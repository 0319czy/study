# 1kni4r.top · 学习实验室

六个中文交互式教学站,聚合在一个 GitHub Pages 站点下,自定义域名 **1kni4r.top**。

## 站点结构

| 路径 | 站点 | 源码仓库位置 |
|---|---|---|
| `/` | 门户聚合页(本仓库自带) | `index.html` |
| `/linux/` | 驱动实验室 · Linux 内核驱动交互教程 | `/home/czy/linux-driver-lab` |
| `/mcu/` | MCU Playground · 单片机与外设通讯教学站 | `/home/czy/mcu-playground` |
| `/analog/` | 知电 · 模拟电子技术交互实验手册 | `/home/czy/analog-playground` |
| `/ml/` | 知机 · 机器学习实验手册 | `/home/czy/ml-playground` |
| `/ros/` | ROS 学习实验室 | `~/文档/deepseek-harness/default-workspace/ros-learn` |
| `/rtos/` | RTOS Lab · 看得见的实时操作系统 | `~/文档/deepseek-harness/default-workspace/rtos-lab` |

## 子路径部署原理

六个子站原本都以根路径(`base: '/'`)构建,挂到 `/linux/` 这类子路径下会资源 404、页面跳转丢前缀。统一做了三件事:

1. **构建 base**:`npx vite build --base=/<slug>/`,资源引用变成 `/<slug>/assets/...`;
2. **路由 basename**:各站 `main.tsx` / `App.tsx` 里的 `<BrowserRouter>` 改为
   `<BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>`,
   同一份源码在根路径独立部署时也自动兼容;
3. **深链兜底**:GitHub Pages 对不存在的路径返回根 `404.html`。本仓库的 `404.html`
   把原始路径暂存到 `sessionStorage` 后回到对应子站根目录,子站 `index.html` 里的
   `id="1kni4r-spa-restore"` 脚本用 `history.replaceState` 还原路径,交给 React Router 渲染
   —— 因此 `/ml/paths`、`/ros/quiz` 这类深链直接刷新/分享也能正常打开。

> 注意:每次把子站 `dist/` 重新复制进对应 slug 目录后,必须重跑 `node scripts/finalize.mjs`
> 重新注入恢复脚本(幂等);`scripts/deploy-github.mjs` 已内置该步骤。

## 本地验收

```bash
node scripts/local-preview.mjs 4191   # 模拟 GitHub Pages(未知路径返回 404.html)
# 打开 http://127.0.0.1:4191/
```

## 部署(已自动化脚本)

```bash
export GH_TOKEN=...                       # GitHub PAT(repo 权限)
export TENCENTCLOUD_SECRET_ID=...         # 腾讯云 API 密钥(DNSPod 权限)
export TENCENTCLOUD_SECRET_KEY=...

python3 scripts/dns-tencent.py --check    # 查当前解析
python3 scripts/dns-tencent.py            # 写入 GitHub Pages 官方 A/AAAA 记录
node scripts/deploy-github.mjs            # 建仓/推送/开 Pages/绑 1kni4r.top/等证书
```

DNS 指向 GitHub Pages 官方地址(apex 域名):

- A: `185.199.108.153`、`185.199.109.153`、`185.199.110.153`、`185.199.111.153`
- AAAA: `2606:50c0:8000::153`、`2606:50c0:8001::153`、`2606:50c0:8002::153`、`2606:50c0:8003::153`

## 说明

- 纯静态站点,无后端、无数据库、无外链资源;全部由 GitHub Pages 托管。
- 域名未做 ICP 备案,因此托管在海外(GitHub Pages),中国大陆部分网络访问速度可能一般;
  若日后备案,可把同一份产物平移到腾讯云 EdgeOne Pages,目录结构无需改动。
