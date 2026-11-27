# 1kni4r.top 平台交接文档(现状版 · 2026-11-27)

> 读者:接手维护的人或 agent。
> 先读:`docs/HANDOFF-codex.md`(四批建设任务与验收标准)、`docs/DECISIONS.md`(决策台账)。
> 本文件记录**当前完成状态、站点结构、维护流程、未完成项**。

---

## 0. 一句话现状

四批建设任务已全部完成(不含实物验证):六站聚合 + 学习路线 + 学习工作台 + 学习档案 + 三门基础课 +
采集监控项目 M0–M5 + 方向进阶四方向,全部上线 <https://1kni4r.top/>。
**唯一未完成的是 hardware(实物)验证**——用户已明确"先不上实物",所有相关标识保持 `hardware-pending`。

---

## 1. 仓库与部署

| 项 | 值 |
|---|---|
| 线上域名 | <https://1kni4r.top/>(HTTPS 强制,HTTP 301) |
| GitHub 仓库 | `0319czy/study`(public),分支 `main` |
| 托管 | GitHub Pages,legacy build,source `main` / `/` |
| 证书 | Let's Encrypt `CN=1kni4r.top`,GitHub 自动续期(当前至 2027-02-25) |
| 本地目录 | `/home/czy/sites/1kni4r.top` |
| DNS | DNSPod/腾讯云,4×A + 4×AAAA(GitHub Pages 官方 IP;免费套餐按线路分散,脚本已幂等) |
| 关键提交 | `889fcbd` 第一批、`97147da`、`6aff012`(档案 + M3 修复)、`bfabb94` 方向、`9cecb3c` 修正 |

部署流程:`node scripts/finalize.mjs` → `git push`(或 `node scripts/deploy-github.mjs`)。推送会自动触发 Pages 重建。

---

## 2. 站点结构(全部已上线)

| 路径 | 内容 | 状态 |
|---|---|---|
| `/` | 学习工作台:新用户入口 + 本地进度(新用户/已开始两种状态) | ✅ |
| `/route/` | 学习路线:7 阶段,每阶段有成果与真实课程入口 | ✅ |
| `/knowledge/` | 知识库:六站入口、缺口表、按站找术语/案例/测验 | ✅ |
| `/labs/` | 实验室:六站实验入口、证据标识规则 | ✅ |
| `/projects/` | 项目实战:采集监控 M0–M5 验收表 | ✅ |
| `/tools/` | 工具与资料:术语、官方资料、环境准备 | ✅ |
| `/search/` | 跨站搜索:构建期索引 937 条,按站筛选 | ✅ |
| `/archive/` | 学习档案:进度/错题/笔记/旧记录迁移/JSON 导入导出 | ✅ |
| `/foundations/` | 工程基础总览(三门最小课) | ✅ |
| `/foundations/c/` | C 与工程工具(8 段,gcc 实测) | ✅ |
| `/foundations/circuits/` | 数字电路入门(8 段,3 个交互模拟) | ✅ |
| `/foundations/linux-user/` | Linux 用户态入门(8 段,gcc + PTY 模拟) | ✅ |
| `/projects/collect/` | M0 采集(ADC 模拟器、检查清单) | ✅ |
| `/projects/m1/` | M1 通信(帧构造器、错误注入、超时模拟) | ✅ |
| `/projects/m2/` | M2 多任务(任务时序/队列/阻塞,3 个 canvas) | ✅ |
| `/projects/m3/` | M3 网关(帧流回放、CSV、查询;XOR 含帧头) | ✅ |
| `/projects/m4/` | M4 展示(仪表盘模拟器、阈值、CSV 导入) | ✅ |
| `/projects/m5/` | M5 交付(交付包结构、10 项自检) | ✅ |
| `/directions/` | 方向进阶总览 | ✅ |
| `/directions/linux-build/` | 嵌入式 Linux 系统构建 | ✅ |
| `/directions/ros/` | ROS 2 机器人应用 | ✅ |
| `/directions/pcb/` | 电路与 PCB 设计 | ✅ |
| `/directions/edge-ai/` | 边缘 AI 模型部署 | ✅ |
| `/linux/` `/mcu/` `/analog/` `/ml/` `/ros/` `/rtos/` | 原六站(内容零改动,深链兜底可用) | ✅ |

---

## 3. 统一契约

### 3.1 串口协议(M1/M2/M3 一致)

```
帧:AA 55 | LEN | SEQ | CMD | DATA[LEN] | XOR
XOR = AA ^ 55 ^ LEN ^ SEQ ^ CMD ^ DATA[0..LEN-1](含帧头,不含 XOR 自身)
校验:把 XOR 字节也异或,合法帧结果为 0x00
CMD:0x01 传感器(温度 int16 LE ×100、湿度 uint16 LE ×100,LEN=4);0x02 心跳(LEN=0)
超时:500 ms;示例:23.45℃/56.78%/SEQ=1 → AA 55 04 01 01 29 09 2E 16 E3
```

> 历史:2026-11-27 修复了 M3 曾写"不含帧头"的冲突,现已三页一致;C 源码与页面回放均复验。

### 3.2 学习记录

- 统一档案键:`1kni4r-learning-v1`(事件/错题/笔记/迁移备份);
- 工作台键:`1kni4r-progress-v1`;
- 六站旧键:`drv-progress-v1`、`drv-theme`、`ros-learn-theme`、`rtos-progress-v1`、`rtos-theme`、`ml-read-algorithms`、`ml-practiced-labs`、`ml-quiz-v1`;
- 迁移:在 `/archive/` 点"扫描并导入旧记录",原文备份到 `migratedFrom`,可导出 JSON 换设备。

### 3.3 课程 schema

- `shared/course/schema.ts`:8 段 + 证据标识(principle/compiled/hardware)+ 版本;
- `shared/course/schema.samples.json`:2 个真实页面映射样例;
- `node shared/course/validate.mjs` 校验 PASS 才算结构合格。

---

## 4. 验收证据(最近一轮)

| 检查 | 结果 |
|---|---|
| `node scripts/finalize.mjs` | 六站 `= 已含`,EXIT 0 |
| `node scripts/build-search-index.mjs` | 937 条,EXIT 0 |
| `node shared/course/validate.mjs` | PASS(2/2 样例、8 段 16/16、错误 0),EXIT 0 |
| `node scripts/prerender-poc.mjs` | `/linux/labs` 200、404 兜底正常、幂等,EXIT 0 |
| 六站自带测试 | mcu 219 项 0 失败、analog 761、ml 1169、ros 75、linux、rtos lint,全 EXIT 0 |
| 六站自带构建 | 6 站全 EXIT 0 |
| 背景色验收(23 页) | 全部 `rgb(8, 11, 16)`,ALL PASS |
| M3 协议一致性 | 回放 11 帧 / 7 成功 / 5 记录 / 4 错误 / 2 杂散,与 C `--self-test` 逐行一致 |
| 方向页交互 | PCB/Edge 48/48 断言 PASS;Linux 构建/ROS 页 JS 错误 0、链接全 200 |
| 线上抽查 | 门户/档案/方向/项目/M3 等关键 URL 全部 200 |

---

## 5. 维护流程

```bash
cd /home/czy/sites/1kni4r.top

# 1) 改了某页(平台页/课程页/项目页):直接编辑对应目录 index.html
# 2) 改了六站内容:进项目重建子路径版本,再同步
cd /home/czy/linux-driver-lab && npx tsc --noEmit && npx vite build --base=/linux/
cp -a dist/. /home/czy/sites/1kni4r.top/linux/
# 3) 必跑:注入深链恢复脚本(幂等)
node /home/czy/sites/1kni4r.top/scripts/finalize.mjs
# 4) 提交并推送(会触发 Pages 重建)
git add -A && git commit -m "..." && git push origin main

# 本地验收(模拟 GitHub Pages)
node scripts/local-preview.mjs 4200
# 六站回归
cd /home/czy/linux-driver-lab && npm run verify
cd /home/czy/mcu-playground && npm run verify
cd /home/czy/analog-playground && npm run verify
cd /home/czy/ml-playground && npm run verify
cd ~/文档/deepseek-harness/default-workspace/ros-learn && npm test
cd ~/文档/deepseek-harness/default-workspace/rtos-lab && npm run lint
```

注意事项:
1. 每次替换子站产物后**必须**重跑 `finalize.mjs`,否则深链恢复脚本丢失;
2. `/linux/labs/` 是预渲染快照,与 `linux/assets` 的 hash 强耦合——重建 linux 后要重跑 `scripts/prerender-poc.mjs --slug linux --route /linux/labs`;
3. GitHub Pages 对 HTML 有 10 分钟缓存,更新后强刷(Ctrl+F5);
4. 不要提交密钥;部署脚本用环境变量 `GH_TOKEN`。

---

## 6. 未完成项(按优先级)

| # | 项 | 说明 |
|---|---|---|
| 1 | **hardware 实物验证** | 用户明确"先不上实物"。所有硬件相关保持 `hardware-pending`;上板后把 M0–M5/方向页的 pending 升级为 hardware,并补证据(接线照、串口日志、测量数据) |
| 2 | 全站深链静态预渲染 | 目前只有 `/linux/labs` 一个 POC;六站其余深链仍走 404 兜底(可正常使用,但对爬虫/分享不友好) |
| 3 | sitemap / canonical | 未做,搜索收录一般 |
| 4 | M3 真实 API | MVP 用 CSV/本地查询演示;接真实网关 HTTP API 时替换数据源即可 |
| 5 | 搜索索引规模 | 单文件 353 KB;条目继续增长需拆分/懒加载 |
| 6 | inventory stage 命名 | 盘点用 `linux/network`,schema 用 `embedded-linux/connectivity`,已用 `STAGE_ALIASES` 归一,建议后续统一源头 |
| 7 | AI 助教 | 交接文档中列为后续阶段,未开始 |

---

## 7. 关键文件索引

| 文件 | 用途 |
|---|---|
| `docs/HANDOFF-codex.md` | 四批建设任务、验收标准、红线 |
| `docs/DECISIONS.md` | 决策台账(D1–D5 已拍板) |
| `docs/INVENTORY.md` / `inventory.json` | 六站内容盘点(937 条) |
| `docs/SCHEMA.md` | 课程 schema 规则 |
| `docs/PRERENDER-POC.md` | 深链预渲染方案与局限 |
| `shared/course/schema.ts` | 课程类型定义 |
| `scripts/finalize.mjs` | 深链恢复注入 + `.nojekyll`/`CNAME` |
| `scripts/build-search-index.mjs` | 搜索索引构建 |
| `scripts/prerender-poc.mjs` | 预渲染 POC |
| `scripts/local-preview.mjs` | 本地验收服务器 |
| `scripts/deploy-github.mjs` / `dns-tencent.py` | 部署与 DNS 脚本 |

---

## 8. 一句话交接

内容、课程、项目、档案、方向都已在线上且可复现;接手者只需按第 5 节维护流程改页/重建/推送。
唯一需要用户本人完成的是实物验证——上板跑通后,把所有 `hardware-pending` 证据升级即可。
