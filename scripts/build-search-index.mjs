#!/usr/bin/env node
/**
 * build-search-index.mjs — 构建期生成跨站搜索索引(纯静态,无需后端)
 *
 * 输入:docs/inventory.json(T0.1 盘点产物)
 * 输出:data/search-index.json(供 /search/ 页面 fetch)
 *
 * 用法:node scripts/build-search-index.mjs
 * 退出码:0 成功;1 缺少 inventory 或格式错误。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY = join(ROOT, 'docs', 'inventory.json');
const OUT_DIR = join(ROOT, 'data');
const OUT = join(OUT_DIR, 'search-index.json');

if (!existsSync(INVENTORY)) {
  console.error(`缺少盘点文件:${INVENTORY}\n请先完成 T0.1(node 生成 docs/inventory.json),再运行本脚本。`);
  process.exit(1);
}

let inv;
try {
  inv = JSON.parse(readFileSync(INVENTORY, 'utf8'));
} catch (e) {
  console.error(`docs/inventory.json 解析失败:${e.message}`);
  process.exit(1);
}

const sites = Array.isArray(inv.sites) ? inv.sites : [];
if (!sites.length) {
  console.error('inventory.json 中没有 sites 数组');
  process.exit(1);
}

const SITE_NAMES = {
  linux: '驱动实验室 · Linux 内核驱动',
  mcu: 'MCU Playground',
  analog: '知电 · 模拟电子技术',
  ml: '知机 · 机器学习',
  ros: 'ROS 学习实验室',
  rtos: 'RTOS Lab',
};

const items = [];
const seen = new Set();
for (const site of sites) {
  const slug = String(site.slug || '').trim();
  if (!slug) continue;
  const siteName = site.name || SITE_NAMES[slug] || slug;
  const list = Array.isArray(site.items) ? site.items : [];
  for (const it of list) {
    if (!it || !it.title || !it.route) continue;
    const type = String(it.type || 'page').toLowerCase();
    const id = `${slug}:${type}:${it.id || it.route}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // 展示用 route:去掉尾部斜杠与非路由后缀,保证可直接跳转
    const route = String(it.route).startsWith('/') ? String(it.route) : `/${slug}/${String(it.route)}`;
    items.push({
      id,
      title: String(it.title),
      site: slug,
      siteName,
      type,
      route,
      keywords: [it.title, it.id || '', type, siteName, slug, (it.tags || []).join(' ')].join(' ').toLowerCase(),
    });
  }
}

// 站点级兜底条目:即使某站没有细分条目,也能从搜索进入
for (const site of sites) {
  const slug = String(site.slug || '').trim();
  if (!slug) continue;
  if (!items.some((x) => x.site === slug)) {
    items.push({
      id: `${slug}:site`,
      title: SITE_NAMES[slug] || site.name || slug,
      site: slug,
      siteName: SITE_NAMES[slug] || site.name || slug,
      type: 'page',
      route: `/${slug}/`,
      keywords: `${slug} ${SITE_NAMES[slug] || ''} 站点入口`.toLowerCase(),
    });
  }
}

const bySite = {};
const byType = {};
for (const it of items) {
  bySite[it.site] = (bySite[it.site] || 0) + 1;
  byType[it.type] = (byType[it.type] || 0) + 1;
}

const generatedAt = new Date().toISOString();
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const manifest = {
  generatedAt,
  source: 'docs/inventory.json',
  count: items.length,
  shards: true,
  sites: sites.map((s) => ({
    slug: s.slug,
    name: s.name || s.slug,
    count: bySite[s.slug] || 0,
    url: '/data/search-index-' + s.slug + '.json',
  })),
};
writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
for (const meta of manifest.sites) {
  const shard = {
    generatedAt,
    site: meta.slug,
    count: meta.count,
    items: items.filter((it) => it.site === meta.slug),
  };
  writeFileSync(join(OUT_DIR, 'search-index-' + meta.slug + '.json'), JSON.stringify(shard, null, 2) + '\n');
}
console.log(`✓ 搜索索引已生成:${OUT}`);
console.log(`  条目总数:${items.length}`);
console.log(`  按站:${Object.entries(bySite).map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`  按类型:${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(' ')}`);
