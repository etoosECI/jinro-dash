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
    { key: 'activity', label: '창의적 체험활동',      re: /창의적\s*체험\s*활동/ },
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
      /* '자율활동: …' 처럼 활동 이름으로 시작하는 줄은 그 자체가 구획이다.
         (창의적 체험활동을 한 덩어리로 붙여넣으면 이 형태로 들어온다.
          이걸 못 잡으면 앞 구획인 수상경력에 통째로 섞여 들어간다) */
      const sub = line.match(/^(자율\s*활동|동아리\s*활동|봉사\s*활동|진로\s*활동)\s*[:：]?\s*/);
      if (sub) {
        const hit = SECTIONS.find(x => x.re.test(sub[1]));
        if (hit) { cur = hit.key; const rest = line.slice(sub[0].length).trim(); out[cur].push(rest || line); continue; }
      }
      out[cur].push(line);
    }
    return out;
  }

  /* 기록에 적힌 그대로의 과목명만 뽑는다 (「과목」·<과목> 형태).
     어느 편제의 과목인지 판단할 때는 이 '날것'을 써야 한다 —
     학교 편제에 맞춰 보정한 이름을 쓰면 판단이 그 편제 쪽으로 기운다. */
  const BRACKET_SUB = /[「『<＜【\[]\s*([가-힣][가-힣A-Za-zⅠⅡⅢ0-9·ㆍ\s]{1,19})\s*[」』>＞】\]]/g;
  function rawSubjects(text) {
    const out = new Set();
    String(text || '').split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      let m;
      BRACKET_SUB.lastIndex = 0;
      while ((m = BRACKET_SUB.exec(line))) {
        const s = m[1].replace(/\s+/g, ' ').trim();
        if (s.length >= 2 && !/^\d+$/.test(s)) out.add(s);
      }
    });
    return [...out];
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
        /* ★ 기록에 없는 과목명을 만들어 내지 않는다.
           「독서」를 '독서 토론과 글쓰기'로 넓혀 잡으면 2015 과정 학생부가
           2022 과목을 이수한 것처럼 보인다 — 적힌 이름을 그대로 쓴다. */
        const norm = subj.find(s => s === matched)
          || subj.find(s => matched.includes(s))
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

  /* ---------- 근거 모음 (상담 진단실이 그대로 쓴다) ----------
     ★ 독서는 '독서활동상황' 칸을 쓰지 않는다. 그 칸은 대입에 반영되지 않으므로,
       창의적 체험활동과 세특 서술 '안에' 녹아 있는 책만 센다. 수상경력도 제외한다.
     ★ 문장은 기록에 있는 그대로 옮긴다 — 요약·각색하지 않는다. */
  const BOOK_RE = /[「『“"']([^」』”"']{2,40})[」』”"']\s*(?:\(([^)]{1,30})\))?/g;
  const READ_HINT = /읽|독서|도서|저자|책|원서|서평|발췌|탐독|완독|저서|번역서/;
  const ACT_KEYS = [['activity', '창의적 체험활동'], ['autonomy', '자율활동'], ['club', '동아리활동'],
    ['service', '봉사활동'], ['careerAct', '진로활동']];

  /* 세특 줄 맨 앞의 「과목명」은 책이 아니다 — 떼고 본다 */
  const stripSubject = line => line.replace(/^[「<\[(＜【][^」>\])＞】]{1,22}[」>\])＞】]\s*/, '');

  function findBooks(line, where, subject) {
    const body = stripSubject(line);
    const out = [];
    BOOK_RE.lastIndex = 0;
    let m;
    while ((m = BOOK_RE.exec(body))) {
      const title = m[1].trim(), author = (m[2] || '').trim();
      if (!title || /^\d+$/.test(title)) continue;
      /* 과목명·활동명이 따옴표에 들어간 경우를 거르기 위해, 저자 표기가 있거나
         같은 문장에 '읽/독서/저자' 같은 말이 있어야 책으로 본다 */
      const near = body.slice(Math.max(0, m.index - 40), m.index + title.length + 40);
      if (!author && !READ_HINT.test(near)) continue;
      out.push({ title, author: author || null, where, subject: subject || null, quote: body.slice(0, 160).trim() });
    }
    return out;
  }

  function buildEvidence(o) {
    const { parsed, setuk, behavior, subjectNotes, ctx } = o;
    const actGroups = ACT_KEYS.map(([k, label]) => ({ label, lines: parsed[k] || [] })).filter(g => g.lines.length);

    /* ① 활동 속 독서 — 창체 + 세특만 */
    const books = [];
    actGroups.forEach(g => g.lines.forEach(l => books.push(...findBooks(l, g.label))));
    Object.entries(subjectNotes).forEach(([sub, lines]) =>
      (lines || []).forEach(l => books.push(...findBooks(l, '세부능력 및 특기사항', sub))));
    const seen = new Set();
    const uniqueBooks = books.filter(b => { const k = b.title; if (seen.has(k)) return false; seen.add(k); return true; });

    /* ② 계열 적합성 — 창체·세특 서술에서 희망 계열·학과 키워드가 걸린 문장 */
    const target = ctx.program || ctx.major || {};
    const kws = [...new Set([].concat(
      target.diagnosisKeywords || [],
      (ctx.major && ctx.major.diagnosisKeywords) || [],
      (target.coreSubjects || []).map(x => String(x).replace(/[ⅠⅡⅢ]|\s/g, '')),
      target.name ? [String(target.name).replace(/(학과|과|계열)$/, '')] : [],
    ))].filter(x => x && x.length >= 2);
    const fitLines = [];
    const pushFit = (line, where, subject) => {
      const hits = kws.filter(k => line.includes(k));
      if (!hits.length) return;
      fitLines.push({ text: line.slice(0, 220).trim(), where, subject: subject || null, hits: [...new Set(hits)].slice(0, 5) });
    };
    actGroups.forEach(g => g.lines.forEach(l => pushFit(l, g.label)));
    Object.entries(subjectNotes).forEach(([sub, lines]) =>
      (lines || []).forEach(l => pushFit(l, '세부능력 및 특기사항', sub)));
    fitLines.sort((a, b) => b.hits.length - a.hits.length || b.text.length - a.text.length);

    /* ③ 공동체 역량 — 대표 서술 셋. 구체적인(길고 신호가 많은) 문장을 고른다 */
    const commSrc = [];
    actGroups.forEach(g => g.lines.forEach(l => commSrc.push({ text: l, where: g.label })));
    (behavior || []).forEach(l => commSrc.push({ text: l, where: '행동특성 및 종합의견' }));
    Object.entries(subjectNotes).forEach(([sub, lines]) =>
      (lines || []).forEach(l => commSrc.push({ text: l, where: '세부능력 및 특기사항', subject: sub })));
    const community = commSrc.map(x => {
      const c = count(x.text, COMMUNITY);
      return { ...x, hits: c.hits.slice(0, 5), n: c.n };
    }).filter(x => x.n)
      .sort((a, b) => b.n - a.n || b.text.length - a.text.length)
      .filter((x, i, arr) => arr.findIndex(y => y.text.slice(0, 24) === x.text.slice(0, 24)) === i)
      .slice(0, 3)
      .map(x => ({ text: x.text.slice(0, 220).trim(), where: x.where, subject: x.subject || null, hits: x.hits }));

    return {
      books: uniqueBooks.slice(0, 12),
      fit: fitLines.slice(0, 8),
      fitKeywords: kws.slice(0, 12),
      community,
      excluded: {
        reading: (parsed.reading || []).length,
        award: (parsed.award || []).length,
        note: '독서활동상황 칸과 수상경력은 대입에 반영되지 않아 근거에서 제외했습니다.',
      },
      sources: actGroups.map(g => `${g.label} ${g.lines.length}줄`).concat(
        setuk.length ? [`세특 ${setuk.length}줄`] : [], (behavior || []).length ? ['행동특성 ' + behavior.length + '줄'] : []),
    };
  }

  function diagnose(parsed, ctx) {
    const major = ctx.major || {};
    const rec = major.recommendedSubjects || [];
    const kw = major.diagnosisKeywords || [];
    const all = Object.values(parsed).flat().join('\n');
    const setuk = parsed.setuk || [];
    const acts = (parsed.activity || []).concat(parsed.autonomy || [], parsed.club || [], parsed.careerAct || [], parsed.service || []);
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
      evidence: buildEvidence({ parsed, setuk, behavior, subjectNotes, ctx }),
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
  /* 저장소에 포함한 사본을 먼저 쓰고, 없을 때만 CDN으로 넘어간다.
     학교·학원 망에서 cdnjs가 막혀 PDF 업로드가 통째로 안 되던 문제가 있었다. */
  const PDF_SOURCES = [
    { lib: 'assets/vendor/pdfjs/pdf.min.js', worker: 'assets/vendor/pdfjs/pdf.worker.min.js', label: '저장소 사본' },
    { lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', label: 'CDN' },
  ];
  const BASE = (function () {
    const p = location.pathname;
    return p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1);
  })();
  const abs = u => /^https?:/.test(u) ? u : BASE + u;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(src + ' 를 불러오지 못했습니다'));
      document.head.appendChild(s);
    });
  }

  /* pdf.js의 텍스트 조각을 '줄'로 되돌린다.
     예전에는 한 페이지를 통째로 한 줄로 이어 붙였다. 그러면 생기부의
     교과학습발달상황 표(줄 단위로 읽는다)가 한 줄도 잡히지 않는다. */
  function pageLines(items) {
    const lines = [];
    let buf = '', lastY = null, lastEnd = null;
    const flush = () => { const t = buf.replace(/\s+/g, ' ').trim(); if (t) lines.push(t); buf = ''; lastEnd = null; };
    (items || []).forEach(it => {
      const str = it.str == null ? '' : String(it.str);
      const tr = it.transform || [];
      const y = tr.length > 5 ? Math.round(tr[5]) : null;
      const x = tr.length > 4 ? tr[4] : null;
      if (lastY != null && y != null && Math.abs(y - lastY) > 2) flush();      // 줄이 바뀜
      if (buf && x != null && lastEnd != null && x - lastEnd > 1) buf += ' ';  // 칸이 떨어져 있으면 띄어쓰기
      buf += str;
      if (x != null) lastEnd = x + (Number(it.width) || 0);
      if (y != null) lastY = y;
      if (it.hasEOL) flush();
    });
    flush();
    return lines;
  }

  let pdfjsPromise = null;
  function loadPdfJs() {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = (async () => {
      const tried = [];
      for (const src of PDF_SOURCES) {
        try {
          await loadScript(abs(src.lib));
          if (!global.pdfjsLib) throw new Error('pdfjsLib 전역이 만들어지지 않았습니다');
          global.pdfjsLib.GlobalWorkerOptions.workerSrc = abs(src.worker);
          return global.pdfjsLib;
        } catch (e) { tried.push(`${src.label}: ${e.message}`); }
      }
      throw new Error('PDF 판독기를 불러오지 못했습니다 (' + tried.join(' / ') +
        '). assets/vendor/pdfjs 폴더가 함께 업로드됐는지 확인해 주세요. 그동안은 생기부 내용을 복사해 아래에 붙여넣으시면 똑같이 진단됩니다.');
    })();
    pdfjsPromise.catch(() => { pdfjsPromise = null; });   // 실패는 캐시하지 않는다
    return pdfjsPromise;
  }

  async function readFile(file) {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const pdfjsLib = await loadPdfJs();
      const buf = await file.arrayBuffer();
      let doc;
      try {
        doc = await pdfjsLib.getDocument({ data: buf }).promise;
      } catch (e) {
        if (/password/i.test(e.message || '')) {
          throw new Error('암호가 걸린 PDF입니다. 암호를 풀어 저장한 뒤 다시 올려 주세요.');
        }
        throw new Error('PDF를 여는 데 실패했습니다: ' + (e.message || '알 수 없는 오류'));
      }
      let text = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const c = await page.getTextContent();
        text += pageLines(c.items).join('\n') + '\n';
      }
      if (text.replace(/\s/g, '').length < 30) {
        /* 글자가 없는 PDF = 스캔·사진본. 던지되, 호출하는 쪽이 OCR을 권할 수 있게 표시한다. */
        const e = new Error(`${doc.numPages}쪽을 모두 읽었지만 글자가 거의 없습니다. 스캔하거나 사진으로 만든 PDF라서 안에 든 것이 글자가 아니라 이미지입니다.`);
        e.needsOcr = true;
        e.numPages = doc.numPages;
        throw e;
      }
      return text;
    }
    if (/\.hwpx?$/i.test(file.name)) {
      throw new Error('한글(.hwp/.hwpx) 파일은 브라우저에서 직접 열 수 없습니다. 한글에서 내용을 복사해 붙여넣기 해 주세요.');
    }
    return await file.text();
  }

  /* ---------- 7) 스캔 PDF에서 글자 읽기 (OCR · 브라우저 안에서만) ----------
     생기부는 미성년자의 민감 개인정보라, 외부 OCR 서비스로 보내지 않는다.
     엔진(tesseract.js)과 한국어 학습 데이터를 저장소에 함께 두고 이 브라우저에서 처리한다. */
  const TESS_DIR = 'assets/vendor/tesseract/';
  let tessPromise = null;
  function loadTesseract() {
    if (tessPromise) return tessPromise;
    tessPromise = (async () => {
      await loadScript(abs(TESS_DIR + 'tesseract.min.js'));
      if (!global.Tesseract) throw new Error('OCR 엔진을 불러오지 못했습니다. assets/vendor/tesseract 폴더가 함께 업로드됐는지 확인해 주세요.');
      return global.Tesseract;
    })();
    tessPromise.catch(() => { tessPromise = null; });
    return tessPromise;
  }

  /* OCR이 흔히 틀리는 모양만 바로잡는다 — 내용을 고치지는 않는다.
     특히 세특의 「과목명」은 진단이 과목을 찾는 단서라서, 닫는 낫표가 깨지면 과목이 통째로 안 잡힌다. */
  function tidyOcr(s) {
    return String(s || '')
      .replace(/「([^」\n]{1,24}?)\s*[|ｌlI丨ㅣ·]\s*(?=\s|$)/gm, '「$1」')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function ocrFile(file, opts) {
    const o = opts || {};
    const [Tess, pdfjsLib] = await Promise.all([loadTesseract(), loadPdfJs()]);
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const total = doc.numPages;
    if (o.onStage) o.onStage('엔진 준비 중…', 0, total);

    const worker = await Tess.createWorker('kor', 1, {
      workerPath: abs(TESS_DIR + 'worker.min.js'),
      corePath: abs(TESS_DIR),
      langPath: abs(TESS_DIR + 'lang'),
      gzip: true,
    });
    let text = '';
    try {
      for (let i = 1; i <= total; i++) {
        if (o.isCancelled && o.isCancelled()) throw new Error('사용자가 중단했습니다.');
        if (o.onStage) o.onStage(`${i}쪽 읽는 중…`, i - 1, total);
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 2 });          // 200dpi 정도 — 작은 글씨도 읽히는 선
        const cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        const r = await worker.recognize(cv);
        text += (r.data.text || '') + '\n';
        cv.width = cv.height = 0;                            // 메모리 반환
      }
    } finally {
      try { await worker.terminate(); } catch (e) {}
    }
    if (o.onStage) o.onStage('마무리 중…', total, total);
    return tidyOcr(text);
  }

  /* ---------- 8) 교과학습발달상황 표에서 과목 성적 읽기 ----------
     생기부의 성적표는 학교·발급 경로마다 조금씩 다르다. 공통으로 나타나는
     "원점수/과목평균(표준편차) 성취도(수강자수) 석차등급" 형태만 잡고,
     못 읽은 줄은 조용히 버린다. 읽은 결과는 반드시 사람이 검수한다. */
  const AREA_FIX = {
    국어: '국어', 수학: '수학', 영어: '영어', 과학: '과학', 한국사: '한국사',
    사회: '사회', '사회(역사/도덕포함)': '사회', '사회(역사/도덕 포함)': '사회',
    '역사': '사회', '도덕': '사회',
    체육: '체육', 예술: '예술', '예술(음악/미술)': '예술',
    '기술·가정': '기술·가정', 기술가정: '기술·가정', '기술ㆍ가정': '기술·가정',
    정보: '정보', 제2외국어: '제2외국어', 한문: '한문', 교양: '교양',
  };
  /* 성적 한 칸: "원점수/과목평균(표준편차) 성취도(수강자수) 석차등급"
     표준편차·성취도·수강자수·석차등급은 학교와 과목 구분에 따라 없을 수 있다.
     ↓ 줄 단위용 / 한 줄로 뭉친 텍스트 훑기용 — 정규식 리터럴로 둔다(이스케이프 사고 방지). */
  const LINE_RE = /^([1-2])\s*(?:학기)?\s+([가-힣][가-힣·ㆍ]{0,9}(?:\s*\([^)]{0,24}\))?)\s+(.+?)\s+(\d{1,2})\s*(?:단위|학점)?\s+(\d{1,3}(?:\.\d+)?)\s*\/\s*(\d{1,3}(?:\.\d+)?)\s*(?:\(\s*(\d{1,3}(?:\.\d+)?)\s*\))?\s*([A-E])?\s*(?:\(\s*(\d{1,4})\s*\))?\s*(\d(?:\.\d)?)?\s*(?:등급)?\s*$/;
  const SCAN_RE = /([1-2])\s*(?:학기)?\s+([가-힣][가-힣·ㆍ]{0,9}(?:\s*\([^)]{0,24}\))?)\s+([가-힣A-Za-zⅠⅡⅢI\d·ㆍ ]{2,22}?)\s+(\d{1,2})\s*(?:단위|학점)?\s+(\d{1,3}(?:\.\d+)?)\s*\/\s*(\d{1,3}(?:\.\d+)?)\s*(?:\(\s*(\d{1,3}(?:\.\d+)?)\s*\))?\s*([A-E])?\s*(?:\(\s*(\d{1,4})\s*\))?\s*(\d(?:\.\d)?)?\s*(?:등급)?/g;

  function pushRow(out, grade, m) {
    const num = v => (v == null || v === '' ? null : Number(v));
    const subject = String(m[3]).trim();
    const area = String(m[2]).replace(/\s+/g, '').trim();
    if (!/[가-힣]/.test(subject) || subject.length > 24) return;
    if (!/[가-힣]/.test(area)) return;
    out.push({
      grade: grade || 1, semester: Number(m[1]),
      area: AREA_FIX[area] || area, subject,
      credits: num(m[4]), rawScore: num(m[5]), mean: num(m[6]), stdev: num(m[7]),
      achievement: m[8] || null, takers: num(m[9]), rank: num(m[10]),
    });
  }

  function parseGrades(text) {
    const src = String(text || '');
    const rows = [];
    let grade = null;
    /* ① 줄 단위 — 제대로 줄이 나뉜 텍스트 */
    src.split(/\r?\n/).forEach(raw => {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (!line) return;
      const g = line.match(/^\[?\s*([1-3])\s*학년\s*\]?/);
      if (g && line.length < 24) { grade = Number(g[1]); return; }
      const m = line.match(LINE_RE);
      if (m) pushRow(rows, grade, m);
    });
    if (rows.length) return rows;

    /* ② 한 줄로 뭉친 텍스트 — 학년 표시를 따라가며 성적칸을 훑는다 */
    const marks = [...src.matchAll(/([1-3])\s*학년/g)].map(m => ({ at: m.index, g: Number(m[1]) }));
    const gradeAt = pos => {
      let g = null;
      for (const mk of marks) { if (mk.at <= pos) g = mk.g; else break; }
      return g;
    };
    SCAN_RE.lastIndex = 0;
    let m;
    while ((m = SCAN_RE.exec(src)) !== null) pushRow(rows, gradeAt(m.index), m);
    return rows;
  }

  /* 국·수·영·사·과 5교과를 학기별로 집계 — 평균 등급·평균 원점수·이수단위 합 */
  const CORE5 = ['국어', '수학', '영어', '사회', '과학'];
  function summarizeGrades(rows) {
    const list = (rows || []).filter(r => r && r.subject);
    const key = r => `${r.grade}-${r.semester}`;
    const terms = [...new Set(list.map(key))].sort();
    const area = r => (r.area === '한국사' ? '사회' : r.area);
    const w = (arr, f) => {                                   // 이수단위 가중평균
      let s = 0, c = 0;
      arr.forEach(r => { const v = f(r); if (v == null) return; const u = Number(r.credits) || 1; s += v * u; c += u; });
      return c ? Math.round((s / c) * 100) / 100 : null;
    };
    const byArea = {};
    CORE5.forEach(a => {
      const mine = list.filter(r => area(r) === a);
      byArea[a] = {
        subjects: mine.length,
        credits: mine.reduce((n, r) => n + (Number(r.credits) || 0), 0),
        rank: w(mine, r => r.rank), raw: w(mine, r => r.rawScore),
        terms: terms.map(t => {
          const m2 = mine.filter(r => key(r) === t);
          return { term: t, rank: w(m2, r => r.rank), raw: w(m2, r => r.rawScore), credits: m2.reduce((n, r) => n + (Number(r.credits) || 0), 0) };
        }).filter(x => x.rank != null || x.raw != null),
      };
    });
    const ranked = CORE5.filter(a => byArea[a].rank != null);
    const all = w(list, r => r.rank);
    const best = ranked.slice().sort((a, b) => byArea[a].rank - byArea[b].rank);
    return {
      terms, byArea,
      overallRank: all,
      overallRaw: w(list, r => r.rawScore),
      totalCredits: list.reduce((n, r) => n + (Number(r.credits) || 0), 0),
      spread: ranked.length > 1 ? Math.round((byArea[best[best.length - 1]].rank - byArea[best[0]].rank) * 100) / 100 : null,
      strong: best.slice(0, 2), weak: best.slice(-2).reverse(),
      subjectCount: list.length,
    };
  }

  /* ---------- 9) 교과 성적 엑셀 양식 (내려받기 · 올리기) ----------
     생기부 표를 못 읽는 경우가 있어, 직접 채워 넣는 길을 함께 둔다.
     엔진(SheetJS)은 저장소에 포함한다 — 망에서 CDN이 막혀도 동작해야 한다. */
  const XLSX_SRC = 'assets/vendor/xlsx/xlsx.mini.min.js';
  let xlsxPromise = null;
  function loadXlsx() {
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = (async () => {
      await loadScript(abs(XLSX_SRC));
      if (!global.XLSX) throw new Error('엑셀 모듈을 불러오지 못했습니다. assets/vendor/xlsx 폴더가 함께 업로드됐는지 확인해 주세요.');
      return global.XLSX;
    })();
    xlsxPromise.catch(() => { xlsxPromise = null; });
    return xlsxPromise;
  }

  const GRADE_COLS = ['학년', '학기', '교과', '과목', '이수단위', '원점수', '과목평균', '표준편차', '성취도', '수강자수', '석차등급'];
  const COL_KEY = { 학년: 'grade', 학기: 'semester', 교과: 'area', 과목: 'subject', 이수단위: 'credits',
    원점수: 'rawScore', 과목평균: 'mean', 표준편차: 'stdev', 성취도: 'achievement', 수강자수: 'takers', 석차등급: 'rank' };

  /* 내려받을 양식 — 이미 읽은 성적이 있으면 그 값을 채워서 준다 */
  async function gradeWorkbook(rows) {
    const XLSX = await loadXlsx();
    const body = (rows && rows.length ? rows : [
      { grade: 1, semester: 1, area: '국어', subject: '공통국어1', credits: 4, rawScore: 92, mean: 71.2, stdev: 12.3, achievement: 'A', takers: 312, rank: 2 },
      { grade: 1, semester: 1, area: '수학', subject: '공통수학1', credits: 4, rawScore: 88, mean: 65.4, stdev: 14.1, achievement: 'B', takers: 312, rank: 3 },
    ]).map(r => GRADE_COLS.map(c => {
      const v = r[COL_KEY[c]];
      return v == null ? '' : v;
    }));
    const aoa = [GRADE_COLS, ...body];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [6, 6, 10, 18, 8, 8, 9, 9, 8, 9, 9].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '교과성적');
    return { XLSX, wb };
  }

  async function downloadGradeTemplate(rows, filename) {
    const { XLSX, wb } = await gradeWorkbook(rows);
    /* XLSX.writeFile에 맡기면 브라우저에 따라 파일 이름이 'download'로 떨어진다.
       직접 Blob을 만들어 이름을 지정한다. */
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || '교과성적_양식.xlsx';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  /* 올린 엑셀·CSV → 성적 행 */
  async function readGradeFile(file) {
    const XLSX = await loadXlsx();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets['교과성적'] || wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('시트를 찾지 못했습니다.');
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    if (!aoa.length) throw new Error('내용이 비어 있습니다.');
    /* 머리글 줄을 찾는다 — 사람이 위에 메모를 적어 두는 일이 흔하다 */
    let h = aoa.findIndex(r => (r || []).some(c => String(c).replace(/\s/g, '') === '과목'));
    if (h < 0) h = 0;
    const head = (aoa[h] || []).map(c => String(c).replace(/\s/g, ''));
    const idx = {};
    GRADE_COLS.forEach(c => { const i = head.indexOf(c.replace(/\s/g, '')); if (i >= 0) idx[COL_KEY[c]] = i; });
    if (idx.subject == null) throw new Error('"과목" 열을 찾지 못했습니다. 내려받은 양식의 머리글을 그대로 두고 값만 채워 주세요.');
    const num = v => { const t = String(v == null ? '' : v).trim(); return t === '' ? null : (isNaN(Number(t)) ? null : Number(t)); };
    const rows = [];
    for (let i = h + 1; i < aoa.length; i++) {
      const r = aoa[i] || [];
      const subject = String(r[idx.subject] == null ? '' : r[idx.subject]).trim();
      if (!subject) continue;
      const ach = String(r[idx.achievement] == null ? '' : r[idx.achievement]).trim().toUpperCase();
      rows.push({
        grade: num(r[idx.grade]) || 1,
        semester: num(r[idx.semester]) === 2 ? 2 : 1,
        area: AREA_FIX[String(r[idx.area] == null ? '' : r[idx.area]).replace(/\s/g, '')] || String(r[idx.area] == null ? '' : r[idx.area]).trim() || '기타',
        subject,
        credits: num(r[idx.credits]), rawScore: num(r[idx.rawScore]), mean: num(r[idx.mean]), stdev: num(r[idx.stdev]),
        achievement: /^[A-E]$/.test(ach) ? ach : null,
        takers: num(r[idx.takers]), rank: num(r[idx.rank]),
      });
    }
    if (!rows.length) throw new Error('과목이 하나도 없습니다. "과목" 열에 과목명을 적어 주세요.');
    return rows;
  }

  global.Record = { mask, splitSections, extractSubjectNotes, rawSubjects, diagnose, readFile, ocrFile, tidyOcr, parseGrades, summarizeGrades, downloadGradeTemplate, readGradeFile, GRADE_COLS, SECTIONS };
})(window);
