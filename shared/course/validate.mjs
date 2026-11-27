#!/usr/bin/env node
/**
 * 课程 schema v1 校验脚本
 * ============================================================
 * 用法:
 *   node shared/course/validate.mjs                 # 校验默认样例文件
 *   node shared/course/validate.mjs <samples.json>  # 校验指定文件
 *
 * 校验内容:
 * 1. samples 文档结构、schemaVersion;
 * 2. 每节课 Meta 必填字段、stage 七枚举、site 枚举、route 前缀与真实路由形态;
 * 3. 8 段结构齐全,各段内容块 / 题目 / 下一步的字段与引用一致性;
 * 4. Evidence.kind 三枚举,version / note 非空;
 * 5. mapping.sources 指向的源文件真实存在、行号在文件范围内;
 * 6. 如果 docs/inventory.json 已存在,额外做一次只读对齐检查(不参与退出码)。
 *
 * 输出:PASS / FAIL 与计数;退出码 0(PASS)/ 1(FAIL)。
 * 注意:本脚本中的枚举与 shared/course/schema.ts 保持一致,修改 schema 时必须同步。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_SAMPLES = path.join(HERE, 'schema.samples.json');
const INVENTORY_PATH = path.join(REPO_ROOT, 'docs', 'inventory.json');

/* ---------- 与 schema.ts 对齐的枚举 ---------- */

const SCHEMA_VERSION = '1.0.0';
const STAGES = ['foundation', 'mcu', 'rtos', 'embedded-linux', 'driver', 'connectivity', 'advanced'];
const SITES = ['linux', 'mcu', 'analog', 'ml', 'ros', 'rtos', 'platform'];
/** T0.1 inventory 的阶段命名:linux / network 与课程 Stage 的 embedded-linux / connectivity 不同。 */
const INVENTORY_STAGE_IDS = ['foundation', 'mcu', 'rtos', 'linux', 'driver', 'network', 'advanced'];
const INVENTORY_TO_STAGE = {
  foundation: 'foundation',
  mcu: 'mcu',
  rtos: 'rtos',
  linux: 'embedded-linux',
  driver: 'driver',
  network: 'connectivity',
  advanced: 'advanced',
};
const EVIDENCE_KINDS = ['principle', 'compiled', 'hardware'];
const LESSON_FIELDS = [
  'goalObjectives',
  'prerequisites',
  'principles',
  'experiment',
  'resultCheck',
  'troubleshooting',
  'quiz',
  'nextStep',
];
const MAPPING_FIELDS = ['meta'].concat(LESSON_FIELDS);
const MAPPING_STATUS = ['direct', 'derived', 'manual', 'missing', 'partial'];
const BLOCK_TYPES = [
  'paragraph',
  'list',
  'callout',
  'formula',
  'figure',
  'lab',
  'table',
  'compare',
  'steps',
  'device',
  'code',
];
const CALLOUT_TONES = ['analogy', 'key', 'warn', 'tip', 'boundary', 'note'];
const QUIZ_KINDS = ['single', 'multiple', 'boolean'];
const RESULT_CHECK_TYPES = ['understand', 'operation', 'measurement', 'self-test', 'project'];
const NEXT_STEP_KINDS = ['lesson', 'lab', 'quiz', 'case', 'project', 'reading', 'external'];
const CODE_LANGUAGES = [
  'c',
  'cpp',
  'python',
  'dts',
  'bash',
  'text',
  'xml',
  'yaml',
  'urdf',
  'xacro',
  'json',
  'other',
];
const LAB_MODES = ['interactive', 'hardware', 'simulation'];
const META_STATUS = ['live', 'building', 'planned'];

/* ---------- 工具函数 ---------- */

let errors = [];
let warnings = [];
let checks = 0;

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function ok(condition, message) {
  checks++;
  if (!condition) fail(message);
  return condition;
}

function warnIf(condition, message) {
  checks++;
  if (!condition) warn(message);
  return condition;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyStringArray(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (const item of value) {
    if (!isNonEmptyString(item)) return false;
  }
  return true;
}

function isStringArray(value) {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (!isNonEmptyString(item)) return false;
  }
  return true;
}

function isIsoDate(value) {
  if (!isNonEmptyString(value)) return false;
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function uniqueIds(items) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

function fileLineCount(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').length;
  } catch (error) {
    return -1;
  }
}

/**
 * 把 mapping.sources 的值解析成 { file, lines }。
 * 支持 "/abs/path.ts:12-34"、"/abs/path.ts:87,130"、"/abs/path.ts"。
 */
function parseSourceRef(value) {
  if (!isNonEmptyString(value)) return null;
  const match = value.match(/^(.*?)(?::([0-9][0-9,\-]*))?$/);
  if (!match) return null;
  return { file: match[1], lines: match[2] || '' };
}

function checkSourceRef(label, value, sourceRoot) {
  const parsed = parseSourceRef(value);
  if (!parsed) {
    fail(label + ':来源格式应为 "路径:行号",实际为 ' + JSON.stringify(value));
    return;
  }
  let file = parsed.file;
  if (!path.isAbsolute(file)) {
    if (!sourceRoot) {
      fail(label + ':相对路径缺少 mapping.sourceRoot: ' + file);
      return;
    }
    file = path.join(sourceRoot, file);
  }
  checks++;
  if (!fs.existsSync(file)) {
    fail(label + ':来源文件不存在: ' + file);
    return;
  }
  if (!parsed.lines) return;
  const total = fileLineCount(file);
  if (total < 0) {
    fail(label + ':无法读取来源文件: ' + file);
    return;
  }
  for (const part of parsed.lines.split(',')) {
    const range = part.split('-');
    const start = Number(range[0]);
    const end = range.length > 1 ? Number(range[1]) : start;
    checks++;
    if (!Number.isInteger(start) || start < 1) {
      fail(label + ':行号非法: ' + part);
      continue;
    }
    if (!Number.isInteger(end) || end < start) {
      fail(label + ':行号区间非法: ' + part);
      continue;
    }
    if (end > total) {
      fail(label + ':行号超出文件范围(' + part + ' > ' + total + ' 行): ' + file);
    }
  }
}

/* ---------- 各段校验 ---------- */

function checkMeta(meta, sampleLabel) {
  const label = sampleLabel + ' meta';
  if (!isPlainObject(meta)) {
    fail(label + ' 缺失或不是对象');
    return;
  }
  if (!ok(isNonEmptyString(meta.id), label + '.id 必须是非空字符串')) return;
  const idMatch = meta.id.match(/^([a-z0-9-]+):([a-z0-9-]+)$/);
  ok(Boolean(idMatch), label + '.id 必须符合 "<site>:<slug>" 规则,实际为 ' + JSON.stringify(meta.id));
  const idSite = idMatch ? idMatch[1] : '';
  const idSlug = idMatch ? idMatch[2] : '';
  ok(isNonEmptyString(meta.title), label + '.title 缺失');
  ok(SITES.indexOf(meta.site) >= 0, label + '.site 非法: ' + JSON.stringify(meta.site));
  if (idSite) ok(idSite === meta.site, label + '.id 的站点前缀与 meta.site 不一致');
  ok(STAGES.indexOf(meta.stage) >= 0, label + '.stage 非法: ' + JSON.stringify(meta.stage));
  ok(isNonEmptyString(meta.route), label + '.route 缺失');
  if (isNonEmptyString(meta.route)) {
    ok(meta.route.charAt(0) === '/', label + '.route 必须以 / 开头');
    ok(meta.route.indexOf(' ') < 0, label + '.route 不能含空格');
    if (meta.site !== 'platform') {
      ok(
        meta.route.indexOf('/' + meta.site + '/') === 0,
        label + '.route 必须以站点前缀 /' + meta.site + '/ 开头,实际为 ' + meta.route,
      );
    }
    if (idSlug) {
      ok(
        meta.route.slice(-(idSlug.length + 1)) === '/' + idSlug,
        label + '.route 应以课程 slug /' + idSlug + ' 结尾,实际为 ' + meta.route,
      );
    }
  }
  if (!ok(Array.isArray(meta.tags), label + '.tags 必须是数组')) return;
  ok(meta.tags.length > 0, label + '.tags 不能为空');
  ok(isNonEmptyStringArray(meta.tags), label + '.tags 每一项都必须是非空字符串');

  if (!ok(Array.isArray(meta.evidence), label + '.evidence 必须是数组')) return;
  ok(meta.evidence.length > 0, label + '.evidence 至少一条(原理示意也要写)');
  meta.evidence.forEach(function (item, index) {
    const itemLabel = label + '.evidence[' + index + ']';
    if (!isPlainObject(item)) {
      fail(itemLabel + ' 不是对象');
      return;
    }
    ok(EVIDENCE_KINDS.indexOf(item.kind) >= 0, itemLabel + '.kind 非法: ' + JSON.stringify(item.kind));
    ok(isNonEmptyString(item.version), itemLabel + '.version 缺失');
    ok(isNonEmptyString(item.note), itemLabel + '.note 缺失');
    if (item.source !== undefined) ok(isNonEmptyString(item.source), itemLabel + '.source 必须是非空字符串');
  });

  ok(isIsoDate(meta.updatedAt), label + '.updatedAt 必须是 ISO 8601 时间,实际为 ' + JSON.stringify(meta.updatedAt));
  if (meta.summary !== undefined) ok(isNonEmptyString(meta.summary), label + '.summary 必须是非空字符串');
  if (meta.english !== undefined) ok(isNonEmptyString(meta.english), label + '.english 必须是非空字符串');
  if (meta.order !== undefined) ok(Number.isInteger(meta.order) && meta.order > 0, label + '.order 必须是正整数');
  if (meta.difficulty !== undefined) ok(isNonEmptyString(meta.difficulty), label + '.difficulty 必须是非空字符串');
  if (meta.minutes !== undefined) ok(Number.isFinite(meta.minutes) && meta.minutes > 0, label + '.minutes 必须是正数');
  if (meta.status !== undefined) ok(META_STATUS.indexOf(meta.status) >= 0, label + '.status 非法: ' + meta.status);
  if (meta.source !== undefined) {
    ok(isPlainObject(meta.source) && isNonEmptyString(meta.source.file), label + '.source.file 缺失');
  }
}

function checkPrerequisites(items, label) {
  if (!ok(Array.isArray(items), label + ' 必须是数组')) return;
  items.forEach(function (item, index) {
    const itemLabel = label + '[' + index + ']';
    if (!isPlainObject(item)) {
      fail(itemLabel + ' 不是对象');
      return;
    }
    ok(isNonEmptyString(item.courseId), itemLabel + '.courseId 缺失');
    if (isNonEmptyString(item.courseId)) {
      ok(/^[a-z0-9-]+:[a-z0-9-]+$/.test(item.courseId), itemLabel + '.courseId 必须符合 "<site>:<slug>"');
    }
    if (item.label !== undefined) ok(isNonEmptyString(item.label), itemLabel + '.label 必须是非空字符串');
    if (item.required !== undefined) ok(typeof item.required === 'boolean', itemLabel + '.required 必须是布尔值');
    if (item.note !== undefined) ok(isNonEmptyString(item.note), itemLabel + '.note 必须是非空字符串');
  });
}

function checkAnalogy(analogy, label) {
  if (!isPlainObject(analogy)) {
    fail(label + ' 不是对象');
    return;
  }
  ok(isNonEmptyString(analogy.title), label + '.title 缺失');
  ok(isNonEmptyString(analogy.text), label + '.text 缺失');
  if (analogy.mapping !== undefined) {
    ok(Array.isArray(analogy.mapping), label + '.mapping 必须是数组');
    if (Array.isArray(analogy.mapping)) {
      analogy.mapping.forEach(function (item, index) {
        const itemLabel = label + '.mapping[' + index + ']';
        ok(isPlainObject(item) && isNonEmptyString(item.concept) && isNonEmptyString(item.everyday), itemLabel + ' 需要 concept 与 everyday');
      });
    }
  }
  if (analogy.bullets !== undefined) ok(isStringArray(analogy.bullets), label + '.bullets 必须是字符串数组');
}

function checkContentBlock(block, label) {
  if (!isPlainObject(block)) {
    fail(label + ' 不是对象');
    return;
  }
  if (!ok(BLOCK_TYPES.indexOf(block.type) >= 0, label + '.type 非法: ' + JSON.stringify(block.type))) return;
  if (block.type === 'paragraph') {
    ok(isNonEmptyString(block.text), label + '.text 缺失');
  } else if (block.type === 'list') {
    ok(isNonEmptyStringArray(block.items), label + '.items 必须是非空字符串数组');
    if (block.ordered !== undefined) ok(typeof block.ordered === 'boolean', label + '.ordered 必须是布尔值');
  } else if (block.type === 'callout') {
    ok(CALLOUT_TONES.indexOf(block.tone) >= 0, label + '.tone 非法: ' + JSON.stringify(block.tone));
    ok(isNonEmptyString(block.title), label + '.title 缺失');
    ok(isNonEmptyString(block.text), label + '.text 缺失');
  } else if (block.type === 'formula') {
    ok(isNonEmptyString(block.latex), label + '.latex 缺失');
    ok(isNonEmptyString(block.label), label + '.label 缺失');
    ok(Array.isArray(block.symbols), label + '.symbols 必须是数组');
    if (Array.isArray(block.symbols)) {
      block.symbols.forEach(function (symbol, index) {
        const symbolLabel = label + '.symbols[' + index + ']';
        ok(
          isPlainObject(symbol) &&
            isNonEmptyString(symbol.symbol) &&
            isNonEmptyString(symbol.name) &&
            isNonEmptyString(symbol.unit) &&
            isNonEmptyString(symbol.meaning),
          symbolLabel + ' 需要 symbol/name/unit/meaning',
        );
      });
    }
    if (block.note !== undefined) ok(isNonEmptyString(block.note), label + '.note 必须是非空字符串');
  } else if (block.type === 'figure') {
    ok(isNonEmptyString(block.figure), label + '.figure 缺失');
    ok(isNonEmptyString(block.caption), label + '.caption 缺失');
  } else if (block.type === 'lab') {
    ok(isNonEmptyString(block.lab), label + '.lab 缺失');
    if (block.title !== undefined) ok(isNonEmptyString(block.title), label + '.title 必须是非空字符串');
  } else if (block.type === 'table') {
    ok(isNonEmptyStringArray(block.headers), label + '.headers 必须是非空字符串数组');
    ok(Array.isArray(block.rows), label + '.rows 必须是数组');
    if (Array.isArray(block.headers) && Array.isArray(block.rows)) {
      block.rows.forEach(function (row, index) {
        ok(
          Array.isArray(row) && row.length === block.headers.length,
          label + '.rows[' + index + '] 列数应与 headers 一致',
        );
      });
    }
    if (block.caption !== undefined) ok(isNonEmptyString(block.caption), label + '.caption 必须是非空字符串');
  } else if (block.type === 'compare') {
    ok(isPlainObject(block.left) && isNonEmptyString(block.left.title) && isNonEmptyStringArray(block.left.items), label + '.left 需要 title 与 items');
    ok(
      isPlainObject(block.right) && isNonEmptyString(block.right.title) && isNonEmptyStringArray(block.right.items),
      label + '.right 需要 title 与 items',
    );
  } else if (block.type === 'steps') {
    ok(Array.isArray(block.items), label + '.items 必须是数组');
    if (Array.isArray(block.items)) {
      block.items.forEach(function (item, index) {
        const itemLabel = label + '.items[' + index + ']';
        ok(isPlainObject(item) && isNonEmptyString(item.title) && isNonEmptyString(item.text), itemLabel + ' 需要 title 与 text');
      });
    }
  } else if (block.type === 'device') {
    ok(isNonEmptyString(block.device), label + '.device 缺失');
  } else if (block.type === 'code') {
    ok(isNonEmptyString(block.id), label + '.id 缺失');
    ok(isNonEmptyString(block.title), label + '.title 缺失');
    ok(CODE_LANGUAGES.indexOf(block.language) >= 0, label + '.language 非法: ' + JSON.stringify(block.language));
    ok(isNonEmptyString(block.code), label + '.code 缺失');
    ok(isNonEmptyString(block.caption), label + '.caption 缺失');
  }
}

function checkCodeSample(sample, label) {
  if (!isPlainObject(sample)) {
    fail(label + ' 不是对象');
    return;
  }
  ok(isNonEmptyString(sample.id), label + '.id 缺失');
  ok(isNonEmptyString(sample.title), label + '.title 缺失');
  ok(CODE_LANGUAGES.indexOf(sample.language) >= 0, label + '.language 非法: ' + JSON.stringify(sample.language));
  ok(isNonEmptyString(sample.code), label + '.code 缺失');
  ok(isNonEmptyString(sample.caption), label + '.caption 缺失');
  if (sample.apiNotes !== undefined) {
    ok(Array.isArray(sample.apiNotes), label + '.apiNotes 必须是数组');
    if (Array.isArray(sample.apiNotes)) {
      sample.apiNotes.forEach(function (note, index) {
        const noteLabel = label + '.apiNotes[' + index + ']';
        ok(
          isPlainObject(note) &&
            isNonEmptyString(note.name) &&
            isNonEmptyString(note.signature) &&
            isStringArray(note.args) &&
            isNonEmptyString(note.returns),
          noteLabel + ' 需要 name/signature/args/returns',
        );
      });
    }
  }
}

function checkPrinciples(principles, label) {
  if (!isPlainObject(principles)) {
    fail(label + ' 缺失或不是对象');
    return;
  }
  const hasContent =
    isNonEmptyString(principles.lead) ||
    isPlainObject(principles.analogy) ||
    isNonEmptyStringArray(principles.why) ||
    isNonEmptyStringArray(principles.takeaways) ||
    (Array.isArray(principles.concepts) && principles.concepts.length > 0) ||
    (Array.isArray(principles.sections) && principles.sections.length > 0) ||
    (Array.isArray(principles.codeSamples) && principles.codeSamples.length > 0) ||
    (Array.isArray(principles.versionNoteIds) && principles.versionNoteIds.length > 0);
  ok(hasContent, label + ' 至少要有 lead/analogy/why/concepts/sections/codeSamples/takeaways 之一');
  if (principles.lead !== undefined) ok(isNonEmptyString(principles.lead), label + '.lead 必须是非空字符串');
  if (principles.analogy !== undefined) checkAnalogy(principles.analogy, label + '.analogy');
  if (principles.why !== undefined) ok(isStringArray(principles.why), label + '.why 必须是字符串数组');
  if (principles.takeaways !== undefined) ok(isStringArray(principles.takeaways), label + '.takeaways 必须是字符串数组');
  if (principles.concepts !== undefined) {
    ok(Array.isArray(principles.concepts), label + '.concepts 必须是数组');
    if (Array.isArray(principles.concepts)) {
      principles.concepts.forEach(function (concept, index) {
        const conceptLabel = label + '.concepts[' + index + ']';
        ok(
          isPlainObject(concept) && isNonEmptyString(concept.term) && isNonEmptyString(concept.explanation),
          conceptLabel + ' 需要 term 与 explanation',
        );
      });
    }
  }
  if (principles.sections !== undefined) {
    ok(Array.isArray(principles.sections), label + '.sections 必须是数组');
    if (Array.isArray(principles.sections)) {
      principles.sections.forEach(function (section, index) {
        const sectionLabel = label + '.sections[' + index + ']';
        ok(isPlainObject(section), sectionLabel + ' 不是对象');
        if (!isPlainObject(section)) return;
        if (section.id !== undefined) ok(isNonEmptyString(section.id), sectionLabel + '.id 必须是非空字符串');
        ok(isNonEmptyString(section.title), sectionLabel + '.title 缺失');
        ok(Array.isArray(section.blocks), sectionLabel + '.blocks 必须是数组');
        if (Array.isArray(section.blocks)) {
          section.blocks.forEach(function (block, blockIndex) {
            checkContentBlock(block, sectionLabel + '.blocks[' + blockIndex + ']');
          });
        }
      });
    }
  }
  if (principles.codeSamples !== undefined) {
    ok(Array.isArray(principles.codeSamples), label + '.codeSamples 必须是数组');
    if (Array.isArray(principles.codeSamples)) {
      principles.codeSamples.forEach(function (sample, index) {
        checkCodeSample(sample, label + '.codeSamples[' + index + ']');
      });
    }
  }
  if (principles.versionNoteIds !== undefined) ok(isStringArray(principles.versionNoteIds), label + '.versionNoteIds 必须是字符串数组');
}

function checkExperiment(experiment, meta, label) {
  if (!isPlainObject(experiment)) {
    fail(label + ' 缺失或不是对象');
    return;
  }
  if (!ok(Array.isArray(experiment.labs), label + '.labs 必须是数组')) return;
  if (experiment.labs.length === 0) {
    ok(isNonEmptyString(experiment.note), label + ' 没有实验时必须用 note 说明原因');
  }
  experiment.labs.forEach(function (lab, index) {
    const labLabel = label + '.labs[' + index + ']';
    if (!isPlainObject(lab)) {
      fail(labLabel + ' 不是对象');
      return;
    }
    ok(isNonEmptyString(lab.id), labLabel + '.id 缺失');
    ok(isNonEmptyString(lab.title), labLabel + '.title 缺失');
    ok(isNonEmptyString(lab.route), labLabel + '.route 缺失');
    if (isNonEmptyString(lab.route)) {
      ok(lab.route.charAt(0) === '/', labLabel + '.route 必须以 / 开头');
      if (meta.site !== 'platform') {
        ok(
          lab.route.indexOf('/' + meta.site + '/') === 0,
          labLabel + '.route 必须以站点前缀 /' + meta.site + '/ 开头,实际为 ' + lab.route,
        );
      }
    }
    if (lab.mode !== undefined) ok(LAB_MODES.indexOf(lab.mode) >= 0, labLabel + '.mode 非法: ' + lab.mode);
    if (lab.embedded !== undefined) ok(typeof lab.embedded === 'boolean', labLabel + '.embedded 必须是布尔值');
    if (lab.summary !== undefined) ok(isNonEmptyString(lab.summary), labLabel + '.summary 必须是非空字符串');
    if (lab.params !== undefined) ok(isStringArray(lab.params), labLabel + '.params 必须是字符串数组');
    if (lab.observe !== undefined) ok(isStringArray(lab.observe), labLabel + '.observe 必须是字符串数组');
    if (lab.conclusion !== undefined) ok(isNonEmptyString(lab.conclusion), labLabel + '.conclusion 必须是非空字符串');
  });
  if (experiment.steps !== undefined) {
    ok(Array.isArray(experiment.steps), label + '.steps 必须是数组');
    if (Array.isArray(experiment.steps)) {
      experiment.steps.forEach(function (step, index) {
        const stepLabel = label + '.steps[' + index + ']';
        ok(isPlainObject(step) && isNonEmptyString(step.title) && isNonEmptyString(step.text), stepLabel + ' 需要 title 与 text');
      });
    }
  }
  if (experiment.hardware !== undefined) ok(isStringArray(experiment.hardware), label + '.hardware 必须是字符串数组');
  if (experiment.observe !== undefined) ok(isStringArray(experiment.observe), label + '.observe 必须是字符串数组');
  if (experiment.expected !== undefined) ok(isStringArray(experiment.expected), label + '.expected 必须是字符串数组');
  if (experiment.note !== undefined) ok(isNonEmptyString(experiment.note), label + '.note 必须是非空字符串');
}

function checkResultCheck(items, label) {
  if (!ok(Array.isArray(items), label + ' 必须是数组')) return;
  ok(items.length > 0, label + ' 至少一条');
  items.forEach(function (item, index) {
    const itemLabel = label + '[' + index + ']';
    if (!isPlainObject(item)) {
      fail(itemLabel + ' 不是对象');
      return;
    }
    ok(isNonEmptyString(item.text), itemLabel + '.text 缺失');
    if (item.expected !== undefined) ok(isNonEmptyString(item.expected), itemLabel + '.expected 必须是非空字符串');
    if (item.type !== undefined) ok(RESULT_CHECK_TYPES.indexOf(item.type) >= 0, itemLabel + '.type 非法: ' + item.type);
  });
}

function checkTroubleshooting(items, label) {
  if (!ok(Array.isArray(items), label + ' 必须是数组')) return;
  if (items.length === 0) warn(label + ' 为空:若本课确实没有可列故障,应在课程编辑记录里说明');
  items.forEach(function (item, index) {
    const itemLabel = label + '[' + index + ']';
    if (!isPlainObject(item)) {
      fail(itemLabel + ' 不是对象');
      return;
    }
    ok(isNonEmptyString(item.symptom), itemLabel + '.symptom 缺失');
    ok(isNonEmptyString(item.cause), itemLabel + '.cause 缺失');
    ok(isNonEmptyString(item.fix), itemLabel + '.fix 缺失');
    if (item.dmesg !== undefined) ok(isNonEmptyString(item.dmesg), itemLabel + '.dmesg 必须是非空字符串');
  });
}

function checkQuiz(items, label) {
  if (!ok(Array.isArray(items), label + ' 必须是数组')) return;
  ok(items.length > 0, label + ' 至少一题');
  items.forEach(function (item, index) {
    const itemLabel = label + '[' + index + ']';
    if (!isPlainObject(item)) {
      fail(itemLabel + ' 不是对象');
      return;
    }
    ok(isNonEmptyString(item.id), itemLabel + '.id 缺失');
    ok(QUIZ_KINDS.indexOf(item.kind) >= 0, itemLabel + '.kind 非法: ' + JSON.stringify(item.kind));
    ok(isNonEmptyString(item.prompt), itemLabel + '.prompt 缺失');
    ok(isNonEmptyString(item.explanation), itemLabel + '.explanation 缺失');
    if (!ok(Array.isArray(item.options), itemLabel + '.options 必须是数组')) return;
    ok(item.options.length > 1, itemLabel + '.options 至少两个');
    const optionIds = [];
    item.options.forEach(function (option, optionIndex) {
      const optionLabel = itemLabel + '.options[' + optionIndex + ']';
      if (!isPlainObject(option)) {
        fail(optionLabel + ' 不是对象');
        return;
      }
      ok(isNonEmptyString(option.id), optionLabel + '.id 缺失');
      ok(isNonEmptyString(option.text), optionLabel + '.text 缺失');
      optionIds.push(option.id);
    });
    ok(uniqueIds(optionIds), itemLabel + '.options 的 id 必须唯一');
    if (!ok(isNonEmptyStringArray(item.correctIds), itemLabel + '.correctIds 必须是非空字符串数组')) return;
    if (item.kind === 'single' || item.kind === 'boolean') {
      ok(item.correctIds.length === 1, itemLabel + ' 单选题/判断题只能有一个正确答案');
    }
    item.correctIds.forEach(function (correctId) {
      ok(optionIds.indexOf(correctId) >= 0, itemLabel + '.correctIds 含不存在的选项 id: ' + correctId);
    });
    if (item.difficulty !== undefined) {
      ok(['基础', '进阶', '综合'].indexOf(item.difficulty) >= 0, itemLabel + '.difficulty 非法: ' + item.difficulty);
    }
  });
}

function checkNextStep(items, meta, label) {
  if (!ok(Array.isArray(items), label + ' 必须是数组')) return;
  ok(items.length > 0, label + ' 至少一条');
  items.forEach(function (item, index) {
    const itemLabel = label + '[' + index + ']';
    if (!isPlainObject(item)) {
      fail(itemLabel + ' 不是对象');
      return;
    }
    ok(isNonEmptyString(item.label), itemLabel + '.label 缺失');
    ok(isNonEmptyString(item.route) || isNonEmptyString(item.courseId), itemLabel + ' 至少要有 route 或 courseId');
    if (isNonEmptyString(item.route)) {
      if (item.route.indexOf('http://') !== 0 && item.route.indexOf('https://') !== 0) {
        ok(item.route.charAt(0) === '/', itemLabel + '.route 站内路径必须以 / 开头');
        if (meta.site !== 'platform') {
          ok(
            item.route.indexOf('/' + meta.site + '/') === 0,
            itemLabel + '.route 必须以站点前缀 /' + meta.site + '/ 开头,实际为 ' + item.route,
          );
        }
      }
    }
    if (item.kind !== undefined) ok(NEXT_STEP_KINDS.indexOf(item.kind) >= 0, itemLabel + '.kind 非法: ' + item.kind);
    if (item.note !== undefined) ok(isNonEmptyString(item.note), itemLabel + '.note 必须是非空字符串');
  });
}

function checkMapping(mapping, sampleLabel) {
  const label = sampleLabel + ' mapping';
  if (!isPlainObject(mapping)) {
    fail(label + ' 缺失或不是对象');
    return;
  }
  ok(isNonEmptyString(mapping.sourceRoot), label + '.sourceRoot 缺失');
  if (isNonEmptyString(mapping.sourceRoot)) {
    checks++;
    if (!fs.existsSync(mapping.sourceRoot)) warn(label + '.sourceRoot 不存在: ' + mapping.sourceRoot);
  }
  if (!ok(isPlainObject(mapping.sources), label + '.sources 必须是对象')) return;
  for (const field of Object.keys(mapping.sources)) {
    checkSourceRef(label + '.sources["' + field + '"]', mapping.sources[field], mapping.sourceRoot);
  }
  for (const field of MAPPING_FIELDS) {
    let covered = false;
    for (const key of Object.keys(mapping.sources)) {
      if (key === field || key.indexOf(field + '.') === 0) {
        covered = true;
        break;
      }
    }
    warnIf(covered, label + '.sources 缺少字段 "' + field + '" 的来源标注');
  }
  if (mapping.status !== undefined) {
    if (ok(isPlainObject(mapping.status), label + '.status 必须是对象')) {
      for (const field of Object.keys(mapping.status)) {
        ok(MAPPING_FIELDS.indexOf(field) >= 0, label + '.status 含未知字段: ' + field);
        ok(MAPPING_STATUS.indexOf(mapping.status[field]) >= 0, label + '.status["' + field + '"] 非法: ' + mapping.status[field]);
      }
    }
  }
  if (mapping.notes !== undefined) ok(isStringArray(mapping.notes), label + '.notes 必须是字符串数组');
}

function checkSample(sample, index) {
  const sampleLabel = 'samples[' + index + ']';
  if (!isPlainObject(sample)) {
    fail(sampleLabel + ' 不是对象');
    return null;
  }
  const meta = sample.meta;
  const lesson = sample.lesson;
  checkMeta(meta, sampleLabel);
  if (!isPlainObject(meta)) return null;
  if (!isPlainObject(lesson)) {
    fail(sampleLabel + '.lesson 缺失或不是对象');
    return { meta: meta, lesson: {}, missing: LESSON_FIELDS.slice() };
  }
  for (const field of LESSON_FIELDS) {
    ok(Object.prototype.hasOwnProperty.call(lesson, field), sampleLabel + '.lesson 缺第 ' + (LESSON_FIELDS.indexOf(field) + 1) + ' 段字段: ' + field);
  }
  if (Array.isArray(lesson.goalObjectives)) {
    ok(isNonEmptyStringArray(lesson.goalObjectives), sampleLabel + '.goalObjectives 必须是非空字符串数组');
  } else {
    fail(sampleLabel + '.goalObjectives 缺失或不是数组');
  }
  checkPrerequisites(lesson.prerequisites, sampleLabel + '.prerequisites');
  checkPrinciples(lesson.principles, sampleLabel + '.principles');
  checkExperiment(lesson.experiment, meta, sampleLabel + '.experiment');
  checkResultCheck(lesson.resultCheck, sampleLabel + '.resultCheck');
  checkTroubleshooting(lesson.troubleshooting, sampleLabel + '.troubleshooting');
  checkQuiz(lesson.quiz, sampleLabel + '.quiz');
  checkNextStep(lesson.nextStep, meta, sampleLabel + '.nextStep');
  checkMapping(sample.mapping, sampleLabel);
  return { meta: meta, lesson: lesson };
}

/* ---------- 可选:docs/inventory.json 对齐检查(不参与退出码) ---------- */

function checkInventory(samplesDoc) {
  if (!fs.existsSync(INVENTORY_PATH)) {
    console.log('inventory: docs/inventory.json 尚未生成(T0.1 并行产出),跳过对齐检查');
    return;
  }
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  } catch (error) {
    console.log('inventory: docs/inventory.json 解析失败(不参与本脚本退出码): ' + error.message);
    return;
  }
  const sites = Array.isArray(doc.sites) ? doc.sites : [];
  let items = 0;
  let missing = 0;
  let badStage = 0;
  let badRoute = 0;
  const byRoute = new Map();
  const required = ['type', 'id', 'title', 'route', 'source'];
  for (const site of sites) {
    if (!Array.isArray(site.items)) continue;
    for (const item of site.items) {
      items++;
      for (const field of required) {
        if (!Object.prototype.hasOwnProperty.call(item, field)) {
          missing++;
          if (missing <= 5) {
            console.log('inventory: 条目缺字段 ' + field + ': ' + JSON.stringify(item).slice(0, 120));
          }
        }
      }
      if (item.stage !== undefined && INVENTORY_STAGE_IDS.indexOf(item.stage) < 0) {
        badStage++;
      }
      if (isNonEmptyString(item.route) && isNonEmptyString(site.base) && item.route.indexOf(site.base) !== 0) {
        badRoute++;
      }
      if (isNonEmptyString(item.route)) {
        if (!byRoute.has(item.route)) byRoute.set(item.route, []);
        byRoute.get(item.route).push({ site: site.slug, item: item });
      }
    }
  }
  console.log(
    'inventory: docs/inventory.json 存在;sites=' +
      sites.length +
      ',items=' +
      items +
      ',缺必填字段=' +
      missing +
      ',stage 越界=' +
      badStage +
      ',route 前缀不符=' +
      badRoute +
      '(仅提示,不参与 PASS/FAIL)',
  );
  // 样例与 inventory 的跨任务一致性:route 命中 + stage 归一后相等。
  if (samplesDoc && Array.isArray(samplesDoc.samples)) {
    for (const sample of samplesDoc.samples) {
      if (!isPlainObject(sample) || !isPlainObject(sample.meta)) continue;
      const hits = byRoute.get(sample.meta.route);
      if (!hits || hits.length === 0) {
        console.log('inventory: 样例 ' + sample.meta.id + ' 的 route 未在盘点中命中: ' + sample.meta.route);
        continue;
      }
      // 同一条 route 可能同时被知识页与内嵌实验占用(如 analog),优先取知识页类条目。
      let hit = hits[0];
      for (const candidate of hits) {
        if (candidate.item.type === 'lesson' || candidate.item.type === 'module' || candidate.item.type === 'page') {
          hit = candidate;
          break;
        }
      }
      const normalized = INVENTORY_TO_STAGE[hit.item.stage] || hit.item.stage;
      const consistent = normalized === sample.meta.stage;
      console.log(
        'inventory: 样例 ' +
          sample.meta.id +
          ' 命中盘点条目 type=' +
          hit.item.type +
          ',stage=' +
          hit.item.stage +
          (consistent ? '(归一后一致)' : '(归一后不一致: 课程 stage=' + sample.meta.stage + ')'),
      );
    }
  }
}

/* ---------- 主流程 ---------- */

function main() {
  const arg = process.argv[2];
  const samplesPath = arg ? path.resolve(arg) : DEFAULT_SAMPLES;

  console.log('课程 schema v1 校验(validate.mjs)');
  console.log('schemaVersion: ' + SCHEMA_VERSION + ' | 样例文件: ' + samplesPath);
  console.log('');

  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(samplesPath, 'utf8'));
  } catch (error) {
    console.log('FAIL');
    console.log('  - 无法读取或解析 ' + samplesPath + ': ' + error.message);
    process.exitCode = 1;
    return;
  }

  if (!isPlainObject(doc)) {
    console.log('FAIL');
    console.log('  - samples 文档顶层必须是对象');
    process.exitCode = 1;
    return;
  }

  if (doc.schemaVersion !== SCHEMA_VERSION) {
    warn('顶层 schemaVersion 是 ' + JSON.stringify(doc.schemaVersion) + ',脚本校验基线是 ' + SCHEMA_VERSION);
  }
  ok(isIsoDate(doc.generatedAt), '顶层 generatedAt 必须是 ISO 8601 时间');
  if (!Array.isArray(doc.samples) || doc.samples.length === 0) {
    console.log('FAIL');
    console.log('  - samples 必须是非空数组');
    process.exitCode = 1;
    return;
  }

  const summaries = [];
  doc.samples.forEach(function (sample, index) {
    errors = [];
    warnings = [];
    const result = checkSample(sample, index);
    const meta = result ? result.meta : null;
    const lesson = result ? result.lesson : null;
    const missing = [];
    if (lesson) {
      for (const field of LESSON_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(lesson, field)) missing.push(field);
      }
    }
    const segments = lesson ? LESSON_FIELDS.length - missing.length : 0;
    const evidenceKinds = {};
    if (meta && Array.isArray(meta.evidence)) {
      for (const item of meta.evidence) {
        const key = item && item.kind ? item.kind : 'unknown';
        evidenceKinds[key] = (evidenceKinds[key] || 0) + 1;
      }
    }
    summaries.push({
      label: meta && meta.id ? meta.id : 'samples[' + index + ']',
      route: meta && meta.route ? meta.route : '(无 route)',
      stage: meta && meta.stage ? meta.stage : '(无 stage)',
      segments: segments,
      missing: missing,
      evidenceKinds: evidenceKinds,
      quiz: lesson && Array.isArray(lesson.quiz) ? lesson.quiz.length : 0,
      sources: sample && sample.mapping && sample.mapping.sources ? Object.keys(sample.mapping.sources).length : 0,
      errors: errors.slice(),
      warnings: warnings.slice(),
    });
  });

  // 汇总输出
  let totalErrors = 0;
  let totalWarnings = 0;
  let segmentsPassed = 0;
  let segmentsTotal = 0;
  let evidenceTotal = 0;
  let sourceTotal = 0;

  for (const summary of summaries) {
    totalErrors += summary.errors.length;
    totalWarnings += summary.warnings.length;
    segmentsPassed += summary.segments;
    segmentsTotal += LESSON_FIELDS.length;
    const kindText = Object.keys(summary.evidenceKinds)
      .map(function (kind) {
        return kind + '×' + summary.evidenceKinds[kind];
      })
      .join(', ');
    evidenceTotal += Object.keys(summary.evidenceKinds).reduce(function (sum, kind) {
      return sum + summary.evidenceKinds[kind];
    }, 0);
    sourceTotal += summary.sources;
    const status = summary.errors.length === 0 ? 'PASS' : 'FAIL';
    console.log(
      status +
        ' ' +
        summary.label +
        '  route=' +
        summary.route +
        '  stage=' +
        summary.stage +
        '  8段=' +
        summary.segments +
        '/8  evidence=' +
        (kindText || '0') +
        '  quiz=' +
        summary.quiz +
        '  sources=' +
        summary.sources,
    );
    if (summary.missing.length > 0) {
      console.log('      缺段: ' + summary.missing.join(', '));
    }
    for (const message of summary.errors) {
      console.log('      错误: ' + message);
    }
    for (const message of summary.warnings) {
      console.log('      警告: ' + message);
    }
  }

  console.log('');
  checkInventory(doc);
  console.log(
    '计数: 样例 ' +
      summaries.filter(function (s) {
        return s.errors.length === 0;
      }).length +
      '/' +
      summaries.length +
      ' 通过;8 段字段 ' +
      segmentsPassed +
      '/' +
      segmentsTotal +
      ';证据 ' +
      evidenceTotal +
      ' 条;来源引用 ' +
      sourceTotal +
      ' 条;警告 ' +
      totalWarnings +
      ';错误 ' +
      totalErrors,
  );
  console.log('');

  if (totalErrors === 0) {
    console.log('PASS');
    process.exitCode = 0;
  } else {
    console.log('FAIL');
    process.exitCode = 1;
  }
}

main();
