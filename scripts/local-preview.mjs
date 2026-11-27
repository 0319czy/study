#!/usr/bin/env node
/**
 * local-preview.mjs — 本地模拟 GitHub Pages 的静态服务器,用于验收聚合站点。
 *
 * 行为与 GitHub Pages 对齐:
 *   - /某目录/          → 该目录 index.html
 *   - 存在的静态文件     → 原样返回
 *   - 不存在的路径       → 返回仓库根的 404.html,HTTP 状态 404(与 GitHub Pages 一致)
 *
 * 用法: node scripts/local-preview.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 4173);

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

async function tryFile(path) {
  try {
    const st = await stat(path);
    if (st.isFile()) return { path, st };
    if (st.isDirectory()) {
      const idx = join(path, 'index.html');
      const st2 = await stat(idx);
      if (st2.isFile()) return { path: idx, st: st2 };
    }
  } catch {
    /* 不存在 */
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  // 防止目录穿越
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(ROOT, safe);

  const found = await tryFile(filePath);
  if (found) {
    const body = await readFile(found.path);
    res.writeHead(200, {
      'content-type': MIME[extname(found.path)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
    return;
  }

  // GitHub Pages 行为:未知路径 → 根 404.html,状态 404
  try {
    const body = await readFile(join(ROOT, '404.html'));
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`local preview: http://127.0.0.1:${PORT}/  (root: ${ROOT})`);
});
