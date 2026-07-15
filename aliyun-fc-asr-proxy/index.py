# -*- coding: utf-8 -*-
"""
阿里云 FC 3.0 Web 函数入口
语音识别代理：百度语音 → 科大讯飞（自动降级）
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
    url = 'https://vop.baidu.com/server_api?access_token=%s&cuid=%s' % (token, cuid)
    body = {
        'format': 'pcm',
        'rate': 16000,
        'channel': 1,
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

def recognize_xunfei(audio_pcm_base64):
    import asyncio
    import websockets
    ws_url = build_xunfei_url()
    audio_data = base64.b64decode(audio_pcm_base64)

    async def _ws():
        async with websockets.connect(ws_url, ping_interval=None, close_timeout=5) as ws:
            business = {
                'common': {'app_id': XUNFEI_APP_ID},
                'business': {
                    'language': 'zh_cn',
                    'domain': 'iat',
                    'accent': 'mandarin',
                    'vad_eos': 2000,
                    'dwa': 'wpgs'
                }
            }
            await ws.send(json.dumps(business))
            frame_size = 1280
            total_len = len(audio_data)
            sent = 0
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
        if not audio_base64:
            return make_response(200, {'text': '', 'error': 'missing audio_base64'})
        logger.info('Audio base64 len: %d' % len(audio_base64))
        # ---- 第 1 层：百度语音 ----
        try:
            text = recognize_baidu(audio_base64)
            if text and text.strip():
                return make_response(200, {'text': text.strip(), 'provider': 'baidu'})
        except Exception as e:
            logger.warning('Baidu: %s' % str(e))
        # ---- 第 2 层：科大讯飞 ----
        if XUNFEI_APP_ID and XUNFEI_API_KEY and XUNFEI_API_SECRET:
            try:
                text = recognize_xunfei(audio_base64)
                if text and text.strip():
                    return make_response(200, {'text': text.strip(), 'provider': 'xunfei'})
            except Exception as e:
                logger.warning('Xunfei: %s' % str(e))
        return make_response(200, {'text': '', 'error': 'all providers failed'})
    except Exception as e:
        logger.error('Handler: %s' % str(e))
        return make_response(500, {'text': '', 'error': str(e)})