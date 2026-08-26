/* 1회성 마이그레이션 스크립트 — 기존 index.html/ach.js의 하드코딩 데이터를 data/ JSON으로 추출
   실행: node tools/extract.mjs   (레거시 파일이 legacy/ 에 있어야 함) */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(process.argv[2] || '.');
const html = fs.readFileSync(path.join(ROOT, 'legacy/index.html'), 'utf8');
const achSrc = fs.readFileSync(path.join(ROOT, 'legacy/ach.js'), 'utf8');

// ---- 레거시 스크립트에서 데이터 선언부만 잘라 평가 ----
const lines = html.split('\n');
const start = lines.findIndex(l => l.trim() === '<script>' && !l.includes('src='));
const dataSrc = lines.slice(start + 1, start + 1 + 568).join('\n');

const ctx = { window: {}, document: { getElementById: () => null, addEventListener: () => {} } };
vm.createContext(ctx);
vm.runInContext(achSrc, ctx);
vm.runInContext(dataSrc + '\n;globalThis.__OUT={ILBAN,SCIENCE,FIELDS,RESEARCH,SCHOOLS};', ctx);
const { ILBAN, SCIENCE, FIELDS, RESEARCH, SCHOOLS } = ctx.__OUT;
const ACH = ctx.window.ACH_AGG;

// ---- 학교 메타 (지역·유형) : 필요 시 여기만 고치면 됨 ----
const META = {
  '개포고등학교':            { id: 'seoul-gangnam-gaepo',      sigungu: '강남구', type: '일반고' },
  '경기고등학교':            { id: 'seoul-gangnam-gyeonggi',   sigungu: '강남구', type: '일반고' },
  '경기여자고등학교':        { id: 'seoul-gangnam-gyeonggiw',  sigungu: '강남구', type: '일반고' },
  '단국대사대부고':          { id: 'seoul-gangnam-dankook',    sigungu: '강남구', type: '일반고' },
  '대원외국어고등학교':      { id: 'seoul-gwangjin-daewon',    sigungu: '광진구', type: '특목고(외국어고)' },
  '숙명여자고등학교':        { id: 'seoul-gangnam-sookmyung',  sigungu: '강남구', type: '일반고' },
  '압구정고등학교':          { id: 'seoul-gangnam-apgujeong',  sigungu: '강남구', type: '일반고' },
  '영동고등학교':            { id: 'seoul-gangnam-yeongdong',  sigungu: '강남구', type: '일반고' },
  '은광여자고등학교':        { id: 'seoul-gangnam-eungwang',   sigungu: '강남구', type: '일반고' },
  '중동고등학교(자율형사립)': { id: 'seoul-gangnam-jungdong',  sigungu: '강남구', type: '자율형사립고' },
  '중산고등학교':            { id: 'seoul-gangnam-jungsan',    sigungu: '강남구', type: '일반고' },
  '진선여자고등학교':        { id: 'seoul-gangnam-jinseon',    sigungu: '강남구', type: '일반고' },
  '청담고등학교':            { id: 'seoul-gangnam-cheongdam',  sigungu: '강남구', type: '일반고' },
  '현대고등학교(자율형사립)': { id: 'seoul-gangnam-hyundai',   sigungu: '강남구', type: '자율형사립고' },
  '휘문고등학교(자율형사립)': { id: 'seoul-gangnam-hwimun',    sigungu: '강남구', type: '자율형사립고' },
};
const SIGUNGU_DIR = { '강남구': 'gangnam', '광진구': 'gwangjin' };
const CAT = { 공통: '공통과목', 일반: '일반선택', 진로: '진로선택', 융합: '융합선택' };

// "2학년 (택5 + 택5, 30학점)" → {grade, picks, credits}
function parsePhase(label) {
  const grade = Number((label.match(/(\d)\s*학년/) || [])[1]) || null;
  const picks = [...label.matchAll(/택\s*(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0) || null;
  const credits = Number((label.match(/(\d+)\s*학점/) || [])[1]) || null;
  return { grade, picks, credits };
}

function buildTrack(trackId, label, pools) {
  return {
    trackId, label,
    phases: Object.entries(pools).map(([phaseLabel, opts]) => {
      const p = parsePhase(phaseLabel);
      return {
        phaseId: `g${p.grade}`,
        label: phaseLabel,
        grade: p.grade,
        requiredPickCount: p.picks,
        totalCredits: p.credits,
        options: opts.map(o => ({
          subject: o.name, area: o.cat, category: CAT[o.type] || o.type, credits: o.cr,
        })),
      };
    }),
  };
}

function buildAchievement(name) {
  const raw = ACH[name];
  if (!raw) return null;
  const out = {};
  for (const [grade, sems] of Object.entries(raw)) {
    out[grade] = {};
    for (const sem of ['1학기', '2학기']) {
      if (!sems[sem]) continue;
      out[grade][sem] = {};
      for (const [area, v] of Object.entries(sems[sem])) {
        out[grade][sem][area] = {
          credits: v[0], avgScore: v[1],
          dist: { A: v[2], B: v[3], C: v[4], D: v[5], E: v[6] },
        };
      }
    }
  }
  return { source: '학교알리미 공시자료', confidence: '공개데이터', byGrade: out };
}

// ---- 학교 JSON 생성 ----
const regions = { schemaVersion: '4.0', updatedAt: '2026-08', sido: [] };
const sidoNode = { name: '서울특별시', dir: 'seoul', sigungu: [] };
regions.sido.push(sidoNode);
const bucket = {};

for (const [name, entry] of Object.entries(SCHOOLS)) {
  const m = META[name];
  if (!m) { console.warn('메타 누락:', name); continue; }
  const dir = SIGUNGU_DIR[m.sigungu];
  const tracks = [];
  if (entry.tracks?.ilban) tracks.push(buildTrack('ilban', '일반과정', entry.tracks.ilban));
  if (entry.tracks?.science) tracks.push(buildTrack('science', '과학중점과정', entry.tracks.science));

  const school = {
    schemaVersion: '4.0',
    schoolId: m.id,
    name,
    schoolType: m.type,
    region: { sido: '서울특별시', sigungu: m.sigungu },
    source: '학교 교육과정 편제표(2022 개정) / 학교알리미',
    referenceGroup: null,
    programs: [],
    professionalSubjects: [],
    tracks,
    achievement: buildAchievement(name),
    gradeStats: {},
  };
  const rel = `schools/${sidoNode.dir}/${dir}/${m.id}.json`;
  const abs = path.join(ROOT, 'data', rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(school, null, 2));

  (bucket[m.sigungu] ||= []).push({
    schoolId: m.id, name, type: m.type, path: rel,
    hasAchievement: !!school.achievement,
  });
}
for (const [sg, schools] of Object.entries(bucket)) {
  sidoNode.sigungu.push({ name: sg, dir: SIGUNGU_DIR[sg], schools: schools.sort((a, b) => a.name.localeCompare(b.name, 'ko')) });
}
sidoNode.sigungu.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
fs.writeFileSync(path.join(ROOT, 'data/regions.json'), JSON.stringify(regions, null, 2));

// ---- 계열(majors) ----
const MAJOR_META = {
  eng: {
    field: '공학·의약', competencies: ['수리적 모델링', '과학 원리의 적용', '설계·문제해결'],
    departments: ['기계공학', '전기전자공학', '컴퓨터공학', '화학공학', '신소재공학', '반도체공학', '의예과', '치의예과', '약학과', '간호학과', '인공지능·데이터사이언스'],
    keywords: ['공학', '로봇', '반도체', '회로', '알고리즘', '프로그래밍', '인공지능', '기계', '설계', '제작', '자동화', '신소재', '에너지', '의학', '의료', '질병', '면역', '세포', '유전', '진단', '임상', '보건', '약물'],
  },
  nat: {
    field: '자연·이학', competencies: ['탐구 설계 능력', '자료 해석', '학문적 호기심'],
    departments: ['수학과', '통계학과', '물리학과', '천문우주학과', '화학과', '생명과학과', '지구환경과학과', '해양학과'],
    keywords: ['수학', '통계', '물리', '화학', '생명', '지구', '천문', '우주', '실험', '증명', '함수', '미적분', '원리', '관측', '모형', '자연현상', '생태'],
  },
  soc: {
    field: '사회·상경', competencies: ['정량 분석', '사회현상 해석', '논증과 글쓰기'],
    departments: ['경영학과', '경제학과', '정치외교학과', '행정학과', '법학과', '사회학과', '언론정보학과', '심리학과', '국제학부'],
    keywords: ['경제', '경영', '금융', '시장', '정책', '법', '정치', '국제', '사회', '문화', '미디어', '설문', '여론', '복지', '도시', '기업', '마케팅', '불평등'],
  },
  hum: {
    field: '인문·어문', competencies: ['텍스트 해석', '비판적 독해', '언어 표현력'],
    departments: ['국어국문학과', '영어영문학과', '독어독문학과', '중어중문학과', '사학과', '철학과', '고고미술사학과', '교육학과', '국어교육과', '역사교육과'],
    keywords: ['문학', '언어', '역사', '철학', '윤리', '번역', '소설', '담론', '사료', '고전', '교육', '심리', '서사', '매체', '글쓰기', '토론', '수사'],
  },
};
const majorIndex = [];
fs.mkdirSync(path.join(ROOT, 'data/majors'), { recursive: true });
for (const [id, f] of Object.entries(FIELDS)) {
  const doc = {
    schemaVersion: '4.0',
    majorId: id,
    name: f.label,
    field: MAJOR_META[id]?.field || f.label,
    desc: f.desc,
    cls: f.cls,
    coreCompetencies: MAJOR_META[id]?.competencies || [],
    departments: MAJOR_META[id]?.departments || [],
    diagnosisKeywords: MAJOR_META[id]?.keywords || [],
    recommendedSubjects: f.rec,
    roadmap: f.road,
    guidance: { lead: f.uniLead, notes: f.uni },
  };
  fs.writeFileSync(path.join(ROOT, `data/majors/${id}.json`), JSON.stringify(doc, null, 2));
  majorIndex.push({ majorId: id, name: f.label, desc: f.desc, path: `majors/${id}.json` });
}
fs.writeFileSync(path.join(ROOT, 'data/majors/index.json'), JSON.stringify({ schemaVersion: '4.0', majors: majorIndex }, null, 2));

// ---- 과목별 탐구(research) ----
fs.mkdirSync(path.join(ROOT, 'data/research'), { recursive: true });
const research = { schemaVersion: '4.0', note: '도서·논문은 검색으로 실재 확인된 항목만 수록', subjects: RESEARCH };
fs.writeFileSync(path.join(ROOT, 'data/research/subjects.json'), JSON.stringify(research, null, 2));

console.log('학교', Object.keys(SCHOOLS).length, '/ 계열', majorIndex.length, '/ 탐구과목', Object.keys(RESEARCH).length);
