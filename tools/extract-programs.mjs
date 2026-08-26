/* ===========================================================
   extract-programs.mjs — 프로토타입의 학과별 탐구 주제 풀을 data/programs/ 로 추출
   실행: node tools/extract-programs.mjs <프로토타입 index.html>
   =========================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve('.');
const SRC = process.argv[2];
const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const start = lines.findIndex(l => l.startsWith('function T(t,bg,q,m,o,s,x,tags)'));
const end = lines.findIndex(l => l.startsWith('const SAMPLE_DIAG='));
const src = lines.slice(start, end).join('\n');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(src + '\n;globalThis.__OUT={MAJORS,RES};', ctx);
const { MAJORS, RES } = ctx.__OUT;

/* 학과 → 상위 계열(majorId) 연결. 새 학과를 넣을 때 여기만 고치면 됩니다. */
const PARENT = {
  medicine: { majorId: 'eng', field: '의약계열', entryNote: '의예·치의예·약학·수의예 등 의약계열 공통 설계에 활용할 수 있습니다.' },
  semi: { majorId: 'eng', field: '공학계열', entryNote: '전기전자·재료·컴퓨터공학 등 이공계 설계에도 그대로 응용됩니다.' },
  biz: { majorId: 'soc', field: '상경계열', entryNote: '경영·경제·회계·무역 등 상경계열 공통 설계에 활용할 수 있습니다.' },
  soc: { majorId: 'soc', field: '사회계열', entryNote: '사회학·언론정보·행정·정치외교 등 사회계열 설계에 응용됩니다.' },
};
const ID = { medicine: 'medicine', semi: 'semiconductor', biz: 'business', soc: 'sociology' };

/* 2022 개정 과목명을 탐구 영역에 정확히 붙이기 위한 보강 키워드.
   (원본은 '물리'만 있어 "전자기와 양자" 같은 과목이 엉뚱한 영역으로 떨어졌다) */
const AREA_EXTRA = {
  medicine: { 생명: ['유전', '생물'], 화학: ['반응'], 물리: ['역학', '전자기', '양자', '에너지'],
              수학: ['대수', '통계'], 융합: ['데이터', '소프트웨어'] },
  semi: { 물리: ['역학', '전자기', '양자', '에너지'], 화학: ['반응', '물질'],
          수학: ['대수', '통계'], 융합: ['데이터', '소프트웨어', '공학', '기술'] },
  biz: { 경제: ['금융', '시장'], 사회: ['국제', '도시', '윤리'], 수학: ['대수', '경제 수학'],
         국어: ['주제 탐구', '문학'] },
  soc: { 사회: ['국제', '도시', '기후'], 윤리: ['인문학'], 수학: ['대수', '수학'],
         국어: ['주제 탐구', '문학', '화법'] },
};

fs.mkdirSync(path.join(ROOT, 'data/programs'), { recursive: true });
const index = [];

for (const [key, m] of Object.entries(MAJORS)) {
  const programId = ID[key] || key;
  const parent = PARENT[key] || {};
  const topicPools = {};
  for (const [area, arr] of Object.entries(m.pools || {})) {
    topicPools[area] = arr.map(t => ({
      title: t.t,
      background: t.bg,
      question: t.q,
      method: t.m,
      output: t.o,
      setuk: t.s,
      extend: t.x,
      tags: t.tags || [],
    }));
  }
  const doc = {
    schemaVersion: '4.1',
    programId,
    name: m.name,
    majorId: parent.majorId || null,
    field: parent.field || m.field,
    entryNote: parent.entryNote || '',
    focusAreas: m.kyo,                 // 이 학과가 중심으로 보는 교과군
    recommendKeywords: m.rec,          // 과목명에 이 키워드가 있으면 '권장'
    areaMap: Object.fromEntries(Object.entries(m.areas).map(([a, keys]) =>
      [a, [...new Set([...keys, ...(((AREA_EXTRA[key] || {})[a]) || [])])]])),   // 과목 → 탐구 영역 매핑
    topicPools,
    resources: (RES[key] || []).map(r => ({
      kind: r.t, title: r.title, author: r.author, publisher: r.pub,
      find: r.find, why: r.why, verified: true,
    })),
  };
  fs.writeFileSync(path.join(ROOT, `data/programs/${programId}.json`), JSON.stringify(doc, null, 2));
  index.push({
    programId, name: doc.name, majorId: doc.majorId, field: doc.field,
    path: `programs/${programId}.json`,
    topicCount: Object.values(topicPools).reduce((s, a) => s + a.length, 0),
  });
}
fs.writeFileSync(path.join(ROOT, 'data/programs/index.json'),
  JSON.stringify({ schemaVersion: '4.1', programs: index }, null, 2));

console.log(index.map(p => `${p.name}(${p.majorId}) 주제 ${p.topicCount}개`).join(' · '));
