/* ===========================================================
   merge-prototype.mjs — 프로토타입(단일 HTML)의 실데이터를 v4 JSON에 병합
   · 과목 단위 성취(원점수평균·A·B·학점)  → school.subjectAchievement
   · 5개 핵심교과 지표(coreAvg/coreArate/elective23) → school.metrics
   · 학점배당표 편제(공통 포함 전 과목·전문교과·택N) → school.creditPlan
   · 참조 바스켓(자사고5 + 일반고6)         → data/reference-groups.json
   실행:  node tools/merge-prototype.mjs <프로토타입 index.html 경로>
   =========================================================== */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const SRC = process.argv[2];
if (!SRC) { console.error('사용법: node tools/merge-prototype.mjs <프로토타입 index.html>'); process.exit(1); }
const html = fs.readFileSync(SRC, 'utf8');

function pick(tag) {
  const m = html.match(new RegExp(`<script id="${tag}" type="application/json">([\\s\\S]*?)</script>`));
  if (!m) throw new Error(tag + ' 블록을 찾지 못했습니다');
  return JSON.parse(m[1]);
}
const SD = pick('SCHOOL_DATA');
const CURR = pick('CURR_META');

/* 프로토타입 약칭 → v4 schoolId */
const MAP = {
  '개포고': 'seoul-gangnam-gaepo', '경기고': 'seoul-gangnam-gyeonggi', '경기여고': 'seoul-gangnam-gyeonggiw',
  '단대부고': 'seoul-gangnam-dankook', '대원외고': 'seoul-gwangjin-daewon', '숙명여고': 'seoul-gangnam-sookmyung',
  '압구정고': 'seoul-gangnam-apgujeong', '영동고': 'seoul-gangnam-yeongdong', '은광여고': 'seoul-gangnam-eungwang',
  '중동고': 'seoul-gangnam-jungdong', '중산고': 'seoul-gangnam-jungsan', '진선여고': 'seoul-gangnam-jinseon',
  '청담고': 'seoul-gangnam-cheongdam', '현대고': 'seoul-gangnam-hyundai', '휘문고': 'seoul-gangnam-hwimun',
};
const CAT = { 공통: '공통과목', 일반: '일반선택', 진로: '진로선택', 융합: '융합선택', 전문: '전문교과' };

/* 학교 파일 경로 인덱스 */
const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/regions.json'), 'utf8'));
const pathById = {};
regions.sido.forEach(sd => (sd.sigungu || []).forEach(sg => (sg.schools || []).forEach(sc => { pathById[sc.schoolId] = sc.path; })));

let merged = 0, planned = 0;
for (const [shortName, s] of Object.entries(SD.schools)) {
  const id = MAP[shortName];
  if (!id) { console.warn('매핑 없음:', shortName); continue; }
  const rel = pathById[id];
  if (!rel) { console.warn('regions.json에 없음:', id); continue; }
  const file = path.join(ROOT, 'data', rel);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));

  /* 과목 단위 성취 */
  doc.subjectAchievement = {
    source: '학교알리미 공시자료(과목별 학업성취사항)',
    confidence: '공개데이터',
    rows: (s.subs || []).map(x => ({
      grade: String(x.g), area: x.kyo, areaGroup: x.kb, subject: x.sub,
      credits: x.cr == null ? null : Number(x.cr),
      sem1: x.s1 ? { avg: x.s1.avg ?? null, A: x.s1.A ?? null, B: x.s1.B ?? null } : null,
      sem2: x.s2 ? { avg: x.s2.avg ?? null, A: x.s2.A ?? null, B: x.s2.B ?? null } : null,
    })),
  };

  /* 5개 핵심교과 지표 (참조 바스켓 비교축) */
  doc.metrics = s.metrics
    ? { byArea: s.metrics.byKyo, coreAvg: s.metrics.coreAvg, coreArate: s.metrics.coreArate, elective23: s.metrics.elective23,
        source: '학교알리미 공시자료 집계', confidence: '공개데이터' }
    : null;

  /* 학점배당표 편제 (있는 학교만) */
  const meta = CURR[shortName];
  if (meta) {
    doc.creditPlan = {
      source: meta.source,
      perSemesterCount: meta.perSemCount || {},
      byGrade: Object.fromEntries(Object.entries(meta.byGrade || {}).map(([g, arr]) => [g,
        arr.map(x => ({ subject: x.sub, category: CAT[x.cat] || x.cat, credits: x.cr, area: x.kyo }))])),
      pickNotes: meta.pickNotes || [],
    };
    doc.professionalSubjects = (meta.professional || []).map(name => ({
      name, track: '학점배당표 기재', grade: null,
    }));
    planned++;
  }
  doc.schemaVersion = '4.1';
  fs.writeFileSync(file, JSON.stringify(doc, null, 2));
  merged++;
}

/* 참조 바스켓 */
const basket = {
  schemaVersion: '4.1',
  note: '서울대 수시 합격생을 다수 배출한 참조군의 학교알리미 공시 학업성취 집계값입니다. 개인 성적이 아니라 학교 평균이며, 내 학교의 상대적 위치를 가늠하는 용도로만 사용하세요.',
  groups: Object.entries(SD.basket).map(([label, g]) => ({
    groupId: label === '자사고' ? 'basket-jasa' : 'basket-ilban',
    label: `${label} 참조군`,
    schoolType: label,
    members: g.schools,
    byArea: g.byKyo,
    coreAvg: g.coreAvg,
    coreArate: g.coreArate,
    elective23: g.elective23,
    source: '학교알리미 공시자료 집계',
  })),
  coreAreas: ['국어', '수학', '영어', '과학', '사회'],
};
fs.writeFileSync(path.join(ROOT, 'data/reference-groups.json'), JSON.stringify(basket, null, 2));

console.log(`학교 ${merged}곳 성취 병합 · 편제(학점배당표) ${planned}곳 · 참조 바스켓 ${basket.groups.length}개 그룹`);
