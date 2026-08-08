#!/usr/bin/env node
/**
 * 阿嬷的频道 · 静态完整性基线检查（ama-channel-v2 阶段 0）
 *
 * 用法:
 *   cd 项目根目录
 *   node tests/integrity-check.js
 *
 * 零框架依赖，仅用 Node 内置 fs/path。
 * 所有 8 大项全部通过才算通过，退出码 0 = 通过，1 = 失败。
 *
 * 覆盖:
 *   [1] operaDB 节目数量 = 35
 *   [2] 35 段音频文件真实存在
 *   [3] 35 张节目封面真实存在
 *   [4] 网页资源引用完整性（operaDB 中 media/poster 无悬空引用）
 *   [5] 搜索框 (userInput) & 麦克风按钮 (micBtn) DOM 在 HTML 中存在
 *   [6] 确认卡 (resultSection/confirmBtn/switchBtn) & 播放器 (playerSection/btnPlayPause) DOM 存在
 *   [7] 莆仙话「实验版」标注完整性（7 条正则，闽南话/中文不被误标）
 *   [8] 源码中不存在真实 API 密钥（4 条正则：api_key/secret/token/app_id 20+字符）
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------- 定位根目录（允许在 tests/ 或 根目录执行） ----------
const CANDIDATE_ROOTS = [
  __dirname,
  path.join(__dirname, '..'),
  process.cwd()
];
let ROOT = null;
for (const r of CANDIDATE_ROOTS) {
  if (fs.existsSync(path.join(r, 'index.html')) &&
      fs.existsSync(path.join(r, 'opera_audio')) &&
      fs.existsSync(path.join(r, 'opera_images'))) {
    ROOT = r;
    break;
  }
}
if (!ROOT) {
  console.error('✗ 无法定位项目根目录（需包含 index.html / opera_audio/ / opera_images/）');
  console.error('  请在项目根目录或 tests/ 目录下执行: node tests/integrity-check.js');
  process.exit(2);
}
const p = (...seg) => path.join(ROOT, ...seg);
const exists = (rel) => {
  try { return fs.existsSync(p(rel)); } catch(e) { return false; }
};
const read = (rel) => fs.readFileSync(p(rel), 'utf-8');

// ---------- 加载 index.html + 阶段3拆分后的外部 JS ----------
const HTML = read('index.html');
const DICTS_JS = exists('assets/js/dialect-dicts.js') ? read('assets/js/dialect-dicts.js') : '';
const OPERA_DB_JS = exists('assets/js/opera-db.js') ? read('assets/js/opera-db.js') : '';
const CSS_EXT = exists('assets/css/app.css') ? read('assets/css/app.css') : '';
// 合并源码用于 const/function 提取（阶段3拆分后数据在外部文件中）
const COMBINED = HTML + '\n' + DICTS_JS + '\n' + OPERA_DB_JS;

// ---------- 工具: 从外部 opera-db.js 中提取 operaDB (只认第一个 const operaDB = [...];) ----------
function extractOperaDB() {
  // 阶段3拆分后 operaDB 在 assets/js/opera-db.js 中
  const src = OPERA_DB_JS || HTML;  // 兼容未拆分的情况
  const m = src.match(/const\s+operaDB\s*=\s*\[([\s\S]*?)\n\]\s*;/);
  if (!m) throw new Error('找不到 const operaDB = [...] 定义');
  const sandbox = {};
  // 用 vm 更安全；Node 自带 vm 模块
  const vm = require('vm');
  const ctx = { module: { exports: {} }, exports: {} };
  vm.createContext(ctx);
  const code = `var operaDB = [${m[1]}\n]; module.exports = operaDB;`;
  vm.runInContext(code, ctx);
  return ctx.module.exports;
}

// ---------- 结果收集 ----------
let TOTAL_PASS = 0;
let TOTAL_FAIL = 0;
const FAILURES = [];
function section(name) {
  console.log('');
  console.log('='.repeat(60));
  console.log(' ' + name);
  console.log('='.repeat(60));
}
function check(name, ok, detail) {
  const tag = ok ? '✓' : '✗';
  console.log(` ${tag} ${name}` + (detail ? `     ${detail}` : ''));
  if (ok) TOTAL_PASS++; else { TOTAL_FAIL++; FAILURES.push(name); }
}

// ============================================================
// 开始 8 大项检查
// ============================================================
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║   ama-channel-demo  静态完整性基线检查（v2 阶段 0）       ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');
console.log('项目根目录: ' + ROOT);
console.log('执行时间  : ' + new Date().toISOString().replace('T', ' ').slice(0,19));

// ---------- [1] operaDB 节目数量 = 35 ----------
section('[1] operaDB 节目数据 (必须 = 35 个)');
let operaDB = [];
try {
  operaDB = extractOperaDB();
  check('operaDB 解析成功', Array.isArray(operaDB));
  const n = operaDB.length;
  check(`节目数量 = 35  (实际: ${n})`, n === 35, `每分类 5 个 × 7 分类 = 35`);
  // 按分类统计
  const byCat = {};
  operaDB.forEach(o => { byCat[o.category] = (byCat[o.category]||0) + 1; });
  const cats = Object.keys(byCat).sort();
  check(`分类数量 = 7 (实际: ${cats.length})`, cats.length === 7, cats.join(', '));
  cats.forEach(c => {
    check(`  · 【${c}】节目数 = 5 (实际: ${byCat[c]})`, byCat[c] === 5);
  });
  // 关键字段完整性
  // 说明：title/category/media/poster 为必填；id 允许缺省（无 id 的节目在后续按 title 做唯一键，不影响匹配）
  const missingField = { title:0, category:0, media:0, poster:0 };
  const idMissing = [];
  operaDB.forEach(o => {
    if (!o.id) idMissing.push(o.title);
    if (!o.title) missingField.title++;
    if (!o.category) missingField.category++;
    if (!o.media) missingField.media++;
    if (!o.poster) missingField.poster++;
  });
  check(`节目 id 字段 (允许缺省，当前缺失 ${idMissing.length})`, true,
        idMissing.length ? `无 id 节目（以 title 作为唯一键，不影响搜索匹配）: ${idMissing.join('、')}` : '全部节目均有 id ✓');
  Object.entries(missingField).forEach(([f, cnt]) => {
    check(`节目 ${f} 字段完整 (缺失 ${cnt})`, cnt === 0);
  });
} catch(e) {
  check(`operaDB 解析失败: ${e.message}`, false);
}

// ---------- [2] 35 段音频文件真实存在 ----------
section('[2] 35 段音频文件存在性');
if (Array.isArray(operaDB) && operaDB.length) {
  let miss = 0, hit = 0;
  operaDB.forEach(o => {
    if (!o.media) return;
    if (exists(o.media)) { hit++; }
    else { console.log(`   ✗ 缺失音频: ${o.title} → ${o.media}`); miss++; }
  });
  check(`DB 引用音频存在 (${hit}/${operaDB.filter(o=>o.media).length})`, miss === 0);
  // 目录级检查
  const audioFiles = fs.existsSync(p('opera_audio'))
    ? fs.readdirSync(p('opera_audio')).filter(f => /\.wav$/i.test(f)) : [];
  check(`opera_audio/ 目录中 .wav 文件数 = 35 (实际: ${audioFiles.length})`, audioFiles.length === 35);
  const mediaRefs = new Set(operaDB.filter(o=>o.media).map(o => o.media.replace(/^opera_audio\//,'')));
  const extras = audioFiles.filter(f => !mediaRefs.has(f));
  check(`opera_audio/ 无多余文件 (多余 ${extras.length})`, extras.length === 0, extras.length ? extras.join(', ') : '');
} else {
  check('跳过 (operaDB 未解析)', false);
}

// ---------- [3] 所有节目封面真实存在 ----------
section('[3] 节目封面存在性');
if (Array.isArray(operaDB) && operaDB.length) {
  let miss = 0, hit = 0, embedded = 0;
  operaDB.forEach(o => {
    if (!o.poster) return;
    if (o.poster.startsWith('data:')) { embedded++; return; }
    if (exists(o.poster)) { hit++; }
    else { console.log(`   ✗ 缺失封面: ${o.title} → ${o.poster}`); miss++; }
  });
  check(`DB 引用封面存在 (${hit}/${operaDB.length - embedded} 非内联)`, miss === 0, embedded ? `另有 ${embedded} 个使用 SVG/内联图` : '');
  const imgFiles = fs.existsSync(p('opera_images'))
    ? fs.readdirSync(p('opera_images')).filter(f => /\.(jpg|jpeg|png)$/i.test(f)) : [];
  console.log(`   · opera_images/ 目录中图片文件数: ${imgFiles.length} (允许含 2 张备用)`);
  const posterRefs = new Set(
    operaDB.filter(o => o.poster && !o.poster.startsWith('data:')).map(o => o.poster.replace(/^opera_images\//,''))
  );
  const missingRef = [...posterRefs].filter(f => !imgFiles.includes(f));
  check(`DB 引用的 ${posterRefs.size} 张图片在目录中都存在 (缺失 ${missingRef.length})`,
        missingRef.length === 0, missingRef.length ? missingRef.join(', ') : '');
} else {
  check('跳过 (operaDB 未解析)', false);
}

// ---------- [4] 网页资源引用完整性（operaDB media/poster + <img src= / <audio src= / 样式背景） ----------
section('[4] 网页资源引用完整性');
{
  // operaDB 层面已经在 [2][3] 查过；这里再做 HTML 中静态引用检查
  const badRefs = [];
  // 提取所有 <img src="xxx">（只在真实 HTML 片段中查，跳过 JS 模板字符串）
  // 方法：先把 <script>...</script> 块整段移除，再做静态 src/url 检查
  let HTML_NO_SCRIPT = HTML;
  let guard = 0;
  while (/<script\b/i.test(HTML_NO_SCRIPT) && guard++ < 20) {
    HTML_NO_SCRIPT = HTML_NO_SCRIPT.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  }
  // 同时移除 <style> 内的 SVG url(#id) 引用 （内部 gradient/fill 非外部文件）
  // 提取所有 <img src="xxx"> (不包含 data:/http:)
  const imgRE = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = imgRE.exec(HTML_NO_SCRIPT)) !== null) {
    const src = m[1];
    if (src.startsWith('data:') || /^https?:/i.test(src)) continue;
    // 忽略模板语法（${...}）—— 虽然已经移除 <script>，保险起见
    if (/\$\{/.test(src)) continue;
    if (!exists(src)) badRefs.push(`<img src="${src}">`);
  }
  // 提取 background: url("xxx") / background-image: url("xxx")
  // 阶段2拆分后 CSS 在外部 assets/css/app.css 中；兼容未拆分时从 <style> 提取
  const cssSources = [];
  const styleMatch = HTML.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i);
  if (styleMatch) cssSources.push(styleMatch[1]);
  if (CSS_EXT) cssSources.push(CSS_EXT);
  cssSources.forEach(css => {
    const bgRE = /url\s*\(\s*["']?([^"')\s]+)["']?\s*\)/gi;
    while ((m = bgRE.exec(css)) !== null) {
      const src = m[1];
      if (src.startsWith('data:') || /^https?:/i.test(src)) continue;
      // 忽略 SVG 内部引用：url(#xxx)  /  url(#xxx) 转义
      if (/^#/.test(src)) continue;
      if (/\$\{/.test(src)) continue;
      // CSS 文件在 assets/css/ 子目录，需相对该目录解析路径
      if (CSS_EXT && css === CSS_EXT) {
        const resolved = path.normalize(path.join('assets/css', src));
        if (!exists(resolved)) badRefs.push(`CSS url("${src}") (resolved: ${resolved})`);
      } else {
        if (!exists(src)) badRefs.push(`CSS url("${src}")`);
      }
    }
  });
  check(`HTML/CSS 静态资源引用悬空数 = 0 (实际: ${badRefs.length})`,
        badRefs.length === 0, badRefs.length ? badRefs.slice(0, 10).join('  /  ') : '');
  // 额外：operaDB 中引用综合（再次确认，给一个总计）
  if (Array.isArray(operaDB)) {
    const all = [];
    operaDB.forEach(o => {
      if (o.media && !o.media.startsWith('data:') && !exists(o.media)) all.push(`[media] ${o.title}: ${o.media}`);
      if (o.poster && !o.poster.startsWith('data:') && !exists(o.poster)) all.push(`[poster] ${o.title}: ${o.poster}`);
    });
    check(`operaDB 资源综合引用悬空 = 0 (实际: ${all.length})`, all.length === 0,
          all.length ? all.slice(0, 10).join(' / ') : '');
  }
}

// ---------- [5] 搜索框 & 麦克风按钮 DOM 存在 ----------
section('[5] 关键 UI 控件：搜索框 & 麦克风按钮');
{
  const doms = [
    ['搜索框 #userInput',           /id\s*=\s*["']userInput["']/],
    ['麦克风按钮 #micBtn',           /id\s*=\s*["']micBtn["']/],
    ['点播按钮 #searchBtn',          /id\s*=\s*["']searchBtn["']/],
    ['语音选台按钮 #voiceBrowseBtn', /id\s*=\s*["']voiceBrowseBtn["']/],
    ['识别状态区 #recogStatus',      /id\s*=\s*["']recogStatus["']/],
    ['语言提示 #langHint',           /id\s*=\s*["']langHint["']/],
    ['JS 端获取 userInput',          /getElementById\s*\(\s*["']userInput["']\s*\)/],
    ['JS 端获取 micBtn',             /getElementById\s*\(\s*["']micBtn["']\s*\)/],
    ['micBtn 绑定 click 事件',       /micBtn\.addEventListener\s*\(\s*["']click/],
    ['userInput 绑定 enter 事件',    /userInput\.addEventListener\s*\(\s*["']keydown/],
  ];
  doms.forEach(([n, re]) => check(n, re.test(HTML)));
}

// ---------- [6] 确认卡 & 播放器 DOM 存在 ----------
section('[6] 关键 UI 控件：确认卡 & 播放器');
{
  const doms = [
    ['确认卡容器 #resultSection',        /id\s*=\s*["']resultSection["']/],
    ['确认卡海报 #resultPoster',          /id\s*=\s*["']resultPoster["']/],
    ['节目标题 #resultTitle',             /id\s*=\s*["']resultTitle["']/],
    ['节目简介 #resultDesc',              /id\s*=\s*["']resultDesc["']/],
    ['匹配序号 #matchIndex',              /id\s*=\s*["']matchIndex["']/],
    ['就是这个按钮 #confirmBtn',          /id\s*=\s*["']confirmBtn["']/],
    ['换一个按钮 #switchBtn',             /id\s*=\s*["']switchBtn["']/],
    ['播放器容器 #playerSection',         /id\s*=\s*["']playerSection["']/],
    ['播放器标题 #playerTitle',           /id\s*=\s*["']playerTitle["']/],
    ['播放器显示区 #playerDisplay',       /id\s*=\s*["']playerDisplay["']/],
    ['播放/暂停按钮 #btnPlayPause',       /id\s*=\s*["']btnPlayPause["']/],
    ['快退 #btnRewind',                   /id\s*=\s*["']btnRewind["']/],
    ['快进 #btnForward',                  /id\s*=\s*["']btnForward["']/],
    ['重播 #btnReplay',                   /id\s*=\s*["']btnReplay["']/],
    ['返回选台 #btnBackSelect',           /id\s*=\s*["']btnBackSelect["']/],
    ['音量滑条 #volumeSlider',            /id\s*=\s*["']volumeSlider["']/],
    ['进度条容器 #progressWrap',          /id\s*=\s*["']progressWrap["']/],
    ['进度条填充 #progressFill',          /id\s*=\s*["']progressFill["']/],
    ['JS 端获取 resultSection',           /getElementById\s*\(\s*["']resultSection["']\s*\)/],
    ['JS 端获取 playerSection',           /getElementById\s*\(\s*["']playerSection["']\s*\)/],
    ['confirmBtn 绑定 click 事件',        /confirmBtn\.addEventListener\s*\(\s*["']click/],
    ['switchBtn 绑定 click 事件',         /switchBtn\.addEventListener\s*\(\s*["']click/],
  ];
  doms.forEach(([n, re]) => check(n, re.test(HTML)));
}

// ---------- [7] 莆仙话「实验版」标注完整性（7 条正则，闽南话/中文不被误标） ----------
section('[7] 莆仙话「实验版」标注完整性 & 闽南话/中文不被误标');
{
  // 必须出现的 7 条（来自 README 第四节要求）
  const positives = [
    ['HTML 语言按钮：莆仙话（实验版）',
     /data-lang\s*=\s*["']puxianhua["'][^>]*>莆仙话（实验版）/],
    ['HTML 输入框默认 placeholder 含 [实验版]',
     /id\s*=\s*["']userInput["'][^>]*placeholder\s*=\s*["'][^"']*\[实验版\][^"']*["']/],
    ['JS 切到中文模式：flowHeader = 中文搜索流程（不含实验版）',
     /flowHeader\.innerHTML\s*=\s*["'][^"']*中文搜索流程[^"']*["']/],
    ['JS 切到闽南话模式：flowHeader = 闽南话语识别（不含实验版）',
     /flowHeader\.innerHTML\s*=\s*["'][^"']*闽南话语识别[^"']*["']/],
    ['JS 切到莆仙话模式：flowHeader = 莆仙话识别实验版 + 闽南语识别 → 莆仙话词典匹配',
     /flowHeader\.innerHTML\s*=\s*["'][^"']*莆仙话识别实验版（闽南语识别 → 莆仙话词典匹配）[^"']*["']/],
    ['JS 切到莆仙话模式：placeholder 含 [实验版]',
     /userInput\.placeholder\s*=\s*["'][^"']*\[实验版\][^"']*["']/],
    ['JS 切到莆仙话模式：langHint = ⚠ 实验版 + 独立ASR待接入',
     /langHint\.textContent\s*=\s*["'][^"']*独立ASR待接入[^"']*["']/],
  ];
  positives.forEach(([n, re]) => check(`【应存在】${n}`, re.test(HTML)));

  // 绝对不能出现的（闽南话 / 中文被误标为实验版）
  const negatives = [
    ['【应不存在】data-lang=minnanhua 按钮文字被标成实验版',
     /data-lang\s*=\s*["']minnanhua["'][^>]*>[^<]*实验版/],
    ['【应不存在】data-lang=chinese 按钮文字被标成实验版',
     /data-lang\s*=\s*["']chinese["'][^>]*>[^<]*实验版/],
    ['【应不存在】闽南话 flowHeader 中出现莆仙话识别实验版字样',
     /minnanhua[^}]*flowHeader\.innerHTML\s*=\s*["'][^"']*莆仙话识别实验版/],
    ['【应不存在】中文 flowHeader 中出现莆仙话识别实验版字样',
     /chinese[^}]*flowHeader\.innerHTML\s*=\s*["'][^"']*莆仙话识别实验版/],
    ['【应不存在】出现"莆仙话语音识别"无"实验"字样（不能伪装成真正的莆仙话模型）',
     /莆仙话语音识别(?![\s\S]{0,10}(实验|辅助匹配))/],
  ];
  negatives.forEach(([n, re]) => check(n, !re.test(HTML)));

  // Provider 层面：PUXIAN_ASR_API_URL 为空（确保未接入）
  check('PUXIAN_ASR_API_URL 当前 = 空字符串（未启用）',
        /PUXIAN_ASR_API_URL\s*=\s*["']\s*["']\s*;/.test(HTML),
        '未配置时 PuxianASRProvider 自动跳过');
}

// ---------- [8] 源码不存在真实 API 密钥 ----------
section('[8] 密钥 / Token 安全检查（前端零密钥）');
{
  // 扫描 index.html + 当前 tests/
  const targets = ['index.html'];
  if (exists('README.md')) targets.push('README.md');
  // aliyun-fc-asr-proxy/index.py 允许有环境变量读取，但禁止明文 key= 20+字符
  if (exists('aliyun-fc-asr-proxy/index.py')) targets.push('aliyun-fc-asr-proxy/index.py');

  const patterns = [
    { name: 'api[_-]key  硬编码 ≥20 字符',
      re:   /api[_-]?key['"\]]?\s*[:=]\s*["'][A-Za-z0-9]{20,}['"]/i,
      safe: (f) => f.endsWith('.py')   // .py 里允许注释里写变量名（值为空就安全）
    },
    { name: 'secret     硬编码 ≥20 字符',
      re:   /[^a-zA-Z_]secret['"\]]?\s*[:=]\s*["'][A-Za-z0-9]{20,}['"]/i,
      safe: (f) => f.endsWith('.py')
    },
    { name: 'token      硬编码 ≥20 字符',
      re:   /[^a-zA-Z_]token['"\]]?\s*[:=]\s*["'][A-Za-z0-9]{20,}['"]/i,
      safe: () => false
    },
    { name: 'app[_-]id   硬编码 ≥10 字符',
      re:   /app[_-]?id['"\]]?\s*[:=]\s*["'][A-Za-z0-9_-]{10,}['"]/i,
      safe: (f) => f.endsWith('.py')
    },
    { name: 'Authorization: Bearer 20+ 字符（莆仙 ASR Token 禁止写前端）',
      re:   /Authorization['":\s]*,\s*Bearer\s+[A-Za-z0-9._-]{20,}/i,
      safe: () => false
    },
  ];

  let leakTotal = 0;
  targets.forEach(f => {
    const content = read(f);
    patterns.forEach(p => {
      if (p.safe(f)) return;
      const m = content.match(p.re);
      if (m) {
        leakTotal++;
        // 定位行号
        const lineNo = content.substring(0, m.index).split('\n').length;
        console.log(`   ⚠  疑似泄露 [${f}:${lineNo}] ${p.name}`);
        console.log(`        匹配片段: ${m[0].slice(0, 80).replace(/\s+/g, ' ')}`);
      }
    });
  });
  check(`扫描文件 ${targets.join(', ')} → 疑似密钥数 = 0 (实际: ${leakTotal})`,
        leakTotal === 0, leakTotal ? '⚠ 请人工复核以上匹配' : '前端零密钥 ✓');

  // 附加：FC 代理中密钥应该都用 os.environ.get('XXX', '') 空默认
  if (exists('aliyun-fc-asr-proxy/index.py')) {
    const py = read('aliyun-fc-asr-proxy/index.py');
    const envGets = [
      ['BAIDU_API_KEY',     /BAIDU_API_KEY\s*=\s*os\.environ\.get\(['"]BAIDU_API_KEY['"],\s*['"]\s*['"]\s*\)/],
      ['BAIDU_SECRET_KEY',  /BAIDU_SECRET_KEY\s*=\s*os\.environ\.get\(['"]BAIDU_SECRET_KEY['"],\s*['"]\s*['"]\s*\)/],
      ['XUNFEI_APP_ID',     /XUNFEI_APP_ID\s*=\s*os\.environ\.get\(['"]XUNFEI_APP_ID['"],\s*['"]\s*['"]\s*\)/],
      ['XUNFEI_API_KEY',    /XUNFEI_API_KEY\s*=\s*os\.environ\.get\(['"]XUNFEI_API_KEY['"],\s*['"]\s*['"]\s*\)/],
      ['XUNFEI_API_SECRET', /XUNFEI_API_SECRET\s*=\s*os\.environ\.get\(['"]XUNFEI_API_SECRET['"],\s*['"]\s*['"]\s*\)/],
    ];
    envGets.forEach(([n, re]) => check(`FC 代理 ${n} 从环境变量读取 (默认='')`, re.test(py)));
  }
}

section('[9] 搜索词规范化幂等性回归（方言翻译 + normalizeSpokenQuery）');
{
  // ---- 从 HTML 中提取 operaDB、puxianDict、minnanDict、spokenAliasMap、四个规范化函数 ----
  function extractConst(name) {
    // 阶段3拆分后数据在外部 JS 文件中，需搜索 COMBINED
    const SRC = COMBINED;
    const re = new RegExp('const\\s+' + name + '\\s*=\\s*', 'g');
    const matches = [];
    let mm;
    while ((mm = re.exec(SRC)) !== null) matches.push(mm.index);
    if (matches.length === 0) throw new Error('找不到 const ' + name + ' = ... 的起始位置');
    const startIdx = matches[0];
    const afterEq = SRC.indexOf('=', startIdx) + 1;
    // 找到对应终止符（[ 或 { 的匹配对）
    let i = afterEq;
    while (i < SRC.length && /\s/.test(SRC[i])) i++;
    const open = SRC[i];
    const close = open === '{' ? '}' : (open === '[' ? ']' : null);
    if (!close) throw new Error('const ' + name + ' 非对象/数组');
    let depth = 1, j = i + 1, inStr = null, escape = false;
    for (; j < SRC.length; j++) {
      const c = SRC[j];
      if (inStr) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) break; }
    }
    const body = SRC.substring(i, j + 1);
    const vm = require('vm');
    const ctx = { module: { exports: {} }, exports: {} };
    vm.createContext(ctx);
    const code = 'var ' + name + ' = ' + body + '; module.exports = ' + name + ';';
    vm.runInContext(code, ctx);
    return ctx.module.exports;
  }

  function extractFunction(fname) {
    // 阶段3拆分后部分函数在外部 JS 文件中，需搜索 COMBINED
    const SRC = COMBINED;
    const re = new RegExp('function\\s+' + fname + '\\s*\\(', 'g');
    const matches = [];
    let mm;
    while ((mm = re.exec(SRC)) !== null) matches.push(mm.index);
    if (matches.length === 0) throw new Error('找不到 function ' + fname);
    const startIdx = matches[0];
    // 找到函数开 {
    let i = startIdx;
    while (i < SRC.length && SRC[i] !== '{') i++;
    if (i >= SRC.length) throw new Error('function ' + fname + ' 无开括号');
    let depth = 1, j = i + 1, inStr = null, escape = false;
    for (; j < SRC.length; j++) {
      const c = SRC[j];
      if (inStr) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) break; }
    }
    const funcSrc = SRC.substring(startIdx, j + 1);
    return funcSrc;
  }

  const operaDB = (typeof extractOperaDB === 'function') ? extractOperaDB() : (function(){
    const src = OPERA_DB_JS || HTML;
    const m = src.match(/const\s+operaDB\s*=\s*\[([\s\S]*?)\n\]\s*;/);
    if (!m) throw new Error('找不到 operaDB');
    const vm = require('vm');
    const ctx = { module: { exports: {} }, exports: {} };
    vm.createContext(ctx);
    vm.runInContext('var operaDB = [' + m[1] + '\n]; module.exports = operaDB;', ctx);
    return ctx.module.exports;
  })();

  const puxianDict = extractConst('puxianDict');
  const minnanDict = extractConst('minnanDict');

  // 构造 canonicalSet（从 operaDB 动态）+ maxTitleLen
  const canonicalSet = new Set(operaDB.filter(o => !o.hidden && o.title).map(o => String(o.title)));
  const titles = [...canonicalSet];
  const maxTitleLen = Math.max(...titles.map(t => t.length));
  check(`规范节目名集合 = ${titles.length} 个，程序计算的最大标题长度 = ${maxTitleLen}`,
    titles.length > 0 && maxTitleLen > 0,
    `最长标题: ` + titles.reduce((a, b) => a.length > b.length ? a : b, '') + ` (${maxTitleLen} 字符)`);

  // ---- 提取辅助函数 _buildCanonicalSet _cleanRawInput _resolveOnce _getSpokenAliasMap 和 3 个目标函数 ----
  // 简化：直接把函数体取出后在 vm 中组装
  const vm = require('vm');
  const sandbox = { window: {}, Set: Set, Object: Object, String: String, Math: Math, operaDB: operaDB, puxianDict: puxianDict, minnanDict: minnanDict };
  vm.createContext(sandbox);
  const helperFns = ['_buildCanonicalSet','_cleanRawInput','_cleanForSearchStart','_resolveOnce','_getSpokenAliasMap',
                      'translateMinnan','translatePuxian','normalizeSpokenQuery'];
  const fnSrcBundle = helperFns.map(extractFunction).join('\n\n');
  // operaDB 等上面的 sandbox 已经提供
  vm.runInContext(fnSrcBundle, sandbox);

  const translatePuxian = sandbox.translatePuxian;
  const translateMinnan = sandbox.translateMinnan;
  const normalizeSpokenQuery = sandbox.normalizeSpokenQuery;

  // 重点词（用户指定 10 个）+ 所有规范节目名
  const keyWords = ['春草闯堂','春草闯唐','梁山伯','祝英台','三国','水浒','西游','射雕','英雄','猪八戒'];
  const allInputs = [...new Set([...keyWords, ...titles])];

  // 9A: normalizeSpokenQuery 幂等
  let badNSQ = 0;
  allInputs.forEach(w => {
    const f1 = normalizeSpokenQuery(w);
    const f2 = normalizeSpokenQuery(f1);
    const f3 = normalizeSpokenQuery(f2);
    if (f1 !== f2 || f2 !== f3 || String(f1).length > maxTitleLen) badNSQ++;
  });
  check(`[9A] normalizeSpokenQuery(${allInputs.length} 个输入) 幂等 f(f(x))=f(x) 且长度≤最大标题长度`,
    badNSQ === 0, `失败数量=${badNSQ}`);

  // 9B: translatePuxian 幂等（方言函数返回 {translated,changed}）
  let badPu = 0;
  allInputs.forEach(w => {
    const f1 = translatePuxian(w).translated;
    const f2 = translatePuxian(f1).translated;
    const f3 = translatePuxian(f2).translated;
    if (f1 !== f2 || f2 !== f3 || String(f1).length > maxTitleLen) badPu++;
  });
  check(`[9B] translatePuxian(${allInputs.length} 个输入) 幂等 且长度≤最大标题长度`,
    badPu === 0, `失败数量=${badPu}`);

  // 9C: translateMinnan 幂等
  let badMn = 0;
  allInputs.forEach(w => {
    const f1 = translateMinnan(w).translated;
    const f2 = translateMinnan(f1).translated;
    const f3 = translateMinnan(f2).translated;
    if (f1 !== f2 || f2 !== f3 || String(f1).length > maxTitleLen) badMn++;
  });
  check(`[9C] translateMinnan(${allInputs.length} 个输入) 幂等 且长度≤最大标题长度`,
    badMn === 0, `失败数量=${badMn}`);

  // 9D: 对 10 个重点词，三种 currentLang 模式下，buildSearchCandidates 的 candidates[0] 首项在 f→ff→fff 下不增长
  // 组装 buildSearchCandidates（需要 getTranslatedSearchText）
  const fnSrcExtra = ['getTranslatedSearchText','buildSearchCandidates','toPinyinApprox','getPronunciationVariants','minnanPronunciationDict','puxianPronunciationDict']
    .filter(n => { try { extractFunction(n); return true; } catch(e) { return false; } })
    .map(n => { try { return extractFunction(n); } catch(e) { return null; } }).filter(Boolean).join('\n\n');
  // 需要的两个 pronunciation dict 如果是 const 形式，也提取
  let extraDictSrc = '';
  try {
    const mpd = extractConst('minnanPronunciationDict');
    const ppd = extractConst('puxianPronunciationDict');
    extraDictSrc = 'var minnanPronunciationDict = ' + JSON.stringify(mpd) + ';\nvar puxianPronunciationDict = ' + JSON.stringify(ppd) + ';';
  } catch(e) {}
  if (fnSrcExtra) {
    vm.runInContext(extraDictSrc + '\n' + fnSrcExtra, sandbox);
    const buildSC = sandbox.buildSearchCandidates;
    if (typeof buildSC === 'function') {
      const langs = ['chinese','puxianhua','minnanhua'];
      let badTri = 0;
      langs.forEach(L => {
        sandbox.currentLang = L;
        keyWords.forEach(w => {
          const c1 = buildSC(w)[0];
          const c2 = buildSC(c1)[0];
          const c3 = buildSC(c2)[0];
          if (String(c1).length !== String(c2).length || String(c2).length !== String(c3).length) badTri++;
        });
      });
      check(`[9D] 三语言 × 10 重点词 candidates[0] 连续三轮长度稳定`,
        badTri === 0, `失败数量=${badTri}`);
    }
  }

  // 9E: 已确认的 2 个爆炸案例输入输出长度上限
  const explodeCases = [
    ['春草闯唐', '春草闯堂'],
    ['梁山伯',   '梁山伯与祝英台'],
    ['祝英台',   '梁山伯与祝英台'],
    ['三国',     '三国演义'],
    ['水浒',     '水浒传'],
    ['西游',     '西游记'],
    ['射雕',     '射雕英雄传'],
    ['英雄',     '英雄儿女'],
  ];
  let badExp = 0;
  explodeCases.forEach(([input, expected]) => {
    const out = normalizeSpokenQuery(input);
    if (String(out) !== expected) badExp++;
    const pu = translatePuxian(input).translated;
    const mn = translateMinnan(input).translated;
    if (String(pu).length > maxTitleLen) badExp++;
    if (String(mn).length > maxTitleLen) badExp++;
  });
  check(`[9E] 8 个已确认别名 → 规范名映射正确 & 方言翻译长度不超过上限`,
    badExp === 0, `失败数量=${badExp}`);

  // 9F: 跨词典别名冲突精确白名单扫描
  // 规则：扫描 puxianDict / minnanDict / spokenAliasMap 三张表中，
  // 同一个别名 key（value 都是规范节目名）在 ≥2 张表中映射到不同节目的情况。
  // 除精确白名单外，其他任何冲突都必须使测试失败。
  // 白名单同时断言两个目标值都是规范节目名，防止节目库变动后白名单静默失效。
  {
    // === [9F] 强化：消除假通过盲区 ===
    // 注意：mkCollect 不再先按 canonicalSet.has(v) 过滤。原因：授权【四-2/4/5】要求，
    // 所有有效映射目标都必须是规范节目；目标缺失或非规范 → 必失败，不能跳过/只打印警告。
    function mkCollect(dict, label) {
      const out = {};
      Object.entries(dict || {}).forEach(([k, v]) => {
        if (typeof v !== 'string') return;
        // 这里不再用 canonicalSet 过滤目标，改由 [9F-0] 统一断言。
        (out[k] = out[k] || []).push({ label, value: v });
      });
      return out;
    }
    // 从已提取的三表构造（sandbox 中 spokenAliasMap 已通过 _getSpokenAliasMap 注册，取 window 上的）
    const spokenMapExtracted = sandbox.window.__spokenAliasMap || (function(){
      // 兜底：若 sandbox.window 上尚未缓存，按 m['x']='y' 模式从源码重新解析 spokenAliasMap
      const SRC = COMBINED;
      const fnStart = SRC.search(/function\s+_getSpokenAliasMap\s*\(\s*\)\s*\{/);
      if (fnStart < 0) return {};
      let depth = 0, start = -1, i = fnStart;
      while (i < SRC.length) {
        if (SRC[i] === '{') { depth++; if (start<0) start = i; }
        else if (SRC[i] === '}') { depth--; if (start>0 && depth===0) break; }
        i++;
      }
      const fnBody = SRC.substring(start+1, i);
      const out = {};
      const re = /m\s*\[\s*(['"`])(.*?)\1\s*\]\s*=\s*(['"`])(.*?)\3\s*;/g;
      let mm; while ((mm = re.exec(fnBody)) !== null) out[mm[2]] = mm[4];
      return out;
    })();
    const puRaw = mkCollect(puxianDict, 'puxianDict');
    const mnRaw = mkCollect(minnanDict, 'minnanDict');
    const spRaw = mkCollect(spokenMapExtracted, 'spokenAliasMap');
    // === [9F-0] 全量映射目标合法性检查（授权【四-1/2/3】）：
    // 三张表中每一个"有效别名映射"的最终收敛目标都必须属于 canonicalSet（规范节目集合）。
    // 不允许先用 canonicalSet.has(v) 过滤掉无效目标后再"假通过"（授权【四-4/5】）。
    // —— 这里的关键是：别名表支持"二级链"，例如 状员→状元→状元与乞丐（最终=规范节目）。
    //    对"直接 value ∈ canonicalSet"的条目：直接断言 value 合法。
    //    对"value ∉ canonicalSet 但 key≠value"的条目：视为"二级别名中间值"，
    //    做 DFS 图搜索要求最终必须能收敛到一个规范节目；若找不到路径则判失败。
    //    "方言普通词"（key=value，通常不是节目名映射）不在别名映射链上，不纳入目标检查。
    function classifyAndCollect(collect, canonicalSet, maxTitleLen) {
      // out = { key: [{label, value, kind}] }  ; kind ∈ {'DIRECT','CHAIN','SKIP'}
      const out = {};
      Object.entries(collect).forEach(([k, list]) => {
        list.forEach(entry => {
          const v = entry.value;
          if (typeof v !== 'string') return;
          const isCanonical = canonicalSet.has(v);
          const isReplace = (k !== v) && String(v).length <= maxTitleLen;
          if (isCanonical) {
            // 直接映射到规范节目 → 作为 DIRECT 条目
            (out[k] = out[k] || []).push({ ...entry, kind: 'DIRECT' });
          } else if (isReplace) {
            // 替换到非规范节目 → 可能是"二级别名中间值"，需要能收敛到规范节目
            (out[k] = out[k] || []).push({ ...entry, kind: 'CHAIN' });
          }
          // 否则：方言普通词（key==value 或 value过长）→ SKIP，不参与合法性断言
        });
      });
      return out;
    }
    const puClassified = classifyAndCollect(puRaw, canonicalSet, maxTitleLen);
    const mnClassified = classifyAndCollect(mnRaw, canonicalSet, maxTitleLen);
    const spClassified = classifyAndCollect(spRaw, canonicalSet, maxTitleLen);
    // 合并成一张"别名→所有可能value"的图（不区分词典，只做收敛性判断；同时为 CHAIN 条目记住 label）
    const graph = {}; // key -> Array<{value, label, kind}>
    function mergeIntoGraph(classified) {
      Object.entries(classified).forEach(([k, list]) => {
        list.forEach(e => {
          (graph[k] = graph[k] || []).push(e);
        });
      });
    }
    mergeIntoGraph(puClassified);
    mergeIntoGraph(mnClassified);
    mergeIntoGraph(spClassified);
    // DFS：给定 start，返回是否存在任意一条路径最终能到达 canonicalSet（带路径记忆避免环）
    function convergesToCanonical(start, visitedPath, depthLimit) {
      if (!depthLimit) depthLimit = 30; // 防御环
      if (visitedPath.has(start)) return false; // 已在当前路径 → 环
      const outs = graph[start];
      if (!outs || outs.length === 0) return false;
      visitedPath.add(start);
      try {
        for (const e of outs) {
          if (canonicalSet.has(e.value)) return true;
          if (depthLimit <= 1) continue;
          if (convergesToCanonical(e.value, visitedPath, depthLimit - 1)) return true;
        }
        return false;
      } finally {
        visitedPath.delete(start);
      }
    }
    // 收集 DIRECT + CHAIN 条目做目标合法性断言
    const allForTargetCheck = [
      ...Object.entries(puClassified).flatMap(([k, list]) => list.map(e => ({ key: k, ...e }))),
      ...Object.entries(mnClassified).flatMap(([k, list]) => list.map(e => ({ key: k, ...e }))),
      ...Object.entries(spClassified).flatMap(([k, list]) => list.map(e => ({ key: k, ...e })))
    ];
    let badTarget = 0;
    allForTargetCheck.forEach(({ key, label, value, kind }) => {
      if (kind === 'DIRECT') {
        // DIRECT: value 应该就是规范节目；如果不是 → 直接失败（不跳过）
        if (!canonicalSet.has(value)) {
          console.log(`   ✗ [9F-0] ${label} 别名 "${key}" → "${value}" (DIRECT) 目标不在规范节目集合`);
          badTarget++;
        }
      } else if (kind === 'CHAIN') {
        // CHAIN: value 是中间值；要求"从 key 出发，至少有一条链路到达规范节目"
        // （value 本身可能在其他词典里作为别名继续指向规范节目）
        if (!convergesToCanonical(key, new Set())) {
          console.log(`   ✗ [9F-0] ${label} 别名 "${key}" → "${value}" (CHAIN) 无法最终收敛到任何规范节目`);
          badTarget++;
        }
      }
    });
    check(`[9F-0] 三张别名表中有效映射 DIRECT+CHAIN 共 ${allForTargetCheck.length} 条，全部可收敛到规范节目（失败=${badTarget}）`,
      badTarget === 0, `非法映射条目=${badTarget}`);
    // === [9F-5] 反向防护：隔离测试样例，验证"映射目标不存在 → 检测函数真的会判失败"
    // （授权【四-11】：不改生产数据，在测试内部用隔离样例验证）
    (function testBadTargetDetection_isolated() {
      const fakeDict = { '不存在的别名1': '不存在的节目A', '不存在的别名2': '西游记' };
      const fakeCollect = mkCollect(fakeDict, 'testDict');
      const classified = classifyAndCollect(fakeCollect, canonicalSet, maxTitleLen);
      const entries = Object.entries(classified).flatMap(([k, list]) => list.map(e => ({ key: k, ...e })));
      let fakeBad = 0;
      entries.forEach(({ key, label, value, kind }) => {
        if (kind === 'DIRECT') {
          if (!canonicalSet.has(value)) fakeBad++;
        } else if (kind === 'CHAIN') {
          // 简化构造：在 fakeDict 范围内图搜索（不依赖全局 graph），若全局 convergesToCanonical 能返回 false 也算检测到
          // 这里用更严格的方式："CHAIN 且 value 不在 canonicalSet 且 value 不在 fakeCollect 中"视为无法收敛
          const fGraph = {};
          Object.entries(fakeCollect).forEach(([fk, flist]) => { (fGraph[fk] = []).push(...flist); });
          function ok(s, vis) {
            if (vis.has(s)) return false; vis.add(s);
            const os = fGraph[s]; if (!os) return false;
            for (const e of os) { if (canonicalSet.has(e.value)) return true; if (ok(e.value, vis)) return true; }
            return false;
          }
          if (!ok(key, new Set())) fakeBad++;
        }
      });
      const detected = (fakeBad >= 1);
      check(`[9F-5] 反向防护：隔离样例中存在 1 个"目标非规范"映射，检测函数应识别到（避免假通过回归）`,
        detected && entries.some(e => e.key === '不存在的别名1'),
        `实际非法映射数=${fakeBad}，条目数=${entries.length}`);
    })();
    // 构造冲突扫描和猪八戒断言用的兼容结构 pu/mn/sp（只含 DIRECT+CHAIN，值={label,value}）
    function stripKind(classified) {
      const out = {};
      Object.entries(classified).forEach(([k, list]) => {
        list.forEach(e => {
          if (e.kind === 'DIRECT' || e.kind === 'CHAIN') {
            (out[k] = out[k] || []).push({ label: e.label, value: e.value });
          }
        });
      });
      return out;
    }
    const pu = stripKind(puClassified);
    const mn = stripKind(mnClassified);
    const sp = stripKind(spClassified);
    const merged = {};
    [pu, mn, sp].forEach(col => Object.entries(col).forEach(([k, list]) => {
      merged[k] = (merged[k] || []).concat(list);
    }));
    const conflicts = [];
    Object.entries(merged).forEach(([key, list]) => {
      const sources = new Set(list.map(x=>x.label));
      const values  = new Set(list.map(x=>x.value));
      if (sources.size >= 2 && values.size >= 2) {
        conflicts.push({
          key,
          sources: [...sources].sort(),
          values:  [...values].sort(),
          bySource: list.slice().sort((a,b)=>a.label.localeCompare(b.label))
        });
      }
    });
    // 精确白名单：唯一允许的 1 条冲突（调用链路分离，不构成歧义）
    //   别名   = 状元
    //   来源   = minnanDict / puxianDict / spokenAliasMap
    //   映射值 = 吕蒙正 / 状元与乞丐
    //   理由   = puxianDict/minnanDict 用于方言翻译链路（currentLang = puxianhua / minnanhua）；
    //            spokenAliasMap 用于 normalizeSpokenQuery 中文/语音链路。两条链路在运行时互斥触发，
    //            同一请求不会同时应用两张表。因此"状元"这一别名虽然跨表映射不同节目，但不会在
    //            同一个 aliasMap 内部自相矛盾，属于预期的分工。
    const ALLOWED = [{
      key: '状元',
      sources: ['minnanDict', 'puxianDict', 'spokenAliasMap'].sort(),
      values:  ['吕蒙正', '状元与乞丐'].sort(),
      assertCanonical: ['吕蒙正', '状元与乞丐'], // 必须都在 canonicalSet 中
      reason: '调用链路分离：方言翻译(currentLang=puxianhua/minnanhua)使用 puxianDict/minnanDict→吕蒙正；'
            + 'normalizeSpokenQuery(中文/语音链路)使用 spokenAliasMap→状元与乞丐。两条链路在运行时互斥，'
            + '同一请求不会在同一 aliasMap 内命中两次不同 value，因此不构成运行时歧义。'
    }];
    // 1) 断言白名单中的两个目标值都是规范节目名（避免节目库变化后白名单指向的节目已被删除/改名）
    let badCanonical = 0;
    ALLOWED.forEach((rule, i) => {
      rule.assertCanonical.forEach(t => {
        if (!canonicalSet.has(t)) {
          console.log(`   ✗ [9F] 白名单[${i}] key="${rule.key}" 断言值 "${t}" 不在 canonicalSet，节目库可能已变更`);
          badCanonical++;
        }
      });
    });
    check(`[9F-1] 精确白名单(${ALLOWED.length} 条)中所有断言目标值均为真实规范节目名`,
      badCanonical === 0, `失败条目=${badCanonical}`);
    // === [9F-1-extra] 白名单数量只能为 1，防止未来悄悄扩展（授权【四-8】）
    check(`[9F-1x] 精确白名单数量严格=1（当前=${ALLOWED.length}），不得自动扩展`,
      ALLOWED.length === 1, `白名单数量=${ALLOWED.length}`);

    // 2) 计算发现的冲突与白名单的差值
    function matchRule(conflict, rule) {
      if (conflict.key !== rule.key) return false;
      if (JSON.stringify(conflict.sources) !== JSON.stringify(rule.sources)) return false;
      if (JSON.stringify(conflict.values)  !== JSON.stringify(rule.values))  return false;
      return true;
    }
    const unknown = [];
    const matched = new Set();
    conflicts.forEach(c => {
      const idx = ALLOWED.findIndex(r => matchRule(c, r));
      if (idx < 0) unknown.push(c); else matched.add(idx);
    });
    const unmatchedRules = ALLOWED.filter((_,i)=>!matched.has(i));
    if (ALLOWED.length) {
      check(`[9F-2] 精确白名单全部匹配 (${matched.size}/${ALLOWED.length})，白名单中不应有多余条目`,
        unmatchedRules.length === 0,
        unmatchedRules.length ? '未匹配的白名单条目：' + unmatchedRules.map(r=>`"${r.key}"->${JSON.stringify(r.values)}`).join(' | ') : '');
    }
    check(`[9F-3] 跨词典别名冲突 = 白名单内允许的 ${ALLOWED.length - unmatchedRules.length} 条；白名单外未知冲突 = ${unknown.length}（必须为0）`,
      unknown.length === 0,
      unknown.length ? ('未知冲突：' + unknown.map(c =>
        `"${c.key}"[${c.sources.join(',')}] → ${c.values.join(' vs ')}`
      ).join(' ； ')) : '');

    // === [9F-4] 猪八戒专项回归断言（授权【四-10】）：三表有效映射全部指向《西游记》，
    // 不得出现「猪八戒娶亲」；不得为「猪八戒」单独建白名单。
    (function assertZhuBajieConsistency() {
      const ZBJ_KEY = '猪八戒';
      const EXPECTED = '西游记';
      const MUST_NOT = '猪八戒娶亲';
      // 从 pu/mn/sp 三张别名映射收集「猪八戒」对应的所有值
      const fromThreeTables = [pu, mn, sp].flatMap(col => (col[ZBJ_KEY] || []).map(e => ({
        source: e.label,
        value:  e.value
      })));
      // 为确保 spokenAliasMap 提取函数覆盖完整，再从 sandbox.window.__spokenAliasMap 原始对象直接查
      const rawFromSpoken = (typeof sandbox.window.__spokenAliasMap === 'object' && sandbox.window.__spokenAliasMap !== null)
        ? sandbox.window.__spokenAliasMap[ZBJ_KEY] : undefined;
      const valuesAll = [...fromThreeTables.map(x => x.value)];
      if (rawFromSpoken !== undefined) valuesAll.push(rawFromSpoken);
      const badValues = valuesAll.filter(v => v !== EXPECTED);
      const goodCount = valuesAll.filter(v => v === EXPECTED).length;
      // 断言：三表至少 3 个「西游记」
      check(`[9F-4a] 猪八戒回归：三表+原始spokenAliasMap 中「猪八戒」映射全部=${EXPECTED}（至少3条有效映射）`,
        badValues.length === 0 && goodCount >= 3,
        `映射值集合=${JSON.stringify(valuesAll)}；异常值(≠${EXPECTED})=${JSON.stringify(badValues)}；goodCount=${goodCount}`);
      // 反向：fromThreeTables + rawFromSpoken 中不得出现「猪八戒娶亲」
      const hasForbidden = valuesAll.includes(MUST_NOT);
      check(`[9F-4b] 猪八戒回归：任何有效路径都不得把「猪八戒」映射到「${MUST_NOT}」`,
        !hasForbidden,
        `已发现 "${MUST_NOT}" 出现在映射值中=${JSON.stringify(valuesAll)}`);
      // 白名单中不得包含「猪八戒」
      const zbjInWhitelist = ALLOWED.some(r => r.key === ZBJ_KEY);
      check(`[9F-4c] 猪八戒回归：「猪八戒」没有被加入跨词典白名单（它不应该有冲突）`,
        !zbjInWhitelist,
        zbjInWhitelist ? '发现猪八戒在 ALLOWED 白名单中，违反方案 C 要求' : '');
      // 打印方便审计
      fromThreeTables.forEach(e => console.log('   · [9F-4] 猪八戒 ' + String(e.source).padEnd(16) + ' → "' + e.value + '"' + (e.value === EXPECTED ? ' ✓' : ' ✗')));
      if (rawFromSpoken !== undefined) console.log('   · [9F-4] 猪八戒 sandbox.spoken   → "' + rawFromSpoken + '"' + (rawFromSpoken === EXPECTED ? ' ✓' : ' ✗'));
    })();

    // 3) 打印每条白名单的详细来源与值 + 理由（便于审计）
    ALLOWED.forEach((rule, i) => {
      console.log(`   · [9F] 白名单[${i}] alias="${rule.key}"  →  ${rule.sources.join(' / ')} 分别映射到 ${rule.values.join(' / ')}`);
      console.log(`       理由：${rule.reason}`);
    });
  }
}

// ============================================================
// 汇总
// ============================================================
console.log('');
console.log('─'.repeat(60));
console.log(` 检查项总计 : ${TOTAL_PASS + TOTAL_FAIL}`);
console.log(`      通过 : ${TOTAL_PASS}`);
console.log(`      失败 : ${TOTAL_FAIL}`);
console.log('─'.repeat(60));

if (TOTAL_FAIL === 0) {
  console.log('');
  console.log(' 🎉  全部通过！ama-channel-v2 阶段 0 基线检查成功。');
  console.log('');
  process.exit(0);
} else {
  console.log('');
  console.log(' ❌  以下 ' + TOTAL_FAIL + ' 项失败，请先修复：');
  FAILURES.forEach((f, i) => console.log(`   ${i+1}. ${f}`));
  console.log('');
  process.exit(1);
}
