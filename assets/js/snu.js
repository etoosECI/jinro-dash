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
    host.appendChild(el('div', { class: 'sec-title', style: 'margin-top:22px', text: '내 학교 편제 점검 (STEP 2에서 고른 학교)' }));
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

  /* ---------- 내 학교 점검 (STEP 2 학교 · STEP 4 학과와 연동) ---------- */
  const SCI8 = ['역학과 에너지', '전자기와 양자', '물질과 에너지', '화학 반응의 세계', '세포와 물질대사', '생물의 유전', '지구시스템과학', '행성우주과학'];
  const nz = s => String(s || '').replace(/\s/g, '');
  /* 서울대 2028 유형 근사 매핑 (jinro-dash 학과 → 서울대 유사 모집단위) */
  const PROG = {
    physics: ['②', '물리학'], mechanical: ['②', '물리학'], electrical: ['②', '물리학'], semiconductor: ['②', '물리학'],
    chemistry: ['②', '화학'], biology: ['②', '생명과학'], medicine: ['②', '생명과학', ['세포와 물질대사', '생물의 유전']],
    earthsci: ['②', '지구과학'], astronomy: ['②', '지구과학'], oceanography: ['②', '지구과학'], pharmacy: ['②', '화학|생명과학'],
    computer: ['②'], mathematics: ['②'], statistics: ['②'], materials: ['②'], chemeng: ['②'],
    nursing: ['②', null, null, true], dentistry: ['②', null, null, true],
  };
  function renderMine() {
    const host = $('#snuMine'); if (!host || !V.data) return;
    host.innerHTML = '';
    const S = V.S || {}, sc = S.school;
    if (!sc) { host.appendChild(el('p', { class: 'note', text: 'STEP 2에서 학교를 고르면, 내 학교 편제를 18개교와 같은 기준으로 비교하고 서울대 2028 권장과목 충족 여부를 점검합니다.' })); return; }
    const names = new Set(), explore = new Set();
    (sc.tracks || []).forEach(t => (t.phases || []).forEach(ph => {
      if (ph.grade === 1) return;
      (ph.options || []).forEach(o => { names.add(o.subject); if (/^(과학|사회|제2외국어|한문)/.test(o.area || '')) explore.add(o.subject); });
    }));
    (sc.professionalSubjects || []).forEach(p => names.add(p.name));
    const N = new Set([...names].map(nz));
    const pro = [...names].filter(x => /^고급|전문 ?수학|과제 ?연구|실험$/.test(x) && !/탐구실험/.test(x));
    (sc.professionalSubjects || []).forEach(p => { if (!pro.includes(p.name)) pro.push(p.name); });
    const sci = SCI8.filter(s => N.has(nz(s)));
    const calc2 = N.has('미적분Ⅱ'), geo = N.has('기하');
    const lang = [...names].some(x => /독일어|프랑스어|스페인어|중국어|일본어|러시아어|아랍어|베트남어|한문/.test(x));
    const P = V.data.schools.map(s => s.plan2026);
    const EX = P.map(p => p.nExplore), med23 = median(EX), medPro = median(P.map(p => p.pro.length));
    const below = EX.filter(a => a < explore.size).length;
    const rows = [
      ['2·3학년 탐구 교과 선택 폭<div class="aoc">과학·사회·제2외국어/한문 과목 수 (학교지정 과목 표기 방식 차이를 피하려고 이 세 교과로 비교)</div>', `<b>${explore.size}</b>`, `18개교 중앙값 ${med23} · 18개교 중 ${below}개교보다 많음`],
      ['고급·전문·실험·과제연구', `<b>${pro.length}</b>`, `중앙값 ${medPro}` + (pro.length ? ` · ${esc(pro.slice(0, 6).join(', '))}${pro.length > 6 ? ' 등' : ''}` : '')],
      ['과학 진로선택(8과목 중)', `<b>${sci.length}</b>`, sci.length < 8 ? '미개설: ' + esc(SCI8.filter(s => !sci.includes(s)).join(', ')) : '모두 개설'],
      ['미적분Ⅱ · 기하', `${calc2 ? '○' : '✕'} · ${geo ? '○' : '✕'}`, '유형②(자연·공학·의약) 필수 권장'],
      ['제2외국어/한문', lang ? '○' : '✕', '유형①(인문·사회·경영) 1과목 이상 권장'],
    ];
    const t = el('table', { class: 'cmp' });
    t.innerHTML = `<thead><tr><th>${esc(sc.name)}</th><th class="num">내 학교</th><th>18개교 기준·비고</th></tr></thead><tbody>` +
      rows.map(r => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td>${r[2]}</td></tr>`).join('') + '</tbody>';
    host.appendChild(t);

    const out = [];
    if (explore.size < med23) out.push(`<b>개설 폭</b> — 탐구 교과 선택 폭이 18개교 중앙값(${med23})보다 적습니다. 역추산 결과 개설 폭은 수시 전환율과 가장 강하게 관련된 축이므로, 공동교육과정·온라인학교로 <u>필요한 과목에 도전한 이력</u>을 보완하는 것이 좋습니다.`);
    if (pro.length < medPro) out.push(`<b>심화 과목</b> — 고급·전문·실험·과제연구 과목이 적습니다. 이공·의약 계열이면 과목 안의 탐구(STEP 5)와 공동교육과정의 고급 과목으로 “깊이” 근거를 만드세요.`);
    const prog = S.program && PROG[S.program.programId];
    if (S.program) {
      if (prog) {
        const miss = [];
        if (prog[3]) { if (!calc2 && !geo) miss.push('기하 또는 미적분Ⅱ'); } else { if (!calc2) miss.push('미적분Ⅱ'); if (!geo) miss.push('기하'); }
        if (sci.length < 3) miss.push('과학 진로선택 3과목 이상');
        if (prog[1]) prog[1].split('|').every(x => !N.has(nz(x))) && miss.push(prog[1].replace('|', ' 또는 '));
        (prog[2] || []).forEach(x => { if (!N.has(nz(x))) miss.push(x); });
        out.push(`<b>${esc(S.program.name)} · 서울대 유형${prog[0]} 기준</b> — ` + (miss.length
          ? `교내 편제로 확인되지 않는 권장 이수: <b>${esc(miss.join(', '))}</b>. 공동교육과정·온라인학교 이수가 인정되니 1학년 때 경로를 확정하세요.`
          : `권장 수학·과학 조건을 교내 편제로 충족할 수 있습니다${prog[1] ? ` (우선 이수: ${esc(prog[1].replace('|', ' 또는 '))})` : ''}. 이제는 이수 여부보다 수업 안 탐구의 깊이가 관건입니다.`));
      } else {
        out.push(`<b>${esc(S.program.name)} · 서울대 유형① 기준(근사)</b> — ` + (lang ? '제2외국어/한문 과목이 편제에 있어 권장 조건을 교내에서 충족할 수 있습니다.' : '제2외국어/한문이 편제에서 확인되지 않습니다. 온라인학교·공동교육과정으로 1과목 이상 이수를 계획하세요.'));
      }
    } else out.push('STEP 4에서 세부 학과를 고르면 서울대 2028 권장과목 기준으로 부족한 과목을 짚어 드립니다.');
    out.push('※ 학과 → 서울대 모집단위 대응은 근사입니다. 최종 판단은 서울대 “2028 전공 연계 과목 선택 안내” 원문으로 확인하세요.');
    host.appendChild(el('div', { class: 'cmp-note', html: out.join('<br><br>') }));
  }

  /* 리포트용 요약 (app.js 리포트에서 선택적으로 사용) */
  function reportHTML() { const n = $('#snuMine'); return n ? n.innerHTML : ''; }

  global.SnuAnalysis = { render, renderMine, reportHTML };
})(window);
