#!/bin/bash
# ============================================================
# 阿嬷的频道 - 一键启动脚本
# ============================================================
# 启动后端 API 和前端网页，显示手机访问地址
# 用法: chmod +x start.sh && ./start.sh
# ============================================================

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"

# 找到项目目录
BACKEND_DIR="$PARENT_DIR/puxian-dialect-training-system/scripts"
FRONTEND_DIR="$SCRIPT_DIR"

echo -e "${GREEN}==============================${NC}"
echo -e "${GREEN}  阿嬷的频道 - 启动服务${NC}"
echo -e "${GREEN}==============================${NC}"
echo ""

# 获取本机 IP
IP_ADDRESS=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

# 检查后端目录
if [ ! -d "$BACKEND_DIR" ]; then
    echo -e "${RED}错误: 找不到后端目录 $BACKEND_DIR${NC}"
    echo "请确认 puxian-dialect-training-system 和 ama-channel 在同一级目录"
    exit 1
fi

# 检查端口是否被占用
check_port() {
    lsof -i :$1 -t 2>/dev/null | head -1
}

# 启动后端 API
echo -e "${BLUE}[1/2] 启动后端 API (端口 8520)...${NC}"
if [ -n "$(check_port 8520)" ]; then
    echo -e "${YELLOW}  端口 8520 已被占用，后端可能已在运行${NC}"
else
    cd "$BACKEND_DIR"
    # 设置离线模式（避免网络超时）
    export TRANSFORMERS_OFFLINE=1
    export HF_HUB_OFFLINE=1
    export HF_DATASETS_OFFLINE=1
    # 后台启动
    nohup python3 api_server.py > /tmp/puxian-api.log 2>&1 &
    BACKEND_PID=$!
    echo "  后端 PID: $BACKEND_PID"
    echo "  日志: /tmp/puxian-api.log"
    # 等待启动
    sleep 3
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${GREEN}  后端启动成功${NC}"
    else
        echo -e "${RED}  后端启动失败，请查看日志: cat /tmp/puxian-api.log${NC}"
    fi
fi

# 启动前端
echo ""
echo -e "${BLUE}[2/2] 启动前端网页 (端口 8080)...${NC}"
if [ -n "$(check_port 8080)" ]; then
    echo -e "${YELLOW}  端口 8080 已被占用，前端可能已在运行${NC}"
else
    cd "$FRONTEND_DIR"
    nohup python3 -m http.server 8080 --bind 0.0.0.0 > /tmp/puxian-frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo "  前端 PID: $FRONTEND_PID"
    sleep 1
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${GREEN}  前端启动成功${NC}"
    else
        echo -e "${RED}  前端启动失败${NC}"
    fi
fi

# 显示访问地址
echo ""
echo -e "${GREEN}==============================${NC}"
echo -e "${GREEN}  服务已启动！${NC}"
echo -e "${GREEN}==============================${NC}"
echo ""
echo -e "${YELLOW}电脑访问:${NC}"
echo -e "  阿嬷点播:  http://localhost:8080/index.html"
echo -e "  录音训练:  http://localhost:8080/record.html"
echo -e "  API 文档:  http://localhost:8520/docs"
echo ""
echo -e "${YELLOW}手机访问 (同一 WiFi):${NC}"
echo -e "  阿嬷点播:  http://$IP_ADDRESS:8080/index.html"
echo -e "  录音训练:  http://$IP_ADDRESS:8080/record.html"
echo ""
echo -e "${YELLOW}分享给家人:${NC}"
echo -e "  把上面的手机访问地址发给家人"
echo -e "  他们用手机浏览器打开就能录音和点播"
echo ""
echo -e "停止服务: ${RED}kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; kill \$(lsof -ti :8520 :8080) 2>/dev/null${NC}"
echo ""
