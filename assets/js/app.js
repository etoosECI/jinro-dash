/* ===========================================================
   app.js — 화면 흐름 오케스트레이션
   ⚠️ 여기는 엔진입니다. 학교·과목·계열을 바꾸려면 data/ 폴더의 JSON만 고치세요.
   =========================================================== */
(function () {
  'use strict';
  const { $, $$, el, esc, banner, loadJSON, nowKST, todayKST, matches, debounce } = Core;

  /* ---------------- 상태 ---------------- */
  const S = {
    profile: null,
    regions: null,
    school: null,       // 현재 학교 상세 JSON
    track: null,        // 현재 과정
    majorIndex: null,
    major: null,        // 현재 계열 상세 JSON
    programIndex: null,
    program: null,      // 현재 학과 상세 JSON (선택 사항)
    refGroups: null,    // 참조 바스켓 (자사고/일반고)
    research: null,     // 과목별 탐구 자료
    selected: new Set(),
    taken: new Set(),
    manual: [],         // 공동교육과정·전문교과 등 직접 추가한 과목
    topicIdx: {},       // 과목별 탐구 주제 로테이션 위치
    diagnosis: null,
    step: 'start',
  };

  // 진단(record)을 계열보다 앞에 둔다 — 보완점이 이후 설계에 반영되도록
  const STEP_ORDER = ['start', 'school', 'record', 'major', 'design', 'report'];

  /* ---------------- 테마 ---------------- */
  function setTheme(t) {
    document.body.className = t === 'dark' ? '' : t;
    $$('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    Store.theme.set(t);
  }

  /* ---------------- 스텝 이동 ---------------- */
  function reachable(step) {
    const p = S.profile;
    switch (step) {
      case 'start': return true;
      case 'school': return !!(p && p.entryGrade);
      case 'record': return !!S.school;
      case 'major': return !!S.school;
      case 'design': return !!S.major;
      case 'report': return !!S.school;
      default: return false;
    }
  }
  /* 상단 스텝 버튼의 잠금 상태를 현재 진행도에 맞게 다시 계산한다.
     (학교나 계열을 고른 직후에도 즉시 풀리도록 별도 함수로 뺐다) */
  function refreshSteps() {
    $$('#steps button').forEach(b => {
      b.classList.toggle('on', b.dataset.step === S.step);
      b.disabled = !reachable(b.dataset.step);
      b.classList.toggle('done', reachable(b.dataset.step) && b.dataset.step !== S.step);
    });
  }
  function go(step) {
    if (!reachable(step)) { banner('info', '이전 단계를 먼저 완료해 주세요.', ''); return; }
    S.step = step;
    STEP_ORDER.forEach(s => { const n = $('#p-' + s); if (n) n.hidden = s !== step; });
    refreshSteps();
    if (step === 'report') renderReport();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- 저장 ---------------- */
  function persist(step, detail) {
    if (!S.profile) return;
    S.profile.chosenSubjects = [...S.selected];
    S.profile.takenSubjects = [...S.taken];
    S.profile.manualSubjects = [...S.manual];
    S.profile.programId = S.program ? S.program.programId : null;
    S.profile.topicIdx = S.topicIdx;
    if (step) Store.log(S.profile, step, detail);
    Store.save(S.profile);
    renderHistory();
  }

  /* ===========================================================
     STEP 1 · 시작
     =========================================================== */
  function initStart() {
    const idInput = $('#idInput'), sel = $('#profileSel');
    idInput.value = Store.lastUsed() || Store.newId();

    function refreshList() {
      sel.innerHTML = '<option value="">— 없음 —</option>';
      Store.list().forEach(id => {
        const p = Store.get(id);
        sel.appendChild(el('option', { value: id, text: `${id} · ${p.schoolName || '학교 미선택'} · ${p.updatedAt || ''}` }));
      });
    }
    refreshList();

    $('#newIdBtn').onclick = () => { idInput.value = Store.newId(); };
    $('#loadBtn').onclick = async () => {
      const id = sel.value;
      if (!id) { banner('info', '이어할 설계를 선택해 주세요.', ''); return; }
      const p = Store.get(id);
      if (!p) return;
      S.profile = p;
      idInput.value = id;
      applyEntry(p.entryGrade);
      S.selected = new Set(p.chosenSubjects || []);
      S.taken = new Set(p.takenSubjects || []);
      S.manual = (p.manualSubjects || []).slice();
      S.topicIdx = p.topicIdx || {};
      S.diagnosis = p.record && p.record.diagnosis || null;
      banner('info', `'${id}' 설계를 불러왔습니다.`, p.schoolName ? `학교: ${p.schoolName}` : '');
      if (p.schoolPath) { await selectSchoolByPath(p.schoolPath, p.trackId); }
      if (p.majorId) { await selectMajor(p.majorId); }
      if (p.programId) { await selectProgram(p.programId); }
      renderGapBanners();
      if (p.record && p.record.consent) { $('#consentBox').hidden = true; $('#uploadBox').hidden = false; }
      if (S.diagnosis) renderDiagnosis();
      renderHistory();
      go(p.schoolId ? (p.majorId ? 'design' : 'school') : 'start');
    };
    $('#delBtn').onclick = () => {
      const id = sel.value;
      if (!id) return;
      if (!confirm(`'${id}' 저장 데이터를 완전히 삭제할까요? 되돌릴 수 없습니다.`)) return;
      Store.remove(id); refreshList();
      banner('info', '삭제했습니다.', '');
    };

    $$('#entrySeg button').forEach(b => b.onclick = () => applyEntry(Number(b.dataset.entry)));

    $('#toSchool').onclick = () => {
      const id = (idInput.value || '').trim();
      if (!id) { banner('warn', '가명 ID를 입력해 주세요.', '실명·학번은 넣지 마세요.'); return; }
      if (/\d{4,}/.test(id) && !/-/.test(id)) { banner('warn', '학번처럼 보이는 ID입니다.', '개인 식별이 가능한 값 대신 가명을 사용해 주세요.'); return; }
      if (!S.entryGrade) { banner('warn', '진입 학년을 선택해 주세요.', '2학년 진입과 3학년 진입은 설계 방식이 다릅니다.'); return; }
      if (!S.profile || S.profile.studentKey !== id) {
        S.profile = Store.get(id) || Store.blank(id);
        S.selected = new Set(S.profile.chosenSubjects || []);
        S.taken = new Set(S.profile.takenSubjects || []);
      }
      S.profile.entryGrade = S.entryGrade;
      persist('시작', `가명 ID ${id} · ${S.profile.entryGrade}학년 진입`);
      go('school');
    };
  }

  function applyEntry(g) {
    if (!g) return;
    S.entryGrade = g;
    if (S.profile) S.profile.entryGrade = g;
    $$('#entrySeg button').forEach(b => b.classList.toggle('on', Number(b.dataset.entry) === g));
    $('#entryDesc').textContent = g === 2
      ? '2·3학년 전체를 백지에서 설계합니다. 권장 이수경로를 처음부터 제안합니다.'
      : '2학년에 이수한 과목을 먼저 입력해 고정하고, 남은 3학년 선택지 안에서만 설계합니다.';
  }

  /* ===========================================================
     STEP 2 · 지역 → 학교
     =========================================================== */
  const SCHOOL_SCHEMA = { schoolId: '문자열', name: '문자열', tracks: '배열', region: '객체?' };

  async function initSchool() {
    S.regions = await loadJSON('regions.json', { schema: { sido: '배열' } });
    if (!S.regions) { $('#schoolNote').textContent = '지역 목록을 불러오지 못했습니다.'; return; }

    const sidoSel = $('#sidoSel'), sgSel = $('#sigunguSel'), schoolSel = $('#schoolSel');
    sidoSel.innerHTML = '';
    S.regions.sido.forEach((s, i) => sidoSel.appendChild(el('option', { value: String(i), text: s.name })));
    sidoSel.onchange = () => { fillSigungu(); fillSchools(); };
    sgSel.onchange = fillSchools;
    fillSigungu(); fillSchools();

    function fillSigungu() {
      const sido = S.regions.sido[Number(sidoSel.value) || 0];
      sgSel.innerHTML = '';
      (sido.sigungu || []).forEach((g, i) => sgSel.appendChild(el('option', { value: String(i), text: `${g.name} (${(g.schools || []).length}교)` })));
    }
    function fillSchools() {
      const sido = S.regions.sido[Number(sidoSel.value) || 0];
      const sg = (sido.sigungu || [])[Number(sgSel.value) || 0];
      schoolSel.innerHTML = '<option value="">— 선택 —</option>';
      ((sg && sg.schools) || []).forEach(s => schoolSel.appendChild(el('option', { value: s.path, text: `${s.name} · ${s.type}` })));
    }
    schoolSel.onchange = () => { if (schoolSel.value) selectSchoolByPath(schoolSel.value); };

    /* 학교명 자동완성 — 가벼운 인덱스만으로 동작 */
    const flat = [];
    S.regions.sido.forEach(sd => (sd.sigungu || []).forEach(sg => (sg.schools || []).forEach(sc =>
      flat.push({ ...sc, region: `${sd.name} ${sg.name}` }))));

    const input = $('#schoolSearch'), list = $('#acList');
    const draw = () => {
      const q = input.value.trim();
      list.innerHTML = '';
      if (!q) { list.classList.remove('on'); input.setAttribute('aria-expanded', 'false'); return; }
      const hits = flat.filter(s => matches(s.name, q)).slice(0, 12);
      if (!hits.length) {
        list.appendChild(el('button', { type: 'button', disabled: true, text: '일치하는 학교가 없습니다' }));
      }
      hits.forEach(s => {
        const b = el('button', { type: 'button', role: 'option' });
        b.appendChild(el('span', { text: s.name }));
        b.appendChild(el('span', { class: 'rg', text: s.region + ' · ' + s.type }));
        b.onclick = () => { input.value = s.name; list.classList.remove('on'); selectSchoolByPath(s.path); };
        list.appendChild(b);
      });
      list.classList.add('on'); input.setAttribute('aria-expanded', 'true');
    };
    input.addEventListener('input', debounce(draw, 120));
    input.addEventListener('blur', () => setTimeout(() => list.classList.remove('on'), 180));

    $('#toMajor').onclick = () => go('major');
  }

  async function selectSchoolByPath(path, wantTrack) {
    const data = await loadJSON(path, { schema: SCHOOL_SCHEMA });
    if (!data) { $('#schoolNote').textContent = '이 학교 데이터를 불러오지 못했습니다. 다른 학교를 선택하거나 관리자에게 알려 주세요.'; return; }
    S.school = data;
    if (S.profile) {
      S.profile.schoolId = data.schoolId; S.profile.schoolName = data.name; S.profile.schoolPath = path;
    }
    $('#hSchool').textContent = `🏫 ${data.name}` + (data.region ? ` · ${data.region.sido} ${data.region.sigungu}` : '');
    $('#schoolNote').innerHTML = `출처: ${esc(data.source || '미기재')} · 유형: <b>${esc(data.schoolType || '미기재')}</b>`;
    $('#schoolBody').hidden = false;
    $('#schoolSel').value = path;

    renderTracks(wantTrack);
    refreshSteps();
    persist('학교 선택', data.name);
    if (S.major) renderBuilder();
  }

  function renderTracks(wantTrack) {
    const seg = $('#trackSeg'); seg.innerHTML = '';
    const tracks = S.school.tracks || [];
    if (!tracks.length) { seg.appendChild(el('span', { class: 'note', text: '개설 과정 정보가 없습니다.' })); S.track = null; renderCurriculum(); return; }
    S.track = tracks.find(t => t.trackId === (wantTrack || (S.profile && S.profile.trackId))) || tracks[0];
    tracks.forEach(t => {
      const b = el('button', { type: 'button', text: t.label, class: t === S.track ? 'on' : '' });
      b.onclick = () => {
        S.track = t; if (S.profile) S.profile.trackId = t.trackId;
        S.selected.clear(); S.taken.clear();
        $$('#trackSeg button').forEach(x => x.classList.toggle('on', x === b));
        renderCurriculum(); renderBuilder(); persist('과정 변경', t.label);
      };
      seg.appendChild(b);
    });
    if (S.profile) S.profile.trackId = S.track.trackId;
    renderCurriculum();
  }

  function renderCurriculum() {
    const grid = $('#currGrid'); grid.innerHTML = '';
    if (!S.track) { grid.appendChild(el('p', { class: 'note', text: '편제 정보가 없습니다.' })); return; }
    (S.track.phases || []).forEach(p => {
      const col = el('div', { class: 'curr-col' });
      col.appendChild(el('h4', { text: p.label }));
      const bits = [];
      if (p.requiredPickCount) bits.push(`이 구간에서 ${p.requiredPickCount}과목 선택`);
      if (p.totalCredits) bits.push(`총 ${p.totalCredits}학점`);
      col.appendChild(el('span', { class: 'rule', text: bits.join(' · ') || '선택 규칙 미기재' }));
      const pool = el('div', { class: 'pool' });
      (p.options || []).forEach(o => {
        const chip = el('span', { class: 'pill cat-' + Core.normCat(o.category), title: `${o.area} · ${o.category} · ${o.credits || '?'}학점` });
        chip.style.borderLeft = '4px solid';
        chip.textContent = o.subject;
        pool.appendChild(chip);
      });
      if (!(p.options || []).length) pool.appendChild(el('span', { class: 'note', text: '개설 과목 데이터 미입력' }));
      col.appendChild(pool);
      grid.appendChild(col);
    });

    /* 전문교과 */
    const pro = $('#proSubj'); pro.innerHTML = '';
    const list = S.school.professionalSubjects || [];
    if (!list.length) {
      pro.appendChild(el('p', { class: 'note', html: '전문교과·심화과목 데이터 <span class="badge none">미입력</span> — 편제표에 표기된 명칭 그대로 넣어 주세요. (없으면 빈 배열)' }));
    } else {
      const tracks = [...new Set(list.map(x => x.track).filter(Boolean))];
      if (tracks.length) pro.appendChild(el('p', { class: 'note', style: 'margin-bottom:6px', text: '구분: ' + tracks.join(' / ') }));
      const pool = el('div', { class: 'chiprow' });
      list.forEach(x => pool.appendChild(el('span', { class: 'subchip', html:
        `${esc(x.name)} <span class="cat 전문교과">전문</span>${x.grade ? ` <span class="note" style="font-size:10.5px">${x.grade}학년</span>` : ''}` })));
      pro.appendChild(pool);
    }
    renderCreditPlan();
    renderAchievement();
    renderCompareBoard();
  }

  /* ---------- 학점배당표 편제 (공통과목 포함 전체 · 프로토타입에서 가져온 장점) ---------- */
  function renderCreditPlan() {
    const host = $('#creditPlan'); host.innerHTML = '';
    const cp = S.school && S.school.creditPlan;
    if (!cp || !cp.byGrade) {
      host.appendChild(el('p', { class: 'note', html: '이 학교의 <b>학점배당표</b> 데이터가 <span class="badge none">미입력</span>입니다. 위의 학년·학기별 선택과목 편제만 표시합니다.' }));
      return;
    }
    const box = el('div', { class: 'planbox' });
    const per = Object.entries(cp.perSemesterCount || {});
    box.appendChild(el('p', { class: 'note', html:
      `출처: ${esc(cp.source)} <span class="badge ok">공개자료</span>` +
      (per.length ? ` · 학기당 이수 과목 수 ${esc(per.map(([k, v]) => k + ':' + v).join(' / '))}` : '') }));
    ['1', '2', '3'].forEach(g => {
      const arr = (cp.byGrade || {})[g] || [];
      if (!arr.length) return;
      box.appendChild(el('div', { class: 'kyoh', style: 'margin-top:12px;font-size:13px;color:var(--accent)', text: g + '학년' }));
      const byArea = {};
      arr.forEach(x => { (byArea[x.area || '기타'] = byArea[x.area || '기타'] || []).push(x); });
      Object.entries(byArea).forEach(([area, list]) => {
        box.appendChild(el('div', { class: 'kyoh', text: area }));
        const row = el('div', { class: 'chiprow' });
        list.forEach(x => row.appendChild(el('span', { class: 'subchip', html:
          `${esc(x.subject)} <span class="cat ${esc(Core.normCat(x.category) === x.category ? x.category : x.category)}">${esc(x.category)}</span> <span class="note" style="font-size:10.5px">${esc(x.credits)}학점</span>` })));
        box.appendChild(row);
      });
    });
    if ((cp.pickNotes || []).length) {
      box.appendChild(el('div', { class: 'picknotes', html: '<b>선택(택N) 안내</b><br>' + cp.pickNotes.map(esc).join(' · ') }));
    }
    host.appendChild(box);
  }

  /* ---------- 참조 바스켓 비교 보드 ---------- */
  function cmpBadge(mine, ref) {
    if (mine == null || ref == null) return '<span class="badge none">미입력</span>';
    if (Math.abs(mine - ref) <= 1) return '<span class="badge b-eq">비슷</span>';
    return mine > ref ? '<span class="badge b-good">유리</span>' : '<span class="badge b-bad">불리</span>';
  }
  const bar100 = v => `<div class="bar"><i style="width:${Math.max(3, Math.min(100, Number(v) || 0))}%"></i></div>`;

  /* 학교명 표기가 달라도(영동고 ↔ 영동고등학교) 같은 학교인지 판정 */
  function sameSchool(a, b) {
    const norm = x => {
      let v = String(x || '').replace(/\(.*?\)/g, '').replace(/\s/g, '');
      let prev;
      do { prev = v; v = v.replace(/(등학교|학교|고)$/, ''); } while (v !== prev);   // 영동고등학교 → 영동고 → 영동
      return v;
    };
    const na = norm(a), nb = norm(b);
    return !!na && !!nb && na === nb;
  }

  function renderCompareBoard() {
    const host = $('#compareBoard'); host.innerHTML = '';
    const note = $('#basketNote');
    const rg = S.refGroups, m = S.school && S.school.metrics;
    if (!rg || !rg.groups || !rg.groups.length) {
      note.textContent = '';
      host.appendChild(el('p', { class: 'note', text: '참조 바스켓 데이터를 불러오지 못했습니다.' }));
      return;
    }
    const ilban = rg.groups.find(g => g.schoolType === '일반고') || rg.groups[0];
    const jasa = rg.groups.find(g => g.schoolType === '자사고') || rg.groups[rg.groups.length - 1];
    note.innerHTML = `— 자사고 ${jasa.members.length} + 일반고 ${ilban.members.length} <span class="badge b-real">실측</span>`;

    if (!m) {
      host.appendChild(el('p', { class: 'note', html: '내 학교의 교과 지표가 <span class="badge none">미입력</span>이라 비교할 수 없습니다. 없는 값은 만들어 넣지 않습니다.' }));
      return;
    }
    const t = el('table', { class: 'cmp' });
    t.innerHTML = '<thead><tr><th>비교축</th><th style="text-align:center">내 학교</th><th style="text-align:center">일반고 평균</th>' +
      '<th style="text-align:center">자사고 평균</th><th style="text-align:center">일반고 대비</th></tr></thead>';
    const tb = el('tbody');
    const areas = rg.coreAreas || ['국어', '수학', '영어', '과학', '사회'];

    areas.forEach(k => {
      const my = (m.byArea || {})[k] || {}, i = (ilban.byArea || {})[k] || {}, j = (jasa.byArea || {})[k] || {};
      const tr = el('tr');
      tr.appendChild(el('td', { html:
        `<b>${esc(k)}</b> <span class="badge b-real">실측</span>${bar100(my.avg)}` +
        `<div class="aoc">A비율 — 내 ${my.A ?? '—'}% · 일반고 ${i.A ?? '—'}% · 자사고 ${j.A ?? '—'}%</div>` }));
      tr.appendChild(el('td', { class: 'num', html: `<b>${my.avg ?? '—'}</b>` }));
      tr.appendChild(el('td', { class: 'num', text: i.avg ?? '—' }));
      tr.appendChild(el('td', { class: 'num', text: j.avg ?? '—' }));
      tr.appendChild(el('td', { class: 'num', html: cmpBadge(my.avg, i.avg) }));
      tb.appendChild(tr);
    });

    /* 5개 교과 종합 */
    const tr2 = el('tr');
    tr2.appendChild(el('td', { html: '<b>핵심 5교과 종합</b><div class="aoc">국·수·영·과·사 원점수 평균 / A비율</div>' }));
    [[m.coreAvg, m.coreArate], [ilban.coreAvg, ilban.coreArate], [jasa.coreAvg, jasa.coreArate]].forEach(([a, r], idx) => {
      tr2.appendChild(el('td', { class: 'num', html: idx === 0 ? `<b>${a ?? '—'}</b><div class="aoc">A ${r ?? '—'}%</div>` : `${a ?? '—'}<div class="aoc">A ${r ?? '—'}%</div>` }));
    });
    tr2.appendChild(el('td', { class: 'num', html: cmpBadge(m.coreAvg, ilban.coreAvg) }));
    tb.appendChild(tr2);

    /* 2~3학년 선택과목 편성 규모 */
    const tr3 = el('tr');
    tr3.appendChild(el('td', { html: '<b>2·3학년 선택과목 편성</b><div class="aoc">개설 선택과목 규모(학점 기준 지표). 클수록 진로 맞춤 설계의 폭이 넓다</div>' }));
    [m.elective23, ilban.elective23, jasa.elective23].forEach((v, idx) =>
      tr3.appendChild(el('td', { class: 'num', html: idx === 0 ? `<b>${v ?? '—'}</b>` : String(v ?? '—') })));
    tr3.appendChild(el('td', { class: 'num', html: cmpBadge(m.elective23, ilban.elective23) }));
    tb.appendChild(tr3);

    /* 전문교과 */
    const pro = (S.school.professionalSubjects || []);
    const tr4 = el('tr');
    tr4.appendChild(el('td', { html: '<b>전문교과·심화과목</b><div class="aoc">고급·실험·과제연구 등. 자사고·특목고와 격차가 가장 잘 드러나는 축</div>' }));
    tr4.appendChild(el('td', { class: 'num', html: pro.length ? `<b>${pro.length}개</b><div class="aoc">${esc(pro.slice(0, 3).map(p => p.name).join(', '))}${pro.length > 3 ? ' 등' : ''}</div>` : '<span class="badge none">미입력</span>' }));
    tr4.appendChild(el('td', { class: 'num', html: '<span class="badge none">미입력</span>' }));
    tr4.appendChild(el('td', { class: 'num', html: '<span class="badge none">미입력</span>' }));
    tr4.appendChild(el('td', { class: 'num', html: pro.length ? '<span class="badge b-real">연동</span>' : '<span class="badge none">미입력</span>' }));
    tb.appendChild(tr4);

    t.appendChild(tb);
    host.appendChild(t);

    host.appendChild(el('div', { class: 'members', html:
      `<b>일반고 참조군</b> ${esc(ilban.members.join(', '))}<br><b>자사고 참조군</b> ${esc(jasa.members.join(', '))}` }));

    /* 내 학교가 참조군에 포함된 경우 — 자기 자신과 비교하는 셈이므로 반드시 알린다 */
    const selfIn = [ilban, jasa].filter(g => (g.members || []).some(mm => sameSchool(mm, S.school.name)));
    if (selfIn.length) {
      host.appendChild(el('div', { class: 'banner warn', style: 'margin-top:10px', html:
        `<div><b>내 학교가 ${esc(selfIn.map(g => g.label).join('·'))}에 포함되어 있습니다.</b><br>` +
        `${esc(S.school.name)}은(는) 서울대 수시 다수 배출 참조군의 구성 학교입니다. ` +
        `따라서 위 "${esc(selfIn[0].label)}" 평균에는 내 학교 값이 이미 섞여 있어, 그 열과의 비교는 자기 자신과의 비교에 가깝습니다. ` +
        `상대 위치를 볼 때는 <b>다른 유형 참조군</b>(${esc(selfIn.some(g => g.schoolType === '자사고') ? '일반고' : '자사고')} 평균) 열을 기준으로 보세요.</div>` }));
    }

    host.appendChild(el('div', { class: 'cmp-note', html: cmpComment(m, ilban, jasa, pro) }));
  }

  /* 입학사정관 관점 한 줄 해석 — 불리해도 보완 전략을 함께 제시한다 */
  function cmpComment(m, ilban, jasa, pro) {
    const out = [];
    const weak = (S.refGroups.coreAreas || []).filter(k => {
      const my = (m.byArea || {})[k], i = (ilban.byArea || {})[k];
      return my && i && my.avg != null && i.avg != null && my.avg < i.avg - 1;
    });
    const strong = (S.refGroups.coreAreas || []).filter(k => {
      const my = (m.byArea || {})[k], i = (ilban.byArea || {})[k];
      return my && i && my.avg != null && i.avg != null && my.avg > i.avg + 1;
    });
    if (strong.length) out.push(`<b>강점 축</b> — ${esc(strong.join('·'))} 교과의 학교 평균이 일반고 참조군보다 높습니다. 이 교과에서 세특의 깊이를 만들면 학업역량이 가장 잘 드러납니다.`);
    if (weak.length) out.push(`<b>보완 축</b> — ${esc(weak.join('·'))} 교과 평균이 참조군보다 낮습니다. 이는 <u>학생 개인의 성취가 아니라 학교 평균</u>이며, 같은 등급이라도 학교 맥락에서 읽힌다는 뜻입니다. 해당 교과에서 도전적인 과목을 이수하고 탐구로 보완하세요.`);
    if (m.elective23 != null && jasa.elective23 != null && m.elective23 < jasa.elective23 * 0.6)
      out.push(`<b>선택과목 폭</b> — 자사고 참조군 대비 개설 선택과목 규모가 작습니다. 학교에 없는 과목은 공동교육과정·온라인학교로 이수하고, STEP 5에서 직접 추가해 설계에 반영하세요.`);
    if (!pro.length)
      out.push(`<b>전문교과</b> — 고급·실험·과제연구 과목 개설이 확인되지 않습니다. 미개설은 감점 요인이 아니지만, 이공·의약 계열이라면 개인 심화탐구나 R&E로 대체 근거를 만드는 편이 유리합니다.`);
    out.push(`※ 위 수치는 <b>학교 평균</b>입니다. 개인 성적이 아니며, 특정 대학의 합격 가능성을 뜻하지 않습니다.`);
    return out.join('<br><br>');
  }

  /* ---------- 과목 단위 학업성취 (학교알리미 공시 · 프로토타입에서 가져온 장점) ----------
     교과군 평균만 보여 주던 것을 과목별 카드로 바꿔, 어떤 과목이 어려운지 바로 보이게 한다. */
  let achGrade = null;
  const KYO_ORDER = ['국어', '수학', '영어', '사회', '과학', '국사'];
  const KYO_EXTRA = ['예체능', '제2외국어', '기타', '교양'];
  const kyoClass = k => [...KYO_ORDER, ...KYO_EXTRA].includes(k) ? k : '기타';

  function renderAchievement() {
    const tabs = $('#achGradeTabs'), body = $('#achBody');
    tabs.innerHTML = ''; body.innerHTML = '';
    const sa = S.school && S.school.subjectAchievement;
    const rows = (sa && sa.rows) || [];
    if (!rows.length) { renderAchievementLegacy(); return; }

    const grades = [...new Set(rows.map(r => r.grade))].sort();
    if (!grades.includes(achGrade)) achGrade = grades[grades.length - 1];
    grades.forEach(g => {
      const b = el('button', { type: 'button', text: g + '학년', class: g === achGrade ? 'on' : '' });
      b.onclick = () => { achGrade = g; renderAchievement(); };
      tabs.appendChild(b);
    });
    body.appendChild(el('p', { class: 'note', html:
      `출처: ${esc(sa.source || '미기재')} <span class="badge ok">공개데이터</span> · 숫자는 <b>과목별 원점수 평균</b>과 A·B 성취 비율이며 개인 성적이 아닙니다.` }));

    const gsubs = rows.filter(r => r.grade === achGrade);
    const split = el('div', { class: 'semSplit' });
    [['sem1', '1학기'], ['sem2', '2학기']].forEach(([key, label]) => {
      const side = el('div', { class: 'semSide' });
      side.appendChild(el('span', { class: 'semh', text: `${achGrade}학년 ${label}` }));
      const grid = el('div', { class: 'kyoGrid' });
      const groups = {};
      gsubs.forEach(r => { if (r[key]) (groups[kyoClass(r.areaGroup)] = groups[kyoClass(r.areaGroup)] || []).push(r); });
      const order = [...KYO_ORDER, ...KYO_EXTRA.filter(k => groups[k])];
      order.forEach(k => {
        const cell = el('div', { class: 'kyoCell' });
        cell.appendChild(el('div', { class: 'kyoh', text: k }));
        if (groups[k]) groups[k].forEach(r => {
          const v = r[key];
          const ach = [v.A != null ? 'A ' + v.A : '', v.B != null ? 'B ' + v.B : ''].filter(Boolean).join(' · ');
          cell.appendChild(el('div', { class: 'scard k-' + k, html:
            `<div class="cn">${esc(r.subject)}</div>` +
            `<div class="srow"><span class="cavg">${v.avg ?? '—'}</span>` +
            `<span class="cach">${esc(ach)}</span>` +
            `<span class="ccr">${r.credits ?? '—'}학점</span></div>` }));
        });
        else cell.appendChild(el('div', { class: 'emptyk', text: '—' }));
        grid.appendChild(cell);
      });
      side.appendChild(grid);
      split.appendChild(side);
    });
    body.appendChild(split);

    /* 교과군 성취도 분포(A~E)는 별도로 접어서 제공 */
    const legacy = S.school.achievement;
    if (legacy && legacy.byGrade && legacy.byGrade[achGrade + '학년']) {
      const det = el('details', { style: 'margin-top:6px' });
      det.appendChild(el('summary', { class: 'note', style: 'cursor:pointer', text: '교과군 성취도 분포(A→E) 자세히 보기' }));
      const wrap = el('div');
      const sems = legacy.byGrade[achGrade + '학년'];
      Object.keys(sems).sort().forEach(sem => {
        const t = el('table', { class: 'ach-table' });
        t.innerHTML = `<thead><tr><th>${esc(achGrade)}학년 ${esc(sem)} 교과군</th><th>이수단위</th><th>원점수평균</th><th>성취도 분포 (A→E)</th></tr></thead>`;
        const tb = el('tbody');
        Object.entries(sems[sem]).forEach(([area, v]) => {
          const tr = el('tr');
          tr.appendChild(el('td', { text: area }));
          tr.appendChild(el('td', { text: v.credits != null ? String(v.credits) : '-' }));
          tr.appendChild(el('td', { text: v.avgScore != null ? v.avgScore.toFixed(1) : '-' }));
          const td = el('td'), bar = el('div', { class: 'ach-bar' });
          ['A', 'B', 'C', 'D', 'E'].forEach((k, i) => {
            const pct = Number((v.dist || {})[k]) || 0;
            if (pct <= 0) return;
            const seg = el('span', { class: 'seg s' + i, text: pct >= 8 ? k + ' ' + pct.toFixed(0) + '%' : '' });
            seg.style.width = pct + '%';
            bar.appendChild(seg);
          });
          td.appendChild(bar); tr.appendChild(td); tb.appendChild(tr);
        });
        t.appendChild(tb); wrap.appendChild(t);
      });
      det.appendChild(wrap);
      body.appendChild(det);
    }
  }

  /* 과목 단위 데이터가 없는 학교용 대체 화면 */
  function renderAchievementLegacy() {
    const tabs = $('#achGradeTabs'), body = $('#achBody');
    const ach = S.school && S.school.achievement;
    if (!ach || !ach.byGrade) {
      body.appendChild(el('p', { class: 'note', html: '이 학교의 학업성취 데이터가 <span class="badge none">미입력</span> 상태입니다. 공개 데이터가 아닌 값은 임의로 채우지 않습니다.' }));
      return;
    }
    const grades = Object.keys(ach.byGrade);
    if (!grades.includes(achGrade)) achGrade = grades[grades.length - 1];
    grades.forEach(g => {
      const b = el('button', { type: 'button', text: g, class: g === achGrade ? 'on' : '' });
      b.onclick = () => { achGrade = g; renderAchievement(); };
      tabs.appendChild(b);
    });
    body.appendChild(el('p', { class: 'note', html: `출처: ${esc(ach.source || '미기재')} <span class="badge ok">공개데이터</span> · 교과군 평균입니다.` }));
    const sems = ach.byGrade[achGrade] || {};
    Object.keys(sems).sort().forEach(sem => {
      const t = el('table', { class: 'ach-table' });
      t.innerHTML = `<thead><tr><th>${esc(sem)} 교과군</th><th>이수단위</th><th>원점수평균</th><th>성취도 분포 (A→E)</th></tr></thead>`;
      const tb = el('tbody');
      Object.entries(sems[sem]).forEach(([area, v]) => {
        const tr = el('tr');
        tr.appendChild(el('td', { text: area }));
        tr.appendChild(el('td', { text: v.credits != null ? String(v.credits) : '-' }));
        tr.appendChild(el('td', { text: v.avgScore != null ? v.avgScore.toFixed(1) : '-' }));
        const td = el('td'), bar = el('div', { class: 'ach-bar' });
        ['A', 'B', 'C', 'D', 'E'].forEach((k, i) => {
          const pct = Number((v.dist || {})[k]) || 0;
          if (pct <= 0) return;
          const seg = el('span', { class: 'seg s' + i, text: pct >= 8 ? k + ' ' + pct.toFixed(0) + '%' : '' });
          seg.style.width = pct + '%';
          bar.appendChild(seg);
        });
        td.appendChild(bar); tr.appendChild(td); tb.appendChild(tr);
      });
      t.appendChild(tb); body.appendChild(t);
    });
  }

  /* ===========================================================
     STEP 4 · 계열 · 학과
     =========================================================== */
  async function initMajor() {
    S.majorIndex = await loadJSON('majors/index.json', { schema: { majors: '배열' } });
    S.programIndex = await loadJSON('programs/index.json', { schema: { programs: '배열' } });
    const host = $('#fields'); host.innerHTML = '';
    if (!S.majorIndex) { host.appendChild(el('p', { class: 'note', text: '계열 목록을 불러오지 못했습니다.' })); return; }
    S.majorIndex.majors.forEach(m => {
      const d = el('div', { class: 'field', tabindex: '0', role: 'button', dataset: { id: m.majorId } });
      d.appendChild(el('div', { class: 'bar' }));
      d.appendChild(el('h3', { text: m.name }));
      d.appendChild(el('p', { text: m.desc || '' }));
      d.onclick = () => selectMajor(m.majorId);
      d.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMajor(m.majorId); } };
      host.appendChild(d);
    });
    $('#toDesign').onclick = () => {
      if (!S.major) { banner('warn', '희망 계열을 먼저 선택해 주세요.', ''); return; }
      go('design');
    };
  }

  async function selectMajor(id) {
    const entry = (S.majorIndex && S.majorIndex.majors || []).find(m => m.majorId === id);
    if (!entry) { banner('info', '준비 중인 계열입니다.', '해당 계열 JSON이 data/majors/ 에 아직 없습니다.'); return; }
    const data = await loadJSON(entry.path, { schema: { majorId: '문자열', name: '문자열', recommendedSubjects: '배열' } });
    if (!data) return;
    S.major = data;
    if (S.profile) S.profile.majorId = id;
    $$('#fields .field').forEach(f => {
      f.classList.add('f-' + f.dataset.id);          // 계열별 색상 띠
      f.classList.toggle('on', f.dataset.id === id);
    });
    // 계열이 바뀌면 그 계열에 속하지 않는 학과 선택은 해제한다
    if (S.program && S.program.majorId !== id) S.program = null;
    renderPrograms(); renderRoad(); renderGuidance(); renderGapBanners(); renderBuilder();
    refreshSteps();
    persist('계열 선택', data.name);
    // 계열 없이 먼저 진단했다면, 계열 정보를 반영해 다시 진단할 수 있게 안내
    if (S.diagnosis && !S.diagnosis.majorApplied) {
      banner('info', '희망 계열이 정해졌습니다.', 'STEP 3에서 [진단 실행]을 한 번 더 누르면 전공 적합성까지 반영해 다시 진단합니다.');
      S.diagnosis.majorApplied = true;
    }
  }

  /* ---------- 세부 학과 (프로토타입에서 가져온 장점) ---------- */
  function renderPrograms() {
    const host = $('#progGrid'); host.innerHTML = '';
    const list = ((S.programIndex && S.programIndex.programs) || []).filter(p => !S.major || p.majorId === S.major.majorId);
    if (!S.major) { host.appendChild(el('p', { class: 'note', text: '계열을 먼저 선택하세요.' })); return; }
    if (!list.length) {
      host.appendChild(el('p', { class: 'note', html:
        `<b>${esc(S.major.name)}</b> 계열의 학과별 탐구 주제 풀은 아직 준비되지 않았습니다. 계열 단위 설계로 진행되며, 과목별 탐구 자료는 그대로 사용할 수 있습니다.` }));
    }
    list.forEach(p => {
      const c = el('div', { class: 'progcard' + (S.program && S.program.programId === p.programId ? ' on' : ''), tabindex: '0', role: 'button' });
      c.appendChild(el('div', { class: 'f', text: p.field || '' }));
      c.appendChild(el('div', { class: 'm', text: p.name }));
      c.appendChild(el('div', { class: 'c', text: `전용 탐구 주제 ${p.topicCount}개` }));
      const pick = () => selectProgram(p.programId);
      c.onclick = pick;
      c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
      host.appendChild(c);
    });
    /* 학과 데이터가 아직 없는 나머지는 '준비 중'으로 정직하게 표시 */
    (S.major.departments || []).filter(d => !list.some(p => p.name === d)).slice(0, 8).forEach(d => {
      const c = el('div', { class: 'progcard soon' });
      c.appendChild(el('div', { class: 'f', text: S.major.field || '' }));
      c.appendChild(el('div', { class: 'm', text: d }));
      c.appendChild(el('div', { class: 'c', text: '전용 주제 풀 준비 중' }));
      host.appendChild(c);
    });
  }

  async function selectProgram(id) {
    if (S.program && S.program.programId === id) {   // 다시 누르면 선택 해제
      S.program = null; renderPrograms(); renderBuilder(); persist('학과 선택 해제'); return;
    }
    const entry = ((S.programIndex && S.programIndex.programs) || []).find(p => p.programId === id);
    if (!entry) return;
    const data = await loadJSON(entry.path, { schema: { programId: '문자열', name: '문자열', topicPools: '객체' } });
    if (!data) return;
    S.program = data;
    renderPrograms(); renderBuilder();
    persist('학과 선택', data.name);
  }

  function renderRoad() {
    const host = $('#road'); host.innerHTML = '';
    const road = (S.major && S.major.roadmap) || {};
    const keys = Object.keys(road);
    if (!keys.length) { host.appendChild(el('p', { class: 'note', text: '로드맵 데이터가 없습니다.' })); return; }
    keys.forEach(k => {
      const t = el('div', { class: 'term' });
      t.appendChild(el('h4', { text: k.replace('-', '학년 ') + '학기' }));
      (road[k] || []).forEach(s => t.appendChild(el('span', { class: 'pill rec', text: s })));
      host.appendChild(t);
    });
  }
  function renderGuidance() {
    const g = (S.major && S.major.guidance) || {};
    $('#uniLead').textContent = g.lead || '';
    const ul = $('#uniList'); ul.innerHTML = '';
    (g.notes || []).forEach(n => ul.appendChild(el('li', { html: n })));
  }

  /* ===========================================================
     STEP 4 · 과목 설계
     =========================================================== */
  function phasesInScope() {
    if (!S.track) return { design: [], taken: [] };
    const g = (S.profile && S.profile.entryGrade) || 2;
    const ph = S.track.phases || [];
    // grade가 null인 구간(학년 공통·학교지정 등)은 어느 진입 학년에서도 설계 대상에 포함한다
    if (g === 3) return { design: ph.filter(p => p.grade !== 2), taken: ph.filter(p => p.grade === 2) };
    return { design: ph, taken: [] };
  }

  /* 권장 과목 문자열은 "미적분II 또는 기하", "미적분Ⅰ(공통선택)" 같은 형태 → 정규화 비교 */
  /* opts.selectableOnly=true 이면 "(공통선택)"처럼 전교생 공통 이수 과목은 제외한다.
     이 과목들은 학기별 선택 대상이 아니라서 '미개설/미선택'으로 잡히면 오해를 부른다. */
  function recTokens(major, opts) {
    const out = [];
    (major && major.recommendedSubjects || []).forEach(r => {
      if (opts && opts.selectableOnly && /공통/.test(r)) return;
      r.replace(/\([^)]*\)/g, '').split(/\s*또는\s*|\s*\/\s*/).forEach(x => {
        const t = x.trim(); if (t) out.push(t);
      });
    });
    return [...new Set(out)];
  }
  /* 선택 대상 목록에서 아직 확보되지 않은 권장 과목 */
  function missingRec() {
    const toks = recTokens(S.major, { selectableOnly: true });
    const all = new Set([...S.selected, ...S.taken]);
    return toks.filter(t => ![...all].some(s => s === t || s.includes(t) || t.includes(s)));
  }
  function isRecommended(subject, major) {
    // 학과를 골랐으면 학과의 권장 키워드를 우선 적용한다
    if (S.program && (S.program.recommendKeywords || []).some(k => subject.includes(k))) return true;
    return recTokens(major).some(t => subject === t || subject.includes(t) || t.includes(subject));
  }

  /* ---------- 진단 보완점(GAP) → 설계 반영 (프로토타입에서 가져온 장점) ---------- */
  function activeGaps() { return (S.diagnosis && S.diagnosis.gaps) || []; }

  function renderGapBanners() {
    const gaps = activeGaps();
    const chips = gaps.map(g => `<span class="gapchip" title="${esc(g.why || '')}">${esc(g.label)}</span>`).join('');
    const hintMajor = $('#gapHintMajor'), banner2 = $('#gapBanner');
    if (hintMajor) hintMajor.innerHTML = gaps.length
      ? `<div class="gapbanner"><b>학생부 진단 보완점</b> — 아래 계열·학과 설계에 이 보완점이 반영됩니다.<div>${chips}</div></div>`
      : `<div class="note">③ 생기부 진단을 먼저 하면, 진단에서 나온 보완점이 이 설계에 반영됩니다. (진단 없이도 설계는 가능합니다.)</div>`;
    if (banner2) banner2.innerHTML = gaps.length
      ? `<div class="gapbanner"><b>보완점 반영 중</b> — <span class="tag-gap">보완</span> 표시가 붙은 과목은 진단에서 부족했던 부분을 메워 줍니다. 탐구 주제도 해당 유형을 우선 보여 줍니다.<div>${chips}</div></div>`
      : '';
  }

  /* 이 과목이 어떤 보완점에 기여하는지 */
  function gapTagsFor(subject) {
    const gaps = activeGaps();
    if (!gaps.length) return [];
    const out = [];
    for (const g of gaps) {
      if (g.kind === 'data' && /통계|확률|미적분|수학|데이터|정보|인공지능|탐구|실험|과제/.test(subject)) out.push('정량');
      if (g.kind === 'cat' && /고급|심화|Ⅱ|전문|실험|과제 연구|과제 탐구|융합|세포|물질대사|반응의 세계|전자기|양자|유전|경제|정치|법|사회문제/.test(subject)) out.push('심화');
      if (g.kind === 'lead' && /탐구|토론|발표|프로젝트|과제 연구|사회문제|융합/.test(subject)) out.push('발표');
      if (g.kind === 'read' && /독서|문학|작문|언어|주제 탐구/.test(subject)) out.push('독서');
    }
    return [...new Set(out)].slice(0, 2);   // 칩이 지저분해지지 않게 최대 2개만
  }

  function renderBuilder() {
    const box = $('#takenBox'), pool = $('#takenPool'), builder = $('#builder');
    builder.innerHTML = ''; pool.innerHTML = '';
    if (!S.track) { builder.appendChild(el('p', { class: 'note', text: '학교와 과정을 먼저 선택해 주세요.' })); return; }
    const { design, taken } = phasesInScope();

    /* 3학년 진입 — 2학년 이수과목 고정 */
    box.hidden = taken.length === 0 || (S.profile && S.profile.takenLocked);
    if (taken.length && !(S.profile && S.profile.takenLocked)) {
      taken.forEach(p => {
        const g = el('div', { class: 'pool-group' });
        g.appendChild(el('div', { class: 'gh', html: `<span>${esc(p.label)}</span><span class="rule">${p.requiredPickCount ? p.requiredPickCount + '과목' : ''}</span>` }));
        const pl = el('div', { class: 'pool' });
        (p.options || []).forEach(o => {
          const b = el('span', { class: 'opt' + (S.taken.has(o.subject) ? ' sel' : ''), text: o.subject });
          b.onclick = () => { S.taken.has(o.subject) ? S.taken.delete(o.subject) : S.taken.add(o.subject); renderBuilder(); };
          pl.appendChild(b);
        });
        g.appendChild(pl); pool.appendChild(g);
      });
      $('#lockTaken').onclick = () => {
        if (!S.taken.size) { banner('warn', '이수한 과목을 하나 이상 체크해 주세요.', '2학년 이수 이력이 있어야 3학년 설계를 정확히 할 수 있습니다.'); return; }
        S.profile.takenLocked = true;
        persist('2학년 이수과목 확정', [...S.taken].join(', '));
        renderBuilder();
        banner('info', '2학년 이수과목을 고정했습니다.', '이 이력을 전제로 3학년 설계를 진행합니다.');
      };
    }

    /* 고정된 이수과목 표시 */
    if (S.profile && S.profile.takenLocked && S.taken.size) {
      const g = el('div', { class: 'pool-group' });
      g.appendChild(el('div', { class: 'gh', html: '<span>2학년 이수 완료 (고정)</span><span class="rule">변경하려면 아래 [이수과목 다시 입력]</span>' }));
      const pl = el('div', { class: 'pool' });
      [...S.taken].forEach(s => pl.appendChild(el('span', { class: 'opt locked', text: s })));
      g.appendChild(pl);
      const btn = el('button', { class: 'btn ghost sm', type: 'button', text: '이수과목 다시 입력', style: 'margin-top:8px' });
      btn.onclick = () => { S.profile.takenLocked = false; renderBuilder(); };
      g.appendChild(btn);
      builder.appendChild(g);
    }

    /* 설계 대상 학기 풀 */
    design.forEach(p => {
      const g = el('div', { class: 'pool-group' });
      const picked = (p.options || []).filter(o => S.selected.has(o.subject)).length;
      const rule = p.requiredPickCount ? `${picked} / ${p.requiredPickCount}과목 선택` : `${picked}과목 선택`;
      g.appendChild(el('div', { class: 'gh', html: `<span>${esc(p.label)}</span><span class="rule">${esc(rule)}</span>` }));
      const pl = el('div', { class: 'pool' });
      (p.options || []).forEach(o => {
        const rec = S.major && isRecommended(o.subject, S.major);
        const gt = gapTagsFor(o.subject);
        const b = el('span', {
          class: 'opt' + (S.selected.has(o.subject) ? ' sel' : '') + (rec ? ' rec' : '') + (gt.length ? ' gapfill' : ''),
          title: `${o.area} · ${o.category} · ${o.credits || 3}학점` + (gt.length ? ` · 보완: ${gt.join('·')}` : ''),
        });
        b.appendChild(document.createTextNode(o.subject));
        b.appendChild(el('span', { class: 'tag', text: o.category.replace('선택', '').replace('과목', '') }));
        gt.forEach(t => b.appendChild(el('span', { class: 'tag-gap', text: '보완:' + t })));
        if (hasTopics(o.subject)) {
          const r = el('span', { class: 'rbtn', title: '탐구 주제·설계 보기', text: '🔎' });
          r.onclick = e => { e.stopPropagation(); openResearch(o.subject); };
          b.appendChild(r);
        }
        b.onclick = () => {
          S.selected.has(o.subject) ? S.selected.delete(o.subject) : S.selected.add(o.subject);
          renderBuilder(); persist(null);
        };
        pl.appendChild(b);
      });
      if (!(p.options || []).length) pl.appendChild(el('span', { class: 'note', text: '개설 과목 데이터 미입력' }));
      g.appendChild(pl);
      builder.appendChild(g);
    });

    /* 직접 추가한 과목 (공동교육과정·전문교과·온라인학교) */
    if (S.manual.length) {
      const g = el('div', { class: 'pool-group' });
      g.appendChild(el('div', { class: 'gh', html: '<span>직접 추가한 과목</span><span class="rule">공동교육과정·전문교과·온라인학교</span>' }));
      const pl = el('div', { class: 'pool' });
      S.manual.forEach((name, i) => {
        const b = el('span', { class: 'opt' + (S.selected.has(name) ? ' sel' : '') });
        b.appendChild(document.createTextNode(name));
        b.appendChild(el('span', { class: 'tag-ext', text: '외부·전문' }));
        const x = el('span', { class: 'rbtn', title: '삭제', text: '✕' });
        x.onclick = e => {
          e.stopPropagation();
          S.manual.splice(i, 1); S.selected.delete(name);
          renderBuilder(); persist('직접 추가 과목 삭제', name);
        };
        b.appendChild(x);
        b.onclick = () => {
          S.selected.has(name) ? S.selected.delete(name) : S.selected.add(name);
          renderBuilder(); persist(null);
        };
        pl.appendChild(b);
      });
      g.appendChild(pl);
      builder.appendChild(g);
    }

    $('#designCtx').textContent = '· ' + [
      S.program ? S.program.name : (S.major ? S.major.name : ''),
      S.school ? S.school.name : '',
      ((S.profile && S.profile.entryGrade) || 2) + '학년 진입',
      (S.taken.size ? '2학년 이수 ' + S.taken.size + '과목 고정' : ''),
    ].filter(Boolean).join(' · ');

    renderGapBanners();
    renderSummary();
  }

  function creditOf(subject) {
    let c = 3;
    (S.track.phases || []).forEach(p => (p.options || []).forEach(o => { if (o.subject === subject && o.credits) c = o.credits; }));
    return c;
  }

  function renderSummary() {
    const { design } = phasesInScope();
    const target = design.reduce((s, p) => s + (p.totalCredits || 0), 0);
    const credits = [...S.selected].reduce((s, x) => s + creditOf(x), 0);
    $('#credits').textContent = credits;
    $('#credBar').style.width = target ? Math.min(100, credits / target * 100) + '%' : '0%';
    $('#credTarget').textContent = target ? `권장 ${target}학점 기준` : '학점 기준 데이터 미입력';

    /* 교과군 분포 */
    const byArea = {};
    (S.track.phases || []).forEach(p => (p.options || []).forEach(o => {
      if (S.selected.has(o.subject)) byArea[o.area] = (byArea[o.area] || 0) + 1;
    }));
    const m = $('#match'); m.innerHTML = '';
    Object.entries(byArea).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
      m.appendChild(el('div', { class: 'mrow', html: `<span>${esc(k)}</span><b>${v}과목</b>` })));
    if (!Object.keys(byArea).length) m.appendChild(el('p', { class: 'note', text: '아직 선택한 과목이 없습니다.' }));

    /* 권장 일치도 */
    const toks = recTokens(S.major);
    const all = new Set([...S.selected, ...S.taken]);
    const hit = toks.filter(t => [...all].some(s => s === t || s.includes(t) || t.includes(s)));
    const uniqHit = [...new Set(hit)];
    $('#recMatch').innerHTML = S.major
      ? `★ 권장 과목 일치 <b class="${uniqHit.length >= toks.length * 0.5 ? 'ok' : 'warnc'}">${uniqHit.length} / ${toks.length}</b>`
      : '계열을 선택하면 권장 과목과의 일치도가 표시됩니다.';

    const sl = $('#selList'); sl.innerHTML = '';
    [...S.taken].forEach(s => sl.appendChild(el('span', { text: '🔒 ' + s })));
    [...S.selected].forEach(s => sl.appendChild(el('span', { text: s })));

    renderRedesign();
  }

  /* 6.6 비권장 과목 선택 시 재설계 — 선택을 부정하지 않고 최적화 */
  function renderRedesign() {
    const box = $('#redesignBox'); box.innerHTML = '';
    if (!S.major || !S.selected.size) return;
    const off = [...S.selected].filter(s => !isRecommended(s, S.major));
    const missing = missingRec();

    if (!off.length && !missing.length) {
      box.appendChild(el('div', { class: 'redesign', style: 'border-color:var(--ok);background:rgba(52,211,153,.08)', html:
        '<h4 style="color:var(--ok)">권장 경로와 일치합니다</h4><p class="note">위계와 계열 연계가 모두 확보된 조합입니다. 이제 과목별 🔎 버튼에서 탐구 주제를 골라 세특 서사를 만드세요.</p>' }));
      return;
    }
    const d = el('div', { class: 'redesign' });
    d.appendChild(el('h4', { text: '이 조합 기준으로 다시 설계하기' }));
    const ul = el('ul');
    if (off.length) {
      ul.appendChild(el('li', { html: `<b>권장 목록 밖 선택:</b> ${esc(off.join(', '))} — 선택 자체는 문제가 아닙니다. 다만 이 과목들이 <b>${esc(S.major.name)}</b> 진로와 어떻게 연결되는지를 탐구 주제로 직접 보여 줘야 합니다.` }));
      off.forEach(s => {
        const r = S.research && S.research.subjects && S.research.subjects[s];
        if (r && r.topics && r.topics.length) {
          ul.appendChild(el('li', { html: `<b>${esc(s)}</b> 진로 연결 탐구 예시: ${esc(r.topics[0])} <span class="note">(🔎 버튼에서 설계·도서·논문 확인)</span>` }));
        } else {
          ul.appendChild(el('li', { html: `<b>${esc(s)}</b> — 사전 검증된 탐구자료가 아직 없습니다. 이 과목의 성취기준 중 ${esc((S.major.diagnosisKeywords || []).slice(0, 3).join('·'))} 와 맞닿는 지점을 잡아 주제를 좁혀 보세요.` }));
        }
      });
    }
    if (missing.length) {
      ul.appendChild(el('li', { html: `<b>아직 비어 있는 권장 과목:</b> ${esc(missing.slice(0, 10).join(', '))}${missing.length > 10 ? ' 외' : ''}` }));
      const offered = new Set();
      (S.track.phases || []).forEach(p => (p.options || []).forEach(o => offered.add(o.subject)));
      const notOffered = missing.filter(mm => ![...offered].some(o => o.includes(mm) || mm.includes(o)));
      if (notOffered.length) ul.appendChild(el('li', { html: `이 중 <b>학교에 미개설</b>: ${esc(notOffered.slice(0, 8).join(', '))} — 미개설은 감점 요인이 아닙니다. 동아리·개인 심화탐구·외부 프로그램으로 대체 근거를 만드는 편이 평가에서 유리합니다.` }));
    }
    if ((S.profile && S.profile.entryGrade) === 3 && S.taken.size) {
      ul.appendChild(el('li', { html: `<b>3학년 설계 원칙:</b> 2학년에 이수한 ${esc([...S.taken].slice(0, 5).join(', '))} 와 <b>연속성</b>이 보이는 3학년 과목을 우선하세요. 선수과목 없이 상위 진로선택으로 건너뛰면 세특에서 깊이가 얕게 읽힙니다.` }));
    }
    d.appendChild(ul);
    box.appendChild(d);
  }

  /* ===========================================================
     구조화된 탐구 주제 (학과 주제 풀 + 과목 자료) — 프로토타입에서 가져온 장점
     주제마다 배경·핵심질문·방법·산출물·세특연결·확장을 갖고, 로테이션할 수 있다.
     =========================================================== */
  function hasTopics(subject) {
    if (S.research && S.research.subjects && S.research.subjects[subject]) return true;
    return !!(S.program && poolFor(subject).length);
  }

  /* 과목 → 학과 탐구 영역. 어느 영역과도 안 맞으면 null (엉뚱한 주제를 억지로 붙이지 않는다) */
  function areaOf(subject) {
    const map = (S.program && S.program.areaMap) || {};
    for (const [area, keys] of Object.entries(map)) {
      if ((keys || []).some(k => subject.includes(k))) return area;
    }
    return null;
  }
  function poolFor(subject) {
    if (!S.program) return [];
    const area = areaOf(subject);
    if (!area) return [];                                  // 학과와 접점이 없는 과목
    return (S.program.topicPools || {})[area] || [];
  }

  /* used: 이미 다른 과목에 배정된 주제 제목 — 같은 주제가 여러 과목에 중복되지 않게 한다.
     보완점이 'data'면 정량 성격(tags:data) 주제를 우선한다. */
  function topicFor(subject, used) {
    let pool = poolFor(subject);
    if (!pool.length) return null;
    const area = areaOf(subject);
    // 이 영역 주제가 모두 소진됐거나 사용자가 '다른 주제'를 눌렀으면 인접 영역까지 넓힌다
    const exhausted = used && pool.every(t => used.has(t.title));
    if (exhausted || S.topicIdx[subject] > 0) {
      const extra = Object.entries(S.program.topicPools || {})
        .filter(([a]) => a !== area).flatMap(([, arr]) => arr)
        .filter(t => !(used && used.has(t.title)) && !pool.includes(t));
      if (extra.length) pool = pool.concat(extra);
    }
    let order = pool.slice();
    const wantData = activeGaps().some(g => g.kind === 'data');
    if (wantData && !(S.topicIdx[subject] > 0)) {
      const di = order.findIndex(t => (t.tags || []).includes('data') && !(used && used.has(t.title)));
      if (di > 0) order = [order[di], ...order.slice(0, di), ...order.slice(di + 1)];
    }
    let i = (S.topicIdx[subject] || 0) % order.length;
    if (used) {                                            // 이미 쓰인 주제는 건너뛴다
      for (let n = 0; n < order.length; n++) {
        const cand = order[(i + n) % order.length];
        if (!used.has(cand.title)) { i = (i + n) % order.length; break; }
      }
    }
    const chosen = order[i];
    let chosenArea = area;
    Object.entries((S.program && S.program.topicPools) || {}).forEach(([a, arr]) => {
      if ((arr || []).some(t => t.title === chosen.title)) chosenArea = a;
    });
    return { topic: chosen, idx: i, len: order.length, area: chosenArea };
  }

  function topicCard(subject, used) {
    const tf = topicFor(subject, used);
    if (tf && used) used.add(tf.topic.title);
    if (!tf) {
      const r = S.research && S.research.subjects && S.research.subjects[subject];
      if (!r) {
        const why = S.program
          ? `${S.program.name}의 탐구 영역(${Object.keys(S.program.topicPools || {}).join('·')})과 직접 이어지는 과목이 아니고, 이 과목의 사전 검증 탐구자료도 아직 없습니다.`
          : '이 과목의 사전 검증 탐구자료가 아직 없습니다.';
        return el('div', { class: 'note', style: 'margin-top:10px', html:
          `<b>${esc(subject)}</b> — ${esc(why)} 없는 자료를 지어내지 않기 위해 비워 둡니다. ` +
          `이 과목은 진로와의 접점을 직접 잡아(예: 이 과목의 성취기준 중 진로 키워드와 맞닿는 지점) 주제를 좁혀 보세요.` });
      }
      const box = el('div', { class: 'inq' });
      box.appendChild(el('div', { class: 'htitle', html: `<h4>🔬 ${esc(subject)} — ${esc(r.subtitle || '탐구 자료')}</h4>` }));
      (r.topics || []).forEach(t => box.appendChild(el('div', { class: 'topic', text: t })));
      if (r.design) box.appendChild(el('div', { class: 'fld2', html: r.design }));
      const btn = el('button', { class: 'btn ghost sm', type: 'button', text: '도서·논문 보기', style: 'margin-top:10px' });
      btn.onclick = () => openResearch(subject);
      box.appendChild(btn);
      return box;
    }
    const t = tf.topic;
    const box = el('div', { class: 'inq' });
    const head = el('div', { class: 'htitle' });
    head.appendChild(el('h4', { text: `🔬 ${subject} — ${t.title}` }));
    const re = el('button', { class: 'btn ghost sm regen', type: 'button', text: `🔄 다른 주제 (${tf.idx + 1}/${tf.len})` });
    re.onclick = () => {
      S.topicIdx[subject] = (S.topicIdx[subject] || 0) + 1;
      renderDesignOut(); persist(null);
    };
    head.appendChild(re);
    box.appendChild(head);
    const flags = [];
    if ((t.tags || []).includes('data') && activeGaps().some(g => g.kind === 'data'))
      flags.push('<span class="tag-gap">보완:정량 데이터 근거</span>');
    if (tf.area && areaOf(subject) && tf.area !== areaOf(subject))
      flags.push(`<span class="tag-ext">${esc(tf.area)} 영역에서 가져온 주제</span>`);
    if (flags.length) box.appendChild(el('div', { html: flags.join(' '), style: 'margin-top:6px' }));
    if (tf.area && areaOf(subject) && tf.area !== areaOf(subject))
      box.appendChild(el('div', { class: 'note', style: 'margin-top:6px;font-size:12px',
        text: `이 과목의 탐구 영역(${areaOf(subject)}) 주제가 이미 다른 과목에 배정되어, ${tf.area} 영역 주제를 가져왔습니다. 과목과의 연결 고리는 세특에서 직접 만들어야 합니다.` }));
    box.appendChild(el('div', { class: 'fld2', html: `<b>배경·동기</b> ${esc(t.background)}` }));
    box.appendChild(el('div', { class: 'fld2', html: `<b>핵심 질문</b> ${esc(t.question)}` }));
    const m = el('div', { class: 'fld2', html: '<b>탐구 방법</b>' });
    const ol = el('ol');
    (t.method || []).forEach(x => ol.appendChild(el('li', { text: x })));
    m.appendChild(ol);
    box.appendChild(m);
    box.appendChild(el('div', { class: 'fld2', html: `<b>예상 산출물</b> ${esc(t.output)}` }));
    box.appendChild(el('div', { class: 'fld2', html: `<b>세특 연결</b> ${esc(t.setuk)}` }));
    box.appendChild(el('div', { class: 'fld2', html: `<b>심화·확장</b> ${esc(t.extend)}` }));
    return box;
  }

  function renderDesignOut() {
    const host = $('#designOut'); host.innerHTML = '';
    const picked = [...S.selected];
    if (!picked.length) { host.appendChild(el('p', { class: 'note', text: '과목을 하나 이상 선택한 뒤 [탐구 설계 생성]을 눌러 주세요.' })); return; }

    const gaps = activeGaps();
    if (gaps.length) host.appendChild(el('div', { class: 'gapbanner', html:
      `<b>이 설계는 진단 보완점을 반영했습니다</b><br>${gaps.map(g => esc(g.label)).join(' · ')} — 탐구 방법에 데이터 분석을, 산출물에 발표를 우선 포함했습니다.` }));

    const off = picked.filter(s => S.major && !isRecommended(s, S.major) && !S.manual.includes(s));
    if (off.length) host.appendChild(el('div', { class: 'redesign', html:
      `<h4>권장 외 과목 중심 재설계</h4><p class="note">${esc(off.join(', '))} 을(를) 중심축으로 탐구를 다시 구성했습니다. 선택을 되돌릴 필요는 없고, 이 과목에서 진로와 만나는 지점을 만들면 됩니다.</p>` }));

    const used = new Set();
    picked.forEach(s => host.appendChild(topicCard(s, used)));

    /* 학과 검증 자료 */
    const res = (S.program && S.program.resources) || [];
    if (res.length) {
      const box = el('div', { class: 'inq res' });
      box.appendChild(el('h4', { html: `📚 ${esc(S.program.name)} 추천 도서·참고자료 <span class="note" style="font-size:11.5px">(실재 검증 완료)</span>` }));
      const ul = el('ul');
      res.forEach(r => ul.appendChild(el('li', { html:
        `<span class="v-ok">확인됨</span><b>[${esc(r.kind)}]</b> 《${esc(r.title)}》 — ${esc(r.author)} · ${esc(r.publisher)}` +
        `<div class="hint">${esc(r.why)} · 찾는 법: ${esc(r.find)}</div>` })));
      box.appendChild(ul);
      box.appendChild(el('p', { class: 'note', style: 'font-size:11.5px;margin-top:8px',
        text: '※ 검색으로 실재를 확인한 자료만 표시합니다. 논문은 KCI·RISS·DBpia에서 주제어로 추가 검색하세요.' }));
      host.appendChild(box);
    }
    persist('탐구 설계 생성', `${picked.length}과목`);
  }

  /* 과목별 탐구 모달 */
  function openResearch(name) {
    const r = S.research && S.research.subjects && S.research.subjects[name];
    $('#mTitle').textContent = name;
    if (!r) {
      $('#mSub').textContent = '사전 검증된 탐구자료 미등록';
      $('#mTopics').innerHTML = '<p class="note">이 과목의 탐구 자료가 아직 준비되지 않았습니다. 없는 자료를 지어내지 않기 위해 비워 둡니다.</p>';
      $('#mDesign').innerHTML = '';
      $('#mBooks').innerHTML = ''; $('#mPapers').innerHTML = '';
    } else {
      $('#mSub').textContent = `${r.field || ''} · ${r.subtitle || ''}`;
      $('#mTopics').innerHTML = (r.topics || []).map(t => `<div class="topic">${esc(t)}</div>`).join('') || '<p class="note">등록된 주제 없음</p>';
      $('#mDesign').innerHTML = r.design || '<p class="note">등록된 설계 없음</p>';
      $('#mBooks').innerHTML = (r.books || []).map(b =>
        `<a class="src" target="_blank" rel="noopener" href="https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(b.t + ' ' + b.a)}">
           <span class="go">교보문고 검색 ↗</span>${esc(b.t)}<span class="meta"><br>${esc(b.a)} · ${esc(b.p || '')}</span></a>`).join('')
        || '<p class="note">검증된 도서 0건</p>';
      $('#mPapers').innerHTML = (r.papers || []).map(p =>
        `<a class="src" target="_blank" rel="noopener" href="${esc(p.u || '#')}">
           <span class="go">${esc(p.s || '검색')} ↗</span>${esc(p.t)}<span class="meta"><br>${esc(p.a || '')}</span></a>`).join('')
        || '<p class="note">검증된 논문 0건</p>';
    }
    $('#modal').classList.add('on');
  }
  function closeModal() { $('#modal').classList.remove('on'); }

  /* ===========================================================
     STEP 5 · 생기부 진단
     =========================================================== */
  let rawText = '';

  function initRecord() {
    const agree = $('#cAgree'), guardian = $('#cGuardian'), btn = $('#consentBtn');
    const sync = () => { btn.disabled = !(agree.checked && guardian.checked); };
    agree.onchange = guardian.onchange = sync;
    btn.onclick = () => {
      $('#consentBox').hidden = true; $('#uploadBox').hidden = false;
      S.profile.record = Object.assign({ consent: true, guardianConsent: true, rawStored: false, at: nowKST() }, S.profile.record || {});
      persist('생기부 동의', '동의 완료(보호자 동의 포함)');
    };

    const drop = $('#drop'), file = $('#fileInput');
    drop.onclick = () => file.click();
    drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('hot'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('hot'); }));
    drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
    file.onchange = () => { if (file.files[0]) handleFile(file.files[0]); };

    $('#clearRecBtn').onclick = () => { $('#recText').value = ''; rawText = ''; $('#diagBox').hidden = true; };
    $('#analyzeBtn').onclick = analyze;
    $('#toReport').onclick = () => go('report');
    $('#skipRecord').onclick = () => go('report');
  }

  async function handleFile(f) {
    try {
      banner('info', `${f.name} 읽는 중…`, '');
      const text = await Record.readFile(f);
      $('#recText').value = Record.mask(text);
      banner('info', '파일을 읽었습니다.', '식별정보로 보이는 부분은 자동 마스킹했습니다. 남아 있는 이름·학번이 있으면 직접 지워 주세요.');
    } catch (e) {
      banner('err', '파일을 읽지 못했습니다', e.message);
    }
  }

  function analyze() {
    const text = Record.mask($('#recText').value || '');
    if (text.trim().length < 50) { banner('warn', '분석할 내용이 너무 짧습니다.', '세특·창체·독서 등 기록을 붙여넣어 주세요.'); return; }
    if (text !== $('#recText').value) {
      $('#recText').value = text;   // 마스킹 결과를 화면에도 반영해 무엇이 지워졌는지 보이게 한다
      banner('info', '식별정보로 보이는 부분을 자동 마스킹했습니다.', '남아 있는 이름·학번이 있으면 직접 지운 뒤 다시 실행해 주세요.');
    }
    rawText = text;
    const knownSubjects = new Set();
    (S.track ? S.track.phases : []).forEach(p => (p.options || []).forEach(o => knownSubjects.add(o.subject)));
    Object.keys((S.research && S.research.subjects) || {}).forEach(s => knownSubjects.add(s));
    ['국어', '수학', '영어', '통합사회', '통합과학', '한국사', '과학탐구실험', '확률과 통계', '미적분', '문학', '독서와 작문', '대수'].forEach(s => knownSubjects.add(s));

    const parsed = Record.splitSections(text);
    const diag = Record.diagnose(parsed, {
      school: S.school, track: S.track, major: S.major,
      taken: [...S.taken], chosen: [...S.selected],
      entryGrade: S.profile.entryGrade, research: S.research,
      knownSubjects: [...knownSubjects],
    });
    S.diagnosis = diag;
    S.profile.record = Object.assign(S.profile.record || {}, {
      consent: true, guardianConsent: true,
      rawStored: !!$('#keepRaw').checked,
      raw: $('#keepRaw').checked ? text : null,
      summary: { chars: diag.counts.chars, sections: diag.counts.sections, subjects: diag.counts.subjects },
      diagnosis: diag, at: nowKST(),
    });
    persist('생기부 진단', `영역 ${diag.counts.sections.length}개 · 과목 ${diag.counts.subjects.length}개 인식 · 보완점 ${(diag.gaps || []).length}건`);
    renderDiagnosis();
    renderGapBanners();
    if (S.track) renderBuilder();
  }

  function renderDiagnosis() {
    const box = $('#diagBox'); box.hidden = false; box.innerHTML = '';
    const d = S.diagnosis;
    if (!d) return;

    box.appendChild(el('div', { class: 'sec-title', text: '읽어 들인 내용' }));
    const kv = el('div', { class: 'kv' });
    kv.appendChild(el('span', { text: `${d.counts.chars.toLocaleString()}자` }));
    (d.counts.sections.length ? d.counts.sections : ['영역 구분 없음']).forEach(s => kv.appendChild(el('span', { text: s })));
    box.appendChild(kv);
    if (d.counts.subjects.length) {
      const kv2 = el('div', { class: 'kv' });
      d.counts.subjects.forEach(s => kv2.appendChild(el('span', { text: '📘 ' + s })));
      box.appendChild(kv2);
    } else {
      box.appendChild(el('p', { class: 'note', style: 'margin-top:8px', text: '과목별 세특을 구분하지 못했습니다. 「과목명」 형태로 줄을 시작하면 더 정확히 읽습니다.' }));
    }

    if ((d.gaps || []).length) {
      box.appendChild(el('div', { class: 'sec-title', style: 'margin-top:20px', text: '이후 설계에 반영될 보완점' }));
      const gb = el('div', { class: 'gapbanner' });
      gb.appendChild(el('div', { html: '<b>아래 보완점이 ④ 계열·⑤ 과목 설계에 자동 반영됩니다.</b>' }));
      d.gaps.forEach(g => {
        gb.appendChild(el('div', { class: 'evd gap', style: 'margin-top:8px', html:
          `<b>${esc(g.label)}</b> — ${esc(g.why)}<span class="q">보완 방향: ${esc(g.hint)}</span>` }));
      });
      box.appendChild(gb);
    }

    box.appendChild(el('div', { class: 'sec-title', style: 'margin-top:20px', text: '입학사정관 관점 3축 진단' }));
    const grid = el('div', { class: 'diag' });
    d.axes.forEach(a => {
      const c = el('div', { class: 'diag-card' });
      const label = a.level === 'hi' ? '강점' : a.level === 'mid' ? '보통' : '보완 필요';
      c.appendChild(el('h4', { html: `<span>${esc(a.key)}</span><span class="score ${a.level}">${label}</span>` }));
      c.appendChild(el('p', { class: 'note', text: a.sub }));
      a.ev.forEach(e => {
        const n = el('div', { class: 'evd' });
        n.appendChild(el('div', { html: '<b>기록에서 확인됨</b> — ' + esc(e.text) }));
        if (e.quote) n.appendChild(el('span', { class: 'q', text: '“' + e.quote + '”' }));
        c.appendChild(n);
      });
      a.gap.forEach(g => c.appendChild(el('div', { class: 'evd gap', html: '<b>기록에 없어 보완 필요</b> — ' + esc(g.text) })));
      grid.appendChild(c);
    });
    box.appendChild(grid);

    box.appendChild(el('div', { class: 'sec-title', style: 'margin-top:20px', text: '학교 편제에 비춘 해석' }));
    d.context.forEach(c => box.appendChild(el('div', { class: 'evd' + (c.kind === 'gap' ? ' gap' : ''), text: c.text })));

    box.appendChild(el('div', { class: 'sec-title', style: 'margin-top:20px', text: '기록을 한 단계 심화한 탐구 제안' }));
    if (!d.deepen.length) {
      box.appendChild(el('p', { class: 'note', text: '과목별 기록을 인식하지 못해 심화 제안을 생성하지 않았습니다. 없는 활동을 만들어 제안하지 않습니다.' }));
    }
    d.deepen.forEach(x => {
      const c = el('div', { class: 'diag-card', style: 'margin-top:10px' });
      c.appendChild(el('h4', { html: `<span>${esc(x.subject)}</span>` }));
      c.appendChild(el('div', { class: 'evd', html: '<b>기록에서 확인된 활동</b><span class="q">“' + esc(x.evidence) + '”</span>' }));
      c.appendChild(el('p', { class: 'note', text: x.note }));
      (x.topics || []).forEach(t => c.appendChild(el('div', { class: 'topic', text: t })));
      if (x.topics && x.topics.length) {
        const b = el('button', { class: 'btn ghost sm', type: 'button', text: '탐구 설계·도서·논문 보기', style: 'margin-top:10px' });
        b.onclick = () => openResearch(x.subject);
        c.appendChild(b);
      }
      box.appendChild(c);
    });

    box.appendChild(el('p', { class: 'disc', style: 'margin-top:16px',
      text: '이 진단은 붙여넣은 기록에 실제로 존재하는 표현만을 근거로 합니다. 합격 가능성이나 대학별 당락은 판단하지 않습니다.' }));
  }

  /* ===========================================================
     STEP 6 · 리포트
     =========================================================== */
  function renderReport() {
    const r = $('#report'); r.innerHTML = '';
    const p = S.profile || {};
    const school = S.school, major = S.major, d = S.diagnosis;

    const cover = el('div', { class: 'cover' });
    cover.appendChild(el('h1', { text: '진로·선택과목 설계 리포트' }));
    cover.appendChild(el('div', { class: 'meta', html:
      `${esc(school ? school.name : '학교 미선택')} · ${esc(major ? major.name : '계열 미선택')}<br>` +
      `${p.entryGrade ? p.entryGrade + '학년 진입' : ''} · 작성일 ${todayKST()} · 가명 ID <span class="idchip">${esc(p.studentKey || '-')}</span>` }));
    r.appendChild(cover);

    /* 1. 학교 편제 요약 */
    r.appendChild(el('h2', { text: '1. 학교 교과 편제 요약' }));
    if (!school) r.appendChild(el('p', { text: '학교가 선택되지 않았습니다.' }));
    else {
      r.appendChild(el('p', { html: `<b>${esc(school.name)}</b> (${esc(school.schoolType || '유형 미기재')}) · 과정: ${esc(S.track ? S.track.label : '-')}<br><span class="note">출처: ${esc(school.source || '미기재')}</span>` }));
      const t = el('table');
      t.innerHTML = '<thead><tr><th>구간</th><th>선택 규칙</th><th>개설 과목 수</th><th>진로+융합선택 수</th></tr></thead>';
      const tb = el('tbody');
      ((S.track && S.track.phases) || []).forEach(ph => {
        const adv = (ph.options || []).filter(o => /진로|융합/.test(o.category)).length;
        const tr = el('tr');
        [ph.label, (ph.requiredPickCount ? ph.requiredPickCount + '과목' : '-') + (ph.totalCredits ? ` / ${ph.totalCredits}학점` : ''), String((ph.options || []).length), String(adv)]
          .forEach(v => tr.appendChild(el('td', { text: v })));
        tb.appendChild(tr);
      });
      t.appendChild(tb); r.appendChild(t);
      const pro = school.professionalSubjects || [];
      r.appendChild(el('p', { html: '전문교과·심화과목: ' + (pro.length ? esc(pro.map(x => x.name).join(', ')) : '<span class="badge none">데이터 미입력</span>') }));
    }

    /* 2. 참조 바스켓 비교 */
    r.appendChild(el('h2', { text: '2. 참조 바스켓 비교 (서울대 수시 다수 배출 참조군)' }));
    const rg = S.refGroups, mt = school && school.metrics;
    if (!rg || !mt) r.appendChild(el('p', { html: '비교 데이터가 <span class="badge none">미입력</span>입니다. 없는 값은 만들어 넣지 않습니다.' }));
    else {
      const il = rg.groups.find(g => g.schoolType === '일반고') || rg.groups[0];
      const ja = rg.groups.find(g => g.schoolType === '자사고') || rg.groups[rg.groups.length - 1];
      const t = el('table');
      t.innerHTML = '<thead><tr><th>교과</th><th>내 학교</th><th>일반고 평균</th><th>자사고 평균</th><th>일반고 대비</th></tr></thead>';
      const tb = el('tbody');
      (rg.coreAreas || []).forEach(k => {
        const my = (mt.byArea || {})[k] || {}, i = (il.byArea || {})[k] || {}, j = (ja.byArea || {})[k] || {};
        const tr = el('tr');
        tr.appendChild(el('td', { text: k }));
        [my.avg, i.avg, j.avg].forEach(v => tr.appendChild(el('td', { text: v == null ? '—' : String(v) })));
        const d1 = (my.avg != null && i.avg != null) ? (Math.abs(my.avg - i.avg) <= 1 ? '비슷' : (my.avg > i.avg ? '유리' : '불리')) : '—';
        tr.appendChild(el('td', { text: d1 }));
        tb.appendChild(tr);
      });
      const trc = el('tr');
      trc.appendChild(el('td', { text: '핵심 5교과 종합' }));
      [mt.coreAvg, il.coreAvg, ja.coreAvg].forEach(v => trc.appendChild(el('td', { text: v == null ? '—' : String(v) })));
      trc.appendChild(el('td', { text: (mt.coreAvg != null && il.coreAvg != null) ? (mt.coreAvg > il.coreAvg ? '유리' : '불리') : '—' }));
      tb.appendChild(trc);
      const tre = el('tr');
      tre.appendChild(el('td', { text: '2·3학년 선택과목 편성' }));
      [mt.elective23, il.elective23, ja.elective23].forEach(v => tre.appendChild(el('td', { text: v == null ? '—' : String(v) })));
      tre.appendChild(el('td', { text: (mt.elective23 != null && il.elective23 != null) ? (mt.elective23 > il.elective23 ? '유리' : '불리') : '—' }));
      tb.appendChild(tre);
      t.appendChild(tb); r.appendChild(t);
      r.appendChild(el('p', { class: 'note', html:
        `일반고 참조군: ${esc(il.members.join(', '))} · 자사고 참조군: ${esc(ja.members.join(', '))}<br>` +
        `모두 <b>학교 평균</b>이며 개인 성적이 아닙니다. 출처: ${esc(il.source || '학교알리미')}` }));
      const selfGroups = [il, ja].filter(g => (g.members || []).some(mm => sameSchool(mm, school.name)));
      if (selfGroups.length) r.appendChild(el('p', { html:
        `<b>참고 —</b> ${esc(school.name)}은(는) ${esc(selfGroups.map(g => g.label).join('·'))}의 구성 학교입니다. ` +
        `해당 열의 평균에는 내 학교 값이 포함되어 있으므로, 상대 위치는 다른 유형 참조군 열을 기준으로 읽어 주세요.` }));
      r.appendChild(el('p', { html: cmpComment(mt, il, ja, school.professionalSubjects || []) }));
    }

    /* 3. 계열 방향 */
    r.appendChild(el('h2', { text: '3. 희망 계열·학과와 이수 방향' }));
    if (S.program) r.appendChild(el('p', { html: `<b>세부 학과</b> ${esc(S.program.name)} — ${esc(S.program.entryNote || '')}` }));
    if (!major) r.appendChild(el('p', { text: '계열이 선택되지 않았습니다.' }));
    else {
      r.appendChild(el('p', { html: `<b>${esc(major.name)}</b> — ${esc(major.desc || '')}` }));
      if (major.departments && major.departments.length) r.appendChild(el('p', { class: 'note', text: '관련 학과: ' + major.departments.join(', ') }));
      r.appendChild(el('p', { text: (major.guidance && major.guidance.lead) || '' }));
      const ul = el('ul');
      ((major.guidance && major.guidance.notes) || []).forEach(n => ul.appendChild(el('li', { html: n })));
      r.appendChild(ul);
    }

    /* 3. 내 과목 설계 */
    r.appendChild(el('h2', { text: '4. 내 과목 설계' }));
    if (S.taken.size) {
      r.appendChild(el('h3', { text: '2학년 이수 완료 (고정)' }));
      r.appendChild(el('p', { text: [...S.taken].join(', ') }));
    }
    r.appendChild(el('h3', { text: (p.entryGrade === 3 ? '3학년' : '2·3학년') + ' 선택 과목' }));
    if (!S.selected.size) r.appendChild(el('p', { text: '선택한 과목이 없습니다.' }));
    else {
      const t = el('table');
      t.innerHTML = '<thead><tr><th>과목</th><th>교과</th><th>구분</th><th>학점</th><th>계열 권장</th></tr></thead>';
      const tb = el('tbody');
      const meta = {};
      ((S.track && S.track.phases) || []).forEach(ph => (ph.options || []).forEach(o => { meta[o.subject] = o; }));
      [...S.selected].forEach(s => {
        const o = meta[s] || {};
        const tr = el('tr');
        const isManual = S.manual.includes(s);
        [s, isManual ? '공동교육과정·전문교과' : (o.area || '-'), isManual ? '직접 추가' : (o.category || '-'),
         String(o.credits || 3), major && isRecommended(s, major) ? '★ 권장' : '자유 선택']
          .forEach(v => tr.appendChild(el('td', { text: v })));
        tb.appendChild(tr);
      });
      t.appendChild(tb); r.appendChild(t);
      const miss = missingRec();
      if (miss.length) r.appendChild(el('p', { html: `<b>미확보 권장 과목:</b> ${esc(miss.join(', '))} — 학교 미개설이면 개인 탐구·동아리로 보완하세요.` }));
    }

    /* 4. 생기부 진단 */
    r.appendChild(el('h2', { text: '5. 학교생활기록부 진단' }));
    if (!d) r.appendChild(el('p', { text: '생기부 진단을 수행하지 않았습니다. (STEP 3에서 진행할 수 있습니다)' }));
    else {
      d.axes.forEach(a => {
        r.appendChild(el('h3', { text: `${a.key} — ${a.level === 'hi' ? '강점' : a.level === 'mid' ? '보통' : '보완 필요'}` }));
        const ul = el('ul');
        a.ev.forEach(e => ul.appendChild(el('li', { html: '<b>[기록에서 확인됨]</b> ' + esc(e.text) + (e.quote ? `<br><span class="note">“${esc(e.quote)}”</span>` : '') })));
        a.gap.forEach(g => ul.appendChild(el('li', { html: '<b>[보완 필요]</b> ' + esc(g.text) })));
        r.appendChild(ul);
      });
      r.appendChild(el('h3', { text: '학교 편제에 비춘 해석' }));
      const ul2 = el('ul');
      d.context.forEach(c => ul2.appendChild(el('li', { text: c.text })));
      r.appendChild(ul2);
      if ((d.gaps || []).length) {
        r.appendChild(el('h3', { text: '설계에 반영한 보완점' }));
        const ul3 = el('ul');
        d.gaps.forEach(g => ul3.appendChild(el('li', { html: `<b>${esc(g.label)}</b> — ${esc(g.why)} → ${esc(g.hint)}` })));
        r.appendChild(ul3);
      }
    }

    /* 6. 탐구 주제 및 설계 — 학과 주제 풀이 있으면 구조화된 설계를 그대로 싣는다 */
    r.appendChild(el('h2', { class: 'page-break', text: '6. 탐구 주제 · 탐구 과정 설계' }));
    const picked = [...S.selected];
    let printed = 0;
    const usedR = new Set();
    picked.slice(0, 10).forEach(sub => {
      const tf = topicFor(sub, usedR);
      if (tf) usedR.add(tf.topic.title);
      if (tf) {
        const t = tf.topic;
        printed++;
        r.appendChild(el('h3', { text: `${sub} — ${t.title}` }));
        r.appendChild(el('p', { html:
          `<b>배경·동기</b> ${esc(t.background)}<br><b>핵심 질문</b> ${esc(t.question)}` }));
        const ul = el('ul');
        (t.method || []).forEach(x => ul.appendChild(el('li', { text: x })));
        r.appendChild(ul);
        r.appendChild(el('p', { html:
          `<b>예상 산출물</b> ${esc(t.output)}<br><b>세특 연결</b> ${esc(t.setuk)}<br><b>심화·확장</b> ${esc(t.extend)}` }));
        return;
      }
      const x = S.research && S.research.subjects && S.research.subjects[sub];
      if (!x) return;
      printed++;
      r.appendChild(el('h3', { text: sub + (x.subtitle ? ` — ${x.subtitle}` : '') }));
      const ul = el('ul');
      (x.topics || []).forEach(t => ul.appendChild(el('li', { text: t })));
      r.appendChild(ul);
      if (x.design) r.appendChild(el('p', { html: x.design }));
    });
    if (!printed) r.appendChild(el('p', { text: '선택한 과목 중 사전 검증된 탐구자료가 있는 과목이 없습니다. 없는 자료는 만들어 넣지 않습니다.' }));
    const subjects = picked.filter(s => S.research && S.research.subjects && S.research.subjects[s]);

    /* 6. 도서·논문 */
    r.appendChild(el('h2', { text: '7. 검증된 추천 도서 · 참고 논문' }));
    const books = [], papers = [];
    subjects.forEach(s => {
      (S.research.subjects[s].books || []).forEach(b => books.push({ subj: s, ...b }));
      (S.research.subjects[s].papers || []).forEach(pp => papers.push({ subj: s, ...pp }));
    });
    const progRes = (S.program && S.program.resources) || [];
    if (progRes.length) {
      r.appendChild(el('h3', { text: `${S.program.name} 학과 자료 (${progRes.length}건)` }));
      const t = el('table'); t.innerHTML = '<thead><tr><th>구분</th><th>제목</th><th>저자</th><th>출판·수록</th><th>찾는 법</th></tr></thead>';
      const tb = el('tbody');
      progRes.forEach(x => { const tr = el('tr'); [x.kind, x.title, x.author, x.publisher, x.find].forEach(v => tr.appendChild(el('td', { text: v || '' }))); tb.appendChild(tr); });
      t.appendChild(tb); r.appendChild(t);
    }
    if (!books.length && !papers.length && !progRes.length) r.appendChild(el('p', { text: '검증된 자료가 0건입니다.' }));
    if (books.length) {
      r.appendChild(el('h3', { text: `도서 (${books.length}건 · 모두 검색으로 실재 확인)` }));
      const t = el('table'); t.innerHTML = '<thead><tr><th>과목</th><th>제목</th><th>저자</th><th>출판사</th></tr></thead>';
      const tb = el('tbody');
      books.forEach(b => { const tr = el('tr'); [b.subj, b.t, b.a, b.p || ''].forEach(v => tr.appendChild(el('td', { text: v }))); tb.appendChild(tr); });
      t.appendChild(tb); r.appendChild(t);
    }
    if (papers.length) {
      r.appendChild(el('h3', { text: `논문 (${papers.length}건 · 검색 경로 병기)` }));
      const t = el('table'); t.innerHTML = '<thead><tr><th>과목</th><th>제목</th><th>수록</th><th>확인 경로</th></tr></thead>';
      const tb = el('tbody');
      papers.forEach(b => {
        const tr = el('tr');
        [b.subj, b.t, b.a || '', b.s || (b.u ? '링크 수록' : '제목으로 검색')].forEach(v => tr.appendChild(el('td', { text: v })));
        tb.appendChild(tr);
      });
      t.appendChild(tb); r.appendChild(t);
    }

    /* 7. 다음 액션 */
    r.appendChild(el('h2', { text: '8. 다음 액션 체크리스트' }));
    const acts = [];
    if (!S.selected.size) acts.push('STEP 5에서 학기별 선택 과목을 확정한다.');
    if (major) {
      const miss = missingRec();
      if (miss.length) acts.push(`미확보 권장 과목(${miss.slice(0, 4).join(', ')}${miss.length > 4 ? ' 외' : ''})의 개설 여부를 담당 선생님께 확인한다.`);
    }
    if (!d) acts.push('생기부를 STEP 3에 넣어 3축 진단을 받는다.');
    else {
      d.axes.forEach(a => a.gap.slice(0, 1).forEach(g => acts.push(`[${a.key}] ${g.text}`)));
    }
    acts.push('선택 과목별 탐구 주제를 1개씩 정하고, 수행평가·세특에 남길 산출물(보고서·발표)을 계획한다.');
    acts.push('탐구와 연결된 도서를 읽고 독서활동에 남긴다.');
    const ol = el('ul');
    acts.forEach(a => ol.appendChild(el('li', { text: '☐ ' + a })));
    r.appendChild(ol);

    r.appendChild(el('div', { class: 'disclaimer', html:
      '본 리포트는 학생의 자기주도적 설계를 돕기 위한 <b>참고용 자료</b>입니다. 특정 대학의 합격 여부를 예측하거나 보장하지 않습니다.<br>' +
      '학업성취 수치는 학교알리미 공시자료 기준의 <b>학교 전체 교과군 평균</b>이며 개인 성적이 아닙니다. 데이터가 없는 항목은 임의로 채우지 않고 "미입력"으로 표시했습니다.<br>' +
      '도서·논문은 검색으로 실재를 확인한 항목만 수록했습니다.<br>' +
      '<b>이 출력물에는 학생의 학습 이력이 담겨 있습니다.</b> 인쇄물 보관과 공유에 주의해 주세요.' }));

    renderHistory();
  }

  function renderHistory() {
    const h = $('#hist'); if (!h) return;
    h.innerHTML = '';
    const hist = (S.profile && S.profile.history) || [];
    if (!hist.length) { h.appendChild(el('p', { class: 'note', text: '기록이 없습니다.' })); return; }
    hist.slice().reverse().forEach(x => h.appendChild(el('div', { text: `${x.at} · ${x.step}${x.detail ? ' — ' + x.detail : ''}` })));
  }

  /* ===========================================================
     부팅
     =========================================================== */
  async function boot() {
    setTheme(Store.theme.get());
    $$('#themeSeg button').forEach(b => b.onclick = () => setTheme(b.dataset.t));
    $$('#steps button').forEach(b => b.onclick = () => go(b.dataset.step));
    $('#mClose').onclick = closeModal;
    $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    $('#applyRec').onclick = () => {
      if (!S.major) { banner('warn', '계열을 먼저 선택해 주세요.', ''); return; }
      const { design } = phasesInScope();
      design.forEach(p => (p.options || []).forEach(o => { if (isRecommended(o.subject, S.major)) S.selected.add(o.subject); }));
      renderBuilder(); persist('권장 과목 자동 선택', `${S.selected.size}과목`);
    };
    $('#resetBtn').onclick = () => { S.selected.clear(); S.topicIdx = {}; $('#designOut').innerHTML = ''; renderBuilder(); persist('선택 초기화'); };
    $('#toRecord').onclick = () => go('record');
    $('#printBtn').onclick = () => window.print();
    $('#saveBtn').onclick = () => { persist('저장', '수동 저장'); banner('info', '저장했습니다.', '이 브라우저에만 저장됩니다.'); };
    $('#exportBtn').onclick = exportJSON;
    $('#wipeBtn').onclick = () => {
      if (!S.profile) return;
      if (!confirm('이 가명 ID의 모든 데이터(설계·진단·이력)를 삭제할까요? 되돌릴 수 없습니다.')) return;
      Store.remove(S.profile.studentKey);
      S.profile = null; S.selected.clear(); S.taken.clear(); S.manual = []; S.topicIdx = {}; S.diagnosis = null;
      banner('info', '삭제했습니다.', '');
      location.reload();
    };

    /* 공동교육과정·전문교과 직접 추가 */
    const addManual = () => {
      const inp = $('#manualSub'), v = (inp.value || '').trim();
      if (!v) return;
      if (S.manual.includes(v)) { banner('info', '이미 추가된 과목입니다.', v); inp.value = ''; return; }
      S.manual.push(v); S.selected.add(v);
      inp.value = '';
      renderBuilder(); persist('직접 추가 과목', v);
    };
    $('#addManual').onclick = addManual;
    $('#manualSub').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } };
    $('#genDesign').onclick = renderDesignOut;
    $('#toRecordFromSchool').onclick = () => go('record');
    $('#toMajorFromRecord').onclick = () => go('major');

    initStart();
    initRecord();
    await Promise.all([initSchool(), initMajor(), loadResearch(), loadReference()]);
    applyEntry(2);
    renderGapBanners();
    go('start');
  }

  async function loadResearch() {
    S.research = await loadJSON('research/subjects.json', { schema: { subjects: '객체' } });
  }
  async function loadReference() {
    S.refGroups = await loadJSON('reference-groups.json', { schema: { groups: '배열' } });
  }

  function exportJSON() {
    if (!S.profile) return;
    const clone = JSON.parse(JSON.stringify(S.profile));
    if (clone.record) { delete clone.record.raw; clone.record.rawStored = false; }  // 원문은 내보내지 않음
    const blob = new Blob([JSON.stringify(clone, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `진로설계_${clone.studentKey}_${todayKST()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
