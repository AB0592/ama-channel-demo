# -*- coding: utf-8 -*-
import json
import base64
import uuid
import time
import hmac
import hashlib
import requests
import os
from datetime import datetime

# =============================================
# 环境变量（在阿里云 FC 控制台设置）
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
    """获取百度 access_token，带缓存"""
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
    """调百度短语音识别，返回文本"""
    token = get_baidu_token()
    audio_bytes = base64.b64decode(audio_pcm_base64)
    
    url = f'https://vop.baidu.com/server_api?access_token={token}'
    body = {
        'format': 'pcm',
        'rate': 16000,
        'channel': 1,
        'cuid': 'ama-channel-' + uuid.uuid4().hex[:8],
        'token': token,
        'len': len(audio_bytes),
        'speech': audio_pcm_base64
    }
    
    resp = requests.post(url, json=body, timeout=5)
    resp.raise_for_status()
    result = resp.json()
    
    err_no = result.get('err_no', -1)
    if err_no == 0:
        return result['result'][0]
    elif err_no == 3300:  # 额度超限
        raise Exception('BAIDU_QUOTA_EXCEEDED')
    elif err_no == 3301:  # 音频质量
        raise Exception('BAIDU_AUDIO_ERROR: ' + result.get('err_msg', ''))
    else:
        raise Exception(f'BAIDU_ERROR_{err_no}: ' + result.get('err_msg', ''))

# =============================================
# 科大讯飞语音识别
# =============================================
def build_xunfei_url():
    """构建讯飞 WebSocket 鉴权 URL"""
    api_key = XUNFEI_API_KEY
    api_secret = XUNFEI_API_SECRET
    
    date = datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S GMT')
    host = 'iat-api.xfyun.cn'
    
    signature_origin = f'host: {host}\ndate: {date}\nGET /v2/iat HTTP/1.1'
    
    sign = hmac.new(api_secret.encode('utf-8'),
                    signature_origin.encode('utf-8'),
                    hashlib.sha256).digest()
    signature = base64.b64encode(sign).decode('utf-8')
    
    authorization_origin = (
        f'api_key="{api_key}", algorithm="hmac-sha256", '
        f'headers="host date request-line", signature="{signature}"'
    )
    authorization = base64.b64encode(authorization_origin.encode('utf-8')).decode('utf-8')
    
    return f'wss://{host}/v2/iat?authorization={authorization}&date={date}&host={host}'

def recognize_xunfei(audio_pcm_base64):
    """调讯飞语音听写 WebSocket，返回文本"""
    import asyncio
    import websockets
    
    ws_url = build_xunfei_url()
    audio_data = base64.b64decode(audio_pcm_base64)
    
    async def _ws():
        async with websockets.connect(ws_url, ping_interval=None, close_timeout=5) as ws:
            # 发送业务参数
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
            
            # 发送音频，每 1280 字节一帧
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
            
            # 收结果
            full_text = ''
            while True:
                resp = await ws.recv()
                data = json.loads(resp)
                code = data.get('code', 0)
                
                if code != 0:
                    raise Exception(f'XUNFEI_ERROR_{code}: ' + data.get('message', ''))
                
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
# FC 入口函数
# =============================================
def handler(environ, start_response):
    """阿里云 FC HTTP 触发器入口"""
    try:
        # 读取请求体
        try:
            request_body_size = int(environ.get('CONTENT_LENGTH', '0'))
        except ValueError:
            request_body_size = 0
        
        body = environ['wsgi.input'].read(request_body_size)
        
        # 解析 JSON
        try:
            payload = json.loads(body)
            audio_base64 = payload.get('audio_base64', '')
            if not audio_base64:
                raise ValueError('缺少 audio_base64')
        except:
            result = json.dumps({'text': '', 'error': '请求格式错误'}, ensure_ascii=False)
            start_response('400 OK', [('Content-Type', 'application/json; charset=utf-8'), ('Access-Control-Allow-Origin', '*')])
            return [result.encode('utf-8')]
        
        # ---- 第 1 层：百度语音 ----
        try:
            text = recognize_baidu(audio_base64)
            if text and text.strip():
                result = json.dumps({'text': text.strip(), 'provider': 'baidu'}, ensure_ascii=False)
                start_response('200 OK', [('Content-Type', 'application/json; charset=utf-8'), ('Access-Control-Allow-Origin', '*')])
                return [result.encode('utf-8')]
        except Exception as e:
            err_msg = str(e)
            if 'BAIDU_QUOTA' in err_msg:
                print('百度额度超限，降级到讯飞')
            else:
                print(f'百度识别异常: {err_msg}')
        
        # ---- 第 2 层：科大讯飞 ----
        if XUNFEI_APP_ID and XUNFEI_API_KEY and XUNFEI_API_SECRET:
            try:
                text = recognize_xunfei(audio_base64)
                if text and text.strip():
                    result = json.dumps({'text': text.strip(), 'provider': 'xunfei'}, ensure_ascii=False)
                    start_response('200 OK', [('Content-Type', 'application/json; charset=utf-8'), ('Access-Control-Allow-Origin', '*')])
                    return [result.encode('utf-8')]
            except Exception as e:
                err_msg = str(e)
                print(f'讯飞识别异常: {err_msg}')
        
        # ---- 都失败 ----
        result = json.dumps({'text': '', 'error': '百度与讯飞均识别失败'}, ensure_ascii=False)
        start_response('200 OK', [('Content-Type', 'application/json; charset=utf-8'), ('Access-Control-Allow-Origin', '*')])
        return [result.encode('utf-8')]
        
    except Exception as e:
        result = json.dumps({'text': '', 'error': str(e)}, ensure_ascii=False)
        start_response('200 OK', [('Content-Type', 'application/json; charset=utf-8'), ('Access-Control-Allow-Origin', '*')])
        return [result.encode('utf-8')]