# PRERENDER-POC · 深链静态预渲染 POC(`/linux/labs`)

> 状态:**POC 已通过**(2026-11-27)。目标站点 `1kni4r.top`(GitHub Pages 纯静态),
> 用一条真实深链 `/linux/labs` 验证「每路由预渲染静态 index.html」方案是否可行。
>
> 验证环境:Google Chrome 156.0.8078.47(headless)+ Node.js v22.20.0,Linux。

---

## 1. 要解决的问题

六个子站都是 React SPA,并且以子路径(`/linux/`、`/ml/` …)部署。访问 `/linux/labs`
这类深链时,GitHub Pages 找不到磁盘上的文件,链路是:

```
GET /linux/labs
  → GitHub Pages 返回仓库根 404.html(HTTP 404)
  → 404.html 把原始路径塞进 sessionStorage,location.replace('/linux/')
  → /linux/index.html 里的 1kni4r-spa-restore 脚本 history.replaceState 还原路径
  → React Router 渲染 /labs
```

人能看到页面,但**爬虫、分享卡片、SEO 抓取拿到的是 HTTP 404 + 一个空壳 HTML**
(只有「正在打开站点…」的转圈页,没有任何页面正文)。本 POC 验证:把每条路由在构建期
渲染成静态 `index.html`,能否让深链直接返回 200 且正文可见。

---

## 2. 方案与脚本

产物脚本:[`scripts/prerender-poc.mjs`](../scripts/prerender-poc.mjs)

```
node scripts/prerender-poc.mjs --slug linux --route /linux/labs
  ├─ 1. 起临时静态服务(127.0.0.1 随机端口),语义与 GitHub Pages / local-preview.mjs 一致:
  │       目录 → 目录下 index.html;存在的静态文件原样返回;
  │       不存在的路径 → 仓库根 404.html,HTTP 404
  ├─ 2. 渲染阶段刻意把目标路由「当作不存在」
  │       → Chrome 必然走一遍 404 → sessionStorage → 恢复路径 → React 渲染 的完整链路
  │       → 第一次跑和第 N 次跑输入一致(不会被上一次落盘的快照干扰)
  ├─ 3. headless Chrome 渲染(CDP 等页面稳定后取 DOM):
  │       --headless=new --disable-gpu --no-sandbox --hide-scrollbars
  │       --force-prefers-reduced-motion --remote-debugging-port=0
  │       → 连上页面 target,等 URL 落到目标路由
  │       → 注入稳定检测:CSS 动画 finish() + MutationObserver 盯 DOM,
  │         ≥1.2s 且连续 700ms 无变更才取 document.documentElement.outerHTML
  ├─ 4. 清洗:去掉 <html> 上的运行时 class/style(明暗主题等),插入生成标记,统一换行
  ├─ 5. 断言:<!DOCTYPE html> / 不是 404 兜底页 / #root 内有渲染结果 /
  │       正文 ≥ 500 字符 / 命中关键字 / 没有任何相对路径引用
  ├─ 6. 落盘到 <repo>/<route>/index.html(原子写;内容相同则跳过,保证幂等)
  └─ 7. 写盘后校验(服务切回正常语义):
        GET /linux/labs            → 200 且含关键字
        GET /linux/labs/           → 200 且含关键字
        快照内 /linux/assets/* 引用 → 全部 200
        GET /ml/paths(未预渲染)  → 404 + 404.html 兜底页,未被破坏
        再用 Chrome 渲染一次已落盘页面 → React 接管后内容仍在(无退化)
```

### 为什么不用 `--dump-dom`,以及 `--force-prefers-reduced-motion` 的作用

`--dump-dom` 在固定的虚拟时间点取 DOM,正好可能截到 Framer Motion 的 spring 中间帧
(如 `transform: translateY(5.55025px)`、`opacity: 0.72`),同一页面两次渲染字节不同,
`git status` 反复出现脏改动 —— 迭代时实测出现过一次「第 1 次写 145,164 字节、第 2 次写
145,178 字节」的抖动。

现在改成:**Chrome 带 `--remote-debugging-port=0` 启动,脚本经 CDP 连上页面,注入
「稳定检测」后再取 `outerHTML`** —— 检测同时做两件事:`document.getAnimations()` 逐个
`finish()`(CSS 动画直接到终态),`MutationObserver` 监听 DOM 变更,已等待 ≥1.2s 且连续
700ms 无变更才认为页面稳定。这样取到的是动画收敛后的终态,而不是中间帧。

`--force-prefers-reduced-motion` 仍然保留:framer-motion 会跳过 transform/位移动画,
页面更快进入稳定态,也减少需要等待的动画数量。实测:连续 6 次运行 + 2 次在 CPU 满载
(`yes` 压满)下运行,输出 **sha256 全部一致**,第 2 次起都是「未变化(幂等,跳过重写)」。

### 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--slug` | 从 route 首段推断 | 站点 slug,需存在 `<slug>/index.html` |
| `--route` | 必填 | 要预渲染的路由,如 `/linux/labs` |
| `--out` | `<repo>/<route>/index.html` | 快照输出路径(必须在仓库内) |
| `--expect` | 内置 `/linux/labs`: `动画实验室,实验` | 断言关键字 |
| `--chrome` | 自动探测 / `CHROME_PATH` | Chrome 可执行文件 |
| `--settle` | `15000` | 等待页面动画/DOM 稳定的上限(ms);`--budget` 作为别名兼容 |
| `--port` | `0` | 临时服务端口,0 = 自动分配 |
| `--control` | `/ml/paths` | 404 兜底抽查用的另一条深链 |
| `--no-verify` | 关 | 跳过写盘后的 HTTP / 资源 / 404 校验 |
| `--no-render-verify` | 关 | 跳过写盘后的二次 Chrome 渲染校验 |
| `--force` | 关 | 覆盖非本脚本生成的 index.html |

退出码:全部校验通过为 0,任一校验失败为 1(可直接用于 CI 阻断发布)。

---

## 3. 验证结果(2026-11-27 实测)

| 验收项 | 结果 |
|---|---|
| `GET /linux/labs`(local-preview,无斜杠) | **HTTP 200**,`text/html; charset=utf-8`,145,166 字节 |
| `GET /linux/labs/`(带斜杠) | **HTTP 200**,145,166 字节 |
| 快照正文 | 可见文本 **11,002 字符**,219 个 `<button>`、148 个 `<svg>`,16 个实验全部在 DOM 里 |
| 关键字命中 | `动画实验室` ×3、`实验` ×15、`驱动` ×46;`<h1>动画实验室</h1>`、`<h2>现在可玩</h2>` |
| 资源引用 | 18 个 `src/href`,**0 个相对路径**;4 个 `/linux/assets/...` 引用全部 200(无需改写) |
| 404 兜底抽查 | `GET /ml/paths` → HTTP 404,内容为 404.html(1,935 字节,「正在打开站点…」),兜底链路完好 |
| 其他站点未受影响 | `/linux/` 仍 200(1,714 字节,原入口未变)、`/` 仍 200 |
| 幂等 | 连续运行 6 次(另在 CPU 满载下 2 次):输出 sha256 均为 `bbafd29c…fc4f85f6`,145,166 字节;第 2 次起全部「未变化(幂等,跳过重写)」 |
| 渲染耗时 | 单次 Chrome render ≈ 1.6–1.8s(含稳定等待),完整一次运行(渲染 + 校验 + 二次渲染)≈ 3.5s |
| 二次渲染 | 命中快照后仍由 React 重渲染,输出 145,110 字节 DOM,关键字仍在(说明静态内容不会让 hydration 崩掉) |

快照体积:145,166 字节(原始)/ 约 23,956 字节(gzip -9);对比 `/linux/index.html`
空壳 1,714 字节、`404.html` 1,935 字节。

HEAD 结构(`linux/labs/index.html` 开头):

```html
<!DOCTYPE html>
<!-- prerendered-by: scripts/prerender-poc.mjs route=/linux/labs -->
<html lang="zh-CN"><head>
  <script id="1kni4r-spa-restore">…</script>
  …
  <script type="module" crossorigin src="/linux/assets/index-PBeKe8lt.js"></script>
  <link rel="stylesheet" href="/linux/assets/index-Djg_MDre.css">
</head>
<body>
  <div id="root">…渲染完成的整页 DOM…</div>
</body></html>
```

`<html>` 上的 `class` / `style` 已剥离:渲染机当时是浅色主题,如果把这个状态烘进快照,
用户端首屏会被钉死在渲染机的主题上。现在仍由页面内联主题脚本按用户偏好决定。

---

## 4. 产物边界(本次改动)

| 路径 | 说明 |
|---|---|
| `linux/labs/index.html` | 新增,预渲染快照(145KB) |
| `scripts/prerender-poc.mjs` | 新增,可重复执行的预渲染脚本 |
| `docs/PRERENDER-POC.md` | 新增,本文档 |

**未改动**:六站源码、`linux/index.html`、`linux/assets/**`、其他 slug 目录、`404.html`。
深链 404 兜底与预渲染快照**并存**:有快照的路由直接 200,其余深链继续走 404 兜底。

---

## 5. 已知局限

1. **不是 hydration,会有一次替换。** 站点源码用的是 `createRoot().render()`,React 挂载后
   会清空 `#root` 重新渲染,静态 HTML 只承担「首帧 / 爬虫内容」。所以快照是快照,不是可互动
   的静态页;用户会看到一次极短的内容替换(不会报 hydration mismatch,因为根本没有 hydrate)。
   要彻底消除,需要在源码里改 `hydrateRoot` —— 本 POC 按约束**未改六站源码**。
2. **交互状态被冻结。** 动画停在初始帧、进度条是 0、`可交互` 实验的按钮要等 JS 才能点。
   滚动入场元素在快照里是初始值(部分 `opacity: 0`):**文本在 HTML 里(爬虫/SEO 可读),
   但无 JS 截图可能看不到这些元素**。真实用户有 JS,行为不变。
3. **`--force-prefers-reduced-motion` 与稳定等待只影响渲染。** 它们只是让快照确定、可复现;
   真实用户未开启 reduced-motion 时动画照常。快照里冻结的是渲染时的终态。
4. **与构建产物 hash 强耦合(接入 CI 的关键约束)。** 快照写死了
   `/linux/assets/index-PBeKe8lt.js` 这类带 hash 的文件名。只要子站重新 build 并替换
   `linux/` 目录,快照就会指向不存在的旧资源。因此必须**在每次把 `dist/` 复制进 slug 目录
   + `finalize.mjs` 之后、部署之前重跑本脚本**(与 finalize 同一节奏);忘记重跑会让页面
   白屏/资源 404。
5. **覆盖粒度是单条路由。** 目前只做了 `/linux/labs`;`/linux/labs/<实验id>` 等更深路径、
   以及其他五个站的深链仍走 404 兜底。要全站静态化需要维护路由清单逐条跑,或改成自动化
   路由枚举 + 并行渲染。
6. **体积与重复。** 每条路由 145KB(gzip 24KB),路由多了会线性放大;内容主要是 React
   渲染出的 DOM,入口脚本仍会再下载一遍 JS 重渲染。
7. **GitHub Pages 的斜杠行为。** `/linux/labs` 会被 301 到 `/linux/labs/`(目录索引),
   分享链接建议统一带斜杠;两者都返回 200。
8. **未做配套 SEO 增强**:没有 sitemap、没有在快照里注入 canonical、也没有把 SPA 的
   `meta description` 改成按路由变化(目前是全站共用)。
9. **快照依赖当前构建与内容**:站点文案/CSS 更新后需要重跑,快照不会自动同步。

---

## 6. 接入建议(若把 POC 转成流程)

1. 维护一份「需要静态化的路由清单」(与产品/SEO 关注的路由对齐)。
2. 在部署流水线里加一步:子站 dist 到位 → `finalize.mjs` → **逐条跑
   `prerender-poc.mjs`** → 失败即中止发布(脚本非 0 退出)→ 再 push。
3. 未来可扩展为通用流水线:路由清单 → 并行渲染 → 统一校验 → 生成 sitemap/prerender 报告。
4. 若某天子站源码允许改动,把 `createRoot().render()` 换成 `hydrateRoot()`,静态快照可以
   直接复用、省掉一次整页重建。

---

## 7. 复现命令

```bash
cd /home/czy/sites/1kni4r.top

# 1. 生成 / 刷新快照(幂等,可重复执行)
node scripts/prerender-poc.mjs --slug linux --route /linux/labs

# 2. 另开一个终端,用 local-preview 模拟 GitHub Pages 验收
node scripts/local-preview.mjs 4191
curl -s -o /dev/null -w 'labs      %{http_code} %{size_download}B\n' http://127.0.0.1:4191/linux/labs
curl -s -o /dev/null -w 'labs/     %{http_code} %{size_download}B\n' http://127.0.0.1:4191/linux/labs/
curl -s -o /dev/null -w 'ml/paths  %{http_code} %{size_download}B\n' http://127.0.0.1:4191/ml/paths
curl -s http://127.0.0.1:4191/linux/labs | grep -c 动画实验室

# 3. 确认没有改到不该改的东西
git status --short
```
