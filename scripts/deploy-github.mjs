#!/usr/bin/env node
/**
 * deploy-github.mjs — 把聚合站点发布到 GitHub Pages 并绑定自定义域名。
 *
 * 前置:
 *   - 已运行 node scripts/finalize.mjs(6 个子站就绪、生成 .nojekyll/CNAME)
 *   - 环境变量 GH_TOKEN(需要 repo 权限的 GitHub Personal Access Token)
 *   - 本机需要能访问 GitHub(可设置 https_proxy=http://127.0.0.1:7890)
 *
 * 用法:
 *   export GH_TOKEN=ghp_xxx
 *   export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890
 *   node scripts/deploy-github.mjs [--repo 1kni4r-top] [--domain 1kni4r.top]
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) {
  console.error('缺少环境变量 GH_TOKEN');
  process.exit(1);
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const REPO = arg('--repo', '1kni4r-top');
const DOMAIN = arg('--domain', '1kni4r.top');
const API = 'https://api.github.com';

async function api(method, path, body) {
  // 本机网络经代理访问 GitHub API 偶发 TLS 断开(UND_ERR_SOCKET),做 3 次退避重试
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(API + path, {
        method,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${TOKEN}`,
          'user-agent': '1kni4r-site-deploy',
          'x-github-api-version': '2022-11-28',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }
      return { status: res.status, json };
    } catch (err) {
      lastErr = err;
      console.error(`api ${method} ${path} 第 ${attempt} 次失败: ${err.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function git(...args) {
  console.log('$ git ' + args.join(' '));
  return execFileSync('git', args, { cwd: ROOT, stdio: 'inherit' });
}

const step = (msg) => console.log('\n== ' + msg + ' ==');

// 0. 前置:确保 6 站就绪并已注入 SPA 深链恢复脚本(幂等)
step('0/6 前置检查与收尾(finalize)');
execFileSync('node', [join(ROOT, 'scripts', 'finalize.mjs')], { stdio: 'inherit' });

// 1. 确认身份与仓库
step('1/6 校验 GitHub Token 与仓库');
const me = await api('GET', '/user');
if (me.status !== 200) {
  console.error('Token 校验失败:', me.status, JSON.stringify(me.json).slice(0, 300));
  process.exit(1);
}
const owner = me.json.login;
console.log('登录为:', owner);

const repoRes = await api('GET', `/repos/${owner}/${REPO}`);
if (repoRes.status === 200) {
  console.log(`仓库 ${owner}/${REPO} 已存在`);
} else if (repoRes.status === 404) {
  const created = await api('POST', '/user/repos', {
    name: REPO,
    private: false,
    auto_init: false,
    description: '1kni4r.top 学习实验室:六个中文交互式教学站聚合页',
  });
  if (created.status !== 201) {
    console.error('创建仓库失败:', created.status, JSON.stringify(created.json).slice(0, 400));
    process.exit(1);
  }
  console.log(`仓库已创建:${owner}/${REPO}`);
} else {
  console.error('查询仓库失败:', repoRes.status, JSON.stringify(repoRes.json).slice(0, 400));
  process.exit(1);
}

// 2. 本地 git 初始化与提交
step('2/6 初始化本地 git 并提交');
if (!existsSync(join(ROOT, '.git'))) {
  git('init', '-b', 'main');
}
git('config', 'user.name', owner);
git('config', 'user.email', `${owner}@users.noreply.github.com`);
git('add', '-A');
try {
  git('commit', '-m', 'deploy: 1kni4r.top 学习实验室(六站聚合)');
} catch {
  console.log('(没有新改动可提交,继续)');
}

// 3. 推送
step('3/6 推送到 GitHub');
const remote = `https://x-access-token:${TOKEN}@github.com/${owner}/${REPO}.git`;
try {
  git('remote', 'remove', 'origin');
} catch {}
git('remote', 'add', 'origin', remote);
git('-c', 'http.postBuffer=524288000', 'push', '-u', 'origin', 'main', '--force');
// 移除带 token 的 remote,避免留在 .git/config 里
git('remote', 'set-url', 'origin', `https://github.com/${owner}/${REPO}.git`);

// 4. 开启 / 更新 Pages
step('4/6 开启 GitHub Pages');
const pages = await api('GET', `/repos/${owner}/${REPO}/pages`);
if (pages.status === 200) {
  console.log('Pages 已存在,更新配置');
  const upd = await api('PUT', `/repos/${owner}/${REPO}/pages`, {
    source: { branch: 'main', path: '/' },
    cname: DOMAIN,
    https_enforced: true,
  });
  console.log('更新结果:', upd.status);
} else {
  const create = await api('POST', `/repos/${owner}/${REPO}/pages`, {
    source: { branch: 'main', path: '/' },
    cname: DOMAIN,
  });
  if (create.status !== 201 && create.status !== 409) {
    console.error('开启 Pages 失败:', create.status, JSON.stringify(create.json).slice(0, 500));
    process.exit(1);
  }
  console.log('Pages 开启结果:', create.status);
}

// 5. 设置自定义域名
step('5/6 绑定自定义域名 ' + DOMAIN);
const dom = await api('PUT', `/repos/${owner}/${REPO}/pages`, { cname: DOMAIN });
console.log('自定义域名结果:', dom.status);
const pagesInfo = await api('GET', `/repos/${owner}/${REPO}/pages`);
if (pagesInfo.status === 200) {
  console.log('Pages 状态:', JSON.stringify({
    html_url: pagesInfo.json.html_url,
    status: pagesInfo.json.status,
    cname: pagesInfo.json.cname,
    https_enforced: pagesInfo.json.https_enforced,
    certificate: pagesInfo.json.https_certificate,
  }));
} else {
  console.log('读取 Pages 状态失败:', pagesInfo.status, JSON.stringify(pagesInfo.json).slice(0, 300));
}

// 6. 轮询构建与证书
step('6/6 等待构建完成与 HTTPS 证书签发(最长约 6 分钟)');
for (let i = 0; i < 24; i++) {
  const info = await api('GET', `/repos/${owner}/${REPO}/pages`);
  if (info.status === 200) {
    const cert = info.json.https_certificate;
    console.log(
      `[${i + 1}/24] status=${info.json.status} cert=${cert ? cert.state : 'none'} cname=${info.json.cname}`,
    );
    if (info.json.status === 'built' && cert && cert.state === 'approved') break;
  }
  await sleep(15000);
}

console.log('\n完成。站点地址:');
console.log(`  https://${DOMAIN}/`);
console.log(`  https://${DOMAIN}/linux/  /mcu/  /analog/  /ml/  /ros/  /rtos/`);
console.log(`GitHub Pages 备用地址: https://${owner}.github.io/${REPO}/`);
