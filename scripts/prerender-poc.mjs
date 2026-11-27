#!/usr/bin/env node
/**
 * prerender-poc.mjs — 深链静态预渲染 POC(GitHub Pages 静态站)。
 *
 * 背景:本站是 React SPA,GitHub Pages 上访问 /linux/labs 这类深链时,服务器找不到
 * 对应文件 → 返回仓库根 404.html → 404.html 用 sessionStorage 记住原路径并跳回
 * /linux/ → 站点 index.html 的恢复脚本 history.replaceState 还原路径 → React 渲染。
 * 结果:人能看到页面,但爬虫/分享卡片拿到的是 HTTP 404 + 空壳 HTML。
 *
 * 本脚本验证的替代方案:在本地按 GitHub Pages 的语义起一个临时静态服务(未知路径回退
 * 根 404.html 并返回 404),让 headless Chrome 完整走一遍「404 → 恢复路径 → React 渲染」,
 * 等页面动画/DOM 稳定后取 outerHTML,落盘为该路由目录下的 index.html。之后该深链在任何静态服务器
 * (含 GitHub Pages)上都是一份现成的 200 HTML,内容已经在 HTML 里。
 *
 * 用法(默认行为即验收用的那一条):
 *   node scripts/prerender-poc.mjs --slug linux --route /linux/labs
 *
 * 可选参数见 --help。
 *
 * 幂等性:同一份输入渲染结果稳定(实测两次渲染逐字节一致)。内容未变化时不重写文件,
 * 重复执行不会产生无意义改动;渲染阶段内部服务刻意把目标路由当作「文件不存在」,
 * 保证第一次跑与第 N 次跑走的是同一条 404 兜底链路。
 */
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** 每条路由的默认断言关键字(可用 --expect 覆盖)。 */
const DEFAULT_EXPECT = {
  '/linux/labs': ['动画实验室', '实验'],
};

const USAGE_LINES = [
  '用法: node scripts/prerender-poc.mjs --slug <slug> --route </slug/路径> (可选参数)',
  '',
  '  --slug <slug>       站点 slug(位于仓库根,需已有 <slug>/index.html)',
  '  --route <path>      要预渲染的路由,如 /linux/labs',
  '  --out <file>        快照输出路径,默认 <repo>/<route>/index.html',
  '  --expect <a,b>      断言快照包含的关键字(逗号分隔)',
  '  --chrome <path>     Chrome 可执行文件(默认自动探测,或 CHROME_PATH 环境变量)',
  '  --settle <ms>       等待页面动画/DOM 稳定的上限,默认 15000',
  '  --port <n>          临时服务端口,默认 0(自动分配空闲端口)',
  '  --control <path>    404 兜底抽查用的另一条深链,默认 /ml/paths',
  '  --timeout <ms>      Chrome 渲染超时,默认 120000',
  '  --no-verify         跳过写盘后的 HTTP / 资源 / 404 兜底校验',
  '  --no-render-verify  跳过写盘后用 Chrome 再渲染一次已落盘页面',
  '  --force             覆盖非本脚本生成的 index.html',
  '  --help              显示本帮助',
];

main().catch((error) => {
  console.error('[prerender-poc] 失败:' + error.message);
  process.exitCode = 1;
});

async function main() {
  const startedAt = Date.now();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE_LINES.join('\n'));
    return;
  }

  const ctx = await resolveContext(opts);
  console.log('[prerender-poc] 仓库根   : ' + ROOT);
  console.log('[prerender-poc] 目标路由 : ' + ctx.route);
  console.log('[prerender-poc] 输出文件 : ' + ctx.outPath);
  console.log('[prerender-poc] 断言关键字: ' + ctx.expect.join(' / '));

  // 1. 临时静态服务:GitHub Pages 语义(未知路径 → 根 404.html + 404)。
  //    渲染阶段刻意屏蔽目标路由,保证每次都走「文件不存在 → 404 兜底 → 恢复路径 → 渲染」。
  const server = await startPreviewServer(opts.port);
  const base = 'http://127.0.0.1:' + server.port;
  console.log('[prerender-poc] 临时服务 : ' + base + '  (未命中路径回退 404.html)');

  const chrome = await findChrome(opts.chrome);
  console.log('[prerender-poc] Chrome   : ' + chrome);

  try {
    server.blockRoute(ctx.route);
    const before = await server.fetch(ctx.route);
    console.log('[prerender-poc] 渲染前   : GET ' + ctx.route + ' → HTTP ' + before.status + (before.status === 404 ? '(预期:404 兜底)' : ''));
    if (before.status !== 404) {
      throw new Error('渲染前 GET ' + ctx.route + ' 期望 404(快照尚未生成),实际 ' + before.status + ';请检查 --out / --force');
    }

    // 2. headless Chrome 走完整兜底链路并 dump DOM。
    const render = await renderRoute(chrome, base + ctx.route, { route: ctx.route, settleMax: opts.settle, timeout: opts.timeoutMs });
    console.log('[prerender-poc] 渲染完成 : ' + render.bytes + ' 字节 DOM,耗时 ' + render.ms + 'ms' + (render.settled ? '' : '  ⚠ 页面在 ' + opts.settle + 'ms 内未稳定'));

    // 3. 清洗运行时痕迹 + 断言,再落盘。
    const snapshot = sanitizeSnapshot(render.dom, ctx);
    const analysis = analyzeSnapshot(snapshot, ctx);
    if (analysis.problems.length) {
      throw new Error('快照校验未通过:\n  - ' + analysis.problems.join('\n  - '));
    }
    console.log('[prerender-poc] 正文文本 : ' + analysis.textChars + ' 字符,命中关键字:' + analysis.hits.join('、'));

    const written = await writeIfChanged(ctx.outPath, snapshot);
    console.log(
      '[prerender-poc] 落盘     : ' +
        (written.changed ? '已写入' : '未变化(幂等,跳过重写)') +
        ' ' +
        ctx.outPath +
        ' (' +
        written.bytes +
        ' 字节)',
    );

    // 4. 写盘后校验:切回 GitHub Pages 正常语义(命中新 index.html)。
    server.unblockRoute();
    if (!opts.noVerify) {
      const checks = await verifyServed(server, ctx, analysis.refs);
      for (const c of checks) console.log('[prerender-poc] ' + (c.ok ? '✓' : '✗') + ' ' + c.label + (c.detail ? ' — ' + c.detail : ''));
      const failed = checks.filter((c) => !c.ok);
      if (failed.length) throw new Error(failed.length + ' 项校验失败:' + failed.map((c) => c.label).join(';'));
    }

    if (!opts.noRenderVerify) {
      const again = await renderRoute(chrome, base + ctx.route, { route: ctx.route, settleMax: opts.settle, timeout: opts.timeoutMs });
      // 二次渲染取的是 outerHTML(不含 doctype / 生成标记),按落盘时的同一套清洗后再断言。
      const againAnalysis = analyzeSnapshot(sanitizeSnapshot(again.dom, ctx), ctx);
      if (againAnalysis.problems.length) {
        throw new Error('二次渲染(命中快照后由 React 接管)未通过:\n  - ' + againAnalysis.problems.join('\n  - '));
      }
      console.log('[prerender-poc] ✓ 二次渲染(命中快照 + React 接管):' + again.bytes + ' 字节 DOM,关键字仍命中(' + again.ms + 'ms)');
    }

    console.log('[prerender-poc] ✓ 全部通过,总耗时 ' + (Date.now() - startedAt) + 'ms');
  } finally {
    await server.close();
  }
}

// ---------------------------------------------------------------------------
// 参数与上下文
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    help: false,
    settle: 15000,
    port: 0,
    timeoutMs: 120000,
    control: '/ml/paths',
    noVerify: false,
    noRenderVerify: false,
    force: false,
    slug: '',
    route: '',
    out: '',
    expect: [],
    chrome: '',
  };
  const need = (name, value) => {
    if (value === undefined || value === '' || value.startsWith('--')) throw new Error('参数 ' + name + ' 缺少取值');
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--slug') {
      opts.slug = need(arg, argv[i + 1]);
      i += 1;
    } else if (arg === '--route') {
      opts.route = need(arg, argv[i + 1]);
      i += 1;
    } else if (arg === '--out') {
      opts.out = need(arg, argv[i + 1]);
      i += 1;
    } else if (arg === '--expect') {
      opts.expect = need(arg, argv[i + 1]).split(',').map((s) => s.trim()).filter(Boolean);
      i += 1;
    } else if (arg === '--chrome') {
      opts.chrome = need(arg, argv[i + 1]);
      i += 1;
    } else if (arg === '--control') {
      opts.control = need(arg, argv[i + 1]);
      i += 1;
    } else if (arg === '--settle') {
      opts.settle = Number(need(arg, argv[i + 1]));
      i += 1;
    } else if (arg === '--budget') {
      // 兼容旧参数:等价于 --settle
      opts.settle = Number(need(arg, argv[i + 1]));
      i += 1;
    } else if (arg === '--port') {
      opts.port = Number(need(arg, argv[i + 1]));
      i += 1;
    } else if (arg === '--timeout') {
      opts.timeoutMs = Number(need(arg, argv[i + 1]));
      i += 1;
    } else if (arg === '--no-verify') {
      opts.noVerify = true;
    } else if (arg === '--no-render-verify') {
      opts.noRenderVerify = true;
    } else if (arg === '--force') {
      opts.force = true;
    } else {
      throw new Error('未知参数 ' + arg + '(--help 查看用法)');
    }
  }
  for (const key of ['settle', 'port', 'timeoutMs']) {
    if (!Number.isFinite(opts[key]) || opts[key] < 0) throw new Error('参数 --' + key + ' 需要非负数字');
  }
  return opts;
}

async function resolveContext(opts) {
  if (!opts.route) throw new Error('缺少 --route(例:--route /linux/labs)');
  const route = normalizeRoute(opts.route);
  const segments = route.slice(1).split('/');
  const slug = opts.slug || segments[0];
  if (!/^[a-z0-9-]+$/i.test(slug)) throw new Error('slug 非法:' + slug);
  if (segments[0] !== slug) throw new Error('路由 ' + route + ' 不属于 slug「' + slug + '」');
  if (segments.length < 2) throw new Error('route 至少需要两段,如 /linux/labs');

  const siteIndex = join(ROOT, slug, 'index.html');
  if (!existsSync(siteIndex)) throw new Error('站点根 ' + siteIndex + ' 不存在,请确认 --slug');

  const outPath = opts.out ? resolve(opts.out) : join(resolve(ROOT, route.replace(/^\/+/, '')), 'index.html');
  const rel = relative(ROOT, outPath);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('输出路径必须位于仓库内:' + outPath);
  if (outPath.split('/').pop() !== 'index.html') throw new Error('输出路径必须以 index.html 结尾:' + outPath);

  // 只在「本脚本生成过的快照」或空位上写,避免误伤手写页面。
  if (existsSync(outPath) && !opts.force) {
    const existing = await readFile(outPath, 'utf8').catch(() => '');
    if (!existing.includes('prerendered-by:')) {
      throw new Error(outPath + ' 已存在且不是 prerender-poc 生成的快照;确认要覆盖请加 --force');
    }
  }

  const expect = opts.expect.length ? opts.expect : DEFAULT_EXPECT[route] || [];
  if (!expect.length) throw new Error('路由 ' + route + ' 没有内置断言关键字,请用 --expect 指定');

  return { slug, route, outPath, expect, control: opts.control };
}

function normalizeRoute(input) {
  let route = String(input).trim();
  if (!route.startsWith('/')) route = '/' + route;
  route = route.replace(/\/+$/, '').replace(/\/{2,}/g, '/');
  if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(route)) throw new Error('路由格式非法:' + input);
  return route;
}

// ---------------------------------------------------------------------------
// 本地静态服务(与 GitHub Pages 行为一致)
// ---------------------------------------------------------------------------

async function startPreviewServer(port) {
  const fallbackIndex = join(ROOT, '404.html');
  const state = { blocked: '' };

  const tryFile = async (path) => {
    try {
      const info = await stat(path);
      if (info.isFile()) return path;
      if (info.isDirectory()) {
        const idx = join(path, 'index.html');
        const idxInfo = await stat(idx);
        if (idxInfo.isFile()) return idx;
      }
    } catch {
      /* 不存在 */
    }
    return null;
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const filePath = join(ROOT, safe);

      // 渲染阶段:把目标路由当作「文件不存在」,迫使浏览器走 404 兜底链路。
      const trimmed = pathname.replace(/\/+$/, '');
      const isBlocked = state.blocked !== '' && trimmed === state.blocked;

      const found = isBlocked ? null : await tryFile(filePath);
      if (found) {
        const body = await readFile(found);
        res.writeHead(200, {
          'content-type': MIME[extname(found)] || 'application/octet-stream',
          'cache-control': 'no-store',
        });
        res.end(body);
        return;
      }

      // GitHub Pages:未知路径 → 仓库根 404.html,HTTP 状态 404。
      try {
        const body = await readFile(fallbackIndex);
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(body);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      }
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('500 ' + error.message);
    }
  });

  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolvePromise);
  });
  const actualPort = server.address().port;

  return {
    port: actualPort,
    blockRoute(route) {
      state.blocked = route.replace(/\/+$/, '');
    },
    unblockRoute() {
      state.blocked = '';
    },
    async fetch(pathname) {
      const res = await fetch('http://127.0.0.1:' + actualPort + pathname, { redirect: 'manual' });
      return { status: res.status, type: res.headers.get('content-type') || '', body: await res.text() };
    },
    async close() {
      await new Promise((r) => server.close(() => r()));
    },
  };
}

// ---------------------------------------------------------------------------
// headless Chrome
// ---------------------------------------------------------------------------

function findChromeInPath() {
  const names = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome'];
  for (const candidate of names) {
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', [candidate], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0];
  }
  return '';
}

async function findChrome(explicit) {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error('指定的 Chrome 不存在:' + explicit);
    return explicit;
  }
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const found = findChromeInPath();
  if (found && existsSync(found)) return found;
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error('未找到 Chrome/Chromium;请用 --chrome 指定或设置 CHROME_PATH');
}

/**
 * headless Chrome 渲染:CDP 等「页面动画与 DOM 稳定」后取 outerHTML。
 *
 * 为什么不用 --dump-dom:dump 发生在固定的虚拟时间点,动画可能正处在 spring 中间帧,
 * 同一页面两次渲染字节不同,无法保证幂等。这里改成:
 *   1. 起 Chrome(--remote-debugging-port=0),按 DevToolsActivePort 连上页面 target;
 *   2. 等 URL 落到目标路由、readyState 离开 loading;
 *   3. 注入稳定检测:持续 finish() CSS 动画 + MutationObserver 盯着 DOM,
 *      已等待 ≥1.2s 且连续 700ms 无变更才认为稳定;
 *   4. Runtime.evaluate 取 document.documentElement.outerHTML。
 */
async function renderRoute(chrome, url, options) {
  const route = options.route;
  const timeout = options.timeout;
  const settleMax = Math.max(1000, options.settleMax);
  const profileDir = join(tmpdir(), 'prerender-poc-chrome-' + process.pid + '-' + randomBytes(4).toString('hex'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--mute-audio',
    // 强制 reduced-motion:framer-motion 跳过 transform/位移动画、CSS 过渡停用,
    // 页面更快进入稳定终态。
    '--force-prefers-reduced-motion',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profileDir,
    url,
  ];
  const startedAt = Date.now();
  const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 8000) stderr += chunk.toString();
  });

  const work = (async () => {
    const target = await findPageTarget(profileDir, timeout);
    const client = await connectCdp(target.webSocketDebuggerUrl);
    try {
      await client.send('Runtime.enable');
      const reached = await waitForRoute(client, route, Math.min(20000, timeout));
      if (!reached) throw new Error('页面未落到目标路由 ' + route);
      const settled = await evaluateWithRetry(client, settleExpression(settleMax), { awaitPromise: true });
      const html = await evaluateWithRetry(client, 'document.documentElement.outerHTML');
      if (typeof html !== 'string' || !html.trim()) throw new Error('CDP 未取到 DOM');
      return {
        dom: html,
        bytes: Buffer.byteLength(html, 'utf8'),
        ms: Date.now() - startedAt,
        settled: Boolean(settled && settled.ok),
      };
    } finally {
      client.close();
    }
  })();

  const watchdog = new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome 渲染超时(' + timeout + 'ms)')), timeout);
    if (timer.unref) timer.unref();
  });

  try {
    return await Promise.race([work, watchdog]);
  } catch (error) {
    const tail = stderr.trim().split(/\r?\n/).slice(-6).join(' | ');
    throw new Error(error.message + (tail ? '; Chrome stderr: ' + tail : ''));
  } finally {
    work.catch(() => {});
    child.kill('SIGKILL');
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 轮询 DevToolsActivePort 与 /json/list,拿到可调试的页面 target。 */
async function findPageTarget(profileDir, timeoutMs) {
  const portFile = join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + Math.min(timeoutMs, 20000);
  let port = 0;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const content = await readFile(portFile, 'utf8').catch(() => '');
      const first = String(content).split(/\r?\n/)[0].trim();
      if (/^\d+$/.test(first)) {
        port = Number(first);
        break;
      }
    }
    await sleep(100);
  }
  if (!port) throw new Error('Chrome 调试端口未就绪(DevToolsActivePort 未出现)');
  let target = null;
  while (Date.now() < deadline && !target) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || null;
    } catch {
      /* 调试端口还没就绪 */
    }
    if (!target) await sleep(100);
  }
  if (!target) throw new Error('未找到可调试的页面 target');
  return target;
}

/** 极简 CDP 客户端(只用 Runtime.evaluate)。 */
function connectCdp(wsUrl) {
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;
    let opened = false;
    ws.addEventListener(
      'open',
      () => {
        opened = true;
        resolvePromise({
          send(method, params) {
            return new Promise((resolve, rejectSend) => {
              const id = nextId++;
              pending.set(id, { resolve, reject: rejectSend });
              try {
                ws.send(JSON.stringify({ id, method, params: params || {} }));
              } catch (error) {
                pending.delete(id);
                rejectSend(error);
              }
            });
          },
          close() {
            try {
              ws.close();
            } catch {
              /* 已关闭 */
            }
          },
        });
      },
      { once: true },
    );
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    });
    ws.addEventListener('error', () => {
      if (!opened) reject(new Error('CDP WebSocket 连接失败'));
    });
    ws.addEventListener('close', () => {
      for (const entry of pending.values()) entry.reject(new Error('CDP 连接已关闭'));
      pending.clear();
    });
  });
}

/** Runtime.evaluate 包装:导航期间执行上下文会被销毁,这里带重试。 */
async function evaluateWithRetry(client, expression, options) {
  const awaitPromise = Boolean(options && options.awaitPromise);
  const deadline = Date.now() + 20000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await client.send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
      });
      if (result && result.exceptionDetails) {
        lastError = new Error(result.exceptionDetails.text || '页面脚本异常');
      } else {
        return result ? result.result.value : undefined;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(120);
  }
  throw new Error('CDP evaluate 失败:' + (lastError ? lastError.message : '超时'));
}

/** 等 SPA 完成 404 → 恢复路径,URL 落到目标路由。 */
async function waitForRoute(client, route, timeoutMs) {
  const expected = route.replace(/\/+$/, '');
  const deadline = Date.now() + timeoutMs;
  const expression =
    '({ pathname: location.pathname, ready: document.readyState, hasRoot: Boolean(document.getElementById("root")) })';
  while (Date.now() < deadline) {
    try {
      const result = await client.send('Runtime.evaluate', { expression, returnByValue: true });
      const value = result && result.result && result.result.value;
      if (value && value.ready !== 'loading' && String(value.pathname).replace(/\/+$/, '') === expected) return true;
    } catch {
      /* 导航中上下文会被销毁,重试 */
    }
    await sleep(120);
  }
  return false;
}

/** 页面内置的「稳定检测」表达式:动画 finish + DOM 静默。 */
function settleExpression(settleMax) {
  return [
    'new Promise((resolve) => {',
    '  const started = Date.now();',
    '  let lastMutation = Date.now();',
    '  const observer = new MutationObserver(() => { lastMutation = Date.now(); });',
    '  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });',
    '  const finishCss = () => {',
    '    try { document.getAnimations().forEach((anim) => { try { anim.finish(); } catch (e) {} }); } catch (e) {}',
    '  };',
    '  const tick = () => {',
    '    finishCss();',
    '    const now = Date.now();',
    '    if (now - started > 1200 && now - lastMutation > 700) { observer.disconnect(); resolve({ ok: true, waited: now - started }); return; }',
    '    if (now - started > ' + settleMax + ') { observer.disconnect(); resolve({ ok: false, waited: now - started }); return; }',
    '    setTimeout(tick, 120);',
    '  };',
    '  tick();',
    '})',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 快照清洗与断言
// ---------------------------------------------------------------------------

function markerFor(route) {
  return '<!-- prerendered-by: scripts/prerender-poc.mjs route=' + route + ' -->';
}

function stripHtmlRuntimeAttrs(html) {
  const match = /<html\b[^>]*>/i.exec(html);
  if (!match) return html;
  const tag = match[0];
  const inner = tag.slice('<html'.length, tag.length - 1);
  const kept = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /\s/.test(inner[i])) i += 1;
    if (i >= inner.length) break;
    const nameStart = i;
    while (i < inner.length && inner[i] !== '=' && !/\s/.test(inner[i])) i += 1;
    const name = inner.slice(nameStart, i).toLowerCase();
    let value = '';
    if (inner[i] === '=') {
      i += 1;
      const quote = inner[i];
      if (quote === '"' || quote === "'") {
        i += 1;
        const valueStart = i;
        while (i < inner.length && inner[i] !== quote) i += 1;
        value = inner.slice(valueStart, i);
        i += 1;
      } else {
        const valueStart = i;
        while (i < inner.length && !/\s/.test(inner[i])) i += 1;
        value = inner.slice(valueStart, i);
      }
    }
    // 主题开关会在渲染机上往 html 写 class / style,不能烘进静态快照。
    if (name === 'class' || name === 'style') continue;
    kept.push(value ? name + '="' + value + '"' : name);
  }
  const rebuilt = kept.length ? '<html ' + kept.join(' ') + '>' : '<html>';
  return html.replace(tag, rebuilt);
}

function sanitizeSnapshot(dom, ctx) {
  let html = dom.replace(/\r\n/g, '\n').trim();
  // CDP 取的是 outerHTML(不含 doctype),补回标准头。
  if (!/^<!doctype html>/i.test(html)) html = '<!DOCTYPE html>\n' + html;
  html = stripHtmlRuntimeAttrs(html);
  if (!html.includes('prerendered-by:')) {
    html = html.replace(/^<!doctype html>\s*/i, '<!DOCTYPE html>\n' + markerFor(ctx.route) + '\n');
  }
  return html + '\n';
}

function extractRefs(html) {
  const refs = new Set();
  const markers = ['src="', "src='", 'href="', "href='"];
  for (let i = 0; i < html.length; i += 1) {
    for (const marker of markers) {
      if (!html.startsWith(marker, i)) continue;
      const quote = marker[marker.length - 1];
      const start = i + marker.length;
      const end = html.indexOf(quote, start);
      if (end > start) refs.add(html.slice(start, end));
    }
  }
  return Array.from(refs);
}

function analyzeSnapshot(html, ctx) {
  const problems = [];
  const expect = ctx.expect;
  if (!/^<!doctype html>/i.test(html.trimStart())) problems.push('缺少 <!DOCTYPE html>');
  if (html.includes('正在打开站点')) problems.push('快照仍是 404 兜底页(渲染未完成或跳转超时)');

  const rootMarker = '<div id="root">';
  const rootIndex = html.indexOf(rootMarker);
  const rootBody = rootIndex >= 0 ? html.slice(rootIndex + rootMarker.length) : '';
  if (rootIndex < 0 || !rootBody.replace(/^\s+/, '').startsWith('<')) {
    problems.push('div id=root 内没有渲染结果');
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const textChars = Array.from(text).length;
  if (textChars < 500) problems.push('正文文本只有 ' + textChars + ' 字符,疑似渲染不完整');

  const refs = extractRefs(html);
  const relativeRefs = refs.filter((ref) => {
    if (ref.startsWith('/') || ref.startsWith('#') || ref.startsWith('data:')) return false;
    if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('mailto:')) return false;
    return true;
  });
  if (relativeRefs.length) problems.push('存在相对路径引用(会因路由层级失效):' + relativeRefs.slice(0, 5).join(', '));

  const hits = expect.filter((k) => html.includes(k));
  const missing = expect.filter((k) => !html.includes(k));
  if (missing.length) problems.push('缺少关键字:' + missing.map((k) => '「' + k + '」').join('、'));

  return { problems, textChars, hits, text, refs };
}

async function writeIfChanged(outPath, content) {
  const bytes = Buffer.byteLength(content, 'utf8');
  const existing = await readFile(outPath, 'utf8').catch(() => null);
  if (existing === content) return { changed: false, bytes };
  await mkdir(dirname(outPath), { recursive: true });
  const tmp = outPath + '.tmp-' + process.pid;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, outPath);
  return { changed: true, bytes };
}

// ---------------------------------------------------------------------------
// 写盘后校验
// ---------------------------------------------------------------------------

async function verifyServed(server, ctx, refs) {
  const checks = [];
  const expect = ctx.expect;

  const checkRoute = async (pathname) => {
    const result = await server.fetch(pathname);
    const hasKeys = expect.every((k) => result.body.includes(k));
    const ok = result.status === 200 && hasKeys;
    checks.push({
      ok,
      label: 'GET ' + pathname + ' → 200 且含关键字',
      detail: 'HTTP ' + result.status + ', ' + Buffer.byteLength(result.body, 'utf8') + ' 字节' + (ok ? '' : ',期望 200 且含 ' + expect.join('/')),
    });
  };

  // 1) 带斜杠 / 不带斜杠都要命中新 index.html,且内容里有关键字。
  await checkRoute(ctx.route);
  await checkRoute(ctx.route + '/');

  // 2) 快照引用的 /slug/assets/ 绝对资源逐个可达(证明路径无需改写)。
  const assetRefs = refs.filter((ref) => ref.startsWith('/' + ctx.slug + '/assets/'));
  let assetOk = assetRefs.length > 0;
  const assetDetail = [];
  for (const ref of assetRefs) {
    const result = await server.fetch(ref);
    if (result.status !== 200) {
      assetOk = false;
      assetDetail.push(ref + ' → ' + result.status);
    }
  }
  checks.push({
    ok: assetOk,
    label: '快照内站内绝对资源可达(' + assetRefs.length + ' 个)',
    detail: assetOk ? '全部 200' : assetDetail.join('; ') || '快照里没有找到 /' + ctx.slug + '/assets/ 引用',
  });

  // 3) 404 兜底未被破坏:另一条未预渲染的深链仍是 404 + 兜底页。
  const control = await server.fetch(ctx.control);
  const controlOk = control.status === 404 && control.body.includes('正在打开站点');
  checks.push({
    ok: controlOk,
    label: '404 兜底抽查 GET ' + ctx.control + '(未预渲染深链)',
    detail: 'HTTP ' + control.status + (controlOk ? ',兜底页正常' : ',兜底页标记缺失'),
  });

  return checks;
}
