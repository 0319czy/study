# 六站内容盘点(Inventory)

> 生成时间:2026-11-27T09:35Z(UTC)/ 2026-11-27 17:35(UTC+8)
> 机器可读明细:[inventory.json](inventory.json)(六站共 **937 条**)
> 盘点对象:`/home/czy/linux-driver-lab`、`/home/czy/mcu-playground`、`/home/czy/analog-playground`、`/home/czy/ml-playground`、`~/文档/deepseek-harness/default-workspace/ros-learn`、`~/文档/deepseek-harness/default-workspace/rtos-lab`
> 关联文档:[DECISIONS.md](DECISIONS.md) 的 A3(7 阶段顺序)与 [HANDOFF-codex.md](HANDOFF-codex.md) 的 T0.1 任务卡。
> **只读声明:本次盘点未修改六站任何源码或构建产物;只新增 `docs/inventory.json` 与 `docs/INVENTORY.md`。**

## 0. 结论摘要

1. 六站可盘点条目共 **937 条**:知识页/课程 **97**、实验 **92**、题目 **277**、案例 **35**、术语 **436**。
2. 覆盖最强的阶段是 **MCU与外设**(174 条)与 **方向进阶**(289 条,ML/ROS);**联网与交付**只有 8 条(2 篇知识页 + 6 道题),无实验、无案例,是当前最薄弱阶段。
3. 三个**系统性缺失**已确认:**C 与工程工具、数字电路、Linux 用户态**——六站合计 97 条知识页/课程中没有对应课程,而后续多个站又把"会 C / 会 Linux 命令"当作前提。
4. 937 条中 **0 条项目型条目**;35 条案例都是单点案例,没有承接 DECISIONS A4「多传感器采集与监控系统(M0–M5)」的端到端项目。
5. 实验与证据体系偏弱:92 个实验全部是浏览器内动画/模拟(其中 analog 24 个实验里 23 个仍未上线);六站没有 A8 要求的「原理示意 / 已编译验证 / 已硬件验证」证据标识。
6. 六站数据模型不统一(知识条目 5 类结构、题目存储方式各异、术语字段命名不一致),这是 T0.2「课程 schema v1」必须先解决的结构问题。

## 1. 按站数量汇总

类型口径:`知识页/课程` = lesson / module / page;`实验` = 交互/动画实验;`题目` = 单道测验题;`案例` = case study;`术语` = glossary 词条。

| 站点 | 聚合路径 | 知识页/课程 | 实验 | 题目 | 案例 | 术语 | 合计 |
|---|---|---:|---:|---:|---:|---:|---:|
| linux · 驱动实验室 | `/linux/` | 21 | 16 | 63 | 7 | 27 | **134** |
| mcu · MCU Playground | `/mcu/` | 19 | 12 | 57 | 8 | 86 | **182** |
| analog · 知电 | `/analog/` | 18 | 24 | 55 | 6 | 80 | **183** |
| ml · 知机 | `/ml/` | 19 | 10 | 41 | 4 | 76 | **150** |
| ros · ROS 学习实验室 | `/ros/` | 11 | 15 | 34 | 5 | 74 | **139** |
| rtos · RTOS Lab | `/rtos/` | 9 | 15 | 27 | 5 | 93 | **149** |
| **合计** | — | **97** | **92** | **277** | **35** | **436** | **937** |

补充说明:

- analog 的 18 条是 `module`(知识模块),正文在 `src/data/lessons/*.ts`;ros 的 11 条是 `page`(知识页);其余站是 lesson/chapter 型课程。
- 题目数量与知识页大致按 3 题/页配比:linux、mcu、rtos 每页 3 题;analog 每模块 3 题(diode 4 题);ros 每页 3 题(communication 4 题);ml 每主题 2–3 题。
- 站点自带清单/参考数量核对:linux 21 知识页 / 16 实验 / 7 案例 / 27 术语 ✓;mcu 19 知识页 ✓(26 条导航,另加 `/cases/:slug` 为 27 条路由模式);analog 18 模块 / 24 实验 / 55 题 ✓;ml 19 主题 / 41 题 / 10 实验 ✓;ros 11 页 / 34 题 / 15 实验 / 5 案例 / 74 术语;rtos 9 章 / 27 题 / 15 实验 / 5 案例 / 93 术语。

## 2. 按 7 阶段归类

阶段定义来自 DECISIONS A3:**工程基础 → MCU与外设 → RTOS → 嵌入式Linux → 驱动与硬件协同 → 联网与交付 → 方向进阶**。
全部 937 条在 `inventory.json` 中逐条带 `stage` 字段;本节是汇总视图。

### 2.1 阶段定义与主责站点

| 阶段 | 阶段目标范围 | 主责站点 | 条目数 |
|---|---|---|---:|
| 工程基础 | 编程与工具链、电子/电路基础、数字电路 | analog(模拟电路,占位) | 183 |
| MCU与外设 | MCU 内核/时钟/存储、GPIO/中断/DMA/定时器/ADC、板级总线(UART/I2C/SPI/CAN/USB) | mcu | 174 |
| RTOS | 任务/调度/同步/中断/内存/启动/调试/低功耗/安全 | rtos | 149 |
| 嵌入式Linux | 内核模块、字符设备、文件 IO、并发、中断、设备模型、调试、实时、安全、移植 | linux | 85 |
| 驱动与硬件协同 | 设备树、platform 驱动、GPIO/pinctrl、I2C/SPI/USB/DMA 驱动 | linux | 49 |
| 联网与交付 | 以太网/无线协议、MQTT/HTTP/OTA、网关、展示与交付 | mcu(仅协议知识) | 8 |
| 方向进阶 | 机器学习、ROS 机器人方向 | ml、ros | 289 |

### 2.2 阶段 × 站点(知识页/课程条目,共 97)

| 阶段 | linux | mcu | analog | ml | ros | rtos | 合计 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 工程基础 | — | — | 18 | — | — | — | **18** |
| MCU与外设 | — | 17 | — | — | — | — | **17** |
| RTOS | — | — | — | — | — | 9 | **9** |
| 嵌入式Linux | 14 | — | — | — | — | — | **14** |
| 驱动与硬件协同 | 7 | — | — | — | — | — | **7** |
| 联网与交付 | — | 2 | — | — | — | — | **2** |
| 方向进阶 | — | — | — | 19 | 11 | — | **30** |
| **合计** | **21** | **19** | **18** | **19** | **11** | **9** | **97** |

### 2.3 阶段 × 条目类型(全部 937 条)

| 阶段 | 知识页/课程 | 实验 | 题目 | 案例 | 术语 | 合计 |
|---|---:|---:|---:|---:|---:|---:|
| 工程基础 | 18 | 24 | 55 | 6 | 80 | **183** |
| MCU与外设 | 17 | 12 | 51 | 8 | 86 | **174** |
| RTOS | 9 | 15 | 27 | 5 | 93 | **149** |
| 嵌入式Linux | 14 | 11 | 42 | 1 | 17 | **85** |
| 驱动与硬件协同 | 7 | 5 | 21 | 6 | 10 | **49** |
| 联网与交付 | 2 | 0 | 6 | 0 | 0 | **8** |
| 方向进阶 | 30 | 25 | 75 | 9 | 150 | **289** |
| **合计** | **97** | **92** | **277** | **35** | **436** | **937** |

阶段覆盖速判(按"课程 + 实验 + 案例"的配套程度,非站点自评):

- **强**:MCU与外设、方向进阶(ML/ROS);
- **中**:RTOS、嵌入式Linux、驱动与硬件协同(课程与题量够,但缺真实硬件/项目);
- **弱**:工程基础(只有模拟电路)、联网与交付(只有 2 篇协议知识页 + 6 题)。

### 2.4 归类规则与近似处理

- 知识页/课程:按标题与内容逐条人工映射;实验与题目继承所属 lesson/module/chapter 的阶段。
- 术语:
  - linux 按 `category`:基础/并发 → 嵌入式Linux,设备模型/内存 → 驱动与硬件协同;
  - mcu 按 `category`:mcu/peripheral/protocol/electrical/tool → MCU与外设;
  - analog/ml/ros/rtos 因术语不细分课程,整站归本站主阶段。
- 案例:按主题人工映射(linux 6 条驱动、1 条内核;其余整站主阶段)。
- **近似点(需在 T0.2 校准)**:
  1. analog 全站归「工程基础」——它实际是模拟电路(半导体/器件/放大/运放/电源/振荡/噪声),在 7 阶段中没有独立位置,按"电路基础"放进工程基础;
  2. mcu 的以太网/无线 2 篇归「联网与交付」,其余 17 篇归「MCU与外设」;
  3. ml、ros 全站归「方向进阶」,未再细分方向;
  4. 阶段字段是盘点侧规则映射,不是六站源码自带元数据。

## 3. 缺口表

### 3.1 系统性缺失(三项,优先级最高)

| # | 系统缺失 | 所属阶段 | 现状证据 | 影响 | 建议 |
|---|---|---|---|---|---|
| G1 | **C 与工程工具** | 工程基础 | 97 条知识页/课程中无 C 语言、位操作、编译链接、Git/Make/gdb 课程;linux 零基础路线受众写明"会 C 语言、用过 Linux 命令"作为前提;mcu `core` 仅覆盖启动流程/链接脚本片段,不是 C 语言课 | 新学习者没有"第 0 门课",后续所有站都假设已会 C 与命令行 | 第 1 批补最小课:C 与位操作、编译链接、Git/Make/gdb 工作流 |
| G2 | **数字电路** | 工程基础 | analog 18 个模块全部是模拟电路(半导体、PN 结、BJT、MOSFET、放大、运放、滤波、电源、振荡、噪声、测量);唯一带"加法器"字样的 `opamp-summing` 是运放加减法实验(analog,且未上线),不是数字逻辑;六站无逻辑门/布尔代数/组合逻辑/时序逻辑/触发器/数字系统 | MCU 的寄存器、总线、时序内容缺少前置;A3 课程链在"电路基础"处断裂 | 第 1 批补数字电路入门(逻辑门 → 组合 → 时序 → 寄存器/计数器) |
| G3 | **Linux 用户态** | 嵌入式Linux | linux 站 21 篇全部是内核/驱动视角(内核模块、字符设备、文件 IO/ioctl、并发、中断、设备模型、设备树、平台驱动、总线驱动、调试、实时、安全、移植);无 shell、POSIX 文件 IO、进程/线程、socket、系统编程课程 | A4 项目的"Linux 网关"没有用户态课程承接;驱动课也缺"用户态调用方"视角 | 第 1 批补 Linux 用户态入门,并排在 Linux 驱动课之前 |

> 这三项与 DECISIONS D4「第一批纳入三门基础最小课」完全对应;当前六站没有任何一门被覆盖。

### 3.2 其他阶段性缺口

| 阶段 | 缺口 | 证据 | 严重度 |
|---|---|---|---|
| 工程基础 | 实验落地不足 | analog 24 个实验里按 `src/pages/LessonPage.tsx` 的实现只有 `rectifier` 标记"可用",其余 23 个为计划中(inventory 中 `status: planned`) | 中 |
| MCU与外设 | 无独立实验路由、无硬件验证 | 12 个实验内嵌在知识页/案例详情页,没有独立 lab 页面;全站无"已在指定硬件验证"标识 | 中 |
| RTOS | 缺 MCU + RTOS 落地项目 | rtos 站 9 章/15 实验/27 题为通用 RTOS 教学,与 mcu 站无交叉引用;DECISIONS D5 指定的 STM32F103 + FreeRTOS 10.x 没有对应课程 | 高 |
| 嵌入式Linux | 无板级/部署实战 | 21 篇均为概念 + 代码片段 + 教学案例;无 Orange Pi/树莓派等网关板实验,无系统构建、烧录、部署内容 | 高 |
| 驱动与硬件协同 | 缺真实硬件联调 | 7 篇驱动、5 个实验、6 个案例均为教学动画/代码片段;无示波器、逻辑分析仪、PCB、板级 bring-up 内容 | 高 |
| 联网与交付 | 六站最薄弱阶段 | 仅 mcu 的 2 篇(以太网、无线协议)+ 6 题,实验/案例/术语均为 0;MQTT/HTTP/OTA 只在上述知识页里被提到,没有对应课程/实验;无网关、仪表盘、部署与交付物 | 高 |
| 方向进阶 | 方向内有缺项 | ML(19 主题/41 题/10 实验)与 ROS(11 页/15 实验/34 题)已有;DECISIONS A11 列的 Linux 系统构建(Buildroot/Yocto)、PCB 设计、边缘 AI 尚无课程(PCB 只在个别知识页中被提及) | 中 |
| 项目实战/交付 | 无端到端项目 | 937 条中 0 条项目型条目;35 条案例为单点案例;DECISIONS A4 的 M0–M5 路线没有任何一条课程或案例承接 | 高 |
| 内容结构 | 六站 schema 不统一 | 知识条目 5 类结构(lesson/chapter/module/topic/page)、题目存储方式各异(独立题库/按页拆分/内嵌主题/页面聚合/章节 quizMap)、术语字段命名不一致(id/term、definition/desc、related/relatedSlug)——直接阻塞 T0.2 | 中 |
| 证据体系 | 无证据分级 | 六站均无 A8 的「原理示意 / 已编译验证 / 已硬件验证 + 适用版本」标识;实验状态只有 analog 区分 ready/planned | 高 |

> 严重度定义:**高** = 影响 A4 端到端主线的闭环;**中** = 影响学习体验或排期;**低** = 文档/一致性问题(本次未列)。

## 4. 六站数据结构差异(盘点时发现)

| 站点 | 知识条目模型 | 实验 | 题目 | 案例 | 术语 | 路由模式数 |
|---|---|---|---:|---:|---:|---:|
| linux | `src/data/lessons.ts` 21 条元数据 + `lessons/<slug>.ts` 正文 | `labs.ts` 16(全部 live) | `quizzes.ts` 63(按 lessonSlug,每篇 3 题) | `cases.ts` 7(仅列表路由) | `glossary.ts` 27(有 id,4 类) | 9 |
| mcu | `nav.ts` 26 条路由元数据 + `lessons/index.ts` 19 个懒加载 | `labs.ts` 12(内嵌知识页) | `quiz/<slug>.ts` 19 个文件 57 题(每页 3 题) | `cases/basic.ts`+`advanced.ts` 8(有详情路由) | `glossary.ts` 86(无 id) | 27 |
| analog | `site.ts` 18 模块 + `lessons/<slug>.ts` 正文 | `site.ts` 24(仅 1 个可用) | `quiz.ts` 55(按 module) | `cases.ts` 6(仅列表路由) | `glossary.ts` 80(无 id) | 9 |
| ml | `algorithms.ts` 19 主题(题目内嵌) | `site.ts` 10(独立 `/lab/:slug`) | `algorithms.ts` 内嵌 41 题 | `cases.ts` 4(仅列表路由) | `glossary.ts` 76(有 id) | 12 |
| ros | `pages/*.ts` + `pages/index.ts` 11 页 | 页面 `lab`/`extraLabs` 共 15 个实例(key 可重复) | `pages/index.ts` 聚合 `ALL_QUIZZES` 34 题 | `cases.ts` 5(仅列表路由) | `glossary.ts` 74(无 id) | 18 |
| rtos | `chapters/*.ts` + `chapters/index.ts` 9 章 | `navigation.ts` `labMeta` 15(内嵌章节) | `chapters/index.ts` `quizMap` 汇总 27 题 | `cases.ts` 5(有详情路由) | `glossary.ts` 93(有 id) | 10 |

具体异常与处理:

1. **linux 实验锚点不一致**:`labs.ts` 每条的 `route` 写成 `/labs#<id>`,但 `LabsPage.tsx` 只给"计划中"实验加 `id`,`live` 实验容器没有 `id`,16 个已上线实验的 hash 锚点实际不滚动。inventory 的 lab route 统一记 `/linux/labs`。
2. **analog 实验可用性**:`LessonPage.tsx` 里 `const ready = labSlug === 'rectifier'`,24 个实验只有 `rectifier` 标"可用",其余在页面上显示"计划中";inventory 用 `status` 字段区分 `ready`/`planned`。
3. **mcu/analog/ros/rtos 的实验没有独立路由**:实验内嵌在知识页(或案例详情),inventory 的 lab route 指向承载页;linux 有独立 `/labs` 实验页;ml 的 10 个实验有独立 `/ml/lab/:slug` 页面。
4. **ml 没有独立题库文件**:41 题内嵌在 `algorithms.ts` 的每个 `topic.questions`,`src/pages/QuizPage.tsx` 现场扁平化;盘点按"题目"逐条提取,`source` 记 `src/data/algorithms.ts`。
5. **ros 实验 key 重复**:`pub-sub`、`qos-dds` 在多个页面出现,单用 key 会冲突;inventory 的 lab id 用 `<pageSlug>/<labKey>` 复合 id。
6. **rtos 实验锚点不一致**:页面里链接写 `#lab-<labId>`,但 `ChapterPage.tsx` 的 lab 块实际 id 是 `#block-<index>`;inventory 的 lab route 只到章节页。
7. **术语字段命名差异**:linux `id/zh/en/definition`;mcu `zh/en/desc`;analog `term/en/definition`;ml `id/zh/en/definition`;ros `term/zh/desc`;rtos `id/zh/en/desc`。无 id 的站按序号生成盘点 id(如 `mcu-term-1`)。
8. **路由模式数与导航/页脚条数不同**:linux 顶部导航 5 条、页脚索引 11 条,而路由模式只有 9 条;mcu 导航清单 26 条,加上 `/cases/:slug` 为 27 条路由模式。`inventory.json` 的 `routeCount` 采用"路由模式数"口径,并附 `routeSource` 说明。
9. **参考数量核对**:linux 21/16/7/27、analog 18/24/55、mcu 19 知识页、ml 19 主题/41 题/10 实验均与源码一致;任务参考里的 ml「7 模块」与当前源码不一致——`src/data/site.ts` 的 `modules` 实际是 9 条导航项(`/paths`、`/map`、`/algorithms`…),不是知识模块,本次按实际记 9 条导航项、不写入 items。

## 5. 盘点方法(可复现)

### 5.1 只读加载方式

不启动浏览器、不启动 vite dev server、不复制/修改六站文件:

1. 为每站写一个临时入口 `entry.js`,用 `export * as … from '<站点>/src/data/…'` 汇总数据模块;
2. 用**站点自带**的 `node_modules/.bin/esbuild` 打包成 `/tmp/inv/<slug>/bundle.mjs`(输出在 /tmp,不写站点);
3. 用 Node 直接 `import()` 打包产物,读取导出的数组/对象;需要懒加载的数据(mcu 的 `loadAllLessons()`/`loadAllQuestions()`)也通过导出函数取全量;
4. 生成 `/home/czy/sites/1kni4r.top/docs/inventory.json`。

### 5.2 提取字段口径

`inventory.json` 每条 item 字段:

| 字段 | 口径 |
|---|---|
| `type` | `lesson` / `module` / `page`(知识页/课程);`lab`(实验);`quiz`(单题);`case`(案例);`glossary`(术语) |
| `id` | 数据源已有 id/slug 直接使用;无 id 的术语按序号生成(`mcu-term-1` 等);ros 实验用 `<page>/<key>` |
| `title` | 标题;题目取题干并截断到 70 字符(超出加 `…`);术语合并中英文 |
| `route` | **站内真实路由 + 聚合 base**(`/linux/`、`/mcu/`…);只到页面级,不带未实现的 hash 锚点 |
| `source` | 该条目 id/标题所在的数据文件(相对站点根);正文文件另见第 4 节 |
| `stage` | 7 阶段之一,规则见 5.3 |
| `status` | 仅部分实验有:linux `live`;analog `ready`/`planned` |

`routeCount` = 站内路由模式数(读 `App.tsx` / `router/routes.tsx`,不含 `*` 404 兜底);`routeSource` 记录来源文件。

### 5.3 阶段归类规则

| 维度 | 规则 |
|---|---|
| 知识页/课程 | 逐条按标题与正文主题映射;linux 21 篇中 14 篇归嵌入式Linux、7 篇归驱动与硬件协同;mcu 17 篇归 MCU与外设、2 篇(以太网/无线)归联网与交付;analog 18 模块归工程基础;ml 19 主题、ros 11 页归方向进阶;rtos 9 章归 RTOS |
| 实验 | 继承所属 lesson/module/chapter 的阶段(linux 11/5,mcu 全 12 归 MCU与外设,analog 24 归工程基础,ml 10、ros 15 归方向进阶,rtos 15 归 RTOS) |
| 题目 | 继承 `lessonSlug` / `module` / `pageSlug` / `chapter` 的阶段 |
| 案例 | 人工按主题映射(linux 6 条驱动、1 条内核;mcu 8 条 MCU;analog 6 条工程基础;ml 4、ros 5 条方向进阶;rtos 5 条 RTOS) |
| 术语 | linux 按 category(基础/并发→嵌入式Linux,设备模型/内存→驱动);mcu 全部 → MCU与外设;其余站整站主阶段 |

### 5.4 近似处理与已知误差

1. **阶段是盘点侧启发式,不是站点元数据**:六站源码没有统一的 stage 字段,归类依据是标题、类别与所属课程;T0.2 冻结 schema v1 后应以正式字段重新校准。
2. **analog → 工程基础**:模拟电路在 7 阶段中无独立位置,按"电路基础"归入工程基础;这也意味着"工程基础"的 183 条不代表编程/工具基础已覆盖。
3. **mcu 以太网/无线 → 联网与交付**:按阶段语义拆分,未把 17 篇外设课程拆出去。
4. **实验可用性未逐页验证**:`status` 来自源码常量(linux `live`、analog 的 `ready = 'rectifier'`),未在浏览器逐页点验;mcu/ros/rtos 未标注状态。
5. **术语 id 生成**:mcu/analog/ros 术语源数据无 id,盘点 id 为序号,重新排序会变化;需要稳定 id 时以 `term`/`zh` 文本为键。
6. **题目标题截断**:`title` 只保留前 70 字符,完整题干以 `id` + `source` 回源;不影响数量与阶段统计。
7. **routeCount 口径**:采用路由模式数,因此与站点导航菜单条数不完全相等(见第 4 节第 8 条);它不是"可访问 URL 总数"。

### 5.5 复现命令(示例:linux)

```bash
# 1) 临时入口(输出到 /tmp,不写站点)
mkdir -p /tmp/inv/linux
cat > /tmp/inv/linux/entry.js <<'EOF'
export * as lessonsMeta from '/home/czy/linux-driver-lab/src/data/lessons.ts';
export * as labs from '/home/czy/linux-driver-lab/src/data/labs.ts';
export * as cases from '/home/czy/linux-driver-lab/src/data/cases.ts';
export * as glossary from '/home/czy/linux-driver-lab/src/data/glossary.ts';
export * as quizzes from '/home/czy/linux-driver-lab/src/data/quizzes.ts';
EOF

# 2) 用站点自带 esbuild 打包
/home/czy/linux-driver-lab/node_modules/.bin/esbuild \
  /tmp/inv/linux/entry.js --bundle --format=esm --platform=node \
  --outfile=/tmp/inv/linux/bundle.mjs --log-level=warning

# 3) 其余五站同理(mcu/analog/ml/ros/rtos 各自入口见第 4 节 source 列),
#    再由盘点脚本 import 六个 bundle,输出 docs/inventory.json
```

六站入口模块清单:

| 站点 | 入口模块 |
|---|---|
| linux | `lessons.ts`、`lessons/index.ts`、`labs.ts`、`cases.ts`、`glossary.ts`、`quizzes.ts` |
| mcu | `lessons/index.ts`、`quiz/index.ts`、`cases/index.ts`、`labs.ts`、`glossary.ts`、`nav.ts` |
| analog | `site.ts`、`lessons/index.ts`、`quiz.ts`、`cases.ts`、`glossary.ts` |
| ml | `algorithms.ts`、`site.ts`、`cases.ts`、`glossary.ts` |
| ros | `pages/index.ts`、`cases.ts`、`glossary.ts`(另 `lib/navigation.ts` 用于核对实验入口) |
| rtos | `chapters/index.ts`、`navigation.ts`、`cases.ts`、`glossary.ts` |

## 6. 校验记录

在 `/home/czy/sites/1kni4r.top` 下执行:

```bash
node -e "const inv=JSON.parse(require('fs').readFileSync('docs/inventory.json','utf8')); \
console.log(inv.sites.length, inv.sites.reduce((n,s)=>n+s.items.length,0))"
# 输出:6 937
```

| 校验项 | 结果 |
|---|---|
| `JSON.parse` 可解析 | ✅ 237 KB,合法 JSON |
| 六站齐全 | ✅ linux / mcu / analog / ml / ros / rtos |
| 每站 items > 0 | ✅ 最小 linux 134、最大 analog 183 |
| route 前缀与聚合 base 一致 | ✅ 937/937 条以 `/linux/`…`/rtos/` 开头;路由模式均能在各站 `App.tsx`/`router/routes.tsx` 找到 |
| 同站 `type|id` 重复 | ✅ 0 条重复 |
| 站点数量对账 | ✅ linux 21/16/63/7/27;mcu 19/12/57/8/86;analog 18/24/55/6/80;ml 19/10/41/4/76;ros 11/15/34/5/74;rtos 9/15/27/5/93(知识页/实验/题目/案例/术语) |
| 阶段字段合法 | ✅ 937 条全部落在 7 个 stage 内,无未知值 |
| 未改动六站 | ✅ 六站目录在 2026-11-27 17:25 之后没有新增/修改文件(`find -newermt` 计数均为 0);六站均非 git 仓库,无法用 git status 佐证,以 mtime 为准 |

> 盘点时间窗口内六站未被写入;本仓库只新增 `docs/inventory.json`、`docs/INVENTORY.md` 两个文件。
