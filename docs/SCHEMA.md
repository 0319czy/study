# 课程 schema v1(冻结版)

> 版本:**1.0.0**(2026-11-27 冻结)
> 状态:第 0 批 T0.2 产出;后续导航 / 跨站搜索 / 学习档案 / 总路线共用本契约。
> 关联:[DECISIONS.md](DECISIONS.md) A6(8 段结构)、A8(证据标识)、A3(7 阶段顺序);[HANDOFF-codex.md](HANDOFF-codex.md) T0.2;[inventory.json](inventory.json)(T0.1 内容盘点)。
> 范围:本文件与 `shared/course/*` 为纯新增文件,**未修改六站任何源码**,未改动聚合目录的 `index.html` / `404.html` / 六站产物。

---

## 0. 一句话

六站现有内容(linux / mcu / analog / ml / ros / rtos)与后续在聚合站新建的课程,统一映射成
**`Meta`(标识与元数据)+ `CourseLesson`(固定 8 段)**,让导航、搜索、学习档案和总路线只依赖一份结构,而不是六套数据模型。

三条硬约定:

1. **一节课 = 1 个 Meta + 8 段**,8 段缺一不可;源站没有的段必须显式补写,不能靠 UI 兜底。
2. **证据可追溯**:代码 / 实验 / 结论必须带 `evidence[]`;没验证就标 `principle`,禁止把“原理示意”写成“已验证”。
3. **不改六站**:schema 是映射层,不要求六站改数据结构;六站缺的字段在映射时补,后续再逐步回填。

---

## 1. 文件与职责

| 文件 | 作用 | 谁维护 |
|---|---|---|
| [`shared/course/schema.ts`](../shared/course/schema.ts) | TS 类型契约(schema v1 的唯一权威定义) | T0.2;schema 变更时同步本文与校验脚本 |
| [`shared/course/schema.samples.json`](../shared/course/schema.samples.json) | 2 个真实页面映射样例 + 来源路径:行号 | 新增样例需通过 `validate.mjs` |
| [`shared/course/validate.mjs`](../shared/course/validate.mjs) | 校验样例:必填字段 / 枚举 / 证据 / 路由 / 来源 | T0.2;修改 schema 时同步枚举 |
| [`docs/inventory.json`](inventory.json) | T0.1 六站 937 条内容盘点,`InventoryItem` 与它对齐 | T0.1 |

本地校验:

```bash
cd /home/czy/sites/1kni4r.top
node shared/course/validate.mjs        # 输出 PASS,exit 0;FAIL 时 exit 1
```

---

## 2. 标识、路由与阶段

### 2.1 全局课程 id

- 格式:`<site>:<slug>`,例如 `linux:device-tree`、`analog:diode`。
- `site` 枚举(六站 + 聚合站自建课):`linux | mcu | analog | ml | ros | rtos | platform`。
- `slug` 与站内知识页 slug 一致;**id 发布后冻结**,改名不改 id(避免学习档案 / 搜索深链失效),确需重建时在本文附录登记新旧映射。

### 2.2 真实路由

- `meta.route` 必须是**部署后可访问的真实路由**,含站点子路径前缀,例如 `/linux/learn/device-tree`、`/analog/learn/diode`。
- 六站源码里的 React Router 路径不带前缀(linux/analog 为 `/learn/:slug`),映射时统一加部署 base:`/linux`、`/mcu`、`/analog`、`/ml`、`/ros`、`/rtos`。
- 实验 / 题目若挂在页面锚点上,用完整路由:`/linux/labs#device-tree-probe`;analog 的实验内嵌在课程正文中、**没有独立路由**,实验与搜索条目统一指向课程路由,并保留实验 id。
- `platform` 站课程的路由由 T0.3 导航 / 聚合外壳确定;本 schema 只约束“以 `/` 开头、不加子站前缀”,不承诺具体路径前缀。

### 2.3 阶段枚举(7 段)

课程顺序(用户已定 A3):工程基础 → MCU 与外设 → RTOS → 嵌入式 Linux → 驱动与硬件协同 → 联网与交付 → 方向进阶。

| Stage | 中文 | 当前内容主责 | inventory 阶段 id |
|---|---|---|---|
| `foundation` | 工程基础 | analog(模电基础);待建 C/数字电路/工程工具 | `foundation` |
| `mcu` | MCU 与外设 | mcu | `mcu` |
| `rtos` | RTOS | rtos | `rtos` |
| `embedded-linux` | 嵌入式 Linux | linux 的内核机制部分(内核模块/字符设备/并发/调试/实时/安全/移植) | **`linux`** |
| `driver` | 驱动与硬件协同 | linux 的总线板级与驱动部分(设备树/platform/GPIO/I2C/SPI/USB/DMA) | `driver` |
| `connectivity` | 联网与交付 | mcu 的协议知识(薄弱);待建网关/交付课 | **`network`** |
| `advanced` | 方向进阶 | ml、ros | `advanced` |

> **已知命名差异(必须归一)**:T0.1 inventory 与 T0.2 并行产出,阶段 id 用了 `linux`、`network`;schema v1 正式枚举是 `embedded-linux`、`connectivity`。
> 消费方读取 inventory 时必须走 `STAGE_ALIASES`(见 `schema.ts`):`linux → embedded-linux`、`network → connectivity`。
> 逐条页面的 stage 以 T0.1 inventory 为准(如 linux 站“设备树”归 `driver`、“内核模块”归 `linux`),不要只按站点粗分。

---

## 3. Meta 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | `<site>:<slug>`,全局唯一,发布后冻结 |
| `title` | string | ✅ | 中文标题 |
| `site` | SiteSlug | ✅ | 见 2.1 |
| `stage` | Stage | ✅ | 七枚举之一,按 2.3 / inventory 逐条归类 |
| `route` | string | ✅ | 真实可访问路由(含站点前缀) |
| `tags` | string[] | ✅ | 搜索 / 归类标签,直接取源站 tags / keywords |
| `evidence` | Evidence[] | ✅ | 至少 1 条;规则见 §5 |
| `updatedAt` | string | ✅ | ISO 8601;源站无此字段时取源文件 mtime,并在 mapping 注明 |
| `summary` | string | — | 一句话概述(linux `summary`、analog `short`、ros `subtitle`、mcu `oneLine`) |
| `english` | string | — | 英文标题 |
| `order` | number | — | 站内推荐顺序(从 1 起) |
| `difficulty` | string | — | 保留源站口径(“入门”/“进阶”/“综合”) |
| `minutes` | number | — | 预计学习时长(分钟) |
| `status` | `live` / `building` / `planned` | — | 内容上线状态 |
| `source` | `{ file, lines? }` | — | 本页数据源位置 |

### Evidence 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `kind` | `principle` / `compiled` / `hardware` | ✅ | 三枚举,含义见 §5 |
| `version` | string | ✅ | 适用版本 / 环境,例如 `Linux 6.x`、`ROS 2 Humble`、`STM32F103 + FreeRTOS 10.x`、`教材通用` |
| `note` | string | ✅ | 这条证据**证明了什么、没证明什么**(边界必须写) |
| `source` | string | — | 证据出处:源码路径:行号 / 命令 / 数据手册 / 文档链接 |

---

## 4. 8 段结构(`CourseLesson`)

| # | 字段 | 含义 | 类型 | 核心要求 | 六站现状(详见 §7) |
|---|---|---|---|---|---|
| 1 | `goalObjectives` | 目标 | string[] | 用可验证动词描述“学完能做什么” | 多数站有 goals/objectives,可直接映射 |
| 2 | `prerequisites` | 前置知识 | Prerequisite[] | 全局课程 id;无前置用空数组 | **仅 analog 有显式字段**,其余需推导/人工补 |
| 3 | `principles` | 原理与图示 | Principles | 至少有一种内容;分节正文用统一 ContentBlock | analogy/why/concepts/sections/codeSamples 均可映射 |
| 4 | `experiment` | 操作实验 | Experiment | `labs` 至少 1 个;无实验须用 `note` 说明 | 实验元数据有;**步骤/硬件/预期**普遍缺失 |
| 5 | `resultCheck` | 结果检查 | ResultCheck[] | 可观察、可勾选;禁止“看完了” | **六站全缺**,必须人工补 |
| 6 | `troubleshooting` | 故障排查 | TroubleshootingItem[] | symptom / cause / fix 三段式 | mistakes/pitfalls 可直接映射 |
| 7 | `quiz` | 小测 | QuizQuestion[] | 选项 id 唯一、correctIds 必须是选项子集 | 题目在题库中,需 join + 下标转 id |
| 8 | `nextStep` | 下一步 | NextStep[] | 至少 1 条;route 站内前缀正确 | 仅 linux `further` 等少数直接字段 |

### 4.1 Principles(第 3 段内部)

| 字段 | 说明 | 典型来源 |
|---|---|---|
| `lead` | 一句话开篇 | linux `oneLine`、analog `tagline`、rtos `oneLiner`、ros `subtitle` |
| `analogy` | 生活比喻(`title/text`,可选 `mapping`、`bullets`) | 六站普遍有 |
| `why` | 为什么重要 / 用在哪里 | 六站普遍有(rtos/ros 为对象,取 text/bullets) |
| `concepts` | 术语级原理(term/english/explanation) | linux `coreConcepts`、ros `concepts` |
| `sections` | 分节正文(id/title/blocks),analog/mcu/rtos/ros 的主形态 | 各站 sections / blocks |
| `codeSamples` | 代码示例(id/title/language/code/caption/apiNotes) | linux `codeSamples`、ros `Section.code`、ml `code` |
| `versionNoteIds` | 版本对照卡 id(linux) | linux `versionNoteIds` |
| `takeaways` | 本节要点 | 六站 `takeaways` |

`blocks` 统一为 `ContentBlock` 联合类型,覆盖六站现有全部正文形态:
`paragraph / list / callout / formula / figure / lab / table / compare / steps / device / code`。
新增 block 类型属于 **minor** 变更(向后兼容),删除 / 改字段属于 **major** 变更。

### 4.2 Experiment / Quiz 的字段约定

- `Experiment.labs[]`:`{ id, title, route, mode?, embedded?, summary?, params?, observe?, conclusion? }`。
  - `mode`:`interactive`(浏览器模拟)、`hardware`(真机)、`simulation`(仿真)。
  - `embedded: true` 表示实验内嵌在课程页,`route` 可指向课程路由。
- `QuizQuestion`:源站若用“选项字符串数组 + 正确下标”,必须先转成 `options[{id,text}]` + `correctIds`(如 analog:下标 → a/b/c/d),**语义无损**,转换规则登记在映射表。
- `NextStep`:`label` 必填;`route` / `courseId` 至少一个;`kind` 区分 lesson/lab/quiz/case/project/reading/external。

---

## 5. 证据标识规则(对应 A8)

| kind | 中文 | 什么时候用 | 必须写清 |
|---|---|---|---|
| `principle` | 原理示意 | 教材 / 手算 / 示意代码;**未**在目标环境运行或测量 | 哪些内容是示意、数值边界、不能证明什么 |
| `compiled` | 已编译验证 | 示例代码在声明的工具链与版本下**编译通过** | 工具链、版本、命令、目标架构;仅 `npm run verify` / 站点自检**不算** |
| `hardware` | 已硬件验证 | 在具体板卡 / 器件上**实测通过** | 硬件型号、版本、实测项、测量条件/仪器 |

规则:

1. 每条证据都必须有 `version` 与 `note`;`note` 必须写“证明了什么 / 没证明什么”,不能只写“已验证”。
2. 页面可有多条证据;排序建议 `hardware > compiled > principle`,最强证据在前。
3. 证据必须真实:没有编译就只标 `principle`;后补 `compiled` / `hardware` 时,在 `source` 写命令或实测记录位置。
4. 版本变化时新增证据,不要覆盖旧版本(例如“Linux 5.x 对照”与“6.x 基线”并存)。
5. **当前六站现状**:T0.1 盘点确认 92 个实验全部是浏览器内动画/模拟,六站没有 A8 证据字段。因此现有页面映射时**全部默认 `principle`**,`compiled` / `hardware` 证据为零,后续必须由课程编辑补测后添加——不得为了“好看”伪造。
6. 两个样例的证据都是 `principle`:linux 设备树(本站声明不连接真实内核/开发板)、analog 二极管(教材公式与手册典型值,非实测)。

示例:

```json
{
  "kind": "principle",
  "version": "Linux 6.x(ARM64 默认;5.x 仅作对照)",
  "note": "dts/overlay 为学习示意;地址、GPIO、中断 cell 均为占位,真实值必须来自 SoC 手册与板级 dts;未做目标内核编译或板卡验证。",
  "source": "/home/czy/linux-driver-lab/src/data/lessons/device-tree.ts:87,130"
}
```

---

## 6. 版本规则

### 6.1 schema 版本

- `COURSE_SCHEMA_VERSION = "1.0.0"`,语义化版本。
- **major**:删字段 / 改字段含义 / 改枚举值 / 改 id 或 route 规则 → 老数据必须迁移。
- **minor**:新增可选字段 / 新增枚举成员(如新 site、新 block 类型 / 新证据类型) → 老数据无需改动。
- **patch**:仅校验脚本、文档修正,类型不变。
- 每次变更必须同时更新:`schema.ts` 常量与枚举、`validate.mjs` 内对应枚举、本文档、样例(如需),并跑一次 `node shared/course/validate.mjs`。
- 兼容策略:消费方(导航 / 搜索 / 档案)按 `schemaVersion` 的 major 拒绝不认识的版本,minor 忽略未知可选字段。

### 6.2 内容版本

- `Meta.updatedAt`:内容组织者维护的更新时间;源站无字段时可用源文件 mtime 作**近似**,但不得把构建时间冒充内容更新时间。
- `Evidence.version`:该条证据的适用版本(软件 / 内核 / RTOS / 教材 / 硬件);同一页有多版本时,每条证据各自声明。
- `Meta.status`:`live`(可学)、`building`(编写中)、`planned`(计划中);`planned` 页面不进入学习档案的“已完成”。
- 内容修订不改 id/route;重大重写可保留 id、更新 `updatedAt` 与证据。

### 6.3 inventory 阶段别名

```text
foundation → foundation
mcu        → mcu
rtos       → rtos
linux      → embedded-linux   ← 命名差异
driver     → driver
network    → connectivity     ← 命名差异
advanced   → advanced
```

消费 T0.1 inventory 时必须归一后再与课程的 `meta.stage` 比较;T0.3 之后建议 T0.1 侧统一为正式枚举。

---

## 7. 现有数据 → schema 映射规则

### 7.1 六站数据源与可映射性

| 站点 | 知识页数据源 | 已有可映射字段 | 必须人工补 / 需转换的字段 | 真实路由形态 |
|---|---|---|---|---|
| linux | `src/data/lessons.ts`(元数据)+ `src/data/lessons/*.ts`(正文)+ `labs.ts` + `quizzes.ts` + `versions.ts` | goals、tags、summary、english、analogy、why、coreConcepts、codeSamples、versionNoteIds、takeaways、mistakes、quizzes、further、lab 元数据 | prerequisites(推导)、resultCheck(人工)、experiment 步骤(人工)、evidence(人工)、stage(按 inventory)、route 加 `/linux` | `/linux/learn/:slug`、`/linux/labs#id` |
| analog | `src/data/site.ts`(modules/labs)+ `src/data/lessons/*.ts` + `quiz.ts` | goals、prerequisites、analogy、why、sections(全量 blocks)、mistakes、takeaways、quiz id、实验元数据(摘要/参数) | resultCheck(人工)、nextStep(按顺序推导)、experiment 步骤(由内嵌 lab block 推导)、evidence(人工)、stage(按 inventory)、route 加 `/analog` | `/analog/learn/:slug`;实验无独立路由 |
| mcu | `src/data/lessons/*.ts` + `src/data/nav.ts`(路由)+ `labs.ts` + `src/data/quiz/*` | goals、analogy、why、sections、mistakes、takeaways、quizIds、keywords、lab 元数据 | prerequisites、resultCheck、nextStep、evidence、experiment 步骤 | `/mcu/<slug>` |
| rtos | `src/data/chapters/*.ts`(题目内嵌于章节) | objectives、metaphor、why、blocks、mistakes、takeaways、quizIds、related | prerequisites、resultCheck、experiment 步骤、evidence | `/rtos/learn/:slug` |
| ros | `src/data/pages/*.ts` | objectives、analogy、why、concepts、sections、lab/extraLabs(observe/conclusion)、pitfalls、takeaways、quizzes | prerequisites、resultCheck、nextStep、evidence | `/ros/<slug>` |
| ml | `src/data/algorithms.ts` + `site.ts` | goals、oneLine、analogy、importance、idea、formulas、steps、experimentId/note、code、questions、takeaways | prerequisites、resultCheck、experiment.hardware、nextStep、evidence | `/ml/algorithms/:slug`、`/ml/lab/:slug` |

> 说明:上表的“已有可映射字段”来自各站 `types.ts` 与数据文件;完整逐条清单见 T0.1 `inventory.json`(937 条)。

### 7.2 逐字段映射规则表(核心:可推导 vs 必须人工补)

| schema 字段 | 映射规则 | 判定 | 备注 |
|---|---|---|---|
| `meta.id` | `site + ':' + slug` | **可推导** | slug 取源站知识页 slug |
| `meta.title` | 源站 title | **可推导** | — |
| `meta.site` | 站点目录 / 部署 base | **可推导** | 六站固定 |
| `meta.stage` | 按站点 + 分组;优先读 T0.1 inventory 逐条 stage,别名归一 | **可推导(需审核)** | 同一站会跨多阶段(如 linux 分 `embedded-linux` 与 `driver`) |
| `meta.route` | React Router 路径 + 部署 base;实验带锚点 | **可推导** | 必须核对真实可访问;analog 实验无独立路由 |
| `meta.tags` | 源站 tags / keywords | **可推导** | analog 用 keywords |
| `meta.evidence` | 源站无任何证据字段 | **必须人工补** | 现有页面默认 `principle`;compiled/hardware 需实测后补 |
| `meta.updatedAt` | 源码 mtime(近似) | **可推导(近似)** | 内容更新时间需编辑维护 |
| `meta.summary` / `english` / `order` / `difficulty` / `minutes` / `status` | 源站同义字段 | **可推导** | 字段名各站不同,见 7.1 |
| `goalObjectives` | goals / objectives | **可推导** | — |
| `prerequisites` | analog 有显式字段;其余按 order/group 推导或人工补 | **推导 + 人工审核** | 5 站无显式前置字段 |
| `principles.lead` | oneLine / tagline / oneLiner / subtitle | **可推导** | — |
| `principles.analogy` | 源站 analogy/metaphor(ros 取 bullets) | **可推导** | — |
| `principles.why` | 源站 why(rtos/ros 为对象,取 text/useCases/bullets) | **可推导** | 需做结构转换 |
| `principles.concepts` | coreConcepts / concepts | **可推导** | — |
| `principles.sections` | sections / blocks | **可推导** | analog/mcu/rtos/ros 主形态;linux 不强拆 |
| `principles.codeSamples` | linux codeSamples;ros Section.code;ml code | **可推导** | 需统一 language 枚举 |
| `principles.versionNoteIds` | linux versionNoteIds | **可推导** | 其他站暂无 |
| `principles.takeaways` | takeaways | **可推导** | — |
| `experiment.labs` | labs 元数据(按 lessonSlug/moduleSlug 关联) | **可推导** | 需 join;内嵌实验标 `embedded: true` |
| `experiment.steps / hardware / expected` | 源站多数无步骤、无硬件、无预期 | **人工补**(analog 可由 lab block 位置推导步骤草案) | 六站实验均为模拟,真机实验必须写硬件 |
| `resultCheck` | 六站都没有结果检查字段 | **必须人工补** | 样例中的 resultCheck 为从 goals/takeaways/例题推导的草案,需编辑复核 |
| `troubleshooting` | mistakes / pitfalls | **可推导** | linux 的 `dmesg` 可选保留 |
| `quiz` | 源站题目:linux 内嵌;其余用 id 引用题库 | **可推导(需 join + 转换)** | 选项字符串/下标 → `options[{id,text}]` + `correctIds`;共享题库需人工确认归属 courseId |
| `nextStep` | linux `further` 直接映射;analog 按模块顺序推导;rtos `related` 部分可用 | **推导 + 人工补** | mcu/ros/ml 多数缺 |
| `SearchIndexEntry` | 由课程 + 实验 + 题目 + 术语 + 案例生成 | **可推导** | 见 §8;术语/题目/案例不进 8 段 |
| `InventoryItem` | 直接读 T0.1 inventory.json | **可推导** | stage 用别名字段归一,见 6.3 |

**汇总**:

- 可自动 / 半自动导出:id、title、site、route、tags、summary、english、order、goals、principles、troubleshooting、quiz(join 后)、updatedAt(近似)。
- **必须人工补**:`evidence`(全部)、`resultCheck`(全部)、`prerequisites`(5/6 站)、`nextStep`(多数站)、`experiment.steps/hardware`(多数)、`stage` 的逐条审核。
- 需转换但语义无损:题目选项与答案、why 对象、analogy bullets、code language、lab 内嵌路由。

### 7.3 两个真实样例的映射结果

| 样例 | 真实路由 | 数据源(路径:行号) | 8 段 | 证据 | 映射难点 |
|---|---|---|---|---|---|
| linux 设备树 | `/linux/learn/device-tree` | `src/data/lessons.ts:144-156`;`src/data/lessons/device-tree.ts:6-218`;`src/data/labs.ts:69-82`;`src/data/versions.ts:85-94` | 8/8;principles 走 analogy+concepts+codeSamples | 3 条 `principle` | prerequisites/resultCheck 为推导;evidence 只能标 principle;route 需加 `/linux` 前缀 |
| analog 二极管 | `/analog/learn/diode` | `src/data/site.ts:38-49,258-279`;`src/data/lessons/diode.ts:4-325`;`src/data/quiz.ts:44-73`;`src/data/devices.ts:10-34` | 8/8;principles.sections 全量 7 节 34 个 block | 2 条 `principle` | 实验无独立路由/无步骤 → 推导;nextStep 按模块顺序推导;题库 id 需 join;resultCheck 为推导 |

两个样例的 route 已在 T0.1 inventory 中命中对应条目,阶段一致:
`linux:device-tree → driver`、`analog:diode → foundation`。

### 7.4 映射中发现的难点(六站数据缺失)

1. **证据体系完全缺失(A8 未落地)**:六站没有任何 `principle/compiled/hardware` 字段,T0.1 确认 92 个实验全为浏览器模拟 → 所有现有页面的 `compiled` / `hardware` 证据必须后续人工补测,当前只能诚实标 `principle`。
2. **`resultCheck` 六站全缺**:只能在映射时由 goals / takeaways / 实验结论合成草案,需课程编辑复核,不能把“推导结果”冒充源站事实。
3. **`prerequisites` 5 站缺失**:仅 analog 有显式前置;linux 可用 order/group 推导,其余站需人工补。
4. **`nextStep` 多数缺失**:仅 linux 有 `further`;analog 可按模块顺序推导;mcu/ros/ml 需人工确定下一步。
5. **实验只有元数据**:labs 有标题/摘要/参数,但普遍没有操作步骤、硬件清单、预期结果;analog 实验无独立路由,搜索只能指向课程页并带实验 id。
6. **`updatedAt` 无来源**:只能取源文件 mtime,不能代表内容更新时间。
7. **`stage` 无来源字段**:依赖 T0.1 逐条归类;且 inventory 用 `linux`/`network` 与正式枚举不一致,必须归一。
8. **题库 / 术语 / 案例不属于 8 段**:题库(尤其共享题库)的归属课程需要人工确认;术语、案例、题目通过 `SearchIndexEntry` / `InventoryItem` 进入平台,不塞进 `CourseLesson`。
9. **正文模型各异**:mcu/rtos/ros 的 blocks 字段不同(ros 用 `Section.formulas/code/commands/table`,rtos 的 blocks 又是另一套),已用 `ContentBlock` 联合类型覆盖;新增形态需 minor 升级。
10. **学习档案不在本 schema**:进度 / 阅读 / 测验记录是档案层(T0.3 / 第三批),`CourseLesson` 不混入用户状态,避免内容与档案耦合。

---

## 8. 搜索索引与 inventory 对齐

### 8.1 `SearchIndexEntry`

跨站搜索的构建期索引条目,字段:
`id / courseId / site / type / title / route / stage / tags / summary? / keywords? / anchor?`。

生成规则:

| 来源 | type | route | 说明 |
|---|---|---|---|
| 知识页 / 模块 / 页面 | `lesson` | 课程真实路由 | 每页 1 条 |
| 实验 | `lab` | 独立实验路由或带锚点路由;内嵌实验用课程路由 + 实验 id | linux 用 `/linux/labs#id`;analog 用课程路由 |
| 题目 | `quiz` | 所属课程路由或测验中心 + 锚点 | 共享题库需 `courseId` 归属 |
| 术语 | `glossary` | 术语表路由 + 锚点 | 不进入 8 段 |
| 案例 | `case` | 案例路由 | 不进入 8 段 |

### 8.2 `InventoryItem`(与 docs/inventory.json 对齐)

- 必填:`type / id / title / route / source`;可选:`stage / status / lessonSlug / note`。
- `type` 枚举:`lesson | lab | quiz | case | glossary | module | page`(inventory 实际值),与课程 `SearchIndexEntry.type` 不完全相同,不要混用。
- `stage` 使用 inventory 口径 `foundation|mcu|rtos|linux|driver|network|advanced`,消费时经 `STAGE_ALIASES` 归一;`status` 为 `live|planned|ready`。
- inventory 里同一 `route` 可能有多条(尤其 analog:模块页与内嵌实验同路由),关联课程时应优先取 `module/lesson/page` 类型条目。

---

## 9. 验收与维护

### 9.1 当前验收结果

```text
$ cd /home/czy/sites/1kni4r.top && node shared/course/validate.mjs
课程 schema v1 校验(validate.mjs)
schemaVersion: 1.0.0 | 样例文件: /home/czy/sites/1kni4r.top/shared/course/schema.samples.json

PASS linux:device-tree  route=/linux/learn/device-tree  stage=driver  8段=8/8  evidence=principle×3  quiz=3  sources=16
PASS analog:diode  route=/analog/learn/diode  stage=foundation  8段=8/8  evidence=principle×2  quiz=3  sources=13

inventory: docs/inventory.json 存在;sites=6,items=937,缺必填字段=0,stage 越界=0,route 前缀不符=0(仅提示,不参与 PASS/FAIL)
inventory: 样例 linux:device-tree 命中盘点条目 type=lesson,stage=driver(归一后一致)
inventory: 样例 analog:diode 命中盘点条目 type=module,stage=foundation(归一后一致)
计数: 样例 2/2 通过;8 段字段 16/16;证据 5 条;来源引用 29 条;警告 0;错误 0

PASS
```

负向用例已验证:把 stage 改成 `linux`、evidence.kind 改成 `tested`、删掉 quiz 段、把来源写成不存在的文件,脚本报 5 条错误并 `exit 1`。

### 9.2 校验脚本检查项

1. 顶层 `schemaVersion` / `generatedAt` / `samples`;
2. Meta:必填字段、id 格式、site / stage 枚举、route 前缀与 slug 结尾、tags、evidence 必填与 kind 枚举、updatedAt ISO;
3. 8 段字段齐全,各段类型与内部一致性(principles 内容块、experiment labs、quiz 选项/答案、nextStep 路由);
4. `mapping.sources` 路径真实存在、行号不超出文件范围、9 个字段都有来源标注;
5. `mapping.status` 枚举;
6. 可选:inventory 存在时做只读对齐提示(不参与退出码)。

### 9.3 新增第三个样例的流程

1. 从真实页面数据导出 JSON,按 `CourseSample` 结构填写(建议先仿照现有两个样例);
2. `mapping.sources` 写“绝对路径:行号”,并核对文件确实存在;
3. 运行 `node shared/course/validate.mjs`,必须 PASS;
4. 不得为了让样例通过而放宽校验(禁止把必填字段改成可选、禁止空证据);
5. 若需要新字段,按 §6.1 升级 schema 版本并同步三处文件。

### 9.4 变更记录

| 日期 | 版本 | 变更 | 操作 |
|---|---|---|---|
| 2026-11-27 | 1.0.0 | 冻结课程 schema v1(8 段 + 证据 + Meta + SearchIndexEntry + InventoryItem);新增 2 个真实页面样例与校验脚本 | T0.2 schema-agent |

> 规则:后续对本契约的修改必须在本表追加,不覆盖历史;改字段/枚举必须同时更新 `schema.ts`、`validate.mjs`、样例与本文档,并跑校验。
