/* ===========================================================
   snu.js — ⑦ 서울대 수시 배출 격차 · 서류평가 기준 역추산 분석
   데이터: data/snu-analysis.json (코드에는 수치를 넣지 않습니다)
   app.js는 go('snu') 때 SnuAnalysis.render(S)만 부릅니다.
   =========================================================== */
(function (global) {
  'use strict';
  const { $, el, esc, loadJSON } = Core;

  const V = { data: null, group: 'all', sortKey: 'susiRate', sortDir: -1, sel: null, xKey: 'n23', yKey: 'susiRate', S: null };

  /* ---------- 작은 통계 도구 ---------- */
  function ranks(a) {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  }
  function spearman(x, y) {
    const rx = ranks(x), ry = ranks(y), n = x.length;
    const mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < n; i++) { a += (rx[i] - mx) * (ry[i] - my); b += (rx[i] - mx) ** 2; c += (ry[i] - my) ** 2; }
    return b && c ? a / Math.sqrt(b * c) : 0;
  }
  const median = a => { const s = a.slice().sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const fmt = (v, d) => v == null ? '—' : (typeof v === 'number' ? v.toFixed(d == null ? 1 : d).replace(/\.0+$/, '') : esc(v));

  /* ---------- 지표 접근자 ---------- */
  const FEAT = {
    n23: s => s.ach2025 && s.ach2025.n23,
    nSim: s => s.ach2025 && s.ach2025.nSim,
    advMath: s => s.ach2025 && s.ach2025.advMath.length,
    advSci: s => s.ach2025 && s.ach2025.advSci.length,
    g2Avg: s => s.ach2025 && s.ach2025.g2Avg,
    g2A: s => s.ach2025 && s.ach2025.g2A,
    g1A: s => s.ach2025 && s.ach2025.g1A,
    careerA: s => s.ach2025 && s.ach2025.careerA,
    plan23: s => s.plan2026.n23,
    planPro: s => s.plan2026.pro.length,
    enroll: s => s.enroll,
  };
  const TGT = { susiRate: s => s.derived.susiRate, susiShare: s => s.derived.susiShare, susiAvg: s => s.derived.susiAvg };
  const groupOk = s => V.group === 'all' || s.group === V.group;

  /* ---------- 진입점 ---------- */
  async function render(S) {
    V.S = S;
    const host = $('#snuBody');
    if (!host) return;
    if (!V.data) {
      host.innerHTML = '<p class="note">분석 데이터를 불러오는 중…</p>';
      V.data = await loadJSON('snu-analysis.json', { schema: { schools: '배열', findings: '배열', framework: '객체' } });
      if (!V.data) { host.innerHTML = '<p class="note">서울대 분석 데이터를 불러오지 못했습니다.</p>'; return; }
      build(host);
    }
    renderMine();
  }

  function build(host) {
    const D = V.data;
    host.innerHTML = '';
    host.appendChild(el('p', { class: 'note', html: `${esc(D.scope)}. 서울대 요강의 서류평가 항목을 기준으로, 학교가 공개한 <b>합격 실적·학업성취·편제</b>를 거꾸로 맞춰 봅니다. <span class="badge b-real">실측</span> 표시는 제공 자료 원값, 해석은 추정입니다.` }));

    /* 1. 핵심 결론 */
    host.appendChild(el('div', { class: 'sec-title', style: 'margin-top:18px', text: '핵심 결론' }));
    const fg = el('div', { class: 'snu-find' });
    D.findings.forEach(f => fg.appendChild(el('div', { class: 'snu-fcard', html: `<h4>${esc(f.title)}</h4><p>${esc(f.body)}</p>` })));
    host.appendChild(fg);

    /* 2. 평가 틀 → 역추산 */
    host.appendChild(el('div', { class: 'sec-title', style: 'margin-top:24px', text: '서울대 서류평가 항목 → 관찰 지표 → 이 자료의 결과' }));
    const ft = el('table', { class: 'cmp snu-fw' });
    ft.innerHTML = '<thead><tr><th>평가 요소</th><th>요강 원문(요지)</th><th>학교 단위 관찰 지표</th><th>결과</th></tr></thead>';
    const fb = el('tbody');
    D.framework.items.forEach(it => fb.appendChild(el('tr', { html:
      `<td><b>${esc(it.key)}</b></td><td class="snu-q">“${esc(it.official)}”</td><td>${esc(it.proxy)}</td><td>${esc(it.finding)}</td>` })));
    ft.appendChild(fb);
    host.appendChild(el('div', { class: 'snu-scroll' }, [ft]));
    const ul = el('ul', { class: 'uni' });
    D.framework.structure.forEach(t => ul.appendChild(el('li', { text: t })));
    host.appendChild(ul);

    /* 3. 필터 + 산점도 */
    host.appendChild(el('div', { class: 'sec-title', style: 'margin-top:24px', text: '요인별 관계 보기' }));
    const ctl = el('div', { class: 'row', style: 'align-items:flex-end;gap:14px' });
    const seg = el('div', { class: 'seg', id: 'snuGroupSeg', style: 'width:max-content' });
    [['all', '전체 18'], ['자사고군', '자사고군 9'], ['일반고', '일반고 9']].forEach(([k, t]) =>
      seg.appendChild(el('button', { type: 'button', dataset: { g: k }, text: t, onclick: () => { V.group = k; refresh(); } })));
    ctl.appendChild(seg);
    const xs = el('select', { id: 'snuX', 'aria-label': '가로축 지표' });
    Object.entries(D.features).forEach(([k, t]) => xs.appendChild(el('option', { value: k, text: t })));
    xs.value = V.xKey; xs.onchange = () => { V.xKey = xs.value; renderScatter(); };
    const ys = el('select', { id: 'snuY', 'aria-label': '세로축 지표' });
    Object.entries(D.targets).forEach(([k, t]) => ys.appendChild(el('option', { value: k, text: t })));
    ys.value = V.yKey; ys.onchange = () => { V.yKey = ys.value; renderScatter(); };
    ctl.appendChild(el('div', { class: 'fld' }, [el('label', { for: 'snuX', text: '가로축(학교 특성)' }), xs]));
    ctl.appendChild(el('div', { class: 'fld' }, [el('label', { for: 'snuY', text: '세로축(서울대 수시 실적)' }), ys]));
    host.appendChild(ctl);
    host.appendChild(el('div', { id: 'snuScatter', class: 'snu-chart' }));

    /* 4. 표 */
    host.appendChild(el('div', { class: 'sec-title', style: 'margin-top:24px', text: '18개교 비교표 — 행을 누르면 학교별 역추산 해석' }));
    host.appendChild(el('div', { id: 'snuTable', class: 'snu-scroll' }));
    host.appendChild(el('div', { id: 'snuDetail' }));

    /* 5. 2028 권장과목 & 내 학교 */
    host.appendChild(el('div', { class: 'sec-title', style: 'margin-top:26px', text: '2028 대입 · 서울대 권장과목 체계와 편제 점검' }));
    host.appendChild(el('div', { id: 'snuRec' }));
    host.appendChild(el('div', { class: 'sec-title', style: 'margin-top:22px', text: '내 학교 비교 · 불리 요인 진단과 보강 방안' }));
    host.appendChild(el('div', { id: 'snuMine' }));

    /* 6. 지도 시사점 · 한계 · 출처 */
    host.appendChild(el('div', { class: 'sec-title', style: 'margin-top:26px', text: '상담·지도 시사점' }));
    const im = el('ul', { class: 'uni' });
    D.implications.forEach(t => im.appendChild(el('li', { text: t })));
    host.appendChild(im);
    host.appendChild(el('div', { class: 'sec-title', style: 'margin-top:22px', text: '자료 기준과 한계' }));
    const lm = el('ul', { class: 'uni' });
    D.dataNotes.concat(D.limits).forEach(t => lm.appendChild(el('li', { text: t })));
    host.appendChild(lm);
    host.appendChild(el('div', { class: 'sec-title', style: 'margin-top:22px', text: '출처' }));
    const so = el('ul', { class: 'uni' });
    D.sources.forEach(s => so.appendChild(el('li', { html: `<a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a>` })));
    host.appendChild(so);

    renderRec();
    refresh();
  }

  function refresh() {
    document.querySelectorAll('#snuGroupSeg button').forEach(b => b.classList.toggle('on', b.dataset.g === V.group));
    renderScatter();
    renderTable();
    renderDetail();
  }

  /* ---------- 산점도 (SVG, 단일 축, 모양+색 이중 부호화) ---------- */
  function renderScatter() {
    const host = $('#snuScatter'); if (!host) return;
    const D = V.data, fx = FEAT[V.xKey], fy = TGT[V.yKey];
    const pts = D.schools.filter(groupOk).map(s => ({ s, x: fx(s), y: fy(s) })).filter(p => p.x != null && p.y != null);
    const miss = D.schools.filter(groupOk).filter(s => fx(s) == null).map(s => s.name);
    const W = 760, H = 380, m = { l: 56, r: 20, t: 18, b: 48 };
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(...ys);
    const padX = (x1 - x0) * 0.06 || 1;
    const sx = v => m.l + (v - (x0 - padX)) / ((x1 + padX) - (x0 - padX)) * (W - m.l - m.r);
    const sy = v => H - m.b - (v / (y1 * 1.1)) * (H - m.t - m.b);
    const ticks = (a, b, n) => { const st = niceStep((b - a) / n), out = []; for (let v = Math.ceil(a / st) * st; v <= b + 1e-9; v += st) out.push(+v.toFixed(6)); return out; };
    let g = '';
    ticks(0, y1 * 1.1, 5).forEach(v => { g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}"/><text class="tick" x="${m.l - 8}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`; });
    ticks(x0 - padX, x1 + padX, 6).forEach(v => { g += `<text class="tick" x="${sx(v)}" y="${H - m.b + 18}" text-anchor="middle">${v}</text>`; });
    g += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>`;
    g += `<text class="axl" x="${(W + m.l) / 2}" y="${H - 8}" text-anchor="middle">${esc(D.features[V.xKey])}</text>`;
    g += `<text class="axl" transform="translate(14 ${(H - m.b + m.t) / 2}) rotate(-90)" text-anchor="middle">${esc(D.targets[V.yKey])}${V.yKey === 'susiAvg' ? ' (명)' : ' (%)'}</text>`;
    const top = pts.slice().sort((a, b) => b.y - a.y).slice(0, 3).map(p => p.s.id);
    pts.forEach(p => {
      const cx = sx(p.x), cy = sy(p.y), cls = p.s.group === '일반고' ? 'g-il' : 'g-ja', on = V.sel === p.s.id;
      const mark = p.s.group === '일반고'
        ? `<rect class="mk ${cls}${on ? ' on' : ''}" x="${cx - 5}" y="${cy - 5}" width="10" height="10" rx="2"/>`
        : `<circle class="mk ${cls}${on ? ' on' : ''}" cx="${cx}" cy="${cy}" r="5.5"/>`;
      const lab = (on || top.includes(p.s.id)) ? `<text class="plab" x="${cx + 9}" y="${cy + 4}">${esc(p.s.name)}</text>` : '';
      g += `<g class="pt" data-id="${p.s.id}" tabindex="0" role="button" aria-label="${esc(p.s.name)} ${fmt(p.x)} / ${fmt(p.y, 2)}">${mark}<circle class="hit" cx="${cx}" cy="${cy}" r="14"/>${lab}</g>`;
    });
    const rho = pts.length > 2 ? spearman(xs, ys) : null;
    host.innerHTML = `<div class="snu-legend"><span><svg width="12" height="12"><circle class="mk g-ja" cx="6" cy="6" r="5"/></svg>자사고군</span><span><svg width="12" height="12"><rect class="mk g-il" x="1" y="1" width="10" height="10" rx="2"/></svg>일반고</span>` +
      `<span class="snu-rho">순위상관 ρ = <b>${rho == null ? '—' : (rho >= 0 ? '+' : '') + rho.toFixed(2)}</b> · n = ${pts.length}${Math.abs(rho || 0) >= 0.6 ? ' · 강한 관계' : Math.abs(rho || 0) >= 0.35 ? ' · 약~중간' : ' · 관계 뚜렷하지 않음'}</span></div>` +
      `<svg viewBox="0 0 ${W} ${H}" class="snu-svg" role="img" aria-label="산점도">${g}</svg><div class="snu-tip" hidden></div>` +
      (miss.length ? `<p class="note">이 지표가 없어 빠진 학교: ${esc(miss.join(', '))}</p>` : '') +
      `<p class="note">ρ는 이 화면에서 바로 계산한 스피어만 순위상관입니다. 표본이 작아 ±0.5 미만은 우연일 수 있습니다. 상관은 인과를 뜻하지 않습니다.</p>`;
    const tip = host.querySelector('.snu-tip'), svg = host.querySelector('svg');
    host.querySelectorAll('.pt').forEach(n => {
      const s = V.data.schools.find(z => z.id === n.dataset.id), p = pts.find(z => z.s.id === s.id);
      const show = () => {
        tip.hidden = false;
        tip.innerHTML = `<b>${esc(s.name)}</b> · ${esc(s.typeLabel)}<br>${esc(D.features[V.xKey])}: <b>${fmt(p.x)}</b><br>${esc(D.targets[V.yKey])}: <b>${fmt(p.y, 2)}</b>`;
        const r = n.getBoundingClientRect(), hr = host.getBoundingClientRect();
        tip.style.left = Math.min(r.left - hr.left + 16, hr.width - 220) + 'px';
        tip.style.top = (r.top - hr.top - 10) + 'px';
      };
      n.addEventListener('mouseenter', show); n.addEventListener('focus', show);
      n.addEventListener('mouseleave', () => { tip.hidden = true; }); n.addEventListener('blur', () => { tip.hidden = true; });
      n.addEventListener('click', () => select(s.id));
      n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s.id); } });
    });
    void svg;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  /* ---------- 표 ---------- */
  const COLS = [
    ['name', '학교', s => s.name, 's'],
    ['enroll', '고3 재적', s => s.enroll],
    ['s24', '수시 24', s => (s.results['2024'] || {}).susi],
    ['s25', '수시 25', s => (s.results['2025'] || {}).susi],
    ['s26', '수시 26', s => (s.results['2026'] || {}).susi],
    ['jungsiAvg', '정시 평균', s => s.derived.jungsiAvg],
    ['susiRate', '재적 대비 수시%', s => s.derived.susiRate],
    ['susiShare', '수시 전환율%', s => s.derived.susiShare],
    ['n23', '개설 2·3학년', s => FEAT.n23(s)],
    ['nSim', '심화·전문', s => FEAT.nSim(s)],
    ['g2Avg', '2학년 평균', s => FEAT.g2Avg(s)],
    ['g2A', '2학년 A%', s => FEAT.g2A(s)],
  ];
  function renderTable() {
    const host = $('#snuTable'); if (!host) return;
    const col = COLS.find(c => c[0] === V.sortKey) || COLS[6];
    const rows = V.data.schools.filter(groupOk).slice().sort((a, b) => {
      const va = col[2](a), vb = col[2](b);
      if (va == null) return 1; if (vb == null) return -1;
      return col[3] === 's' ? String(va).localeCompare(String(vb), 'ko') * V.sortDir : (va - vb) * V.sortDir;
    });
    const t = el('table', { class: 'cmp snu-tbl' });
    const hr = el('tr');
    COLS.forEach(c => hr.appendChild(el('th', { class: c[3] === 's' ? '' : 'num', html: esc(c[1]) + (c[0] === V.sortKey ? (V.sortDir > 0 ? ' ▲' : ' ▼') : ''),
      tabindex: '0', 'aria-sort': c[0] === V.sortKey ? (V.sortDir > 0 ? 'ascending' : 'descending') : 'none',
      onclick: () => sortBy(c[0]), onkeydown: e => { if (e.key === 'Enter') sortBy(c[0]); } })));
    t.appendChild(el('thead', null, [hr]));
    const tb = el('tbody');
    rows.forEach(s => {
      const tr = el('tr', { class: 'snu-row' + (V.sel === s.id ? ' on' : ''), tabindex: '0', onclick: () => select(s.id), onkeydown: e => { if (e.key === 'Enter') select(s.id); } });
      COLS.forEach((c, i) => {
        const v = c[2](s);
        tr.appendChild(el('td', { class: i ? 'num' : '', html: i === 0
          ? `<b>${esc(s.name)}</b><div class="aoc">${esc(s.group === '일반고' ? '일반고' : s.typeLabel.split('(')[0])} · ${esc(s.region)}</div>`
          : (v == null ? '<span class="badge none">—</span>' : fmt(v, c[0] === 'susiRate' ? 2 : 1)) }));
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    host.innerHTML = ''; host.appendChild(t);
    host.appendChild(el('p', { class: 'note', html: '수시 전환율 = 3개년 평균 수시 ÷ (수시+정시). 정시에는 졸업생(N수) 합격이 섞여 있습니다. “—”는 100위 밖이거나 자료가 없는 경우입니다.' }));
  }
  function sortBy(k) { if (V.sortKey === k) V.sortDir *= -1; else { V.sortKey = k; V.sortDir = k === 'name' ? 1 : -1; } renderTable(); }
  function select(id) { V.sel = V.sel === id ? null : id; renderScatter(); renderTable(); renderDetail(); if (V.sel) { const d = $('#snuDetail'); d && d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }

  /* ---------- 학교 상세 ---------- */
  function renderDetail() {
    const host = $('#snuDetail'); if (!host) return;
    host.innerHTML = '';
    const s = V.sel && V.data.schools.find(z => z.id === V.sel);
    if (!s) { host.appendChild(el('p', { class: 'note', text: '표나 산점도에서 학교를 누르면 5개년 추이와 역추산 해석이 여기에 나옵니다.' })); return; }
    const yrs = ['2022', '2023', '2024', '2025', '2026'];
    const mx = Math.max(1, ...yrs.map(y => s.results[y] ? (s.results[y].susi || 0) + (s.results[y].jungsi || 0) : 0));
    const bars = yrs.map(y => {
      const r = s.results[y];
      if (!r) return `<div class="yb"><div class="yv none">—</div><div class="yl">${y}</div></div>`;
      const hs = (r.susi || 0) / mx * 90, hj = (r.jungsi || 0) / mx * 90;
      return `<div class="yb" title="${y}: 수시 ${r.susi}, 정시 ${r.jungsi} (${r.basis} 기준)"><div class="ystack"><div class="yj" style="height:${hj}px"></div><div class="ys" style="height:${hs}px"></div></div><div class="yv">${r.susi}<span>/${r.jungsi}</span></div><div class="yl">${y}</div></div>`;
    }).join('');
    const a = s.ach2025, p = s.plan2026;
    const card = el('div', { class: 'snu-detail card' });
    card.innerHTML = `<h3>${esc(s.name)} <span class="badge">${esc(s.typeLabel)}</span> <span class="badge">${esc(s.region)}</span></h3>
      <div class="grid2" style="margin-top:12px">
        <div><div class="sec-title">서울대 합격 5개년 (수시/정시)</div><div class="ybars">${bars}</div>
          <div class="snu-legend"><span><i class="lg-s"></i>수시</span><span><i class="lg-j"></i>정시</span><span class="aoc">2022·2023은 등록 기준</span></div></div>
        <div><div class="sec-title">역추산 해석</div><p class="snu-read">${esc(s.reading)}</p>
          ${s.achNote ? `<p class="note" style="margin-top:8px">⚠ ${esc(s.achNote)}</p>` : ''}</div>
      </div>
      <div class="grid2" style="margin-top:14px">
        <div><div class="sec-title">2025 운영 교육과정·성적 구조 (2015 개정 학년 포함)</div>${a ? `
          <table class="cmp"><tbody>
          <tr><td>2·3학년 실제 개설 과목</td><td class="num"><b>${a.n23}</b></td></tr>
          <tr><td>심화·전문교과 과목</td><td class="num"><b>${a.nSim}</b></td></tr>
          <tr><td>과학Ⅱ 개설</td><td class="num">${a.sci2.length}/4</td></tr>
          <tr><td>고급·심화 수학</td><td>${esc(a.advMath.join(', ') || '없음')}</td></tr>
          <tr><td>고급·AP 과학</td><td>${esc(a.advSci.join(', ') || '없음')}</td></tr>
          <tr><td>2학년 핵심과목 평균 / A비율</td><td class="num">${fmt(a.g2Avg)} / ${fmt(a.g2A)}%</td></tr>
          <tr><td>1학년 공통과목 A비율</td><td class="num">${fmt(a.g1A)}%</td></tr>
          <tr><td>3학년 진로선택 A비율</td><td class="num">${fmt(a.careerA)}%</td></tr>
          </tbody></table>` : '<p class="note"><span class="badge none">미입력</span> 제공 자료 확인 필요</p>'}</div>
        <div><div class="sec-title">2026 입학생 편제 (2022 개정)</div>
          <table class="cmp"><tbody>
          <tr><td>2·3학년 편성 과목</td><td class="num"><b>${p.n23}</b></td></tr>
          <tr><td>과학 진로선택</td><td class="num">${p.sciCareer.length}/8</td></tr>
          <tr><td>미적분Ⅱ · 기하</td><td class="num">${p.calc2 ? '○' : '✕'} · ${p.geometry ? '○' : '✕'}</td></tr>
          <tr><td>고급·전문·실험·과제연구</td><td>${esc(p.pro.join(', ') || '없음')}</td></tr>
          <tr><td>공동교육과정 등</td><td>${esc(p.joint || '편제 문서에 언급 없음')}</td></tr>
          </tbody></table>
          ${p.note ? `<p class="note" style="margin-top:6px">판독 메모: ${esc(p.note)}</p>` : ''}</div>
      </div>`;
    host.appendChild(card);
  }

  /* ---------- 2028 권장과목 ---------- */
  function renderRec() {
    const host = $('#snuRec'), R = V.data.rec2028; if (!host || !R) return;
    const t = el('table', { class: 'cmp snu-rec' });
    t.innerHTML = '<thead><tr><th>유형</th><th>모집단위</th><th>권장 이수</th></tr></thead><tbody>' +
      R.types.map(x => `<tr><td><b>${esc(x.type)}</b></td><td>${esc(x.units)}</td><td>${esc(x.rule)}</td></tr>`).join('') + '</tbody>';
    host.appendChild(t);
    const t2 = el('table', { class: 'cmp snu-rec', style: 'margin-top:10px' });
    t2.innerHTML = '<thead><tr><th>유형② 우선 이수 권장(일반선택)</th><th>모집단위</th></tr></thead><tbody>' +
      R.priority.map(x => `<tr><td><b>${esc(x.subject)}</b></td><td>${esc(x.units)}</td></tr>`).join('') + '</tbody>';
    host.appendChild(t2);
    const n = V.data.schools.length;
    const ok = V.data.schools.filter(s => s.plan2026.calc2 && s.plan2026.geometry && s.plan2026.sciCareer.length >= 3).length;
    host.appendChild(el('p', { class: 'cmp-note', html: `18개교 2026 입학생 편제 중 <b>${ok}/${n}개교</b>가 유형② 수학·과학 조건(기하·미적분Ⅱ·과학 진로선택 3과목 이상)을 교내 편제로 충족합니다. 즉 이 학교들 사이에서는 권장과목 개설 여부보다 <b>얼마나 깊이 이수했는지</b>가 차이를 만듭니다.<br><span class="aoc">${esc(R.source)}</span>` }));
  }

  /* ===========================================================
     내 학교 비교 · 불리 요인 진단 · 보강 방안
     - 학교 구조 요인(학생이 바꿀 수 없음)과 학생 선택·기록 요인(바꿀 수 있음)을 나눈다
     - 기준: 18개교 분포(사분위) + 같은 유형 중앙값 + 서울대 평가 원칙
     =========================================================== */
  const SCI8 = ['역학과 에너지', '전자기와 양자', '물질과 에너지', '화학 반응의 세계', '세포와 물질대사', '생물의 유전', '지구시스템과학', '행성우주과학'];
  const nz = s => String(s || '').replace(/\s/g, '');
  const nk = s => nz(s).replace(/Ⅰ/g, '1').replace(/Ⅱ/g, '2').replace(/[·•ㆍ]/g, '');
  const CORE2 = ['문학', '독서', '언어와매체', '화법과작문', '수학1', '수학2', '미적분', '확률과통계', '영어1', '영어2', '물리학1', '화학1', '생명과학1', '지구과학1'];
  const RX_SCI = /고급(물리|화학|생명|지구)|고전역학|유기화학|분자생물|AP(물리|화학|생물|환경)|전자기|양자|열역학|물리화학|생화학|세포/;
  const RX_MATH = /심화수학|고급수학|미적분학|선형대수|이산수학|통계학|수학과제|경제수학|인공지능수학|기하와벡터|해석|정수론|수학연습|미적분2|대수/;
  const RX_DEEP = /^(고급|전문|심화)|과제 ?연구|과제 ?탐구|실험$|이산 수학/;

  /* jinro-dash 학과 → 서울대 2028 권장 유형 (유사 모집단위 기준 근사) */
  const PROG = {
    physics: ['②', '물리학'], mechanical: ['②', '물리학'], electrical: ['②', '물리학'], semiconductor: ['②', '물리학'],
    chemistry: ['②', '화학'], biology: ['②', '생명과학'], medicine: ['②', '생명과학', ['세포와 물질대사', '생물의 유전']],
    earthsci: ['②', '지구과학'], astronomy: ['②', '지구과학'], oceanography: ['②', '지구과학'], pharmacy: ['②', '화학|생명과학'],
    computer: ['②'], mathematics: ['②'], statistics: ['②'], materials: ['②'], chemeng: ['②'],
    nursing: ['②', null, null, true], dentistry: ['②', null, null, true],
  };
  const LV = {
    bad: { t: '불리', i: '▼' }, warn: { t: '주의', i: '!' }, neutral: { t: '중립', i: '–' },
    good: { t: '강점', i: '▲' }, none: { t: '미입력', i: '?' },
  };
  function quart(arr) {
    const a = arr.filter(v => v != null).sort((x, y) => x - y), q = f => { const i = (a.length - 1) * f, lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
    return { q1: +q(.25).toFixed(1), med: +q(.5).toFixed(1), q3: +q(.75).toFixed(1), n: a.length, above: v => a.filter(x => x < v).length };
  }

  /* 학교 JSON에서 18개교와 같은 정의로 지표를 뽑는다 */
  function schoolProfile(sc) {
    const names = new Set(), explore = new Set(), cats = {};
    (sc.tracks || []).forEach(t => (t.phases || []).forEach(ph => {
      if (ph.grade === 1) return;
      (ph.options || []).forEach(o => { names.add(o.subject); cats[o.subject] = o.category; if (/^(과학|사회|제2외국어|한문)/.test(o.area || '')) explore.add(o.subject); });
    }));
    (sc.professionalSubjects || []).forEach(p => names.add(p.name));
    const N = new Set([...names].map(nz));
    const pro = [...new Set([...names].filter(x => RX_DEEP.test(x) && !/탐구실험/.test(x)).concat((sc.professionalSubjects || []).map(p => p.name)))];
    const rows = (sc.subjectAchievement && sc.subjectAchievement.rows) || [];
    const op = new Set(rows.filter(r => +r.grade >= 2).map(r => r.subject.trim()));
    const opK = [...op].map(nk);
    let avgs = [], As = [];
    rows.filter(r => +r.grade === 2 && CORE2.includes(nk(r.subject))).forEach(r => [r.sem1, r.sem2].forEach(m => { if (m && m.avg != null) { avgs.push(m.avg); if (m.A != null) As.push(m.A); } }));
    const mean = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
    return {
      names, N, cats, pro, explore: explore.size,
      sci: SCI8.filter(x => N.has(nz(x))), calc2: N.has('미적분Ⅱ'), geo: N.has('기하'),
      lang: [...names].some(x => /독일어|프랑스어|스페인어|중국어|일본어|러시아어|아랍어|베트남어|한문/.test(x)),
      op: rows.length ? op.size : null,
      adv: rows.length ? opK.filter(x => RX_SCI.test(x) || RX_MATH.test(x)).length : null,
      g2Avg: mean(avgs), g2A: mean(As),
      type: sc.schoolType || '',
    };
  }

  function diagnose(S) {
    const D = V.data, sc = S.school; if (!sc || !D) return null;
    const me = schoolProfile(sc);
    const isIlban = /일반고|자율형공립/.test(me.type);
    const peers = D.schools.filter(s => s.group === (isIlban ? '일반고' : '자사고군'));
    const B = {
      op: quart(D.schools.map(s => s.ach2025.n23)), opPeer: quart(peers.map(s => s.ach2025.n23)),
      adv: quart(D.schools.map(s => s.ach2025.advMath.length + s.ach2025.advSci.length)),
      g2A: quart(D.schools.map(s => s.ach2025.g2A)), g2Avg: quart(D.schools.map(s => s.ach2025.g2Avg)),
      ex: quart(D.schools.map(s => s.plan2026.nExplore)), pro: quart(D.schools.map(s => s.plan2026.pro.length)),
    };
    const peerLbl = isIlban ? '일반고 9' : '자사고군 9';
    const items = [];
    const add = o => items.push(o);
    const tier = (v, q) => v == null ? 'none' : v < q.q1 ? 'bad' : v < q.med ? 'warn' : v >= q.q3 ? 'good' : 'neutral';

    /* ── 학교 구조 요인 ── */
    add({ owner: '학교', item: '운영 과목 폭', eval: '학업태도 · 교육환경 맥락', level: tier(me.op, B.op), value: me.op,
      bench: `18개교 중앙값 ${B.op.med} (하위 25% ${B.op.q1}) · ${peerLbl} 중앙값 ${B.opPeer.med}`,
      why: '2·3학년에 실제 운영된 과목 수. 역추산에서 수시 합격률과 가장 강하게 함께 움직인 축입니다(ρ=+0.70).',
      fix: ['학교에 없는 과목은 공동교육과정·온라인학교로 이수 (서울대는 공동교육과정 이수 과목 인정)', 'STEP 5에서 “직접 추가”로 설계에 넣어 이수 경로를 확정'] });
    add({ owner: '학교', item: '고급·심화 수학·과학 운영', eval: '학업태도(도전) · 정성평가(이수자 수)', level: tier(me.adv, B.adv), value: me.adv,
      bench: `18개교 중앙값 ${B.adv.med} (하위 25% ${B.adv.q1})`,
      why: '고급 과목·심화 수학·AP 등 운영 수. 고급 수학 계열은 수시 합격률과 ρ=+0.76.',
      fix: ['공동교육과정의 고급 수학·고급 과학 수강', '정규 과목 안에서 한 단계 심화한 탐구를 세특에 남기기 (STEP 5 주제 카드)'] });
    add({ owner: '학교', item: '2022 개정 편제의 탐구 교과 폭', eval: '교육환경 맥락', level: tier(me.explore, B.ex), value: me.explore,
      bench: `18개교(2026 입학생 편제) 중앙값 ${B.ex.med}`,
      why: '과학·사회·제2외국어/한문 선택 과목 수. 2025 입학생부터 해당되는 편제 기준입니다.',
      fix: ['부족한 교과군은 공동교육과정 목록에서 먼저 확인'] });
    add({ owner: '학교', item: '고급·전문·실험·과제연구 편제', eval: '학업태도 · 교육환경 맥락', level: tier(me.pro.length, B.pro), value: me.pro.length,
      bench: `18개교 중앙값 ${B.pro.med}` + (me.pro.length ? ` · 내 학교: ${me.pro.slice(0, 5).join(', ')}${me.pro.length > 5 ? ' 등' : ''}` : ''),
      why: '2028 이후 편제 격차가 줄면 이 축에서 차이가 남습니다.',
      fix: ['R&E·과제연구형 공동교육과정, 대학 연계 프로그램 활용'] });
    /* 성적 구조 — 불리보다는 '해석'의 문제 */
    let gl = 'none', gw = '학교알리미 과목별 성취 자료가 없어 판단하지 않습니다.', gf = [];
    if (me.g2A != null) {
      if (me.g2A >= B.g2A.q3) { gl = 'warn'; gw = `A비율이 높은 편(${me.g2A}%)이라 A 자체로는 변별이 약합니다. 18개교에서 A비율은 합격률과 관계가 없었습니다(ρ=+0.29).`; gf = ['원점수·과목 평균 대비 위치와 세특의 학업 수행 내용으로 차별화', '난도 높은 선택과목을 피하지 않기']; }
      else if ((me.g2Avg != null && me.g2Avg < B.g2Avg.q1) || me.g2A < B.g2A.q1) { gl = 'neutral'; gw = `A비율 ${me.g2A}% · 평균 ${me.g2Avg}점으로 성적을 엄격하게 주는 학교입니다. 서울대는 평균·분포와 함께 정성평가하므로 등급만으로 크게 불리하지 않습니다. 다만 교과 정량 반영이 큰 다른 대학·전형에서는 불리할 수 있습니다.`; gf = ['대학별로 지원 전략을 나누기 (서울대 종합 ↔ 교과 정량 대학)']; }
      else { gl = 'neutral'; gw = `A비율 ${me.g2A}% · 평균 ${me.g2Avg}점으로 18개교 범위 안입니다.`; }
    }
    add({ owner: '학교', item: '성적 분포 구조', eval: '학업역량 (주어진 여건에서의 성취)', level: gl, value: me.g2A != null ? `A ${me.g2A}% · 평균 ${me.g2Avg}` : null,
      bench: `18개교 A비율 중앙값 ${B.g2A.med}% · 평균 중앙값 ${B.g2Avg.med}점 (2학년 핵심과목)`, why: gw, fix: gf });
    /* 전형 통로 */
    add(isIlban
      ? { owner: '학교', item: '전형 통로', eval: '전형 구조', level: 'good', value: '지역균형 가능', bench: '2027 추천 2명 → 2028 3명·수능최저 폐지(발표 기준)',
          why: '일반고 9개교 수시 인원의 바닥을 지역균형이 받칩니다.', fix: ['교내 추천 기준(학업·학생부 충실도)을 조기에 확인'] }
      : { owner: '학교', item: '전형 통로', eval: '전형 구조', level: 'warn', value: '2028 지역균형 불가', bench: '자사고·외고·국제고·과학고·영재학교는 2028부터 지역균형 지원 불가(발표 기준)',
          why: '일반전형(서류 1단계 2배수)만 남아, 학생부의 교육과정 깊이가 더 중요해집니다.', fix: ['일반전형 기준으로 학업태도·전공 심화 근거를 집중 설계'] });

    /* ── 전공 권장과목 (학교 개설 여부) ── */
    const P = S.program, pm = P && PROG[P.programId];
    let recMiss = [], recNeed = [];
    if (P) {
      if (pm) {
        if (pm[3]) recNeed.push('기하|미적분Ⅱ'); else recNeed.push('미적분Ⅱ', '기하');
        if (pm[1]) recNeed.push(pm[1]);
        (pm[2] || []).forEach(x => recNeed.push(x));
        recMiss = recNeed.filter(x => x.split('|').every(y => !me.N.has(nz(y))));
        if (me.sci.length < 3) recMiss.push('과학 진로선택 3과목 이상');
      } else {
        recNeed.push('제2외국어/한문 1과목'); if (!me.lang) recMiss.push('제2외국어/한문 1과목');
      }
      add({ owner: '학교', item: `서울대 2028 권장과목 개설 (${P.name}, 유형${pm ? pm[0] : '①'})`, eval: '교육환경 · 전공 연계 이수', level: recMiss.length ? 'bad' : 'good',
        value: recMiss.length ? `미개설 ${recMiss.length}` : '충족 가능', bench: '권장: ' + recNeed.map(x => x.replace('|', ' 또는 ')).join(', '),
        why: recMiss.length ? `교내 편제로 확인되지 않음: ${recMiss.map(x => x.replace('|', ' 또는 ')).join(', ')}` : '교내 편제로 권장 조건을 채울 수 있습니다.',
        fix: recMiss.length ? ['공동교육과정·온라인학교로 1학년 때 이수 경로 확정', 'STEP 5 “직접 추가”로 설계에 반영'] : [] });
      const coreMiss = (P.coreSubjects || []).filter(x => !me.N.has(nz(x)));
      if (coreMiss.length) add({ owner: '학교', item: `학과 핵심과목 개설 (${P.name})`, eval: '진로 연계 이수', level: coreMiss.length >= 2 ? 'bad' : 'warn', value: `미개설 ${coreMiss.length}`,
        bench: '대시보드 학과 핵심: ' + (P.coreSubjects || []).join(', '), why: '학교 편제에 없음: ' + coreMiss.join(', '), fix: ['공동교육과정 개설 여부 확인 후 직접 추가'] });
    }

    /* ── 학생 선택 요인 (바꿀 수 있음) ── */
    const mine = new Set([...(S.selected || []), ...(S.taken || []), ...((S.manual || []).map(m => m.subject || m.name || m))].map(nz));
    if (!P) add({ owner: '학생 선택', item: '학과 미선택', eval: '—', level: 'none', value: null, bench: '', why: 'STEP 4에서 세부 학과를 고르면 권장과목·핵심과목 기준으로 진단합니다.', fix: [] });
    else if (!mine.size) add({ owner: '학생 선택', item: '과목 선택 전', eval: '학업태도', level: 'none', value: null, bench: '', why: 'STEP 5에서 과목을 고르면 “학교에 있는데 고르지 않은 권장·핵심 과목”을 찾아냅니다.', fix: [] });
    else {
      const want = [...new Set(recNeed.concat(P.coreSubjects || []))].filter(x => !recMiss.includes(x));
      const skipped = want.filter(x => x.split('|').some(y => me.N.has(nz(y))) && x.split('|').every(y => !mine.has(nz(y))));
      add({ owner: '학생 선택', item: '개설된 권장·핵심과목 선택', eval: '학업태도 · 전공 연계 이수', level: skipped.length ? 'bad' : 'good', value: skipped.length ? `미선택 ${skipped.length}` : '모두 선택',
        bench: '학교에 개설된 과목 기준', why: skipped.length ? `학교에 있는데 고르지 않은 과목: ${skipped.map(x => x.replace('|', ' 또는 ')).join(', ')}. 개설된 과목을 피한 것은 학교 탓으로 설명되지 않습니다.` : '학교에서 들을 수 있는 권장·핵심 과목을 모두 설계에 넣었습니다.',
        fix: skipped.length ? ['STEP 5에서 해당 과목을 선택 (학기 상한 안에서 교체)'] : [] });
      const deep = [...mine].filter(x => RX_DEEP.test(x) || me.cats[[...me.names].find(n => nz(n) === x)] === '진로선택');
      add({ owner: '학생 선택', item: '도전적 과목 이수', eval: '학업태도(도전) · 정성평가', level: deep.length >= 4 ? 'good' : deep.length >= 2 ? 'neutral' : 'warn', value: deep.length,
        bench: '진로선택·고급·심화·과제연구 과목 수', why: '서울대는 소수 수강·고난도 과목의 등급 불이익을 걱정해 피하지 말라고 안내합니다.', fix: deep.length < 4 ? ['학교 또는 공동교육과정의 진로선택·고급 과목을 추가'] : [] });
      const manual = (S.manual || []).length;
      if (recMiss.length || tier(me.op, B.op) === 'bad') add({ owner: '학생 선택', item: '공동교육과정 보강 여부', eval: '교육환경 극복 노력', level: manual ? 'good' : 'bad', value: manual ? `${manual}과목 추가` : '없음',
        bench: '학교 구조가 불리한 경우 필요', why: manual ? '학교 밖 이수로 구조적 불리를 보완하고 있습니다.' : '학교 편제의 빈틈을 메우는 과목이 설계에 없습니다.', fix: manual ? [] : ['STEP 5 “직접 추가”에 공동교육과정 과목 입력'] });
    }

    /* ── 학생 기록 요인 (생기부 진단 결과) ── */
    const d = S.diagnosis;
    if (d && d.gaps) {
      if (!d.gaps.length) add({ owner: '학생 기록', item: '생기부 보완점', eval: '학업역량·진로역량·공동체역량', level: 'good', value: '없음', bench: 'STEP 3 진단', why: '규칙 기반 진단에서 뚜렷한 보완점이 없었습니다.', fix: [] });
      d.gaps.forEach(g => add({ owner: '학생 기록', item: g.label, eval: g.kind === 'cat' ? '학업태도·진로역량' : g.kind === 'data' ? '학업역량(탐구 깊이)' : g.kind === 'lead' ? '학업 외 소양' : '학업태도', level: 'warn', value: null, bench: 'STEP 3 진단', why: g.why, fix: [g.hint] }));
    } else add({ owner: '학생 기록', item: '생기부 진단 전', eval: '—', level: 'none', value: null, bench: '', why: 'STEP 3에서 생기부를 진단하면 기록 단위의 보완점이 여기에 합쳐집니다.', fix: [] });

    /* 보강 우선순위: 학생이 바꿀 수 있는 불리 → 학교 구조의 불리(학교 밖 이수로 메움) → 기록 → 주의 */
    const rank = o => (o.level === 'bad' ? 0 : o.level === 'warn' ? 10 : 99) + (o.owner === '학생 선택' ? 0 : o.owner === '학교' ? 1 : 2);
    const todo = items.filter(o => (o.level === 'bad' || o.level === 'warn') && o.fix.length).sort((a, b) => rank(a) - rank(b));
    const selfIn = D.schools.find(z => nz(sc.name).replace(/(고등학교|\(.*\))/g, '').replace(/고$/, '') === z.name.replace(/고$/, ''));
    return { me, items, todo, peerLbl, isIlban, selfIn };
  }

  function diagNode(S, forPrint) {
    const r = diagnose(S); if (!r) return null;
    const wrap = el('div', { class: 'snu-diag' });
    const cnt = k => r.items.filter(o => o.level === k).length;
    wrap.appendChild(el('div', { class: 'snu-tiles', html: ['bad', 'warn', 'good', 'none'].map(k =>
      `<div class="snu-tile lv-${k}"><div class="n">${cnt(k)}</div><div class="l">${LV[k].i} ${LV[k].t}</div></div>`).join('') }));
    ['학교', '학생 선택', '학생 기록'].forEach(ow => {
      const its = r.items.filter(o => o.owner === ow); if (!its.length) return;
      wrap.appendChild(el('h4', { class: 'snu-h4', text: ow === '학교' ? '학교 구조 요인 — 학생이 바꿀 수 없음, 학교 밖 이수로 메움' : ow === '학생 선택' ? '학생 선택 요인 — 지금 바꿀 수 있음' : '학생 기록 요인 — 생기부에서 보완' }));
      const t = el('table', { class: 'cmp snu-dtbl' });
      t.innerHTML = '<thead><tr><th>판정</th><th>항목 · 서울대 평가 요소</th><th class="num">내 학교/학생</th><th>기준과 근거</th></tr></thead><tbody>' + its.map(o =>
        `<tr><td><span class="lvb lv-${o.level}">${LV[o.level].i} ${LV[o.level].t}</span></td><td><b>${esc(o.item)}</b><div class="aoc">${esc(o.eval)}</div></td>` +
        `<td class="num">${o.value == null ? '—' : esc(o.value)}</td><td>${esc(o.why)}${o.bench ? `<div class="aoc">${esc(o.bench)}</div>` : ''}</td></tr>`).join('') + '</tbody>';
      wrap.appendChild(forPrint ? t : el('div', { class: 'snu-scroll' }, [t]));
    });
    wrap.appendChild(el('h4', { class: 'snu-h4', text: '무엇을 보강할까 — 우선순위' }));
    if (!r.todo.length) wrap.appendChild(el('p', { class: 'note', text: '현재 입력 기준으로 보강이 급한 항목은 없습니다. 과목 안 탐구의 깊이를 계속 쌓으세요.' }));
    else {
      const ol = el('ol', { class: 'snu-todo' });
      r.todo.forEach(o => ol.appendChild(el('li', { html: `<span class="lvb lv-${o.level}">${LV[o.level].i} ${LV[o.level].t}</span> <b>${esc(o.item)}</b> <span class="aoc">(${esc(o.owner)})</span><ul>${o.fix.map(f => `<li>☐ ${esc(f)}</li>`).join('')}</ul>` })));
      wrap.appendChild(ol);
    }
    if (r.selfIn) wrap.appendChild(el('p', { class: 'note', html: `※ 내 학교(${esc(r.selfIn.name)})는 비교 기준 18개교에 포함되어 있습니다. 분포에 자기 값이 섞여 있다는 점을 감안하세요.` }));
    wrap.appendChild(el('p', { class: 'note', style: 'margin-top:10px', html: `기준: 서울대 수시 다수 배출 18개교(${esc(r.peerLbl)} 포함)의 분포. 하위 25% 미만 = 불리, 중앙값 미만 = 주의, 상위 25% 이상 = 강점. 학교 지표는 학교알리미 공시·편제표 기준이며 공시 연도가 18개교와 다를 수 있습니다. <b>합격 가능성 예측이 아닙니다.</b>` }));
    return wrap;
  }

  function renderMine() {
    const host = $('#snuMine'); if (!host || !V.data) return;
    host.innerHTML = '';
    const S = V.S || {};
    if (!S.school) { host.appendChild(el('p', { class: 'note', text: 'STEP 2에서 학교를 고르면, 18개교와 같은 기준으로 내 학교의 불리한 점과 학생이 보강할 점을 나눠 보여 줍니다. STEP 4 학과·STEP 5 과목·STEP 3 생기부 진단을 마치면 더 정확해집니다.' })); return; }
    host.appendChild(diagNode(S));
    host.appendChild(el('p', { class: 'note', text: '※ 학과 → 서울대 모집단위 대응은 근사입니다. 최종 판단은 서울대 “2028 전공 연계 과목 선택 안내” 원문으로 확인하세요.' }));
  }

  async function ensure() {
    if (!V.data) V.data = await loadJSON('snu-analysis.json', { schema: { schools: '배열', findings: '배열', framework: '객체' } });
    return V.data;
  }
  /* 리포트(STEP 6)용 — 인쇄 레이아웃 */
  async function reportSection(S) {
    if (!S.school || !(await ensure())) return null;
    V.S = S;
    const sec = el('div', { class: 'snu-report' });
    sec.appendChild(el('h2', { text: '서울대 기준 · 내 학교 불리 요인과 보강 방안' }));
    sec.appendChild(diagNode(S, true));
    return sec;
  }
  function reportHTML() { const n = $('#snuMine'); return n ? n.innerHTML : ''; }

  global.SnuAnalysis = { render, renderMine, reportHTML, reportSection, diagnose, ensure };
})(window);
