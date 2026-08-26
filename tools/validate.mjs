/* ===========================================================
   validate.mjs — data/ 폴더의 JSON이 규칙에 맞는지 검사
   사용법:  node tools/validate.mjs
   (Node.js만 있으면 됩니다. 통과하면 "모두 정상", 아니면 문제 파일과 이유를 알려 줍니다.)
   =========================================================== */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const D = p => path.join(ROOT, 'data', p);
const errors = [], warns = [];
const err = (f, m) => errors.push(`❌ ${f} — ${m}`);
const warn = (f, m) => warns.push(`⚠️  ${f} — ${m}`);

function readJSON(rel) {
  const p = D(rel);
  if (!fs.existsSync(p)) { err(rel, '파일이 없습니다'); return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { err(rel, 'JSON 문법 오류: ' + e.message); return null; }
}

const CATS = ['공통과목', '일반선택', '진로선택', '융합선택'];
const PLAN_CATS = [...CATS, '전문교과'];
const CORE_AREAS = ['국어', '수학', '영어', '과학', '사회'];

/* ---- regions.json ---- */
const regions = readJSON('regions.json');
const schoolPaths = [];
if (regions) {
  if (!Array.isArray(regions.sido)) err('regions.json', "'sido'가 배열이 아닙니다");
  else regions.sido.forEach((sd, i) => {
    if (!sd.name) err('regions.json', `sido[${i}]에 name이 없습니다`);
    (sd.sigungu || []).forEach((sg, j) => {
      if (!sg.name) err('regions.json', `${sd.name} sigungu[${j}]에 name이 없습니다`);
      (sg.schools || []).forEach(sc => {
        if (!sc.schoolId || !sc.name || !sc.path) err('regions.json', `${sd.name} ${sg.name}의 학교 항목에 schoolId/name/path 중 빠진 값이 있습니다`);
        else schoolPaths.push(sc);
      });
    });
  });
}

/* ---- 학교 파일 ---- */
const seenIds = new Set();
for (const entry of schoolPaths) {
  const doc = readJSON(entry.path);
  if (!doc) continue;
  const f = entry.path;
  if (!doc.schoolId) err(f, 'schoolId가 없습니다');
  else if (doc.schoolId !== entry.schoolId) err(f, `schoolId가 regions.json(${entry.schoolId})과 다릅니다: ${doc.schoolId}`);
  if (seenIds.has(doc.schoolId)) err(f, `schoolId가 중복됩니다: ${doc.schoolId}`);
  seenIds.add(doc.schoolId);
  if (!doc.name) err(f, 'name이 없습니다');
  if (!Array.isArray(doc.tracks) || !doc.tracks.length) { err(f, 'tracks(개설 과정)가 비어 있습니다'); continue; }

  doc.tracks.forEach(t => {
    if (!t.trackId || !t.label) err(f, '트랙에 trackId/label이 없습니다');
    if (!Array.isArray(t.phases) || !t.phases.length) { err(f, `${t.label}: phases가 비어 있습니다`); return; }
    t.phases.forEach(p => {
      // grade가 null이면 "학년 공통·학교지정 구간"으로 보고 통과시킨다 (앱은 두 학년 모두에 노출)
      if (p.grade != null && ![2, 3].includes(p.grade)) err(f, `${t.label} / ${p.label}: grade는 2, 3 또는 null이어야 합니다 (${p.grade})`);
      if (p.grade != null && !p.requiredPickCount) warn(f, `${t.label} / ${p.label}: requiredPickCount(선택 과목 수)가 없습니다`);
      if (!Array.isArray(p.options) || !p.options.length) { warn(f, `${t.label} / ${p.label}: 개설 과목(options)이 비어 있습니다`); return; }
      p.options.forEach(o => {
        if (!o.subject) err(f, `${p.label}: subject 없는 과목 항목이 있습니다`);
        if (!CATS.includes(o.category)) err(f, `${p.label} / ${o.subject}: category는 ${CATS.join('|')} 중 하나여야 합니다 (현재 "${o.category}")`);
        if (o.credits != null && typeof o.credits !== 'number') err(f, `${p.label} / ${o.subject}: credits는 숫자여야 합니다`);
      });
      const names = p.options.map(o => o.subject);
      const dup = names.filter((n, i) => names.indexOf(n) !== i);
      if (dup.length) warn(f, `${p.label}: 같은 과목이 중복 개설되어 있습니다 — ${[...new Set(dup)].join(', ')}`);
    });
  });

  if (doc.achievement && doc.achievement.byGrade) {
    for (const [g, sems] of Object.entries(doc.achievement.byGrade))
      for (const [sem, areas] of Object.entries(sems))
        for (const [area, v] of Object.entries(areas)) {
          const sum = ['A', 'B', 'C', 'D', 'E'].reduce((s, k) => s + (Number((v.dist || {})[k]) || 0), 0);
          if (sum && Math.abs(sum - 100) > 1.5) warn(f, `학업성취 ${g} ${sem} ${area}: 성취도 분포 합이 ${sum.toFixed(1)}%입니다 (100% 근처여야 함)`);
        }
  }
  if (doc.gradeStats && Object.keys(doc.gradeStats).length) {
    for (const [k, v] of Object.entries(doc.gradeStats))
      if (!v.confidence) warn(f, `gradeStats.${k}: confidence(출처 신뢰도) 표기가 없습니다. 운영자 입력값은 "운영자입력"으로 표시하세요.`);
  }
  if (!Array.isArray(doc.professionalSubjects)) warn(f, 'professionalSubjects는 배열이어야 합니다 (없으면 빈 배열 [])');

  /* 과목 단위 성취 */
  if (doc.subjectAchievement) {
    const rows = doc.subjectAchievement.rows;
    if (!Array.isArray(rows)) err(f, 'subjectAchievement.rows는 배열이어야 합니다');
    else rows.forEach(r => {
      if (!r.subject) err(f, 'subjectAchievement에 subject 없는 항목이 있습니다');
      else if (!['1', '2', '3'].includes(String(r.grade))) warn(f, `과목 성취 "${r.subject}": grade가 1·2·3이 아닙니다 (${r.grade})`);
      ['sem1', 'sem2'].forEach(k => {
        const v = r[k]; if (!v) return;
        if (v.avg != null && (v.avg < 0 || v.avg > 100)) err(f, `과목 성취 "${r.subject}" ${k}: 원점수평균이 0~100 범위를 벗어납니다 (${v.avg})`);
        ['A', 'B'].forEach(g => { if (v[g] != null && (v[g] < 0 || v[g] > 100)) err(f, `과목 성취 "${r.subject}" ${k}: ${g}비율이 0~100 범위를 벗어납니다`); });
      });
    });
  }

  /* 참조 바스켓 비교축 지표 */
  if (doc.metrics) {
    const m = doc.metrics;
    if (!m.byArea || typeof m.byArea !== 'object') err(f, 'metrics.byArea가 객체가 아닙니다');
    else CORE_AREAS.forEach(k => { if (!m.byArea[k]) warn(f, `metrics.byArea에 "${k}" 교과가 없어 참조 바스켓 비교에서 빠집니다`); });
    if (m.coreAvg == null) warn(f, 'metrics.coreAvg가 없어 종합 비교가 표시되지 않습니다');
  } else warn(f, 'metrics가 없어 참조 바스켓 비교를 할 수 없습니다 (비교 화면에 "미입력"으로 표시됨)');

  /* 학점배당표 */
  if (doc.creditPlan) {
    const cp = doc.creditPlan;
    if (!cp.source) warn(f, 'creditPlan.source(출처)가 없습니다');
    Object.entries(cp.byGrade || {}).forEach(([g, arr]) => (arr || []).forEach(x => {
      if (!x.subject) err(f, `creditPlan ${g}학년: subject 없는 항목이 있습니다`);
      if (!PLAN_CATS.includes(x.category)) err(f, `creditPlan ${g}학년 "${x.subject}": category는 ${PLAN_CATS.join('|')} 중 하나여야 합니다 (현재 "${x.category}")`);
    }));
  }
}

/* ---- 계열 ---- */
const midx = readJSON('majors/index.json');
if (midx) {
  if (!Array.isArray(midx.majors)) err('majors/index.json', "'majors'가 배열이 아닙니다");
  else midx.majors.forEach(m => {
    const doc = readJSON(m.path);
    if (!doc) return;
    if (doc.majorId !== m.majorId) err(m.path, `majorId가 index.json(${m.majorId})과 다릅니다`);
    if (!Array.isArray(doc.recommendedSubjects) || !doc.recommendedSubjects.length) err(m.path, 'recommendedSubjects가 비어 있습니다');
    if (!doc.roadmap || !Object.keys(doc.roadmap).length) warn(m.path, 'roadmap이 비어 있습니다');
    if (!Array.isArray(doc.diagnosisKeywords) || !doc.diagnosisKeywords.length) warn(m.path, 'diagnosisKeywords가 비어 있어 생기부 진단의 진로역량 판정이 약해집니다');
  });
}

/* ---- 탐구 자료 (환각 방지 점검) ---- */
const res = readJSON('research/subjects.json');
if (res) {
  if (!res.subjects || typeof res.subjects !== 'object') err('research/subjects.json', "'subjects'가 객체가 아닙니다");
  else for (const [subject, v] of Object.entries(res.subjects)) {
    const f = `research/subjects.json (${subject})`;
    if (!Array.isArray(v.topics) || !v.topics.length) warn(f, '탐구 주제가 없습니다');
    (v.books || []).forEach(b => {
      if (!b.t || !b.a) err(f, `도서 항목에 제목(t)/저자(a)가 빠졌습니다: ${JSON.stringify(b)}`);
      else if (!b.p) warn(f, `도서 "${b.t}": 출판사(p)가 없어 실재 확인이 어렵습니다`);
    });
    (v.papers || []).forEach(p => {
      if (!p.t) err(f, '논문 항목에 제목(t)이 없습니다');
      else if (!p.u && !p.s) warn(f, `논문 "${p.t}": 검색 경로(s) 또는 링크(u)가 없습니다. 확인 불가능한 자료는 넣지 마세요.`);
    });
  }
}

/* ---- 참조 바스켓 ---- */
const ref = readJSON('reference-groups.json');
if (ref) {
  if (!Array.isArray(ref.groups) || !ref.groups.length) err('reference-groups.json', 'groups가 비어 있습니다');
  else ref.groups.forEach(g => {
    const f = `reference-groups.json (${g.label || g.groupId})`;
    if (!g.schoolType) err(f, 'schoolType이 없습니다 (일반고/자사고 등)');
    if (!Array.isArray(g.members) || !g.members.length) warn(f, '참조군 구성 학교(members)가 비어 있습니다');
    CORE_AREAS.forEach(k => { if (!(g.byArea || {})[k]) err(f, `byArea에 "${k}" 교과가 없습니다`); });
    if (g.coreAvg == null) warn(f, 'coreAvg가 없습니다');
  });
}

/* ---- 학과 (탐구 주제 풀) ---- */
const pidx = readJSON('programs/index.json');
if (pidx) {
  const majorIds = new Set(((midx && midx.majors) || []).map(m => m.majorId));
  (pidx.programs || []).forEach(p => {
    const doc = readJSON(p.path);
    if (!doc) return;
    const f = p.path;
    if (doc.programId !== p.programId) err(f, `programId가 index.json(${p.programId})과 다릅니다`);
    if (doc.majorId && !majorIds.has(doc.majorId)) err(f, `majorId "${doc.majorId}"에 해당하는 계열이 data/majors에 없습니다`);
    const pools = doc.topicPools || {};
    if (!Object.keys(pools).length) err(f, 'topicPools가 비어 있습니다');
    Object.entries(pools).forEach(([area, arr]) => (arr || []).forEach(t => {
      ['title', 'background', 'question', 'output', 'setuk', 'extend'].forEach(k => {
        if (!t[k]) err(f, `${area} 영역 주제 "${t.title || '(제목없음)'}": ${k} 항목이 비어 있습니다`);
      });
      if (!Array.isArray(t.method) || !t.method.length) err(f, `${area} 영역 주제 "${t.title}": method(탐구 방법 단계)가 비어 있습니다`);
    }));
    (doc.areaMap ? Object.keys(doc.areaMap) : []).forEach(a => {
      if (!pools[a]) warn(f, `areaMap의 "${a}" 영역에 대응하는 topicPools가 없습니다`);
    });
    (doc.resources || []).forEach(rr => {
      if (!rr.title || !rr.author) err(f, `자료 항목에 제목/저자가 빠졌습니다: ${JSON.stringify(rr).slice(0, 60)}`);
      else if (!rr.find) warn(f, `자료 "${rr.title}": 찾는 법(find)이 없어 실재 확인이 어렵습니다`);
    });
  });
}

/* ---- 결과 ---- */
console.log(`\n검사 대상: 학교 ${schoolPaths.length}곳 · 계열 ${midx ? (midx.majors || []).length : 0}개 · 학과 ${pidx ? (pidx.programs || []).length : 0}개 · 탐구과목 ${res && res.subjects ? Object.keys(res.subjects).length : 0}개 · 참조군 ${ref ? (ref.groups || []).length : 0}개\n`);
warns.forEach(w => console.log(w));
errors.forEach(e => console.log(e));
if (!errors.length && !warns.length) console.log('✅ 모두 정상입니다.');
else console.log(`\n오류 ${errors.length}건 / 경고 ${warns.length}건 — 오류는 반드시 고쳐야 하고, 경고는 데이터가 비어 있다는 안내입니다.`);
process.exit(errors.length ? 1 : 0);
