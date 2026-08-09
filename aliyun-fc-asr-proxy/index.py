# -*- coding: utf-8 -*-
"""
阿里云 FC 3.0 Web 函数入口
语音识别代理：讯飞方言（闽南话）→ DashScope（热词）→ 百度（兜底）
"""
import json
import base64
import uuid
import time
import hmac
import hashlib
import os
import logging
from urllib.parse import quote
logger = logging.getLogger()
# =============================================
# 环境变量
# =============================================
BAIDU_API_KEY = os.environ.get('BAIDU_API_KEY', '')
BAIDU_SECRET_KEY = os.environ.get('BAIDU_SECRET_KEY', '')
XUNFEI_APP_ID = os.environ.get('XUNFEI_APP_ID', '')
XUNFEI_API_KEY = os.environ.get('XUNFEI_API_KEY', '')
XUNFEI_API_SECRET = os.environ.get('XUNFEI_API_SECRET', '')
DASHSCOPE_API_KEY = os.environ.get('DASHSCOPE_API_KEY', '')
# 35 个节目名热词（提升节目名识别率）
HOTWORDS = ("春草闯堂 状元与乞丐 江梅妃 新亭泪 秋风辞 射雕英雄传 红楼梦 三国演义 "
"水浒传 西游记 东方红 没有共产党就没有新中国 打靶归来 最炫民族风 小苹果 "
"地道战 铁道游击队 英雄儿女 人到中年 庐山恋 陈三五娘 梁山伯与祝英台 "
"吕蒙正 薛平贵与王宝钏 王金龙与苏三 八骏马 梅花操 百鸟归巢 三千两金 "
"直入花园 小沙弥下山 驯猴 元宵乐 大名府 雷万春打虎")
# 百炼热词表 ID（在阿里云百炼控制台创建，含上述 35 个节目名）
# 已通过 DashScope VocabularyService 创建并验证
VOCABULARY_ID = os.environ.get('DASHSCOPE_VOCABULARY_ID', 'vocab-puxian-f24eb1eb7c7e4c448048259a3fda04a8')
# =============================================
# 百炼 DashScope 实时识别（paraformer-realtime-v2，带热词）
# =============================================
def recognize_dashscope(audio_pcm_base64):
    """流式实时识别：PCM base64 → 文本。手写 WebSocket 协议（零 dashscope SDK 依赖）。
    协议逆向自 dashscope 1.26.6 源码，仅依赖纯 Python 的 websockets 库，无 .so 二进制。
    失败抛异常（上层降级）。
    """
    import asyncio
    import uuid
    import websockets
    if not DASHSCOPE_API_KEY:
        raise Exception('DASHSCOPE_API_KEY missing')
    pcm = base64.b64decode(audio_pcm_base64)
    ws_url = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'

    async def _ws():
        task_id = uuid.uuid4().hex
        out = []
        async with websockets.connect(
            ws_url,
            additional_headers={'Authorization': 'Bearer ' + DASHSCOPE_API_KEY},
            max_size=None,
            close_timeout=5,
        ) as ws:
            # 1. 启动任务
            start = {
                'header': {'action': 'run-task', 'task_id': task_id, 'streaming': 'duplex'},
                'payload': {
                    'model': 'paraformer-realtime-v2',
                    'task_group': 'audio',
                    'task': 'asr',
                    'function': 'recognition',
                    'parameters': {
                        'format': 'pcm',
                        'sample_rate': 16000,
                        'vocabulary_id': VOCABULARY_ID,
                    },
                    'input': {}
                }
            }
            await ws.send(json.dumps(start, ensure_ascii=False))
            # 2. 等 task-started
            while True:
                msg = json.loads(await ws.recv())
                ev = msg['header']['event']
                if ev == 'task-started':
                    break
                if ev == 'task-failed':
                    raise Exception('DASHSCOPE_START_FAILED: %s' % msg['header'].get('error_message'))
            # 3. 发音频（二进制，任意分块）
            frame = 4096
            for i in range(0, len(pcm), frame):
                await ws.send(pcm[i:i + frame])
            # 4. 收尾
            finish = {
                'header': {'action': 'finish-task', 'task_id': task_id},
                'payload': {'input': {}}
            }
            await ws.send(json.dumps(finish, ensure_ascii=False))
            # 5. 收结果
            while True:
                msg = json.loads(await ws.recv())
                ev = msg['header']['event']
                if ev == 'result-generated':
                    payload = msg.get('payload', {})
                    output = payload.get('output', payload)
                    sentence = output.get('sentence', {})
                    text = sentence.get('text', '')
                    if text and sentence.get('sentence_end') and text not in out:
                        out.append(text)
                elif ev == 'task-finished':
                    break
                elif ev == 'task-failed':
                    raise Exception('DASHSCOPE_FAILED: %s' % msg['header'].get('error_message'))
            return ''.join(out)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(_ws())
    finally:
        loop.close()
    return result.strip()

# =============================================
# 百度语音识别
# =============================================
BAIDU_TOKEN_CACHE = {'token': None, 'expires': 0}

def get_baidu_token():
    import requests
    now = time.time()
    if BAIDU_TOKEN_CACHE['token'] and BAIDU_TOKEN_CACHE['expires'] > now + 60:
        return BAIDU_TOKEN_CACHE['token']
    url = 'https://aip.baidubce.com/oauth/2.0/token'
    params = {
        'grant_type': 'client_credentials',
        'client_id': BAIDU_API_KEY,
        'client_secret': BAIDU_SECRET_KEY
    }
    resp = requests.post(url, params=params, timeout=5)
    resp.raise_for_status()
    data = resp.json()
    BAIDU_TOKEN_CACHE['token'] = data['access_token']
    BAIDU_TOKEN_CACHE['expires'] = now + data.get('expires_in', 2592000)
    return data['access_token']

def recognize_baidu(audio_pcm_base64):
    import requests
    token = get_baidu_token()
    audio_bytes = base64.b64decode(audio_pcm_base64)
    cuid = 'ama-channel-' + uuid.uuid4().hex[:8]
    url = 'https://vop.baidu.com/server_api'
    body = {
        'format': 'pcm',
        'rate': 16000,
        'channel': 1,
        'cuid': cuid,
        'token': token,
        'len': len(audio_bytes),
        'speech': audio_pcm_base64
    }
    resp = requests.post(url, json=body, timeout=8)
    resp.raise_for_status()
    result = resp.json()
    err_no = result.get('err_no', -1)
    if err_no == 0:
        return result['result'][0]
    elif err_no == 3300:
        raise Exception('BAIDU_QUOTA_EXCEEDED')
    else:
        raise Exception('BAIDU_ERROR_%d: %s' % (err_no, result.get('err_msg', '')))

# =============================================
# 科大讯飞语音识别
# =============================================
def build_xunfei_url():
    date = time.strftime('%a, %d %b %Y %H:%M:%S GMT', time.gmtime())
    host = 'iat-api.xfyun.cn'
    signature_origin = 'host: %s\ndate: %s\nGET /v2/iat HTTP/1.1' % (host, date)
    sign = hmac.new(XUNFEI_API_SECRET.encode('utf-8'),
                    signature_origin.encode('utf-8'),
                    hashlib.sha256).digest()
    signature = base64.b64encode(sign).decode('utf-8')
    authorization_origin = 'api_key="%s", algorithm="hmac-sha256", headers="host date request-line", signature="%s"' % (XUNFEI_API_KEY, signature)
    authorization = base64.b64encode(authorization_origin.encode('utf-8')).decode('utf-8')
    return 'wss://%s/v2/iat?authorization=%s&date=%s&host=%s' % (host, quote(authorization, safe=''), quote(date, safe=''), host)

def recognize_xunfei(audio_pcm_base64, accent='mandarin'):
    import asyncio
    import websockets
    ws_url = build_xunfei_url()
    audio_data = base64.b64decode(audio_pcm_base64)

    async def _ws():
        async with websockets.connect(ws_url, ping_interval=None, close_timeout=5) as ws:
            frame_size = 1280
            total_len = len(audio_data)
            # 第一帧：common + business + data 三合一（讯飞 iat 协议要求）
            first = audio_data[0:frame_size]
            only_one = (frame_size >= total_len)
            start_frame = {
                'common': {'app_id': XUNFEI_APP_ID},
                'business': {
                    'language': 'zh_cn',
                    'domain': 'iat',
                    'accent': accent,  # mandarin=普通话, fujian=闽南话, cantonese=粤语
                    'vad_eos': 2000,
                    'dwa': 'wpgs'
                },
                'data': {
                    'status': 2 if only_one else 0,
                    'format': 'audio/L16;rate=16000',
                    'encoding': 'raw',
                    'audio': base64.b64encode(first).decode('utf-8')
                }
            }
            await ws.send(json.dumps(start_frame))
            sent = frame_size
            while sent < total_len:
                chunk = audio_data[sent:sent + frame_size]
                is_last = (sent + frame_size >= total_len)
                frame = {
                    'data': {
                        'status': 2 if is_last else 1,
                        'format': 'audio/L16;rate=16000',
                        'encoding': 'raw',
                        'audio': base64.b64encode(chunk).decode('utf-8')
                    }
                }
                await ws.send(json.dumps(frame))
                sent += frame_size
            full_text = ''
            while True:
                resp = await ws.recv()
                data = json.loads(resp)
                code = data.get('code', 0)
                if code != 0:
                    raise Exception('XUNFEI_ERROR_%d: %s' % (code, data.get('message', '')))
                if data.get('data', {}).get('status') == 2:
                    for item in data['data'].get('result', {}).get('ws', []):
                        for w in item.get('cw', []):
                            full_text += w.get('w', '')
                    break
            return full_text.strip()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(_ws())
    loop.close()
    return result

# =============================================
# HTTP 响应工具
# =============================================
def make_response(status_code, body_dict):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        'body': json.dumps(body_dict, ensure_ascii=False)
    }

# =============================================
# FC 3.0 入口函数
# =============================================
def handler(event, context):
    """阿里云 FC 3.0 入口"""
    try:
        # 处理 event 为 bytes 的情况
        if isinstance(event, bytes):
            event = event.decode('utf-8')
        if isinstance(event, str):
            event = json.loads(event)
        # 如果 event 是 dict，直接使用
        http_method = event.get('method', event.get('httpMethod', 'POST')) if isinstance(event, dict) else 'POST'
        if http_method == 'OPTIONS':
            return make_response(200, {'text': '', 'ok': True})
        raw_body = event.get('body', event.get('rawBody', '')) if isinstance(event, dict) else (json.dumps(event) if event else '')
        if event.get('isBase64Encoded') if isinstance(event, dict) else False:
            raw_body = base64.b64decode(raw_body).decode('utf-8')
        if isinstance(raw_body, bytes):
            raw_body = raw_body.decode('utf-8')
        payload = json.loads(raw_body) if raw_body else {}
        audio_base64 = payload.get('audio_base64', '')
        dialect = payload.get('dialect', 'mandarin')  # mandarin / fujian(闽南话) / cantonese(粤语)
        if not audio_base64:
            return make_response(200, {'text': '', 'error': 'missing audio_base64', 'ver': 'v3'})
        logger.info('Audio base64 len: %d, dialect: %s' % (len(audio_base64), dialect))
        _xf_error = None  # 讯飞失败原因（始终返回，便于诊断）
        if dialect != 'mandarin':
            # ---- 方言模式（闽南话/莆仙话）----
            # 降级链：讯飞方言引擎(accent=fujian) → DashScope(通用中文) → 百度中文(兜底）
            # 第1层：讯飞方言引擎（accent=fujian，闽南话专用）
            if XUNFEI_APP_ID and XUNFEI_API_KEY and XUNFEI_API_SECRET:
                try:
                    text = recognize_xunfei(audio_base64, accent=dialect)
                    if text and text.strip():
                        logger.info('Xunfei(%s) success: %s' % (dialect, text[:50]))
                        return make_response(200, {'text': text.strip(), 'provider': 'xunfei', 'dialect': dialect, 'ver': 'v3'})
                    else:
                        _xf_error = 'Xunfei(%s) returned empty text' % dialect
                        logger.warning(_xf_error)
                except Exception as e:
                    _xf_error = 'Xunfei(%s): %s' % (dialect, str(e))
                    logger.warning(_xf_error)
            else:
                _xf_error = 'Xunfei keys not configured (XUNFEI_APP_ID/API_KEY/API_SECRET)'
                logger.warning(_xf_error)
            # 第2层：DashScope paraformer-realtime-v2（通用中文识别，非方言模型）
            if DASHSCOPE_API_KEY:
                try:
                    text = recognize_dashscope(audio_base64)
                    if text and text.strip():
                        logger.info('DashScope(%s) success: %s' % (dialect, text[:50]))
                        return make_response(200, {'text': text.strip(), 'provider': 'dashscope', 'dialect': dialect, 'xunfei_error': _xf_error, 'ver': 'v3'})
                except Exception as e:
                    _dbg = 'DashScope(%s): %s' % (dialect, str(e))
                    logger.warning(_dbg)
            else:
                logger.warning('DASHSCOPE_API_KEY not configured')
            # 第3层：百度中文（兜底，识别普通话发音）
            if BAIDU_API_KEY and BAIDU_SECRET_KEY:
                try:
                    text = recognize_baidu(audio_base64)
                    if text and text.strip():
                        logger.info('Baidu(%s) success: %s' % (dialect, text[:50]))
                        return make_response(200, {'text': text.strip(), 'provider': 'baidu', 'dialect': dialect, 'xunfei_error': _xf_error, 'ver': 'v3'})
                except Exception as e:
                    _dbg = 'Baidu(%s): %s' % (dialect, str(e))
                    logger.warning(_dbg)
            else:
                logger.warning('Baidu keys not configured')
            return make_response(200, {'text': '', 'error': 'dialect provider failed', 'xunfei_error': _xf_error, 'ver': 'v3'})
        # ---- 第 1 层：百度语音（普通话）----
        try:
            text = recognize_baidu(audio_base64)
            if text and text.strip():
                return make_response(200, {'text': text.strip(), 'provider': 'baidu'})
        except Exception as e:
            logger.warning('Baidu: %s' % str(e))
        # ---- 第 2 层：科大讯飞（普通话）----
        if XUNFEI_APP_ID and XUNFEI_API_KEY and XUNFEI_API_SECRET:
            try:
                text = recognize_xunfei(audio_base64, accent='mandarin')
                if text and text.strip():
                    return make_response(200, {'text': text.strip(), 'provider': 'xunfei'})
            except Exception as e:
                logger.warning('Xunfei: %s' % str(e))
        # ---- 第 3 层：百炼 DashScope（普通话，带热词）----
        if DASHSCOPE_API_KEY:
            try:
                text = recognize_dashscope(audio_base64)
                if text and text.strip():
                    return make_response(200, {'text': text.strip(), 'provider': 'dashscope'})
            except Exception as e:
                logger.warning('DashScope: %s' % str(e))
        return make_response(200, {'text': '', 'error': 'all providers failed'})
    except Exception as e:
        logger.error('Handler: %s' % str(e))
        return make_response(500, {'text': '', 'error': str(e)})
