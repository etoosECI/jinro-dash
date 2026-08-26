/* ===========================================================
   record.js — 생기부 파싱 + 입학사정관 관점 진단 엔진
   ★ 무결성 원칙: 기록에 실제로 있는 문장만 근거로 인용한다.
     기록에 없는 활동·수상·성적은 절대 만들어내지 않는다.
     합불 예측은 하지 않는다.
   ★ 개인정보: 모든 처리는 브라우저 안에서만 일어난다(서버 전송 없음).
   =========================================================== */
(function (global) {
  'use strict';

  /* ---------- 1) 식별정보 마스킹 ---------- */
  const MASKS = [
    [/\b\d{6}\s*[-–]\s*\d{7}\b/g, '[주민등록번호 삭제]'],
    [/\b01[0-9]\s*[-–.\s]?\s*\d{3,4}\s*[-–.\s]?\s*\d{4}\b/g, '[전화번호 삭제]'],
    [/[\w.+-]+@[\w-]+\.[\w.]+/g, '[이메일 삭제]'],
    [/(성\s*명|이\s*름)\s*[:：]\s*\S{2,5}/g, '$1: [삭제]'],
    [/(학\s*번)\s*[:：]?\s*\d{4,}/g, '$1: [삭제]'],
    [/\b\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일\s*생\b/g, '[생년월일 삭제]'],
  ];
  function mask(text) {
    let t = String(text || '');
    MASKS.forEach(([re, to]) => { t = t.replace(re, to); });
    return t;
  }

  /* ---------- 2) 영역 분리 ---------- */
  const SECTIONS = [
    { key: 'award',    label: '수상경력',            re: /수상\s*경력/ },
    { key: 'career',   label: '진로희망사항',        re: /진로\s*희망/ },
    { key: 'autonomy', label: '자율활동',            re: /자율\s*활동/ },
    { key: 'club',     label: '동아리활동',          re: /동아리\s*활동/ },
    { key: 'service',  label: '봉사활동',            re: /봉사\s*활동/ },
    { key: 'careerAct',label: '진로활동',            re: /진로\s*활동/ },
    { key: 'setuk',    label: '세부능력 및 특기사항', re: /세부\s*능력\s*(및|,)?\s*특기\s*사항|세특/ },
    { key: 'reading',  label: '독서활동상황',        re: /독서\s*활동/ },
    { key: 'behavior', label: '행동특성 및 종합의견', re: /행동\s*특성\s*(및|,)?\s*종합\s*의견|행특/ },
  ];

  function splitSections(text) {
    const lines = String(text || '').split(/\r?\n/);
    const out = { _etc: [] };
    SECTIONS.forEach(s => { out[s.key] = []; });
    let cur = '_etc';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      // 짧은 줄이 영역 제목처럼 보이면 구획 전환
      if (line.length <= 40) {
        const hit = SECTIONS.find(s => s.re.test(line));
        if (hit) { cur = hit.key; continue; }
      }
      out[cur].push(line);
    }
    return out;
  }

  /* ---------- 3) 과목별 세특 추출 ---------- */
  /* 「과목」, <과목>, (과목), '과목:' 형태를 모두 시도 */
  function extractSubjectNotes(sectionLines, knownSubjects) {
    const notes = {};   // 과목 → 문장들
    const subj = (knownSubjects || []).slice().sort((a, b) => b.length - a.length);
    let current = null;
    for (const line of sectionLines) {
      let matched = null;
      const bracket = line.match(/^[「<\[(＜【]\s*([^」>\])＞】]{2,20})\s*[」>\])＞】]/);
      if (bracket) matched = bracket[1].trim();
      if (!matched) {
        const colon = line.match(/^([가-힣A-Za-zⅠⅡ0-9·\s]{2,20})\s*[:：]\s*\S/);
        if (colon && subj.some(s => colon[1].trim() === s)) matched = colon[1].trim();
      }
      if (!matched) {
        const found = subj.find(s => line.slice(0, Math.max(12, s.length + 4)).includes(s));
        if (found) matched = found;
      }
      if (matched) {
        // 정확히 일치하는 과목명을 최우선으로 잡는다.
        // (그렇지 않으면 「물리학」이 "고급 물리학"으로 잘못 흡수된다)
        const norm = subj.find(s => s === matched)
          || subj.find(s => matched.includes(s))
          || subj.find(s => s.includes(matched))
          || matched;
        current = norm;
        notes[current] = notes[current] || [];
        const rest = line.replace(/^[「<\[(＜【]?[^」>\])＞】:：]{0,22}[」>\])＞】:：]?\s*/, '');
        if (rest.length > 4) notes[current].push(rest);
      } else if (current) {
        notes[current].push(line);
      }
    }
    return notes;
  }

  /* ---------- 4) 신호 사전 ---------- */
  const INQUIRY_VERBS = ['탐구', '분석', '실험', '설계', '검증', '측정', '조사', '고찰', '도출', '비교', '모델링', '시뮬레이션', '가설', '보고서', '데이터', '통계', '변인', '재현'];
  const DEPTH_VERBS = ['후속', '심화', '연계', '확장', '추가 탐구', '한계', '개선', '재설계', '문제점'];
  const COMMUNITY = ['협업', '협력', '모둠', '조장', '부장', '멘토', '멘토링', '발표', '토론', '나눔', '배려', '봉사', '리더', '학급', '학생회', '도움', '가르쳐'];
  const READING_HINT = ['읽고', '독서', '책', '저자', '도서'];
  /* 정량 근거(데이터·통계) 신호 — 있으면 '정량적 데이터 근거' 보완점이 뜨지 않는다 */
  const QUANT = ['통계', '데이터', '그래프', '상관', '회귀', '표본', '설문', '수치', '정량', '측정값', '오차', '분포', '평균', '유의', '변인 통제'];
  /* 주도·발표 신호 */
  const LEAD = ['주도', '이끌', '기획', '조장', '부장', '발표', '진행', '제안', '운영', '대표'];
  /* 심화·진로선택 과목 신호 */
  const ADVANCED = /고급|심화|Ⅱ|II|전문|실험|과제 연구|과제 탐구|융합과학|세포와 물질대사|화학 반응의 세계|전자기와 양자|생물의 유전/;

  function count(text, dict) {
    let n = 0; const hits = [];
    for (const w of dict) {
      const c = (text.match(new RegExp(w, 'g')) || []).length;
      if (c) { n += c; hits.push(w); }
    }
    return { n, hits };
  }

  function snippet(lines, keyword, max) {
    for (const l of lines) {
      const i = l.indexOf(keyword);
      if (i >= 0) {
        const start = Math.max(0, i - 30);
        const s = l.slice(start, start + (max || 110)).trim();
        return (start > 0 ? '…' : '') + s + (start + (max || 110) < l.length ? '…' : '');
      }
    }
    return null;
  }

  /* ---------- 5) 진단 ---------- */
  /* ctx = { school, track, major, taken:[], chosen:[], entryGrade } */
  function diagnose(parsed, ctx) {
    const major = ctx.major || {};
    const rec = major.recommendedSubjects || [];
    const kw = major.diagnosisKeywords || [];
    const all = Object.values(parsed).flat().join('\n');
    const setuk = parsed.setuk || [];
    const acts = (parsed.autonomy || []).concat(parsed.club || [], parsed.careerAct || [], parsed.service || []);
    const reading = parsed.reading || [];
    const behavior = parsed.behavior || [];

    const subjectNotes = ctx.knownSubjects ? extractSubjectNotes(setuk, ctx.knownSubjects) : {};
    const subjectsInRecord = Object.keys(subjectNotes);

    const axes = [];

    /* --- 학업역량 --- */
    {
      const inq = count(setuk.join('\n'), INQUIRY_VERBS);
      const dep = count(setuk.join('\n'), DEPTH_VERBS);
      const advanced = (ctx.chosen || []).concat(ctx.taken || [])
        .filter(s => /고급|심화|Ⅱ|미적분|전자기|반응의 세계|유전|과제 탐구|융합과학/.test(s));
      const ev = [], gap = [];
      if (inq.n) ev.push({ text: `세특에 탐구형 서술이 ${inq.n}회 나타납니다 (${inq.hits.slice(0, 6).join('·')}).`, quote: snippet(setuk, inq.hits[0]) });
      else gap.push({ text: '세특에서 탐구·분석·실험 같은 탐구 서술을 찾지 못했습니다. 수행평가를 탐구 보고서 형태로 남기면 학업태도·탐구력이 드러납니다.' });
      if (dep.n) ev.push({ text: `후속·심화 탐구의 흔적이 확인됩니다 (${dep.hits.slice(0, 4).join('·')}). 하나의 주제를 끝까지 밀고 간 서사는 평가에서 가장 높게 읽힙니다.`, quote: snippet(setuk, dep.hits[0]) });
      else gap.push({ text: '단발성 탐구는 있으나 "후속 탐구·심화"로 이어진 기록이 보이지 않습니다. 한 주제를 2·3학년에 걸쳐 발전시키는 설계를 권합니다.' });
      if (advanced.length) ev.push({ text: `위계가 높은 과목을 이수(예정)합니다: ${advanced.slice(0, 6).join(', ')}. 도전 수준이 드러납니다.` });
      else gap.push({ text: '진로선택·심화 과목의 이수가 확인되지 않습니다. STEP 4에서 위계 상위 과목을 넣을 수 있는지 확인해 보세요.' });
      axes.push({ key: '학업역량', sub: '학업성취도 · 학업태도 · 탐구력', ev, gap,
        level: score([inq.n >= 6, dep.n >= 1, advanced.length >= 2]) });
    }

    /* --- 진로역량 --- */
    {
      const ev = [], gap = [];
      const takenAll = new Set([].concat(ctx.taken || [], ctx.chosen || [], subjectsInRecord));
      const matchedRec = rec.filter(r => [...takenAll].some(t => t && (r.includes(t) || t.includes(r.replace(/\(.*\)/, '').trim()))));
      const missingRec = rec.filter(r => !matchedRec.includes(r));
      const kwHit = count(all, kw);

      if (matchedRec.length) ev.push({ text: `${major.name || '희망 계열'} 권장 과목 중 ${matchedRec.length}/${rec.length}개가 이수·선택에 포함되어 있습니다: ${matchedRec.slice(0, 8).join(', ')}` });
      else gap.push({ text: `${major.name || '희망 계열'} 권장 과목과 겹치는 과목이 확인되지 않습니다. 계열 적합성을 드러낼 과목을 우선 확보해야 합니다.` });
      if (missingRec.length) gap.push({ text: `아직 확보되지 않은 권장 과목: ${missingRec.slice(0, 8).join(', ')}${missingRec.length > 8 ? ' 외' : ''}. 학교 편제에 개설되어 있다면 우선 검토하고, 미개설이면 개인 심화탐구·동아리로 보완하세요.` });
      if (kwHit.n) ev.push({ text: `기록 전반에서 계열 관련 키워드가 ${kwHit.n}회 확인됩니다 (${kwHit.hits.slice(0, 8).join('·')}).`, quote: snippet(setuk.concat(acts), kwHit.hits[0]) });
      else gap.push({ text: '진로와 직접 연결되는 키워드가 기록에서 확인되지 않습니다. 탐구 주제 자체를 진로 쪽으로 좁히는 편이 좋습니다.' });
      if (reading.length) ev.push({ text: `독서활동 기록 ${reading.length}건이 확인됩니다. 세특의 탐구와 독서가 한 줄기로 이어지면 진로역량이 강하게 읽힙니다.`, quote: reading[0] ? reading[0].slice(0, 110) : null });
      else gap.push({ text: '독서 기록이 확인되지 않습니다. 탐구 주제와 연결된 도서를 STEP 4의 과목별 카드에서 확인해 채워 보세요.' });
      axes.push({ key: '진로역량', sub: '전공 관련 교과 이수 · 진로 탐색 활동', ev, gap,
        level: score([matchedRec.length >= Math.max(3, rec.length * 0.4), kwHit.n >= 3, reading.length >= 1]) });
    }

    /* --- 공동체역량 --- */
    {
      const ev = [], gap = [];
      const src = acts.concat(behavior, setuk).join('\n');
      const c = count(src, COMMUNITY);
      if (c.n) ev.push({ text: `협업·나눔·리더십 관련 서술이 ${c.n}회 확인됩니다 (${c.hits.slice(0, 6).join('·')}).`, quote: snippet(acts.concat(behavior), c.hits[0]) });
      else gap.push({ text: '협업·발표·나눔에 해당하는 서술을 찾지 못했습니다. 모둠 탐구·발표·또래 멘토링을 설계에 넣으면 자연스럽게 남습니다.' });
      if (behavior.length) ev.push({ text: '행동특성 및 종합의견이 기록되어 있습니다. 교과 탐구와 인성 서술이 같은 방향을 가리키는지 점검하세요.' });
      axes.push({ key: '공동체역량', sub: '협업·소통 · 나눔·배려 · 성실성 · 리더십', ev, gap, level: score([c.n >= 4, behavior.length > 0]) });
    }

    /* --- 학교 편제 대조 --- */
    const context = schoolContext(ctx, subjectsInRecord);

    /* --- 심화 탐구 제안 (기록에 있는 것에서 출발) --- */
    const deepen = buildDeepenings(subjectNotes, ctx);

    /* --- 보완점(GAP): 이후 계열·과목 설계로 흘려보낸다 --- */
    const gaps = buildGaps({ all, setuk, acts, behavior, reading, ctx, subjectsInRecord });

    return {
      at: Core.nowKST(),
      gaps,
      counts: {
        chars: all.length,
        sections: Object.entries(parsed).filter(([k, v]) => k !== '_etc' && v.length).map(([k]) => (SECTIONS.find(s => s.key === k) || {}).label).filter(Boolean),
        subjects: subjectsInRecord,
      },
      axes, context, deepen,
      subjectNotes,
    };
  }

  /* 기록에서 '약한 축'을 찾아 보완점으로 만든다.
     kind는 이후 설계 화면에서 어떤 과목·주제를 우선 추천할지 결정하는 열쇠다.
       data → 정량·통계 성격의 과목/탐구,  cat → 진로선택·심화 과목,
       lead → 발표·주도형 산출물,          read → 독서-탐구 연결            */
  function buildGaps(o) {
    const gaps = [];
    const body = o.setuk.concat(o.acts, o.behavior).join('\n');
    const quant = count(body, QUANT);
    if (quant.n < 2) gaps.push({
      kind: 'data', label: '정량적 데이터 근거 보완',
      hint: '통계·실측을 결합한 탐구로 주장을 수치로 뒷받침',
      why: quant.n ? `정량 표현이 ${quant.n}회에 그칩니다.` : '기록에서 데이터·통계·측정 관련 서술을 찾지 못했습니다.',
    });

    const chosen = [].concat(o.ctx.taken || [], o.ctx.chosen || [], o.subjectsInRecord || []);
    const adv = chosen.filter(s => ADVANCED.test(s));
    if (adv.length < 2) gaps.push({
      kind: 'cat', label: '전공 심화 교과 이수·탐구 보완',
      hint: '진로선택·심화 과목을 이수하고 그 안에서 탐구를 남기기',
      why: adv.length ? `심화 성격 과목이 ${adv.length}개뿐입니다 (${adv.join(', ')}).` : '진로선택·심화 과목의 이수가 확인되지 않습니다.',
    });

    const lead = count(body, LEAD);
    if (lead.n < 2) gaps.push({
      kind: 'lead', label: '발표·주도 경험 보완',
      hint: '탐구 발표를 직접 이끌어 소통·리더십을 드러내기',
      why: lead.n ? `주도·발표 표현이 ${lead.n}회에 그칩니다.` : '탐구를 주도하거나 발표로 이끈 기록이 보이지 않습니다.',
    });

    if (!o.reading.length) gaps.push({
      kind: 'read', label: '독서–탐구 연결 보완',
      hint: '탐구 주제와 이어지는 도서를 읽고 독서활동에 남기기',
      why: '독서활동 기록이 확인되지 않습니다.',
    });
    return gaps;
  }

  function score(flags) {
    const n = flags.filter(Boolean).length;
    return n >= flags.length ? 'hi' : n >= Math.ceil(flags.length / 2) ? 'mid' : 'lo';
  }

  /* 학교 편제에 비춘 해석: "이 학교에서 가능한 최선의 선택을 했는가" */
  function schoolContext(ctx, subjectsInRecord) {
    const out = [];
    const school = ctx.school, track = ctx.track;
    if (!school || !track) return out;
    const offered = new Set();
    (track.phases || []).forEach(p => (p.options || []).forEach(o => offered.add(o.subject)));
    const rec = (ctx.major && ctx.major.recommendedSubjects) || [];

    const recOffered = rec.filter(r => [...offered].some(o => r.includes(o) || o.includes(r.replace(/\(.*\)/, '').trim())));
    const recNotOffered = rec.filter(r => !recOffered.includes(r));

    if (recOffered.length) out.push({ kind: 'ok', text: `${school.name} 편제에는 희망 계열 권장 과목 중 ${recOffered.length}개가 개설되어 있습니다: ${recOffered.slice(0, 8).join(', ')}` });
    if (recNotOffered.length) out.push({ kind: 'gap', text: `이 학교 편제에 없는 권장 과목: ${recNotOffered.slice(0, 8).join(', ')}. 미개설은 학생 책임이 아니므로, 개인 탐구·동아리·외부 프로그램으로 대체 근거를 만드는 편이 유리합니다.` });

    const chosen = new Set([].concat(ctx.taken || [], ctx.chosen || []));
    const missedButOffered = [...offered].filter(o => rec.some(r => r.includes(o) || o.includes(r)) && !chosen.has(o));
    if (missedButOffered.length) out.push({ kind: 'gap', text: `개설되어 있는데 아직 선택하지 않은 계열 관련 과목: ${missedButOffered.slice(0, 8).join(', ')}. 학교에 있는데 고르지 않은 과목은 "이수 노력" 항목에서 아쉬운 신호가 될 수 있습니다.` });

    const inRecordNotOffered = (subjectsInRecord || []).filter(s => s && !offered.has(s));
    if (inRecordNotOffered.length) out.push({ kind: 'info', text: `기록에는 있으나 현재 선택한 과정의 편제표에서 확인되지 않는 과목: ${inRecordNotOffered.slice(0, 8).join(', ')} — 1학년 공통과목이거나 과정(트랙)이 다를 수 있습니다.` });

    const ach = school.achievement;
    if (ach && ach.byGrade) out.push({ kind: 'info', text: '학교알리미 공시 학업성취(교과군 원점수평균·성취도 분포)를 STEP 2에서 함께 확인할 수 있습니다. 개인 성적이 아닌 학교 평균이므로 상대 위치 참고용입니다.' });
    else out.push({ kind: 'none', text: '이 학교의 학업성취 공시 데이터가 입력되어 있지 않습니다 (데이터 미입력).' });

    return out;
  }

  /* 기록에서 드러난 활동을 한 단계 심화 — 없는 활동은 만들지 않는다 */
  function buildDeepenings(subjectNotes, ctx) {
    const res = (ctx.research && ctx.research.subjects) || {};
    const out = [];
    for (const [subject, lines] of Object.entries(subjectNotes)) {
      const body = lines.join(' ');
      const seed = INQUIRY_VERBS.find(v => body.includes(v));
      const entry = res[subject];
      out.push({
        subject,
        evidence: body.slice(0, 160) + (body.length > 160 ? '…' : ''),
        hasSeed: !!seed,
        topics: entry ? (entry.topics || []) : [],
        design: entry ? entry.design : null,
        books: entry ? (entry.books || []) : [],
        papers: entry ? (entry.papers || []) : [],
        note: entry
          ? '기록에 남은 이 과목의 활동을 아래 주제로 한 단계 확장하면 "후속 탐구" 서사가 만들어집니다.'
          : '이 과목에 대한 사전 검증 탐구자료가 아직 없습니다. 기록에 있는 내용을 바탕으로 상담 시 직접 설계하세요.',
      });
    }
    return out.sort((a, b) => (b.topics.length - a.topics.length) || (b.hasSeed - a.hasSeed)).slice(0, 8);
  }

  /* ---------- 6) PDF 텍스트 추출 (pdf.js 지연 로드) ---------- */
  let pdfjsPromise = null;
  function loadPdfJs() {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => {
        try {
          global.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(global.pdfjsLib);
        } catch (e) { reject(e); }
      };
      s.onerror = () => reject(new Error('pdf.js를 불러오지 못했습니다'));
      document.head.appendChild(s);
    });
    return pdfjsPromise;
  }

  async function readFile(file) {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const pdfjsLib = await loadPdfJs();
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const c = await page.getTextContent();
        text += c.items.map(it => it.str).join(' ') + '\n';
      }
      return text;
    }
    if (/\.hwpx?$/i.test(file.name)) {
      throw new Error('한글(.hwp/.hwpx) 파일은 브라우저에서 직접 열 수 없습니다. 한글에서 내용을 복사해 붙여넣기 해 주세요.');
    }
    return await file.text();
  }

  global.Record = { mask, splitSections, extractSubjectNotes, diagnose, readFile, SECTIONS };
})(window);
