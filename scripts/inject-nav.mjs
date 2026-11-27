#!/usr/bin/env node
/**
 * inject-nav.mjs — 给六站 index.html(含预渲染深链)注入共享平台导航(幂等)
 * 六站是 React SPA:导航插在 #root 之外,不改路由与源码。
 * 用法:node scripts/inject-nav.mjs
 * 注意:六站重新 build 后需重跑本脚本(与 finalize 一起)。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SLUGS = ['linux', 'mcu', 'analog', 'ml', 'ros', 'rtos'];
const LINK = '<link rel="stylesheet" href="/shared/site-nav-light.css" data-platform-nav-style="1" />';
const TOKENS = '<link rel="stylesheet" href="/shared/six-tokens.css" data-six-tokens="1" />';
const NAV = `<nav id="platform-nav" aria-label="平台导航">
  <a class="brand" href="/"><span class="brand-dot"></span>1kni4r 学习实验室</a>
  <div class="navlinks">
    <a href="/">学习工作台</a>
    <a href="/route/">学习路线</a>
    <a href="/knowledge/">知识库</a>
    <a href="/labs/">实验室</a>
    <a href="/projects/">项目实战</a>
    <a href="/tools/">工具与资料</a>
    <a href="/archive/">学习档案</a>
  </div>
  <a class="navsearch" href="/search/">搜索 ⌕</a>
  <button type="button" id="theme-toggle" class="theme-toggle">深色</button>
</nav>`;

// 收集六站所有 index.html(含深链预渲染快照)
async function walk(dir, out) {
  const { readdir } = await import('node:fs/promises');
  for (const name of await readdir(dir)) {
    if (name === 'assets') continue;
    const full = join(dir, name);
    const { stat } = await import('node:fs/promises');
    const st = await stat(full);
    if (st.isDirectory()) await walk(full, out);
    else if (name === 'index.html') out.push(full);
  }
}

const files = [];
for (const slug of SLUGS) {
  const d = join(ROOT, slug);
  if (existsSync(d)) await walk(d, files);
}

let changed = 0;
let skipped = 0;
for (const file of files) {
  const html = await readFile(file, 'utf8');
  if (!/<\/body>/i.test(html)) { skipped++; continue; }
  let next = html;
  // 移除旧块,保证幂等
  next = next.replace(/<link[^>]*data-platform-nav-style="1"[^>]*>\s*/gi, '');
  next = next.replace(/<link[^>]*data-six-tokens="1"[^>]*>\s*/gi, '');
  next = next.replace(/<nav id="platform-nav"[\s\S]*?<\/nav>\s*/gi, '');
  next = next.replace(/<script data-theme-script="1"[\s\S]*?<\/script>\s*/gi, '');
  // 令牌映射放在 </head> 前(晚于站点自身 CSS);导航在 <body> 后;主题脚本在 </body> 前
  next = next.replace(/<\/head>/i, TOKENS + '\n</head>');
  next = next.replace(/(<body[^>]*>)/i, '$1\n' + LINK + '\n' + NAV + '\n');
  next = next.replace(/<\/body>/i, '<script data-theme-script="1">(function(){var KEY=\'1kni4r-theme-v1\';function apply(t){var d=t===\'dark\';document.documentElement.classList.toggle(\'dark\',d);document.documentElement.dataset.theme=d?\'dark\':\'light\';var b=document.getElementById(\'theme-toggle\');if(b){b.textContent=d?\'浅色\':\'深色\';}}var s=null;try{s=localStorage.getItem(KEY);}catch(e){}apply(s===\'dark\'?\'dark\':\'light\');var btn=document.getElementById(\'theme-toggle\');if(btn){btn.addEventListener(\'click\',function(){var cur=document.documentElement.dataset.theme===\'dark\'?\'dark\':\'light\';var n=cur===\'dark\'?\'light\':\'dark\';try{localStorage.setItem(KEY,n);}catch(e){}apply(n);});}})();</script>\n</body>');
  if (next !== html) {
    await writeFile(file, next, 'utf8');
    changed++;
  }
}
console.log('[inject-nav] 处理 index.html ' + files.length + ' 个;写入 ' + changed + ' 个,跳过 ' + skipped);
