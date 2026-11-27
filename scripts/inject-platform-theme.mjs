#!/usr/bin/env node
/**
 * inject-platform-theme.mjs — 给平台页注入共享浅色主题、主题按钮与移动端折叠菜单(幂等)
 * 平台页默认浅色(1kni4r-theme-v1;无选择时 light),深色由用户切换。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = [
  'index.html',
  'route/index.html',
  'knowledge/index.html',
  'labs/index.html',
  'projects/index.html',
  'projects/collect/index.html', 'projects/m1/index.html', 'projects/m2/index.html',
  'projects/m3/index.html', 'projects/m4/index.html', 'projects/m5/index.html',
  'tools/index.html', 'search/index.html', 'archive/index.html',
  'foundations/index.html',
  'foundations/c/index.html', 'foundations/circuits/index.html', 'foundations/linux-user/index.html',
  'foundations/c-advanced/index.html', 'foundations/circuits-practice/index.html',
  'directions/index.html', 'directions/linux-build/index.html', 'directions/linux-build-deep/index.html',
  'directions/ros/index.html', 'directions/pcb/index.html', 'directions/edge-ai/index.html',
  'c/index.html', 'c/start/index.html', 'c/memory-debug/index.html',
  'digital/index.html', 'digital/start/index.html', 'digital/sampling-debounce/index.html',
  'linux-user/index.html', 'linux-user/start/index.html', 'linux-user/serial-pty/index.html',
  'linux-build/index.html', 'linux-build/start/index.html', 'linux-build/buildroot/index.html',
];
const LINK = '<link rel="stylesheet" href="/shared/platform-light.css" data-platform-theme="1" />';
const INIT = '<script data-theme-init="1">try{var t=localStorage.getItem("1kni4r-theme-v1");document.documentElement.dataset.theme=(t==="dark")?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}</script>';
const BTN = '<button type="button" data-theme-toggle class="theme-toggle" aria-pressed="false">深色</button>';
const NAVBTN = '<button type="button" class="nav-toggle" data-nav-toggle aria-expanded="false" aria-label="菜单">菜单</button>';
const SCRIPT = '<script src="/shared/theme.js" data-platform-theme-js="1"></script>';

let changed = 0;
let missing = 0;
for (const rel of PAGES) {
  const file = join(ROOT, rel);
  if (!existsSync(file)) { missing++; console.log('[platform-theme] 跳过(不存在): ' + rel); continue; }
  let html = await readFile(file, 'utf8');
  const before = html;
  html = html.replace(/<link[^>]*data-platform-theme="1"[^>]*>\s*/gi, '');
  html = html.replace(/<script[^>]*data-theme-init="1"[^>]*>[\s\S]*?<\/script>\s*/gi, '');
  html = html.replace(/<script[^>]*data-platform-theme-js="1"[^>]*><\/script>\s*/gi, '');
  html = html.replace(/<button[^>]*data-theme-toggle[^>]*>[\s\S]*?<\/button>\s*/gi, '');
  html = html.replace(/<button[^>]*data-nav-toggle[^>]*>[\s\S]*?<\/button>\s*/gi, '');
  html = html.replace(/<\/head>/i, LINK + '\n' + INIT + '\n</head>');
  html = html.replace(/(<a class="navsearch[^"]*")/i, NAVBTN + '\n    ' + BTN + '\n    $1');
  html = html.replace(/<\/body>/i, SCRIPT + '\n</body>');
  if (html !== before) { await writeFile(file, html, 'utf8'); changed++; }
}
console.log('[platform-theme] 写入 ' + changed + ' 页,跳过 ' + missing);
