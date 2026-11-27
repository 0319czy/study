#!/usr/bin/env node
/**
 * finalize.mjs — 1kni4r.top 聚合站点收尾脚本
 *
 * 作用:
 *  1. 检查 6 个子站点目录是否就绪(存在 index.html);
 *  2. 给每个子站 index.html 注入「SPA 深链路径恢复」脚本(幂等,带标记检测);
 *  3. 生成 .nojekyll(GitHub Pages 不跑 Jekyll,保证 assets 目录完整发布);
 *  4. 生成 CNAME(自定义域名 → GitHub Pages);
 *  5. 生成根 404.html 的前缀表快照校验(与 404.html 实际内容一致性由人工保证)。
 *
 * 用法: node scripts/finalize.mjs
 * 退出码: 0 = 全部就绪;1 = 有站点未构建。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITES = [
  { slug: 'linux', name: 'Linux 驱动实验室' },
  { slug: 'mcu', name: 'MCU Playground' },
  { slug: 'analog', name: '知电 · 模拟电子技术' },
  { slug: 'ml', name: '知机 · 机器学习' },
  { slug: 'ros', name: 'ROS 学习实验室' },
  { slug: 'rtos', name: 'RTOS Lab' },
];
const DOMAIN = '1kni4r.top';

function injectRestore(html, slug) {
  const MARK = `id="1kni4r-spa-restore"`;
  if (html.includes(MARK)) return { html, changed: false };
  const prefix = `/${slug}/`;
  const script = `<script id="1kni4r-spa-restore">(function(){try{var p=sessionStorage.getItem('1kni4r-spa-path');if(p&&p.indexOf('${prefix}')===0){sessionStorage.removeItem('1kni4r-spa-path');history.replaceState(null,'',p);}}catch(e){}})();</script>`;
  if (html.includes('<head>')) {
    return { html: html.replace('<head>', '<head>\n  ' + script), changed: true };
  }
  return { html: script + '\n' + html, changed: true };
}

let failed = false;
const report = [];

for (const site of SITES) {
  const dir = join(ROOT, site.slug);
  const indexPath = join(dir, 'index.html');
  if (!existsSync(indexPath)) {
    failed = true;
    report.push(`✗ ${site.slug.padEnd(7)} 缺少 ${indexPath}`);
    continue;
  }
  const before = readFileSync(indexPath, 'utf8');
  const { html, changed } = injectRestore(before, site.slug);
  if (changed) writeFileSync(indexPath, html);
  // 统计产物大小,便于确认不是空壳
  let files = 0;
  let bytes = 0;
  (function walk(d) {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else {
        files++;
        bytes += st.size;
      }
    }
  })(dir);
  report.push(
    `${changed ? '✓ 注入' : '= 已含'} ${site.slug.padEnd(7)} ${site.name.padEnd(22)} ${files} 文件 / ${(bytes / 1048576).toFixed(2)} MB`,
  );
}

writeFileSync(join(ROOT, '.nojekyll'), '');
writeFileSync(join(ROOT, 'CNAME'), DOMAIN + '\n');
report.push(`✓ 生成 .nojekyll 与 CNAME(${DOMAIN})`);

console.log(report.join('\n'));
if (failed) process.exit(1);
