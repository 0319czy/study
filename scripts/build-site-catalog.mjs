#!/usr/bin/env node
/**
 * build-site-catalog.mjs — 从 shared/site-catalog.json 生成工作台与知识库的学科卡片
 * 用法:node scripts/build-site-catalog.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(join(ROOT, 'shared/site-catalog.json'), 'utf8'));
const sites = catalog.sites || [];
const groups = catalog.groups || [...new Set(sites.map((s) => s.group))];

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/></svg>';

const homeCards = [];
let idx = 0;
for (const g of groups) {
  const list = sites.filter((s) => s.group === g);
  if (!list.length) continue;
  homeCards.push('        <div class="cat-group" style="grid-column:1/-1;font-size:12px;letter-spacing:.12em;color:#8b9bb0;text-transform:uppercase;margin:14px 0 2px">' + g + '</div>');
  for (const s of list) {
    idx += 1;
    const tags = (s.tags || []).map((t) => '<span class="tag">' + t + '</span>').join('');
    homeCards.push(
      '        <a class="card" href="' + s.href + '">\n' +
      '          <div class="card-top"><div class="icon">' + ICON + '</div><span class="idx">' + String(idx).padStart(2, '0') + '</span></div>\n' +
      '          <h2>' + s.name + '</h2>\n' +
      '          <p>' + s.summary + '</p>\n' +
      '          <div class="tags">' + tags + '</div>\n' +
      '          <span class="go">进入 →</span>\n' +
      '        </a>'
    );
  }
}

const knowCards = [];
for (const g of groups) {
  const list = sites.filter((s) => s.group === g);
  if (!list.length) continue;
  knowCards.push('        <div class="cat-group" style="grid-column:1/-1;font-size:12px;letter-spacing:.12em;color:#8b9bb0;text-transform:uppercase;margin:14px 0 2px">' + g + '</div>');
  for (const s of list) {
    knowCards.push(
      '        <a class="card" href="' + s.href + '">\n' +
      '          <div class="t">' + s.name + '</div>\n' +
      '          <div class="d">' + s.summary + '</div>\n' +
      '          <div class="tagline">进入学科首页 →</div>\n' +
      '        </a>'
    );
  }
}

const count = sites.length;
async function patch(file, fn) {
  const p = join(ROOT, file);
  const before = await readFile(p, 'utf8');
  const after = fn(before);
  if (after !== before) { await writeFile(p, after, 'utf8'); return true; }
  return false;
}

const a = await patch('index.html', (h) => {
  let s = h.replace(/<div class="cards" id="cards">[\s\S]*?\n      <\/div>\n    <\/main>/, '<div class="cards" id="cards">\n' + homeCards.join('\n') + '\n      </div>\n    </main>');
  s = s.replace(/六个中文交互式教学站/g, count + ' 个中文交互式教学站');
  s = s.replace(/六个可看、可玩、可练的中文交互式教学站/g, count + ' 个可看、可玩、可练的中文交互式教学站');
  return s;
});
const b = await patch('knowledge/index.html', (h) => {
  let s = h.replace(/<div class="section">\s*<div class="grid">[\s\S]*?<\/div>\s*<\/div>/, '<div class="section">\n      <div class="grid">\n' + knowCards.join('\n') + '\n      </div>\n    </div>');
  s = s.replace(/知识库:六个学科站的内容入口/g, '知识库:全部学科站的内容入口(共 ' + count + ' 个)');
  s = s.replace(/六个站继续保留在知识库中/g, '各学科站继续保留在知识库中');
  s = s.replace(/知识库:六个中文教学站的知识入口与覆盖范围/g, '知识库:全部中文教学站的知识入口与覆盖范围');
  return s;
});
console.log('✓ 学科目录已生成:共 ' + count + ' 站;index.html ' + (a ? '已更新' : '未变化') + ';knowledge/index.html ' + (b ? '已更新' : '未变化'));
