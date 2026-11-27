#!/usr/bin/env node
/**
 * build-sitemap.mjs — 生成 sitemap.xml 与 robots.txt(纯静态,无依赖)
 * 用法:node scripts/build-sitemap.mjs
 */
import { existsSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = 'https://1kni4r.top';

const PAGES = [
  '/', '/route/', '/knowledge/', '/labs/', '/projects/',
  '/projects/collect/', '/projects/m1/', '/projects/m2/', '/projects/m3/',
  '/projects/m4/', '/projects/m5/', '/tools/', '/search/', '/archive/',
  '/foundations/', '/foundations/c/', '/foundations/circuits/', '/foundations/linux-user/',
  '/directions/', '/directions/linux-build/', '/directions/ros/',
  '/directions/pcb/', '/directions/edge-ai/',
  '/linux/', '/mcu/', '/analog/', '/ml/', '/ros/', '/rtos/',
];

function mtime(page) {
  const clean = page.replace(/^\//, '').replace(/\/$/, '');
  const candidates = clean === '' ? [join(ROOT, 'index.html')] : [join(ROOT, clean, 'index.html')];
  for (const c of candidates) {
    try {
      const st = statSync(c);
      if (st.isFile()) return st.mtime.toISOString();
    } catch {}
  }
  return null;
}

const found = [];
for (const page of PAGES) {
  const last = mtime(page);
  if (last) found.push({ loc: DOMAIN + page, last });
}

function walkIndexes(dir, relPrefix, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'assets') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkIndexes(full, relPrefix + '/' + name, out);
    } else if (name === 'index.html' && relPrefix !== '') {
      out.push({ loc: DOMAIN + relPrefix + '/', last: st.mtime.toISOString() });
    }
  }
}
const SLUGS = ['linux', 'mcu', 'analog', 'ml', 'ros', 'rtos'];
for (const slug of SLUGS) {
  const slugDir = join(ROOT, slug);
  if (!existsSync(slugDir)) continue;
  walkIndexes(slugDir, '/' + slug, found);
}

const seen = new Set();
const unique = [];
for (const e of found) {
  if (seen.has(e.loc)) continue;
  seen.add(e.loc);
  unique.push(e);
}
unique.sort((a, b) => a.loc.localeCompare(b.loc));

const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
for (const e of unique) {
  lines.push('  <url><loc>' + e.loc + '</loc><lastmod>' + e.last.slice(0, 10) + '</lastmod></url>');
}
lines.push('</urlset>', '');
writeFileSync(join(ROOT, 'sitemap.xml'), lines.join('\n'));
writeFileSync(join(ROOT, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: ' + DOMAIN + '/sitemap.xml\n');
console.log('✓ sitemap.xml 已生成:' + unique.length + ' 条');
console.log('✓ robots.txt 已生成');
