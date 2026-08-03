# 阿嬷的频道 · 莆仙戏点戏机

> ama-channel-demo / develop/ama-channel-v2
> Trae.ai 开发比赛参赛作品 · 所有代码迭代在 Trae 平台内完成

---

## 一、项目定位

「阿嬷的频道」（又名「莆仙戏点戏机」）是一个**面向老年用户的方言语音点播应用**。

奶奶外婆想看莆仙戏、歌仔戏、南音、木偶戏，或者想听音乐、看电视剧和电影，可以：

- 用莆仙话 / 闽南话 / 中文**输入文字**或说出**习惯叫法**（如「春草」「状元」）；
- 或用普通话**语音说出戏名**；

系统通过语音识别得到中文文本，再经**方言词典翻译、别名映射、模糊匹配**从 35 个节目库中找到对应戏目，显示封面图让老人家确认后播放。

### 本项目不是什么（重要）

- **不是莆仙方言训练系统**：不负责录音采集、数据标注、模型训练、识别评测和推理 API 输出；
- **不提供真正的莆仙话语音识别模型**：当前所有 ASR 识别的是普通话，对莆仙话的「识别」只是**普通话识别结果 + 莆仙话发音词典匹配**，在页面中标注为「莆仙话识别实验版」；
- **不内嵌任何真实 ASR 服务密钥**：百度 / 科大讯飞 / 阿里 / FunASR 等服务均通过服务端代理转发或走浏览器内置 API，前端零密钥。

---

## 二、与「莆仙方言训练系统」的关系

两个项目是**解耦的独立项目**，以后通过「莆仙话语音识别 API」连接：

```
┌──────────────────────────┐            HTTPS / JSON            ┌──────────────────────────┐
│   阿嬷的频道（本项目）     │   PUXIAN_ASR_API_URL 预留接入点     │  莆仙方言训练系统（独立）   │
│                          │ ─────────────────────────────────▶ │                          │
│  · 前端 UI / 节目库       │   POST {audio_base64,              │  · 录音采集 & 标注         │
│  · 方言词典 / 模糊匹配    │          dialect: 'puxian',        │  · 模型训练 & 评测         │
│  · 播放器 / 确认卡        │          version: 'v1'}            │  · 推理 API（莆仙话模型）  │
│  · ASR Provider 链        │ ◀───────────────────────────────── │                          │
└──────────────────────────┘   { text: '莆仙话识别文本' }        └──────────────────────────┘
```

### 当前连接状态

| 项 | 状态 |
|----|------|
| `PUXIAN_ASR_API_URL` | 空字符串 `''`（**未接入**） |
| `PUXIAN_ASR_API_VERSION` | `'v1'`（预留版本号） |
| `PUXIAN_ASR_TIMEOUT` | `10000` ms（预留超时） |
| `PuxianASRProvider` | 仅**接口定义 + 错误处理**，不发送虚假结果，不伪造识别文本 |

API 未完成时，页面**自动跳过 PuxianASRProvider** 并走现有识别方案，页面标注「莆仙话识别实验版」。

### 未来接入安全要求（修正版）

真正接入时必须满足以下条件，**不能使用通配 Origin 或裸 IP 白名单**：

1. 通过**服务端代理**（例如一个新的云函数）完成鉴权、签名和 Bearer Token 注入；**前端永远不保存莆仙 ASR 的 Bearer Token**；
2. 服务端代理配置**明确的允许来源列表**（CORS Allow-Origin 非 `*`）、**HTTPS 强制**、**鉴权校验**和**限流策略**（按 IP + 用户会话）；
3. 前端仅向本项目的服务端代理发请求，不直接访问训练系统的推理端口。

---

## 三、当前语音识别说明（实验识别 / 辅助匹配）

### 识别能力边界

当前所有识别链路识别的都是**普通话**。当用户切换到「莆仙话（实验版）」或「闽南话」模式时，流程是：

1. 用户说出莆仙话 / 闽南话读音（实际应尽量接近普通话发音，因为识别器是普通话）；
2. 语音识别层（Baidu/Xunfei/FunASR/Google）返回**普通话**文本；
3. 前端通过莆仙话 / 闽南话**发音词典**（56 条 + 34 条）做**同音/近音 → 戏名**映射，再与模糊匹配叠加；
4. 命中后显示「**莆仙话识别实验版（普通话识别 → 莆仙话词典匹配）**」作为说明。

因此：
- 页面中所有「莆仙话识别」字样均**标注为实验版**；
- 闽南话不标注为实验版，但也只是「普通话识别 + 闽南话词典匹配」；
- 中文模式直接按普通话文本搜索，无需翻译步骤。

### Provider 降级顺序（4 层）

> 百度与讯飞在**服务端代理内部自动降级**（百度配额用尽/失败时由 FC 自动调用讯飞），因此前端以「BaiduXunfeiCombinedProvider」为一个 Provider，不伪装成两个独立 Provider。

| 优先级 | Provider 名称 | 对应实现 | 语言 | 失败后自动降级到下一个 |
|--------|---------------|----------|------|----------------------|
| 1（莆仙话模式且已配置 PUXIAN_ASR_API_URL 时） | **PuxianASRProvider** | `callPuxianDialectASR(blob)` → POST 到 `PUXIAN_ASR_API_URL` | 莆仙话（未来） | ✅ 是 |
| 2 | **BaiduXunfeiCombinedProvider** | `callAliyunFcProxy(blob)` → 阿里云 FC：百度 → 讯飞服务端自动降级 | 普通话 | ✅ 是 |
| 3 | **FunASRProvider** | `tryFunasrWithBlob(blob)` → WebSocket `FC_FUNASR_URL`（Paraformer 中文模型） | 普通话 | ✅ 是 |
| 4 | **BrowserSpeechProvider** | `tryGoogleWebSpeech(blob)` → 浏览器 `window.SpeechRecognition` API（Chrome/Edge/Safari） | 普通话 | — |

当 `PUXIAN_ASR_API_URL` 为空（当前默认）时，PuxianASRProvider 直接抛 `PUXIAN_ASR_API_NOT_CONFIGURED` 错误，runASRChain 自动从 BaiduXunfeiCombinedProvider 开始。

---

## 四、项目启动方式

**无需 Node.js / 后端 / 构建工具。双击 `index.html` 即可打开。**

### 方式 A：直接双击（离线包使用）

```
双击 index.html → Chrome / Edge / Safari 打开
```

> 注意：
> - 麦克风录音权限需要 `https://` 或 `http://localhost`，双击打开（`file://`）时浏览器可能禁用录音；文字搜索和海报墙点击播放仍可正常使用；
> - Service Worker（后续 PWA）在 `file://` 下不会注册。

### 方式 B：本地起一个静态服务器（推荐，可测试麦克风）

```bash
# Python 3（无需安装任何包）
cd 项目目录
python3 -m http.server 8000
# 打开浏览器访问 http://localhost:8000
```

```bash
# 或 Node.js（需已安装 Node）
npx serve .
```

启动后麦克风按钮可用。

---

## 五、目录结构

```
ama-channel-demo/
│
├─ index.html                       主文件（5298 行 · 单页应用 · v2 后续按阶段拆分）
├─ ama-channel.html                 备用副本（内容近似 index.html，归档不修改）
├─ README.md                        本说明文档
│
├─ aliyun-fc-asr-proxy/             后端 FC 代理：百度→讯飞服务端自动降级（非前端）
│   ├─ index.py                     204 行，密钥从环境变量读取，前端零密钥
│   └─ requirements.txt
│
├─ opera_audio/                     35 段音频（WAV，每分类 5 段 × 7 分类 = 35）
│   ├─ chuncao.wav                  春草闯堂
│   ├─ zhuangyuan.wav               状元与乞丐
│   └─ ...（共 35 个 WAV）
│
├─ opera_images/                    37 张节目封面（JPG/PNG，含 2 张备用）
│   ├─ chuncao.jpg
│   ├─ puxianxi_jiangmeifei.jpg
│   ├─ cartoon_tv_logo.jpg          备用 Logo
│   ├─ zhuangyuan_v3.jpg            备用封面
│   └─ ...（共 37 张）
│
├─ tests/                           v2 基线测试脚本（零框架依赖）
│   └─ integrity-check.js           静态完整性检查（节目/音频/封面/UI/标注/密钥）
│
├─ 阿嬷的频道-35节目深度泛化词条表.xlsx     搜索泛化关键词表（供参考）
├─ 阿嬷的频道-作品贴-论坛更新版.txt         比赛帖子文案
└─ 阿嬷的频道-莆仙戏点戏机-用熟悉的叫法帮长辈找回文化娱乐.zip
                                     比赛提交用离线包（约 1.9 MB）
```

### v2 后续新增目录（阶段 1 起逐步创建，本阶段 0 不创建）

```
assets/
   ├─ css/          （阶段 2） app.css / hero-bg.jpg 外置
   ├─ data/         （阶段 3） opera-db.js / dialect-dicts.js
   └─ js/           （阶段 4-5）asr-providers.js / search-core.js / player-core.js / ui-interactions.js
manifest.webmanifest  （PWA 第一步，后期）
service-worker.js     （PWA 第二步，后期，按需缓存音频）
```

---

## 六、Provider 降级顺序（结构化复述）

```
runASRChain(blob)
    │
    ├─ [可选] PuxianASRProvider          dialect=puxian · POST → PUXIAN_ASR_API_URL
    │     └─ 未配置 URL / 失败 → 继续
    │
    ├─ BaiduXunfeiCombinedProvider       POST → FC_PROXY_URL
    │     ├─ 服务端 第 1 层：recognize_baidu()
    │     │    成功 → { text, provider: 'baidu' } 返回
    │     │    失败（配额/网络）→ 服务端自动降级
    │     └─ 服务端 第 2 层：recognize_xunfei()
    │          成功 → { text, provider: 'xunfei' } 返回
    │          失败 → 前端 runASRChain 继续下一个
    │
    ├─ FunASRProvider                    WS → FC_FUNASR_URL (Paraformer 中文)
    │     └─ 失败 → 继续
    │
    └─ BrowserSpeechProvider             window.SpeechRecognition (zh-CN)
          └─ 失败 → runASRChain 返回 null → 页面提示「语音识别暂时不可用」
```

前端通过 `ASRProviders` 枚举 + `activeASRChain` 数组 + `ASRProviderImpl` 注册表管理；以后需要单独监控百度/讯费时，才修改服务端接口并拆分前端 Provider。

---

## 七、隐私和密钥安全边界（重要红线）

### 7.1 前端源码禁止内容

本项目（含 `index.html`、`assets/` 下所有 JS/CSS、`tests/`）**永远不能出现以下内容**：

| 禁止项 | 示例 | 检查方式 |
|--------|------|----------|
| 百度 API Key / Secret Key | `BAIDU_API_KEY = 'S********************'` | `tests/integrity-check.js` 第 7 组正则（4 项） |
| 讯飞 APP ID / API Key / Secret | `XUNFEI_APP_ID`、`hmac-sha256` 硬编码签名 | 同上 |
| 莆仙 ASR Bearer Token | `Authorization: Bearer xxxx` | 同上 + 代码评审 |
| 阿里 AK/SK、FC Token |  | 同上 |
| 用户个人录音（base64） | 任何音频硬编码为 `data:audio/...` | 手动检查 + 体积监控 |

### 7.2 密钥正确存放位置

| 服务 | 密钥存放位置 | 读取方式 |
|------|--------------|----------|
| 百度语音识别 | 阿里云 FC **环境变量** | `os.environ.get('BAIDU_API_KEY', '')`（index.py L21） |
| 讯飞语音识别 | 阿里云 FC **环境变量** | `os.environ.get('XUNFEI_APP_ID', '')`（index.py L23-25） |
| 莆仙话推理 API | 未来服务端代理的**环境变量 / KMS** | 代理从环境变量读 Authorization 头，前端零接触 |
| FunASR 容器 | 无密钥（内网 FC） | WebSocket 直连 FC 域名 |
| Browser Speech | 无密钥（浏览器内置） | 浏览器权限弹窗 |

### 7.3 用户录音处理

- 录音 Blob（WebM / PCM）**仅存在于内存中**，发送到 ASR 服务后立即被 GC 回收；
- **不写入 `localStorage / IndexedDB / 文件系统`**，不随页面刷新保留；
- 未来若要保存录音（例如作为训练样本），**必须增加明确的知情同意弹窗 + 单独的隐私说明页**，并让用户勾选「同意将录音用于模型训练」后方可上传；
- 比赛演示期间不保存任何录音。

### 7.4 外部通信域白名单（前端可发出请求的域名）

| 域名 | 用途 | 方法 |
|------|------|------|
| `https://ama-channel-*.cn-shanghai.fcapp.run` | BaiduXunfeiCombinedProvider | POST JSON |
| `wss://funasr-*.cn-shanghai.fcapp.run` | FunASRProvider | WebSocket |
| `https://{未来莆仙话代理域名}` | （未来）PuxianASRProvider | POST JSON |
| `*.gstatic.com / *.googleapis.com` | BrowserSpeechProvider（浏览器内部） | 不由前端控制 |

前端代码中不出现任何其他 URL（不使用 CDN 外链 JS/CSS）。

---

## 八、测试方法

### 8.1 静态完整性检查（零依赖，Node.js 即可跑）

```bash
cd 项目根目录
node tests/integrity-check.js
```

检查项（对应阶段 0 基线）：

| 编号 | 检查项 | 通过标准 |
|------|--------|----------|
| 1 | operaDB 节目数量 | 必须 = **35** 个 |
| 2 | 35 段音频文件存在性 | 每个节目有 `media` 字段且 `opera_audio/*.wav` 真实存在 |
| 3 | 所有节目封面存在性 | 每个节目 `poster` 字段且 `opera_images/*.jpg` 真实存在 |
| 4 | 网页资源引用完整性 | operaDB 中所有 media/poster 路径不指向不存在的文件 |
| 5 | 搜索框 & 麦克风按钮 DOM 存在 | `id=userInput` / `id=micBtn` 在 HTML 中可找到 |
| 6 | 确认卡 & 播放器 DOM 存在 | `resultSection / confirmBtn / switchBtn / playerSection / btnPlayPause` 全部存在 |
| 7 | 莆仙话「实验版」标注完整性（7 条正则） | 按钮、Placeholder、流程标题、提示语都标注「实验版」；闽南话/中文未被误标 |
| 8 | 源码不存在真实 API 密钥（4 条正则） | api_key / secret / token / app_id ≥20 字符硬编码 0 出现 |

### 8.2 浏览器手动冒烟测试（每次改动后 Chrome + 手机视口各跑 1 次）

1. 打开 `http://localhost:8000` → 首页所有元素不白屏、不溢出；
2. 文字输入「春草闯唐」→ 点播 → 确认卡显示「春草闯堂」→「就是这个」→ 播放器成功出声音 + 进度条走；
3. 确认卡「换一个」→ 候选循环不越界；
4. 分类 Tab 点「莆仙戏」→ 仅显示 5 张海报；
5. 海报卡片 ▶ 按钮 → 直接播放（快捷路径）；
6. 语言切「莆仙话（实验版）」→ langHint 显示「⚠ 实验版：独立ASR待接入」→ 再切回中文，不残留实验版字样；
7. 麦克风（localhost 下）授权 → 录 3 秒「春草闯堂」→ 显示识别状态（百度/讯飞/FunASR/Google 任一或降级提示）；
8. 关于弹窗 / 录入弹窗打开再关闭 → 控制台无报错。

### 8.3 关键搜索回归（可扩展成 regression-search.js）

输入 / 期望首条匹配：

```
春草闯唐       →  春草闯堂
春草           →  春草闯堂
状元乞丐       →  状元与乞丐
秋风词         →  秋风辞
江梅飞         →  江梅妃
新品类         →  新亭泪
```

（全部通过后才算搜索链健康。）

---

## 九、后续 PWA 规划（分两步，本轮阶段 0 不执行）

### 第一步：manifest + 图标（基础安装能力）

在阶段 6（UI 优化）或阶段 7（App 准备）前期执行。创建：

| 文件 | 内容 |
|------|------|
| `manifest.webmanifest` | name="阿嬷的频道" / short_name / start_url="./index.html" / display="standalone" / background_color / theme_color / 192px & 512px 图标 |
| `assets/icons/icon-192.png` | 从 `opera_images/cartoon_tv_logo.jpg` 裁切生成 |
| `assets/icons/icon-512.png` | 同上，512×512 |
| `index.html` `<head>` 加一行 | `<link rel="manifest" href="manifest.webmanifest">` |

效果：Chrome / Edge / Safari（iOS 16.4+）用户打开页面 → 菜单「添加到主屏幕」→ 桌面出现 App 图标，点击全屏打开，无浏览器地址栏。

### 第二步：Service Worker + 按需缓存策略

在 manifest 稳定后**单独评审缓存策略**再执行，**绝不一次预缓存全部 42 MB 音频**。建议白名单分批：

| 缓存层级 | 内容 | 大小估算 | 策略 |
|----------|------|----------|------|
| **Shell（首次打开必缓存）** | HTML / CSS / JS / data 拆出文件 / 192 & 512 图标 / 37 张海报 JPG | ≤ 2 MB | `cache.addAll` install 时一次缓存 |
| **按需（播放时才缓存）** | 35 段 WAV 音频（~42 MB） | 每段 ~ 1.2 MB | 监听 `fetch` → 命中 `.wav` → `cache.put` 后台写入；按 LRU 保留最近 10 段 |
| **分批（用户主动触发）** | 「离线下载全部戏曲」按钮（后续 UI 增加） | 42 MB | 必须在 WiFi + 用户主动点击 + 知情同意弹窗后才执行；显示进度条 + 可取消 |

> 比赛演示阶段，评委现场使用「localhost + WiFi」即可，**不强制启用 SW**。Service Worker 总是可选注册：`if ('serviceWorker' in navigator && location.protocol !== 'file:')`，在 `file://` 和比赛离线包中静默跳过。

---

## 十、版本与回溯

### 分支 / Tag / Stash（阶段 0 已创建）

| 名称 | 类型 | 说明 | 何时创建 |
|------|------|------|----------|
| `before-ama-channel-v2-2026-08-03` | **Git Stash** | 保存阶段 0 前所有未提交改动（含未跟踪），**未经确认不删除** | 2026-08-03 |
| `develop/puxian-asr-v1` | 分支 | Provider 架构 v1（从 main 派生的上一版） | 历史 |
| `develop/ama-channel-v2` | 分支 | **v2 唯一开发分支**（从 puxian-asr-v1 的 9a6ec1d 派生） | 2026-08-03 |
| `ama-channel-v2-baseline` | **Tag** | v2 基线：README + tests 加入前的原始功能快照（9a6ec1d） | 2026-08-03 |

### 回溯方法（修正版 · 优先用分支/commit/tag，不用破坏性命令）

- **回退到 v2 起点**：`git checkout ama-channel-v2-baseline`（切到快照，不改工作区）或 `git switch -c tmp-fix ama-channel-v2-baseline`
- **对比两个阶段差异**：`git diff ama-channel-v2-baseline..develop/ama-channel-v2 --stat`
- **取消当前未提交改动**：优先 `git checkout -- <file>`（单文件）；全局不用 `git clean -fd / git reset --hard`，除非评审确认不会覆盖有价值的未保存工作
- **恢复 stash**：`git stash apply stash@{0}`（保留 stash 备份），确认无误后再 `git stash drop stash@{0}`

### 提交与推送策略

- 所有正式代码修改、测试过程**仅在 Trae 平台内完成**；
- 每阶段通过测试后本地 commit，**绝不主动 push 到 origin**；
- 比赛提交离线包：`git archive --format=zip -o ama-channel-v2-submit.zip develop/ama-channel-v2`（不含 .git 历史）

---

*本文档随 develop/ama-channel-v2 迭代更新。最后更新：2026-08-03 阶段 0*
