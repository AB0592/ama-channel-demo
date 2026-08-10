# -*- coding: utf-8 -*-
"""
阿里云 FC 3.0 Web 函数入口
三模块独立语音识别架构：
  模块 1 mandarin：百度(第一) → 讯飞普通话 → DashScope热词
  模块 2 fujian  ：讯飞fujian(第一) → DashScope热词 → 百度兜底
  模块 3 puxian  ：跳过讯飞 → DashScope热词 → 百度兜底
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
                resp = await asyncio.wait_for(ws.recv(), timeout=6)
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
    try:
        result = loop.run_until_complete(asyncio.wait_for(_ws(), timeout=6))
    except asyncio.TimeoutError:
        logger.warning('Xunfei timeout after 6s (accent=%s)' % accent)
        return ''
    finally:
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
# 模块 1：中文（mandarin）— 百度(第一) → 讯飞普通话 → DashScope热词
# =============================================
def module_mandarin(audio_base64):
    """中文模块：百度中文识别准确率最高，做主引擎。

    引擎链：百度(5s) → 讯飞普通话(6s) → DashScope热词(5s)
    模块总耗时上限 8s（保证前端 8s 超时内返回）。
    """
    # 第1层：百度语音（普通话，准确率最高）
    try:
        text = recognize_baidu(audio_base64)
        if text and text.strip():
            logger.info('mandarin/baidu success: %s' % text[:50])
            return {'text': text.strip(), 'provider': 'baidu', 'ver': 'v3'}
    except Exception as e:
        logger.warning('mandarin/baidu: %s' % str(e))

    # 第2层：科大讯飞（普通话）
    if XUNFEI_APP_ID and XUNFEI_API_KEY and XUNFEI_API_SECRET:
        try:
            text = recognize_xunfei(audio_base64, accent='mandarin')
            if text and text.strip():
                logger.info('mandarin/xunfei success: %s' % text[:50])
                return {'text': text.strip(), 'provider': 'xunfei', 'ver': 'v3'}
        except Exception as e:
            logger.warning('mandarin/xunfei: %s' % str(e))
    else:
        logger.warning('mandarin: xunfei keys not configured')

    # 第3层：DashScope（带热词）
    if DASHSCOPE_API_KEY:
        try:
            text = recognize_dashscope(audio_base64)
            if text and text.strip():
                logger.info('mandarin/dashscope success: %s' % text[:50])
                return {'text': text.strip(), 'provider': 'dashscope', 'ver': 'v3'}
        except Exception as e:
            logger.warning('mandarin/dashscope: %s' % str(e))
    else:
        logger.warning('mandarin: DASHSCOPE_API_KEY not configured')

    return {'text': '', 'error': 'mandarin providers failed', 'ver': 'v3'}


# =============================================
# 模块 2：闽南话（fujian）— 讯飞fujian(第一) → DashScope热词 → 百度兜底
# =============================================
def module_fujian(audio_base64):
    """闽南话模块：讯飞是唯一真支持闽南话的引擎，必须第一。

    引擎链：讯飞accent=fujian(6s) → DashScope热词(5s) → 百度中文(5s)
    讯飞返回垃圾文本（纯标点/空）视为失败，继续降级。
    模块总耗时上限 8s。
    """
    _xf_error = None  # 讯飞诊断字段（仅 fujian 模块返回）

    # 第1层：讯飞方言引擎（accent=fujian，闽南话专用，唯一支持闽南话的引擎）
    if XUNFEI_APP_ID and XUNFEI_API_KEY and XUNFEI_API_SECRET:
        try:
            text = recognize_xunfei(audio_base64, accent='fujian')
            if text and text.strip():
                logger.info('fujian/xunfei success: %s' % text[:50])
                return {'text': text.strip(), 'provider': 'xunfei', 'ver': 'v3'}
            else:
                _xf_error = 'xunfei returned empty text'
                logger.warning('fujian/xunfei: %s' % _xf_error)
        except Exception as e:
            _xf_error = 'xunfei: %s' % str(e)
            logger.warning('fujian/xunfei: %s' % str(e))
    else:
        _xf_error = 'xunfei keys not configured'
        logger.warning('fujian: %s' % _xf_error)

    # 第2层：DashScope paraformer-realtime-v2（带热词）
    if DASHSCOPE_API_KEY:
        try:
            text = recognize_dashscope(audio_base64)
            if text and text.strip():
                logger.info('fujian/dashscope success: %s' % text[:50])
                return {'text': text.strip(), 'provider': 'dashscope', 'xunfei_error': _xf_error, 'ver': 'v3'}
        except Exception as e:
            logger.warning('fujian/dashscope: %s' % str(e))
    else:
        logger.warning('fujian: DASHSCOPE_API_KEY not configured')

    # 第3层：百度中文（兜底）
    if BAIDU_API_KEY and BAIDU_SECRET_KEY:
        try:
            text = recognize_baidu(audio_base64)
            if text and text.strip():
                logger.info('fujian/baidu success: %s' % text[:50])
                return {'text': text.strip(), 'provider': 'baidu', 'xunfei_error': _xf_error, 'ver': 'v3'}
        except Exception as e:
            logger.warning('fujian/baidu: %s' % str(e))
    else:
        logger.warning('fujian: baidu keys not configured')

    return {'text': '', 'error': 'fujian providers failed', 'xunfei_error': _xf_error, 'ver': 'v3'}


# =============================================
# 模块 3：莆仙话（puxian）— 跳过讯飞 → DashScope热词 → 百度兜底
# =============================================
def module_puxian(audio_base64):
    """莆仙话模块：云端无莆仙话引擎，跳过讯飞。

    注意：讯飞 accent 不支持莆仙话，此处结构上禁止调用讯飞接口，
    避免垃圾文本堵死降级链路。本函数内不得出现任何讯飞识别调用。

    引擎链：DashScope热词(5s) → 百度中文(5s)
    模块总耗时上限 8s。
    """
    _xf_error = 'xunfei skipped: accent not supported for puxian dialect'
    logger.info(_xf_error)

    # 第1层：DashScope paraformer-realtime-v2（带 vocabulary_id 热词）
    if DASHSCOPE_API_KEY:
        try:
            text = recognize_dashscope(audio_base64)
            if text and text.strip():
                logger.info('puxian/dashscope success: %s' % text[:50])
                return {'text': text.strip(), 'provider': 'dashscope', 'xunfei_error': _xf_error, 'ver': 'v3'}
        except Exception as e:
            logger.warning('puxian/dashscope: %s' % str(e))
    else:
        logger.warning('puxian: DASHSCOPE_API_KEY not configured')

    # 第2层：百度中文（兜底）
    if BAIDU_API_KEY and BAIDU_SECRET_KEY:
        try:
            text = recognize_baidu(audio_base64)
            if text and text.strip():
                logger.info('puxian/baidu success: %s' % text[:50])
                return {'text': text.strip(), 'provider': 'baidu', 'xunfei_error': _xf_error, 'ver': 'v3'}
        except Exception as e:
            logger.warning('puxian/baidu: %s' % str(e))
    else:
        logger.warning('puxian: baidu keys not configured')

    return {'text': '', 'error': 'puxian providers failed', 'xunfei_error': _xf_error, 'ver': 'v3'}


# =============================================
# FC 3.0 入口函数 — 三模块独立路由
# =============================================
def handler(event, context):
    """阿里云 FC 3.0 入口：按 dialect 路由到对应独立模块。

    路由规则：
      dialect=mandarin → module_mandarin（百度→讯飞→DashScope）
      dialect=fujian   → module_fujian（讯飞fujian→DashScope→百度）
      dialect=puxian   → module_puxian（跳过讯飞→DashScope→百度）
    """
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
        dialect = payload.get('dialect', 'mandarin')  # mandarin / fujian(闽南话) / puxian(莆仙话)
        if not audio_base64:
            return make_response(200, {'text': '', 'error': 'missing audio_base64', 'ver': 'v3'})
        logger.info('Audio base64 len: %d, dialect: %s' % (len(audio_base64), dialect))

        # 三模块独立路由
        if dialect == 'fujian':
            result = module_fujian(audio_base64)
        elif dialect == 'puxian':
            result = module_puxian(audio_base64)
        else:
            result = module_mandarin(audio_base64)

        result['dialect'] = dialect
        return make_response(200, result)
    except Exception as e:
        logger.error('Handler: %s' % str(e))
        return make_response(500, {'text': '', 'error': str(e)})
