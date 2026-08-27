/* ===========================================================
   build-programs.mjs — data/programs/ 전체를 생성한다
     · tools/topics/catalog.mjs  — 34개 학과 정의 + 학과 고유 주제
     · tools/topics/shared.mjs   — 계열 그룹별 공통 주제 풀
     · tools/extra-topics.mjs    — 기존 4개 학과 보강 주제
     · 프로토타입 index.html      — 기존 4개 학과의 원본 주제 (legacy)

   실행:  node tools/build-programs.mjs [프로토타입 index.html]
          (프로토타입 경로를 생략하면 legacy 주제 없이 빌드된다)
   =========================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { CATALOG, GROUP_DEFAULTS } from './topics/catalog.mjs';
import { SHARED } from './topics/shared.mjs';
import { EXTRA } from './extra-topics.mjs';
import { SUBJECT_PLAN, normSubject } from './topics/subjects.mjs';

const ROOT = path.resolve('.');
const SRC = process.argv[2];

/* ---------- 프로토타입에서 기존 4개 학과의 주제·자료 읽기 ---------- */
let LEGACY_POOLS = {}, LEGACY_RES = {};
if (SRC && fs.existsSync(SRC)) {
  const lines = fs.readFileSync(SRC, 'utf8').split('\n');
  const a = lines.findIndex(l => l.startsWith('function T(t,bg,q,m,o,s,x,tags)'));
  const b = lines.findIndex(l => l.startsWith('const SAMPLE_DIAG='));
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(lines.slice(a, b).join('\n') + '\n;globalThis.__O={MAJORS,RES};', ctx);
  for (const [k, m] of Object.entries(ctx.__O.MAJORS)) {
    LEGACY_POOLS[k] = Object.fromEntries(Object.entries(m.pools || {}).map(([area, arr]) => [area,
      arr.map(t => ({ title: t.t, background: t.bg, question: t.q, method: t.m,
                      output: t.o, setuk: t.s, extend: t.x, tags: t.tags || [] }))]));
  }
  LEGACY_RES = ctx.__O.RES || {};
} else {
  console.warn('※ 프로토타입 경로가 없어 legacy 주제 없이 빌드합니다.');
}

/* ---------- 계열별 공통 자료 (검증된 것만) ----------
   ⚠️ 여기 넣는 도서는 검색으로 실재를 확인한 것만. 확인 안 되면 넣지 않는다. */
const GROUP_RESOURCES = {
  natural: [
    { kind: '도서', title: '코스모스', author: '칼 세이건(홍승수 옮김)', publisher: '사이언스북스',
      find: '교보문고/예스24 검색', why: '자연과학 전반의 탐구 태도를 보여 주는 고전' },
    { kind: '도서', title: '이기적 유전자', author: '리처드 도킨스(홍영남·이상임 옮김)', publisher: '을유문화사',
      find: '교보문고/예스24 검색', why: '진화·유전을 관점의 문제로 다시 보게 하는 책' },
  ],
  engineering: [
    { kind: '도서', title: '파인만의 여섯 가지 물리 이야기', author: '리처드 파인만', publisher: '승산',
      find: '교보문고/알라딘 검색', why: '공학의 바탕이 되는 물리 개념을 직관적으로 정리' },
    { kind: '도서', title: '칩 워(Chip War)', author: '크리스 밀러', publisher: '부키',
      find: '교보문고/예스24 검색', why: '기술이 산업·국제정치와 얽히는 방식을 보여 줌' },
  ],
  medical: [
    { kind: '도서', title: '아내를 모자로 착각한 남자', author: '올리버 색스', publisher: '알마',
      find: '교보문고/알라딘 검색', why: '임상 관찰이 어떻게 기록되는지 보여 주는 사례집' },
    { kind: '도서', title: '이기적 유전자', author: '리처드 도킨스(홍영남·이상임 옮김)', publisher: '을유문화사',
      find: '교보문고/예스24 검색', why: '생명현상을 진화적 관점에서 이해하는 기초' },
  ],
  social: [
    { kind: '도서', title: '넛지(Nudge)', author: '리처드 탈러·캐스 선스타인', publisher: '리더스북',
      find: '교보문고/예스24 검색', why: '제도 설계가 행동을 바꾸는 방식을 보여 줌' },
    { kind: '도서', title: '팩트풀니스', author: '한스 로슬링 외', publisher: '김영사',
      find: '교보문고/알라딘 검색', why: '데이터로 세상을 읽는 통계 리터러시' },
  ],
  humanities: [
    { kind: '도서', title: '사회학적 상상력', author: 'C. 라이트 밀스', publisher: '돌베개',
      find: '교보문고/예스24 검색', why: '개인의 경험을 구조로 옮겨 보는 훈련' },
    { kind: '도서', title: '언어의 역사', author: '토르 얀손', publisher: '한울아카데미',
      find: '교보문고/알라딘 검색', why: '언어를 역사적 산물로 보는 관점' },
  ],
};

/* ---------- shared.mjs 중복 키 검사 ----------
   JS 객체 리터럴은 같은 키를 두 번 쓰면 뒤엣것이 앞엣것을 조용히 덮어쓴다.
   주제를 보강하다가 이미 있는 영역 키를 또 만들면 기존 주제가 통째로 사라진다.
   (실제로 한 번 겪었다) 그래서 소스를 직접 훑어 중복 키를 잡는다. */
function lintSharedDuplicateKeys() {
  const src = fs.readFileSync(path.join(ROOT, 'tools/topics/shared.mjs'), 'utf8').split('\n');
  let group = null, keys = new Set(), bad = [];
  for (const line of src) {
    const g = line.match(/^  ([A-Za-z]+): \{/);
    if (g) { group = g[1]; keys = new Set(); continue; }
    const k = line.match(/^    ([^\s:]+): \[/);
    if (k && group) {
      if (keys.has(k[1])) bad.push(`${group}.${k[1]}`);
      keys.add(k[1]);
    }
  }
  if (bad.length) {
    console.error('❌ shared.mjs에 중복된 영역 키가 있습니다(앞의 주제가 사라집니다):', bad.join(', '));
    process.exit(1);
  }
}
lintSharedDuplicateKeys();

/* ---------- 주제 풀 병합 ---------- */
function mergePools(...pools) {
  const out = {};
  const seen = new Set();
  for (const pool of pools) {
    for (const [area, arr] of Object.entries(pool || {})) {
      out[area] = out[area] || [];
      for (const t of arr || []) {
        const key = t.title;
        if (seen.has(key)) continue;      // 같은 주제가 두 번 들어가지 않게
        seen.add(key);
        out[area].push(t);
      }
    }
  }
  for (const k of Object.keys(out)) if (!out[k].length) delete out[k];
  return out;
}

/* ---------- 학과별 권장 과목이 실제 개설 어휘에 있는지 검사 ----------
   과목명 오타는 조용히 '권장 0개'를 만든다. 빌드 때 잡아야 한다. */
const VOCAB = new Map();          // 정규화명 → 실제 표기(대표)
(function collectVocab() {
  const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/regions.json'), 'utf8'));
  regions.sido.forEach(sd => (sd.sigungu || []).forEach(sg => (sg.schools || []).forEach(sc => {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', sc.path), 'utf8'));
    (doc.tracks || []).forEach(t => (t.phases || []).forEach(ph => (ph.options || []).forEach(o => {
      if (!VOCAB.has(normSubject(o.subject))) VOCAB.set(normSubject(o.subject), o.subject);
    })));
    Object.values((doc.creditPlan && doc.creditPlan.byGrade) || {}).flat().forEach(x => {
      if (x.subject && !VOCAB.has(normSubject(x.subject))) VOCAB.set(normSubject(x.subject), x.subject);
    });
  })));
})();

const unknown = [];
for (const [pid, plan] of Object.entries(SUBJECT_PLAN)) {
  [...(plan.core || []), ...(plan.recommended || [])].forEach(sub => {
    if (!VOCAB.has(normSubject(sub))) unknown.push(`${pid}: "${sub}"`);
  });
}
if (unknown.length) {
  console.warn('\n⚠️  현재 수록 학교 어디에도 개설되어 있지 않은 과목명 ' + unknown.length + '건');
  console.warn('   (오타이거나, 아직 그 과목을 개설한 학교가 없다는 뜻입니다)');
  unknown.forEach(u => console.warn('   · ' + u));
  console.warn('');
}

/* ---------- 생성 ---------- */
fs.mkdirSync(path.join(ROOT, 'data/programs'), { recursive: true });
const index = [];
const seenIds = new Set();

for (const p of CATALOG) {
  if (seenIds.has(p.id)) { console.error('학과 ID 중복:', p.id); process.exit(1); }
  seenIds.add(p.id);

  const gd = GROUP_DEFAULTS[p.group];
  if (!gd) { console.error(`${p.name}: 알 수 없는 그룹 "${p.group}"`); process.exit(1); }

  const legacyPools = p.legacy ? (LEGACY_POOLS[p.legacy] || {}) : {};
  const extraPools = p.legacy ? (EXTRA[p.legacy] || {}) : {};
  const ownPools = p.own || {};
  const sharedPools = SHARED[p.group] || {};

  /* 순서가 곧 배정 우선순위 — 학과 고유 → 원본 → 보강 → 계열 공통 */
  const topicPools = mergePools(ownPools, legacyPools, extraPools, sharedPools);

  const legacyRes = p.legacy && LEGACY_RES[p.legacy]
    ? LEGACY_RES[p.legacy].map(r => ({ kind: r.t, title: r.title, author: r.author,
        publisher: r.pub, find: r.find, why: r.why, verified: true }))
    : [];
  const resources = legacyRes.length ? legacyRes
    : (GROUP_RESOURCES[p.group] || []).map(r => ({ ...r, verified: true }));

  const doc = {
    schemaVersion: '4.2',
    programId: p.id,
    name: p.name,
    majorId: p.majorId,
    field: p.field,
    entryNote: p.entryNote || '',
    focusAreas: p.focusAreas || gd.focusAreas,
    /* ★ 권장 판정의 1순위 — 정확한 과목명 목록 */
    coreSubjects: (SUBJECT_PLAN[p.id] || {}).core || [],
    recommendedSubjects: (SUBJECT_PLAN[p.id] || {}).recommended || [],
    /* 목록에 없는 과목을 보조로 잡는 키워드 (교과군 안에서만 적용) */
    recommendKeywords: p.recommendKeywords || [],
    areaMap: p.areaMap || gd.areaMap,
    ownTopicCount: Object.values(ownPools).reduce((n, a) => n + a.length, 0)
                 + Object.values(legacyPools).reduce((n, a) => n + a.length, 0)
                 + Object.values(extraPools).reduce((n, a) => n + a.length, 0),
    topicPools,
    resources,
  };

  /* recommendKeywords가 비면(legacy 학과) 원본 rec을 쓴다 */
  if (!doc.recommendKeywords.length && p.legacy) {
    const fallback = { medicine: ['미적', '기하', '확률', '화학', '생명', '물리', '세포', '물질대사', '과학탐구', '융합과학', '고급'],
      semiconductor: ['미적', '기하', '물리', '화학', '확률', '정보', '인공지능', '고급', '융합', '과학'],
      business: ['경제', '확률', '통계', '수학', '사회', '정치', '법', '화법', '언어', '매체', '미적'],
      sociology: ['사회', '정치', '법', '지리', '세계', '문화', '윤리', '사상', '확률', '통계', '독서', '언어', '매체'] };
    doc.recommendKeywords = fallback[p.id] || [];
  }

  const total = Object.values(topicPools).reduce((n, a) => n + a.length, 0);
  if (!total) { console.error(`${p.name}: 탐구 주제가 하나도 없습니다.`); process.exit(1); }

  fs.writeFileSync(path.join(ROOT, `data/programs/${p.id}.json`), JSON.stringify(doc, null, 2));
  index.push({ programId: p.id, name: p.name, majorId: p.majorId, field: p.field,
    path: `programs/${p.id}.json`, topicCount: total, ownTopicCount: doc.ownTopicCount });
}

fs.writeFileSync(path.join(ROOT, 'data/programs/index.json'),
  JSON.stringify({ schemaVersion: '4.2', programs: index }, null, 2));

/* ===========================================================
   계열(majors)에도 focusAreas · areaMap · topicPools를 넣는다
   ★ 학과 선택은 '선택 사항'이라 많은 학생이 계열만 고르고 넘어간다.
     계열에 이 값들이 없으면 교과군 필터가 전혀 걸리지 않아
     인문·사회 계열 학생 화면에 이과 과목이 그대로 깔린다.
   =========================================================== */
const MAJOR_SETUP = {
  eng: { groups: ['engineering', 'medical'], focusAreas: ['수학', '과학', '정보', '기술'] },
  nat: { groups: ['natural'], focusAreas: ['수학', '과학', '정보'] },
  soc: { groups: ['social'], focusAreas: ['사회', '국어', '수학', '정보', '영어'] },
  hum: { groups: ['humanities'], focusAreas: ['국어', '사회', '영어', '제2외국어', '수학', '예술'] },
};

function mergeAreaMaps(groups) {
  const out = {};
  groups.forEach(g => {
    for (const [area, keys] of Object.entries(GROUP_DEFAULTS[g].areaMap)) {
      out[area] = [...new Set([...(out[area] || []), ...keys])];
    }
  });
  return out;
}

/* ---------- 계열(majors)의 departments를 학과 이름과 일치시킨다 ----------
   이름이 다르면 화면에서 같은 학과가 "준비 중" 카드로 한 번 더 그려진다
   (예: programs의 '경영학' vs majors의 '경영학과'). */
const midxPath = path.join(ROOT, 'data/majors/index.json');
if (fs.existsSync(midxPath)) {
  const midx = JSON.parse(fs.readFileSync(midxPath, 'utf8'));
  (midx.majors || []).forEach(m => {
    const file = path.join(ROOT, 'data', m.path);
    if (!fs.existsSync(file)) return;
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    doc.departments = index.filter(p => p.majorId === m.majorId).map(p => p.name);

    const setup = MAJOR_SETUP[m.majorId];
    if (setup) {
      doc.focusAreas = setup.focusAreas;
      doc.areaMap = mergeAreaMaps(setup.groups);
      doc.topicPools = mergePools(...setup.groups.map(g => SHARED[g] || {}));
      doc.resources = setup.groups.flatMap(g => (GROUP_RESOURCES[g] || []))
        .filter((r, i, a) => a.findIndex(x => x.title === r.title) === i)
        .map(r => ({ ...r, verified: true }));
      doc.schemaVersion = '4.3';
      const n = Object.values(doc.topicPools).reduce((s, a) => s + a.length, 0);
      console.log(`  [계열] ${doc.name} — 교과군 ${doc.focusAreas.join('·')} · 공통 탐구 주제 ${n}개`);
    }
    fs.writeFileSync(file, JSON.stringify(doc, null, 2));
  });
  console.log('계열별 departments를 학과 이름과 동기화했습니다.');
}

/* 계열별 요약 */
const byMajor = {};
index.forEach(p => { (byMajor[p.majorId] = byMajor[p.majorId] || []).push(p); });
for (const [m, list] of Object.entries(byMajor)) {
  console.log(`\n[${m}] 학과 ${list.length}개`);
  list.forEach(p => console.log(`   ${p.name.padEnd(12, ' ')} 주제 ${String(p.topicCount).padStart(2)}개 (고유 ${p.ownTopicCount})`));
}
console.log(`\n총 ${index.length}개 학과 생성`);
