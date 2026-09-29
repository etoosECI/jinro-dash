/* ===========================================================
   bridge.js — Expert-Course(입시 전문가 과정 실습 도구) 연결
   두 사이트가 같은 주소(etooseci.github.io) 아래 있어 브라우저 저장소를 함께 읽는다.
     - Expert-Course 학생 기록: localStorage 'expertCourse.students.v1'  (과목별 성적 record.courses)
     - Expert-Course 학생부 정밀분석: localStorage 'expertCourse.hakjong.v1' (학생부 원문 sections, 최종평가 final)
   ★ 읽기만 한다. jinro-dash 쪽 데이터 구조·개인정보 원칙(원문 기본 미저장)은 바꾸지 않는다.
   ★ app.js는 window.JinroHost(상태 S와 몇 개 함수)를 열어 주고, 렌더 끝에서 onBuilder/onReport를 부른다.
   =========================================================== */
(function (global) {
  'use strict';
  const EC = '../Expert-Course/';
  const AREA_HEAD = { 자율: '자율활동', 동아리: '동아리활동', 진로: '진로활동', 세특: '세부능력 및 특기사항', 개인별세특: '세부능력 및 특기사항', 독서: '독서활동상황', 행특: '행동특성 및 종합의견', 기타: '' };

  function read(key) { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  const ecStudents = () => read('expertCourse.students.v1').filter(r => r && r.record && r.record.values);
  const ecAnalyses = () => read('expertCourse.hakjong.v1').filter(r => r && r.record && Array.isArray(r.record.sections));
  const pad = n => String(n).padStart(2, '0');
  const norm = s => String(s || '').replace(/\s+/g, '').replace(/Ⅰ/g, 'I').replace(/Ⅱ/g, 'II').toLowerCase();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const host = () => global.JinroHost || null;
  const banner = (...a) => (global.Core && Core.banner ? Core.banner(...a) : null);

  /* 정밀분석 원문 → jinro-dash 진단이 읽을 수 있는 텍스트 (영역 제목 + 「과목」) */
  function composeText(rec) {
    const out = [];
    [1, 2, 3].forEach(y => {
      let last = '';
      rec.sections.filter(s => s.year === y && s.text).forEach(s => {
        const head = AREA_HEAD[s.area] || '';
        if (head && head !== last) { out.push(head); last = head; }
        out.push(s.subject && (s.area === '세특' || s.area === '개인별세특') ? `「${s.subject}」 ${s.text}` : s.text);
      });
    });
    return out.join('\n');
  }

  /* ① STEP 3 생기부 진단 — Expert-Course 정밀분석 원문 가져오기 */
  function mountRecordImport() {
    const box = document.getElementById('uploadBox');
    if (!box || document.getElementById('ecImport')) return;
    const wrap = document.createElement('div');
    wrap.id = 'ecImport'; wrap.className = 'ec-bridge';
    const anchor = box.querySelector('.fld'); if (anchor) anchor.parentNode.insertBefore(wrap, anchor); else box.appendChild(wrap);
    const draw = () => {
      const list = ecAnalyses();
      wrap.innerHTML = `<b>Expert-Course 연결</b> <span class="note">학생부 정밀분석 보드에 붙여넣은 원문을 그대로 가져옵니다.</span>
        <div class="row" style="margin-top:8px;align-items:flex-end"><div class="fld"><label for="ecAnaSel">정밀분석 기록</label>
        <select id="ecAnaSel"><option value="">${list.length ? '선택하세요' : '이 브라우저에 저장된 정밀분석이 없습니다'}</option>${list.map(r => `<option value="${r.number}">${pad(r.number)}번 · ${esc(r.record.student && r.record.student.name || '학생')} · 원문 ${r.record.sections.length}개 영역</option>`).join('')}</select></div>
        <button class="btn sm ghost" id="ecAnaBtn" type="button" ${list.length ? '' : 'disabled'}>원문 가져오기</button>
        <a class="btn sm ghost" href="${EC}hakjong.html" target="_blank" rel="noopener">정밀분석 보드 열기 ↗</a></div>`;
      wrap.querySelector('#ecAnaBtn').onclick = () => {
        const n = Number(wrap.querySelector('#ecAnaSel').value), row = ecAnalyses().find(r => r.number === n);
        if (!row) return;
        const ta = document.getElementById('recText');
        if (ta.value.trim() && !confirm('입력창의 내용을 정밀분석 원문으로 바꿀까요?')) return;
        ta.value = global.Record ? Record.mask(composeText(row.record)) : composeText(row.record);
        banner('info', 'Expert-Course 정밀분석 원문을 가져왔습니다.', '[진단 실행]을 누르면 키워드 기반 자동 진단이 나옵니다. 사람이 표시한 근거(정밀분석)와 비교해 보세요.');
      };
    };
    draw();
    wrap.addEventListener('focusin', e => { if (e.target.id === 'ecAnaSel' && !e.target.dataset.fresh) { e.target.dataset.fresh = '1'; draw(); } });
  }

  /* ② STEP 5 (3학년 진입) — Expert-Course 성적에서 2학년 이수과목 체크 */
  function onBuilder(S) {
    const box = document.getElementById('takenBox');
    if (!box || box.hidden) return;
    let wrap = document.getElementById('ecTaken');
    const list = ecStudents().filter(r => Array.isArray(r.record.courses) && r.record.courses.length);
    if (!list.length) { if (wrap) wrap.remove(); return; }
    if (!wrap) { const pool = document.getElementById('takenPool'); wrap = document.createElement('div'); wrap.id = 'ecTaken'; wrap.className = 'ec-bridge'; pool.parentNode.insertBefore(wrap, pool); }
    wrap.innerHTML = `<b>Expert-Course 성적에서 가져오기</b> <span class="note">상담 진단실 학생의 2학년 이수 과목을 편제와 대조해 체크합니다. 과목명이 편제와 같아야 체크됩니다.</span>
      <div class="row" style="margin-top:8px;align-items:flex-end"><div class="fld"><label for="ecStuSel">Expert-Course 학생</label>
      <select id="ecStuSel"><option value="">선택하세요</option>${list.map(r => `<option value="${r.number}">${pad(r.number)}번 · ${esc(r.record.values.studentName || '이름 미입력')} · ${r.record.courses.length}과목</option>`).join('')}</select></div>
      <button class="btn sm ghost" id="ecTakenBtn" type="button">2학년 이수과목 체크</button></div>`;
    wrap.querySelector('#ecTakenBtn').onclick = () => {
      const h = host(); if (!h) return;
      const row = ecStudents().find(r => r.number === Number(wrap.querySelector('#ecStuSel').value)); if (!row) return;
      const mine = new Set(row.record.courses.filter(c => Number(c.year) === 2).map(c => norm(c.name)));
      const opts = []; (h.S.track ? h.S.track.phases : []).filter(p => p.grade === 2).forEach(p => (p.options || []).forEach(o => opts.push(o.subject)));
      const hit = opts.filter(s => mine.has(norm(s)));
      hit.forEach(s => h.S.taken.add(s));
      h.renderBuilder();
      banner(hit.length ? 'info' : 'warn', hit.length ? `2학년 이수과목 ${hit.length}개를 체크했습니다.` : '편제와 이름이 같은 과목을 찾지 못했습니다.',
        hit.length ? hit.join(', ') + ' — 확인 후 [이수과목 확정]을 눌러 주세요.' : '2015 개정 과목명(예: 화학Ⅰ)은 2022 개정 편제(예: 화학)와 이름이 달라 자동으로 맞춰지지 않습니다. 직접 체크해 주세요.');
    };
  }

  /* ③ 리포트 — 이 설계에 연결된 Expert-Course 정밀분석 요약 */
  function onReport(S) {
    const r = document.getElementById('report'); if (!r || !S.profile) return;
    const key = S.profile.studentKey, linked = ecAnalyses().filter(x => x.record.jinro && x.record.jinro.key === key);
    const sec = document.createElement('div'); sec.className = 'ec-report';
    const open = n => `${EC}hakjong.html?open=${n}`;
    if (!linked.length) {
      sec.innerHTML = `<h2>Expert-Course 학생부 정밀분석</h2><p class="note noprint">이 설계와 연결된 정밀분석이 없습니다. <a href="${EC}hakjong.html?jinro=${encodeURIComponent(key)}" target="_blank" rel="noopener">정밀분석 보드에서 이 설계와 연결해 시작하기 ↗</a></p>`;
      sec.classList.add('noprint');
    } else {
      sec.innerHTML = `<h2>Expert-Course 학생부 정밀분석</h2>` + linked.map(x => {
        const f = x.record.final || {}, li = a => (a || []).filter(i => i && i.text).map(i => `<li>${esc(i.text)}</li>`).join('') || '<li>—</li>';
        return `<div class="ec-card"><p><b>${esc(x.record.student && x.record.student.name || '학생')}</b> · 근거 ${x.record.evidence.length}개 · 탐구 줄기 ${x.record.threads.length}개 <a class="noprint" href="${open(x.number)}" target="_blank" rel="noopener">정밀분석 열기 ↗</a></p>
          <p><b>핵심경쟁력</b> ${esc(f.core && f.core.text || '—')}</p><div class="ec-cols"><div><b>핵심강점</b><ul>${li(f.strengths)}</ul></div><div><b>핵심약점</b><ul>${li(f.weaknesses)}</ul></div><div><b>의심·검증</b><ul>${li(f.checks)}</ul></div></div></div>`;
      }).join('');
    }
    const disc = r.querySelector('.disclaimer'); r.insertBefore(sec, disc || null);
  }

  /* ④ 머리글 링크 */
  function mountHeaderLink() {
    const h = document.querySelector('header'); if (!h || document.getElementById('ecLink')) return;
    const a = document.createElement('a'); a.id = 'ecLink'; a.className = 'ec-link noprint'; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = 'Expert-Course ↗'; a.title = '입시 전문가 과정 실습 도구 (상담 진단실·학생부 정밀분석)';
    a.href = EC; a.onclick = () => { const k = host() && host().S.profile && host().S.profile.studentKey; a.href = k ? `${EC}hakjong.html?jinro=${encodeURIComponent(k)}` : EC; };
    h.appendChild(a);
  }

  function init() { mountHeaderLink(); mountRecordImport(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  global.JinroBridge = { onBuilder, onReport, composeText };
})(window);
