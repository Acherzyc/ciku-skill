#!/usr/bin/env node
/**
 * ciku-skill v4.0.0-lite 零依赖质检器
 * 纯 Node 标准库实现，无任何 npm/Python 依赖。
 * 用法: node validate_deck.js <deck.json>
 * 口径与 references/schema.json（小程序 v2.1）一致。
 */
'use strict';

const fs = require('fs');

const TONES = ['褒义', '贬义', '中性', '褒贬兼有'];
const INTENSITIES = ['轻', '中', '重'];
const SEM_KEYS = ['action', 'intensity', 'object', 'focus', 'context'];
const EXTRA_KEYS = ['moreExamples', 'unmapped', 'legacyFullDef'];
const HANZI2_8 = /^[\u4e00-\u9fa5]{2,8}$/;
const TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
const GLOSS_BLACKLIST = ['的意思', '是指', '指的是', '表示', '形容', '比喻指', '含义是'];
const PLACEHOLDER_RE = /(待补充|待完善|TODO|XXX|占位|placeholder)/i;
const SOURCE_IN_EXAMPLE_RE = /（20\d{2}[^\n）]{0,12}）|\(20\d{2}[^\n)]{0,12}\)/;

const errors = [];
const warnings = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

function stripBOM(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

function loadDeck(path) {
  if (!path) { err('用法: node validate_deck.js <deck.json>'); return null; }
  let raw;
  try { raw = fs.readFileSync(path, 'utf8'); }
  catch (e) { err('无法读取文件: ' + e.message); return null; }
  try { return JSON.parse(stripBOM(raw)); }
  catch (e) { err('JSON 解析失败: ' + e.message); return null; }
}

function checkCardId(deck) {
  const seen = new Set();
  deck.cards.forEach((c, i) => {
    if (!c || typeof c !== 'object') { err(`/cards/${i} 不是对象`); return; }
    if (typeof c.id !== 'string' || !c.id) { err(`/cards/${i} 缺少 id`); return; }
    if (seen.has(c.id)) err(`card.id 重复: ${c.id}`);
    seen.add(c.id);
    const re = new RegExp('^' + deck.deckId + '-c\\d{3,4}$');
    if (!re.test(c.id)) err(`card.id 格式不符（应为 <deckId>-c0001）: ${c.id}`);
  });
}

function checkWordUniqueness(deck) {
  const seen = new Map();
  deck.cards.forEach((c) => {
    const w = c && c.word;
    if (typeof w !== 'string') return;
    if (seen.has(w)) err(`word 重复收录（审查①）: ${w}`);
    seen.set(w, true);
  });
}

function checkCard(deck, c, groupIds) {
  const w = c.word;

  if (!HANZI2_8.test(w || '')) err(`${w || c.id}: word 须为 2~8 汉字（审查②）: "${w}"`);

  if (typeof c.pinyin !== 'string' || c.pinyin.length < 3 || !TONE_MARK.test(c.pinyin))
    err(`${w}: pinyin 必须带声调符号（审查③）: "${c.pinyin}"`);

  if (!TONES.includes(c.tone)) err(`${w}: tone 越界枚举（审查③）: "${c.tone}"`);

  if (typeof c.shortDef !== 'string' || !c.shortDef) err(`${w}: shortDef 缺失`);
  else if (c.shortDef.length > 20) err(`${w}: shortDef 超过 20 字（审查③，${c.shortDef.length}）`);
  if (PLACEHOLDER_RE.test(c.shortDef || '')) err(`${w}: shortDef 含占位符`);

  if (typeof c.mnemonic !== 'string' || !c.mnemonic) err(`${w}: mnemonic 缺失（审查③）`);
  else {
    if (c.mnemonic.length > 20) err(`${w}: mnemonic 超过 20 字（${c.mnemonic.length}）`);
    if (!c.mnemonic.includes(w)) err(`${w}: mnemonic 不含词原形`);
    if (c.mnemonic.includes('=')) {
      const right = c.mnemonic.split('=').pop().trim();
      if (right !== w) err(`${w}: mnemonic「=」右侧须与 word 逐字相同: "${right}"`);
    }
    if (c.mnemonic === c.shortDef) err(`${w}: mnemonic 与 shortDef 重复`);
  }

  // fullDef 禁用
  if ('fullDef' in c) err(`${w}: fullDef 字段已在 v2.1 删除（审查⑤）`);

  // sem
  const sem = c.sem;
  if (!sem || typeof sem !== 'object' || Array.isArray(sem)) err(`${w}: sem 缺失或非对象`);
  else {
    const keys = Object.keys(sem);
    for (const k of SEM_KEYS) if (!keys.includes(k)) err(`${w}: sem 缺少 ${k}`);
    for (const k of keys) if (!SEM_KEYS.includes(k)) err(`${w}: sem 存在未知键 ${k}`);
    if (typeof sem.action === 'string') { if (!sem.action) err(`${w}: sem.action 为空`); else if (sem.action.length > 14) err(`${w}: sem.action 超 14 字（${sem.action.length}）`); }
    if (!INTENSITIES.includes(sem.intensity)) err(`${w}: sem.intensity 必须为 轻/中/重，禁空串（当前 "${sem.intensity}"）`);
    if (typeof sem.object === 'string') { if (!sem.object) err(`${w}: sem.object 为空`); else if (sem.object.length > 20) err(`${w}: sem.object 超 20 字（${sem.object.length}）`); }
    if (typeof sem.focus === 'string') { if (!sem.focus) err(`${w}: sem.focus 为空`); else if (sem.focus.length > 30) err(`${w}: sem.focus 超 30 字（${sem.focus.length}）`); }
    if (typeof sem.context === 'string') { if (!sem.context) err(`${w}: sem.context 为空`); else if (sem.context.length > 16) err(`${w}: sem.context 超 16 字（${sem.context.length}）`); }
  }

  // usage（可选）
  if (c.usage !== undefined && typeof c.usage !== 'string') err(`${w}: usage 须为字符串`);

  // confusions
  const cfs = c.confusions;
  if (cfs !== undefined) {
    if (!Array.isArray(cfs)) err(`${w}: confusions 须为数组`);
    else {
      if (cfs.length > 4) err(`${w}: confusions ${cfs.length} 条超出硬上限 4`);
      cfs.forEach((cf, i) => {
        if (!cf || typeof cf !== 'object') { err(`${w}: confusions[${i}] 非对象`); return; }
        const cw = cf.word;
        if (!HANZI2_8.test(cw || '')) err(`${w}: confusions[${i}].word 须为 2~8 汉字真实词项: "${cw}"`);
        else if (cw === w) err(`${w}: confusions[${i}].word 不得为本词`);
        if (typeof cf.diff !== 'string' || !cf.diff) err(`${w}: confusions[${i}] 缺 diff`);
        else if (cf.diff.length > 60) err(`${w}: confusions[${i}].diff 超 60 字（${cf.diff.length}）`);
        if (cf.tip !== undefined) {
          if (typeof cf.tip !== 'string') err(`${w}: confusions[${i}].tip 须为字符串`);
          else if (cf.tip.length > 30) err(`${w}: confusions[${i}].tip 超 30 字（${cf.tip.length}）`);
        }
      });
    }
  }

  // example
  if (typeof c.example !== 'string' || !c.example) err(`${w}: example 缺失`);
  else {
    const ex = c.example;
    if (ex.includes('|')) err(`${w}: example 禁用 | 分隔（恰好 1 条）`);
    if (ex.length < 20 || ex.length > 80) err(`${w}: example 长度须 20~80 字（当前 ${ex.length}）`);
    if (!ex.includes(w)) err(`${w}: example 不含词原形`);
    if (PLACEHOLDER_RE.test(ex)) err(`${w}: example 含占位符`);
    if (SOURCE_IN_EXAMPLE_RE.test(ex)) err(`${w}: example 句内含来源括号，应迁出至 exampleSource`);
  }
  if (c.exampleSource !== undefined && typeof c.exampleSource !== 'string') err(`${w}: exampleSource 须为字符串`);

  // synonyms
  const syns = c.synonyms;
  if (!Array.isArray(syns) || syns.length === 0) err(`${w}: synonyms 缺失或空数组（1~4 条）`);
  else {
    if (syns.length > 4) err(`${w}: synonyms ${syns.length} 条超上限 4`);
    const dup = new Set();
    syns.forEach((s) => {
      if (typeof s !== 'string' || !HANZI2_8.test(s)) { err(`${w}: synonyms 须为 2~8 汉字真实词项: "${s}"`); return; }
      if (s === w) err(`${w}: synonyms 含词本身`);
      if (dup.has(s)) err(`${w}: synonyms 重复: ${s}`);
      dup.add(s);
      for (const g of GLOSS_BLACKLIST) if (s.includes(g)) { err(`${w}: synonyms 含释义粘连串 "${s}"（审查②）`); break; }
    });
  }

  // tags
  if (c.tags !== undefined) {
    if (!Array.isArray(c.tags)) err(`${w}: tags 须为数组`);
    else {
      if (c.tags.length > 3) warn(`${w}: tags 超过 3 个（建议 1~3）`);
      c.tags.forEach((t) => { if (t === c.tone) err(`${w}: tags 禁与 tone 同文: "${t}"`); });
    }
  }

  // extra
  if (c.extra !== undefined) {
    if (typeof c.extra !== 'object' || Array.isArray(c.extra)) err(`${w}: extra 须为对象`);
    else Object.keys(c.extra).forEach((k) => { if (!EXTRA_KEYS.includes(k)) warn(`${w}: extra 含非归档键 "${k}"（允许 ${EXTRA_KEYS.join('/')}）`); });
  }

  // groupWords 闭环
  if (!Array.isArray(c.groupWords)) err(`${w}: groupWords 缺失`);
  if (typeof c.groupId !== 'string' || !groupIds.has(c.groupId)) err(`${w}: groupId 不存在于 groups: ${c.groupId}`);
}

function checkGroups(deck) {
  const groups = Array.isArray(deck.groups) ? deck.groups : [];
  const groupIds = new Set(groups.map((g) => g && g.id).filter(Boolean));
  groups.forEach((g) => {
    if (!g || !g.id || !g.name) err(`groups 项缺少 id/name: ${JSON.stringify(g)}`);
    if (g && typeof g.cardCount === 'number') {
      const actual = deck.cards.filter((c) => c && c.groupId === g.id).length;
      if (g.cardCount !== actual) err(`组 ${g.id}(${g.name}) cardCount=${g.cardCount} 与实际 ${actual} 不一致（审查⑤）`);
    }
  });
  // groupWords 双向闭环
  const byGroup = new Map();
  deck.cards.forEach((c) => {
    if (!c || typeof c.groupId !== 'string') return;
    if (!byGroup.has(c.groupId)) byGroup.set(c.groupId, []);
    byGroup.get(c.groupId).push(c);
  });
  deck.cards.forEach((c) => {
    if (!c || !Array.isArray(c.groupWords) || !c.groupId) return;
    const members = byGroup.get(c.groupId) || [];
    const expect = members.map((m) => m.word).sort().join('|');
    const got = c.groupWords.slice().sort().join('|');
    if (expect !== got) err(`${c.word}: groupWords 与同组成员不一致（审查⑤）`);
  });
  return groupIds;
}

function checkSynGroupSameness(deck) {
  const byGroup = new Map();
  deck.cards.forEach((c) => {
    if (!c || !c.groupId || !Array.isArray(c.synonyms)) return;
    const key = c.synonyms.join('|');
    if (!byGroup.has(c.groupId)) byGroup.set(c.groupId, new Map());
    const m = byGroup.get(c.groupId);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(c.word);
  });
  byGroup.forEach((m, gid) => {
    m.forEach((words, key) => {
      if (words.length >= 2 && key) err(`组 ${gid} 内 ${words.length} 卡 synonyms 列表雷同（v2.1.1 同组填充审查⑧）: ${words.join('、')} → [${key.split('|').join('、')}]`);
    });
  });
}

function main() {
  const path = process.argv[2];
  const deck = loadDeck(path);
  if (!deck) { report(); process.exit(1); }

  if (deck.version !== '2.1') err(`version 必须为 "2.1"（当前 "${deck.version}"）`);
  if (!deck.deckId || typeof deck.deckId !== 'string') err('缺少 deckId');
  else if (!/^[a-z0-9_-]{2,64}$/.test(deck.deckId)) err(`deckId 须为小写英文/数字/下划线/连字符: "${deck.deckId}"`);
  if (!deck.name) err('缺少 name');
  if (!Array.isArray(deck.cards) || deck.cards.length === 0) err('cards 为空或缺失');

  if (Array.isArray(deck.cards) && deck.cards.length) {
    const groupIds = checkGroups(deck);
    checkCardId(deck);
    checkWordUniqueness(deck);
    deck.cards.forEach((c) => { if (c && typeof c === 'object') checkCard(deck, c, groupIds); });
    checkSynGroupSameness(deck);
    const uniq = new Set(deck.cards.filter((c) => c && c.word).map((c) => c.word)).size;
    console.log(`卡片: ${deck.cards.length} | 唯一词: ${uniq} | 组: ${Array.isArray(deck.groups) ? deck.groups.length : 0} | 模式: v2.1 严检`);
  }

  report();
  process.exit(errors.length ? 1 : 0);
}

function report() {
  if (errors.length) {
    console.log(`\n[FAILED] ${errors.length} 个错误:`);
    errors.forEach((e) => console.log('  ✗ ' + e));
  }
  if (warnings.length) {
    console.log(`\n[WARN] ${warnings.length} 个警告:`);
    warnings.forEach((e) => console.log('  ! ' + e));
  }
  if (!errors.length && !warnings.length) console.log('\n✅ 全部通过（0 error / 0 warning）');
  else if (!errors.length) console.log('\n✅ 通过（0 error / ' + warnings.length + ' warning）');
  else console.log('\n校验模式: v2.1 严检（exit 1）');
}

main();
