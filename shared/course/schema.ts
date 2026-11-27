/**
 * 1kni4r.top 课程 schema v1 —— 平台统一课程契约
 * ============================================================
 * 目标:让六站(linux/mcu/analog/ml/ros/rtos)现有内容,以及后续在聚合站
 * 新建的课程,都能映射到同一结构,供导航 / 跨站搜索 / 学习档案 / 总路线复用。
 *
 * 三条硬约定:
 * 1) 一节课 = Meta(标识与元数据) + CourseLesson(固定 8 段)。
 * 2) 8 段缺一不可;源站缺失的段必须显式补写,不能靠 UI 兜底“看起来有”。
 * 3) 页面上的代码 / 实验 / 结论必须带证据标识(Evidence),没验证就标 principle。
 *
 * 版本:1.0.0(2026-11-27 冻结)
 * 详细字段解释、证据规则、版本规则与六站映射表见 docs/SCHEMA.md。
 * 本文件只定义类型,不引入任何运行时逻辑;校验脚本 validate.mjs 同时校验
 * 枚举与本文件保持一致。
 */

/** schema 版本。字段增删/枚举变化时按 docs/SCHEMA.md 的版本规则升级。 */
export const COURSE_SCHEMA_VERSION = '1.0.0' as const;

/** 课程版本号字符串类型,例如 "1.0.0"。 */
export type SchemaVersion = typeof COURSE_SCHEMA_VERSION | string;

/* ============================================================
   一、站点与阶段
   ============================================================ */

/**
 * 七阶段枚举。课程顺序(见 docs/DECISIONS.md A3):
 * foundation(工程基础) → mcu(MCU 与外设) → rtos → embedded-linux
 * → driver(驱动与硬件协同) → connectivity(联网与交付) → advanced(方向进阶)
 */
export const COURSE_STAGES = [
  'foundation',
  'mcu',
  'rtos',
  'embedded-linux',
  'driver',
  'connectivity',
  'advanced',
] as const;

/** 阶段。字符串枚举,与 validate.mjs 的 STAGES 保持一致。 */
export type Stage = (typeof COURSE_STAGES)[number];

/**
 * 站点 slug。前六个是已上线的六站;platform 表示聚合站自建课程
 * (例如第一批要补的 C 与工程工具课)。新增站点时同步扩展本数组并提升 minor。
 */
export const SITE_SLUGS = ['linux', 'mcu', 'analog', 'ml', 'ros', 'rtos', 'platform'] as const;

/** 站点 slug 类型。 */
export type SiteSlug = (typeof SITE_SLUGS)[number];

/* ============================================================
   二、证据标识(A8:原理示意 / 已编译验证 / 已硬件验证)
   ============================================================ */

/**
 * 证据类型:
 * - principle:原理示意。教材 / 手算 / 示例代码,未在目标环境实际运行或测量。
 * - compiled:已编译验证。示例代码在声明的工具链与版本下编译通过(需写清命令)。
 * - hardware:已在指定硬件验证。在具体板卡 / 器件上实测通过(需写清硬件型号)。
 */
export const EVIDENCE_KINDS = ['principle', 'compiled', 'hardware'] as const;

/** 证据类型。 */
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * 一条证据。version 与 note 都不能为空:
 * - version:适用版本 / 环境,例如 "Linux 6.x"、"ROS 2 Humble"、"STM32F103 + FreeRTOS 10.x"。
 * - note:这条证据具体证明了什么、没证明什么(边界)。
 * - source:可选,证据出处(源码路径:行号 / 命令 / 数据手册 / 文档链接)。
 */
export interface Evidence {
  kind: EvidenceKind;
  version: string;
  note: string;
  source?: string;
}

/* ============================================================
   三、课程元数据 Meta
   ============================================================ */

/** 来源标注。file 为绝对路径或相对 sourceRoot 的路径,lines 形如 "144-156"。 */
export interface SourceRef {
  file: string;
  lines?: string;
}

/**
 * 课程元数据。id/title/site/stage/route/tags/evidence/updatedAt 为必填;
 * 其余为“无损映射可选项”——源站已有就带上,没有就省略,不伪造。
 */
export interface Meta {
  /** 全局唯一 id,规则 `<site>:<slug>`,例如 "linux:device-tree"。 */
  id: string;
  /** 页面标题(中文)。 */
  title: string;
  /** 所属站点 slug。 */
  site: SiteSlug;
  /** 所属阶段(七选一)。 */
  stage: Stage;
  /** 站内真实可访问路由,必须带站点前缀,例如 "/linux/learn/device-tree"。 */
  route: string;
  /** 搜索 / 归类用的标签。源站 keywords/tags 直接映射。 */
  tags: string[];
  /** 证据清单,至少一条;当前六站内容以 principle 为主。 */
  evidence: Evidence[];
  /** 内容更新时间,ISO 8601;源站无此字段时取源文件修改时间并标注来源。 */
  updatedAt: string;

  /** 可选:一句话概述(linux summary / analog short / ros subtitle 等)。 */
  summary?: string;
  /** 可选:英文标题。 */
  english?: string;
  /** 可选:站内推荐顺序,从 1 开始。 */
  order?: number;
  /** 可选:难度,保留源站口径("入门"/"进阶"/"综合" 等)。 */
  difficulty?: string;
  /** 可选:预计学习时长(分钟)。 */
  minutes?: number;
  /** 可选:内容上线状态。 */
  status?: 'live' | 'building' | 'planned';
  /** 可选:本页数据的源文件位置。 */
  source?: SourceRef;
}

/* ============================================================
   四、8 段结构用到的内容块
   ============================================================ */

/** 生活比喻中的“概念 → 日常物”对照。 */
export interface AnalogyMapping {
  concept: string;
  everyday: string;
}

/** 生活比喻。mapping / bullets 可选,兼容 linux(有 mapping)与 ros(有 bullets)。 */
export interface Analogy {
  title: string;
  text: string;
  mapping?: AnalogyMapping[];
  bullets?: string[];
}

/** 核心概念条目。 */
export interface CoreConcept {
  term: string;
  english?: string;
  explanation: string;
}

/** 公式中的符号说明。 */
export interface FormulaSymbol {
  symbol: string;
  name: string;
  unit: string;
  meaning: string;
}

/** 提示框语气,与六站现有组件语义一致。 */
export type CalloutTone = 'analogy' | 'key' | 'warn' | 'tip' | 'boundary' | 'note';

/** 代码块可选语言。源站出现新语言时先归到 other,再评估是否扩充枚举。 */
export type CodeLanguage =
  | 'c'
  | 'cpp'
  | 'python'
  | 'dts'
  | 'bash'
  | 'text'
  | 'xml'
  | 'yaml'
  | 'urdf'
  | 'xacro'
  | 'json'
  | 'other';

/** 代码示例里对 API 的参数 / 返回值 / 上下文解释。 */
export interface ApiNote {
  name: string;
  signature: string;
  args: string[];
  returns: string;
  context?: string;
  note?: string;
}

/** 代码示例。apiNotes 可选,但“只给代码不解释”的内容不应进入课程正文。 */
export interface CodeSample {
  id: string;
  title: string;
  language: CodeLanguage;
  code: string;
  caption: string;
  apiNotes?: ApiNote[];
}

/** 正文块:段落。 */
export interface ParagraphBlock {
  type: 'paragraph';
  text: string;
}

/** 正文块:列表。 */
export interface ListBlock {
  type: 'list';
  ordered?: boolean;
  items: string[];
}

/** 正文块:提示框。 */
export interface CalloutBlock {
  type: 'callout';
  tone: CalloutTone;
  title: string;
  text: string;
}

/** 正文块:公式。 */
export interface FormulaBlock {
  type: 'formula';
  latex: string;
  label: string;
  symbols: FormulaSymbol[];
  note?: string;
}

/** 正文块:图示(图由渲染层按 figure id 注册)。 */
export interface FigureBlock {
  type: 'figure';
  figure: string;
  caption: string;
}

/** 正文块:实验入口(交互实验内嵌在原理正文中的位置)。 */
export interface LabBlock {
  type: 'lab';
  lab: string;
  title?: string;
}

/** 正文块:表格。 */
export interface TableBlock {
  type: 'table';
  caption?: string;
  headers: string[];
  rows: string[][];
}

/** 正文块:左右对比。 */
export interface CompareBlock {
  type: 'compare';
  left: { title: string; items: string[] };
  right: { title: string; items: string[] };
}

/** 正文块:分步说明。 */
export interface StepsBlock {
  type: 'steps';
  items: { title: string; text: string }[];
}

/** 正文块:器件卡引用(渲染层按 device id 取器件数据)。 */
export interface DeviceBlock {
  type: 'device';
  device: string;
}

/** 正文块:代码。 */
export interface CodeBlock extends CodeSample {
  type: 'code';
}

/** 统一正文块联合类型,覆盖六站现有的全部正文形态。 */
export type ContentBlock =
  | ParagraphBlock
  | ListBlock
  | CalloutBlock
  | FormulaBlock
  | FigureBlock
  | LabBlock
  | TableBlock
  | CompareBlock
  | StepsBlock
  | DeviceBlock
  | CodeBlock;

/* ============================================================
   五、8 段结构
   ============================================================ */

/** 第 3 段:原理与图示。按“总述 → 比喻 → 为什么 → 概念 → 分节正文 → 代码 → 要点”组织。 */
export interface Principles {
  /** 一句话开篇(linux oneLine / analog tagline / mcu oneLine)。 */
  lead?: string;
  /** 生活比喻。 */
  analogy?: Analogy;
  /** 为什么重要 / 用在哪里。 */
  why?: string[];
  /** 术语级核心概念。 */
  concepts?: CoreConcept[];
  /** 分节正文。analog / mcu / rtos / ros 的 sections 可 1:1 映射到这里。 */
  sections?: PrincipleSection[];
  /** 代码示例。linux 的 codeSamples 映射到这里。 */
  codeSamples?: CodeSample[];
  /** 版本对照卡 id(linux versions.ts);渲染时按 id 取详情。 */
  versionNoteIds?: string[];
  /** 本节要点(源站 takeaways)。 */
  takeaways?: string[];
}

/** 原理正文的一节。 */
export interface PrincipleSection {
  id?: string;
  title?: string;
  blocks: ContentBlock[];
}

/** 实验中的可调参数 / 观察点。 */
export interface LabRef {
  /** 实验 id,站内唯一(可带站点前缀的场景由 courseId 区分)。 */
  id: string;
  title: string;
  /** 真实可访问路由;内嵌实验没有独立路由时填所属课程路由。 */
  route: string;
  /** 实验形态:交互模拟 / 真机 / 仿真。 */
  mode?: 'interactive' | 'hardware' | 'simulation';
  /** 是否为内嵌在课程正文里的实验(没有独立路由页)。 */
  embedded?: boolean;
  summary?: string;
  /** 可调参数的人类可读说明。 */
  params?: string[];
  /** 观察问题。 */
  observe?: string[];
  /** 结论提示。 */
  conclusion?: string;
}

/** 实验操作步骤(源站有分步文案时使用)。 */
export interface ExperimentStep {
  title: string;
  text: string;
}

/** 第 4 段:操作实验。 */
export interface Experiment {
  /** 关联实验清单,至少一个;没有实验的课程要在 note 里写明原因。 */
  labs: LabRef[];
  /** 文字步骤。六站多数实验是交互模拟,没有文字步骤时省略。 */
  steps?: ExperimentStep[];
  /** 所需硬件(真机实验必填)。 */
  hardware?: string[];
  /** 观察点(可与 labs[].observe 并存)。 */
  observe?: string[];
  /** 预期结果 / 结论。 */
  expected?: string[];
  /** 边界说明,例如“动画为交互模拟,不连接真实内核”。 */
  note?: string;
}

/** 结果检查类型。 */
export type ResultCheckType = 'understand' | 'operation' | 'measurement' | 'self-test' | 'project';

/** 第 5 段:结果检查。每条都应可观察、可勾选,禁止“看完了”式检查。 */
export interface ResultCheck {
  text: string;
  expected?: string;
  type?: ResultCheckType;
}

/** 第 6 段:故障排查。symptom/cause/fix 三段式,日志字段可选。 */
export interface TroubleshootingItem {
  symptom: string;
  cause: string;
  fix: string;
  /** 相关内核日志 / 控制台输出。 */
  dmesg?: string;
}

/** 题型。 */
export type QuizKind = 'single' | 'multiple' | 'boolean';

/** 选项。 */
export interface QuizOption {
  id: string;
  text: string;
}

/** 第 7 段:小测。 */
export interface QuizQuestion {
  id: string;
  kind: QuizKind;
  prompt: string;
  options: QuizOption[];
  correctIds: string[];
  explanation: string;
  difficulty?: '基础' | '进阶' | '综合';
  /** 源站归属课程 slug,便于回链。 */
  lessonSlug?: string;
}

/** 下一步类型。 */
export type NextStepKind = 'lesson' | 'lab' | 'quiz' | 'case' | 'project' | 'reading' | 'external';

/** 第 8 段:下一步。既能指站内路由,也能指课程 id 或外部阅读。 */
export interface NextStep {
  label: string;
  route?: string;
  /** 跨站课程 id,例如 "linux:platform-driver"。 */
  courseId?: string;
  kind?: NextStepKind;
  note?: string;
}

/**
 * 一节课的固定 8 段。全部必填:源站没有的段必须人工补写或明确标注,
 * 不允许缺字段(缺段与“留白”是两回事,validate.mjs 会拦截)。
 */
export interface CourseLesson {
  /** 1. 目标:学完能做什么,用可验证的动词描述。 */
  goalObjectives: string[];
  /** 2. 前置知识:课程 id 列表;没有前置要求时为空数组。 */
  prerequisites: Prerequisite[];
  /** 3. 原理与图示。 */
  principles: Principles;
  /** 4. 操作实验。 */
  experiment: Experiment;
  /** 5. 结果检查。 */
  resultCheck: ResultCheck[];
  /** 6. 故障排查。 */
  troubleshooting: TroubleshootingItem[];
  /** 7. 小测。 */
  quiz: QuizQuestion[];
  /** 8. 下一步。 */
  nextStep: NextStep[];
}

/** 前置知识。courseId 用全局 id;label 用于展示,可省略。 */
export interface Prerequisite {
  /** 全局课程 id,例如 "analog:semiconductor"。 */
  courseId: string;
  /** 展示用名称。 */
  label?: string;
  /** 是否硬性前置。默认 true。 */
  required?: boolean;
  note?: string;
}

/** 一节课的完整记录 = 元数据 + 8 段。 */
export interface CourseRecord {
  meta: Meta;
  lesson: CourseLesson;
}

/* ============================================================
   六、映射样例的旁证信息(docs 与校验脚本使用)
   ============================================================ */

/**
 * 映射状态:
 * - direct:源站有同义字段,可直接搬;
 * - derived:由结构 / 顺序 / 规则推导,需复核;
 * - manual:源站没有,必须人工补写;
 * - missing:本样例暂时缺失,等待课程编辑补齐;
 * - partial:部分映射(例如只映射了部分正文块)。
 */
export type MappingStatus = 'direct' | 'derived' | 'manual' | 'missing' | 'partial';

/** 映射字段名。 */
export type MappingField = 'meta' | keyof CourseLesson;

/** 样例旁证:来源路径:行号 + 各段映射状态 + 说明。 */
export interface CourseMapping {
  /** 源站源码根目录(绝对路径)。 */
  sourceRoot: string;
  /** 字段 → "路径:行号"。路径必须真实存在。 */
  sources: Record<string, string>;
  /** 字段 → 映射状态。 */
  status: Partial<Record<MappingField, MappingStatus>>;
  notes?: string[];
}

/** 一个映射样例 = 课程记录 + 映射旁证。 */
export interface CourseSample extends CourseRecord {
  mapping: CourseMapping;
}

/** schema.samples.json 的顶层结构。 */
export interface SamplesDocument {
  schemaVersion: SchemaVersion;
  generatedAt: string;
  samples: CourseSample[];
}

/* ============================================================
   七、搜索索引与内容盘点(T0.1 inventory 对齐)
   ============================================================ */

/** 搜索条目类型。 */
export type SearchEntryType = 'lesson' | 'lab' | 'quiz' | 'glossary' | 'case';

/**
 * 跨站搜索索引的一条。由构建期从课程 / 实验 / 题目 / 术语 / 案例生成,
 * 不依赖运行时接口。
 */
export interface SearchIndexEntry {
  /** 条目 id(课程 id 或 “课程 id # 子项 id”)。 */
  id: string;
  /** 所属课程 id。 */
  courseId: string;
  site: SiteSlug;
  type: SearchEntryType;
  title: string;
  /** 真实可访问路由,可带锚点。 */
  route: string;
  stage: Stage;
  tags: string[];
  summary?: string;
  keywords?: string[];
  /** 路由片段锚点,例如 "device-tree-probe"。 */
  anchor?: string;
}

/**
 * 内容盘点条目,与 docs/inventory.json(T0.1)对齐。
 * 必填字段与 T0.1 任务卡一致:type/id/title/route/source;
 * stage/status/lessonSlug 是可选附加字段,缺失时不应导致盘点失败。
 */
export type InventoryItemType = 'lesson' | 'lab' | 'quiz' | 'case' | 'glossary' | 'module' | 'page';

/**
 * T0.1 inventory 使用的阶段 id。注意与课程 Stage 的两个命名差异:
 * inventory 的 "linux" = 课程 Stage 的 "embedded-linux";
 * inventory 的 "network" = 课程 Stage 的 "connectivity"。
 * 原因:T0.1 与 T0.2 并行产出,枚举命名未及统一;对齐层按 STAGE_ALIASES 归一,
 * schema 课时数据(meta.stage)始终使用 7 阶段正式枚举 Stage。
 */
export const INVENTORY_STAGE_IDS = [
  'foundation',
  'mcu',
  'rtos',
  'linux',
  'driver',
  'network',
  'advanced',
] as const;

/** inventory 阶段 id。 */
export type InventoryStageId = (typeof INVENTORY_STAGE_IDS)[number];

/** inventory 阶段 id → 课程 Stage 的归一映射(T0.1 命名 → schema v1 正式枚举)。 */
export const STAGE_ALIASES: Record<InventoryStageId, Stage> = {
  foundation: 'foundation',
  mcu: 'mcu',
  rtos: 'rtos',
  linux: 'embedded-linux',
  driver: 'driver',
  network: 'connectivity',
  advanced: 'advanced',
};

/** 内容盘点条目。 */
export interface InventoryItem {
  type: InventoryItemType;
  /** 条目 id:知识页用 slug,实验/题目用站内 id,模块用编号或 slug。 */
  id: string;
  title: string;
  /** 真实可访问路由(带站点前缀)。 */
  route: string;
  /** 数据源文件(相对站点源码根),例如 "src/data/lessons.ts"。 */
  source: string;
  /** 可选:inventory 口径的阶段(schema 消费时用 STAGE_ALIASES 归一)。 */
  stage?: InventoryStageId;
  /** 可选:内容状态(T0.1 口径)。 */
  status?: 'live' | 'planned' | 'ready';
  /** 可选:所属课程 slug,便于与 CourseRecord 关联。 */
  lessonSlug?: string;
  /** 可选:备注(近似提取 / 缺口说明)。 */
  note?: string;
}

/** 一个站点的盘点结果。 */
export interface InventorySite {
  slug: SiteSlug;
  name: string;
  /** 部署子路径,例如 "/linux/"。 */
  base: string;
  routeCount: number;
  items: InventoryItem[];
}

/** docs/inventory.json 的顶层结构(与 T0.1 实际产出对齐)。 */
export interface InventoryDocument {
  generatedAt: string;
  /** T0.1 附带的阶段定义表(可选,消费方可忽略)。 */
  stages?: { id: string; name: string }[];
  /** T0.1 附带的统计(可选)。 */
  totals?: {
    items: number;
    byType: Partial<Record<InventoryItemType, number>>;
    byStage: Partial<Record<InventoryStageId, number>>;
  };
  sites: InventorySite[];
}
