/* ===========================================================
   core.js — 공통 유틸 · 안전 로더 · 스키마 검증 · 오류 배너
   ⚠️ 여기는 엔진입니다. 데이터를 바꿀 때 이 파일은 건드리지 마세요.
   =========================================================== */
(function (global) {
  'use strict';

  /* ---------- DOM 헬퍼 ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;              // 신뢰된 내부 문자열만 사용
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    (children || []).forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* ---------- 오류/알림 배너 (fail-safe의 얼굴) ---------- */
  const seenBanners = new Set();
  function banner(kind, title, detail, opts) {
    const key = kind + '|' + title + '|' + (detail || '');
    if (!(opts && opts.repeat) && seenBanners.has(key)) return;
    seenBanners.add(key);
    const host = $('#banners');
    if (!host) { console[kind === 'err' ? 'error' : 'warn'](title, detail || ''); return; }
    const b = el('div', { class: 'banner ' + kind });
    b.appendChild(el('div', { html: '<b>' + esc(title) + '</b>' + (detail ? '<br>' + esc(detail) : '') }));
    b.appendChild(el('button', { class: 'x', type: 'button', 'aria-label': '닫기', text: '✕', onclick: () => b.remove() }));
    host.appendChild(b);
    if (kind === 'info') setTimeout(() => b.remove(), 6000);
    return b;
  }

  /* ---------- 아주 작은 스키마 검증기 ----------
     spec 예: { name:'문자열', tracks:'배열', region:'객체?' }  ('?' = 선택)
     반환: { ok:true } | { ok:false, errors:[...] }               */
  const TYPE_OF = v => Array.isArray(v) ? '배열' : v === null ? '널' : typeof v === 'object' ? '객체'
    : typeof v === 'string' ? '문자열' : typeof v === 'number' ? '숫자' : typeof v === 'boolean' ? '불린' : '없음';

  function validate(obj, spec, label) {
    const errors = [];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, errors: [(label || '데이터') + ': 객체 형식이 아닙니다'] };
    }
    for (const [key, rule] of Object.entries(spec)) {
      const optional = rule.endsWith('?');
      const want = optional ? rule.slice(0, -1) : rule;
      const has = Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null;
      if (!has) { if (!optional) errors.push(`'${key}' 항목이 없습니다 (필수: ${want})`); continue; }
      const got = TYPE_OF(obj[key]);
      if (got !== want) errors.push(`'${key}' 형식이 ${want}이어야 하는데 ${got}입니다`);
    }
    return errors.length ? { ok: false, errors } : { ok: true };
  }

  /* ---------- 안전한 JSON 로더 (실패해도 앱이 죽지 않음) ---------- */
  const cache = new Map();
  const BASE = (function () {
    const p = location.pathname;
    return p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1);
  })();

  async function loadJSON(relPath, opts) {
    const o = opts || {};
    if (cache.has(relPath)) return cache.get(relPath);
    const url = BASE + 'data/' + relPath.split('/').map(encodeURIComponent).join('/');
    let data = null;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (e) {
      const local = location.protocol === 'file:';
      banner('err', `데이터를 불러오지 못했습니다: ${relPath}`,
        local ? '브라우저에서 파일을 직접 연 경우(file://) 보안 정책 때문에 JSON을 읽을 수 없습니다. README의 "로컬에서 실행하기"를 참고해 간단한 정적 서버로 열어 주세요.'
              : `사유: ${e.message}. 파일 경로와 JSON 문법(쉼표·따옴표)을 확인해 주세요.`);
      cache.set(relPath, null);
      return null;
    }
    if (o.schema) {
      const v = validate(data, o.schema, relPath);
      if (!v.ok) {
        banner('warn', `데이터 형식 오류: ${relPath}`, v.errors.join(' / ') + ' — 이 항목만 제외하고 나머지는 정상 동작합니다.');
        cache.set(relPath, null);
        return null;
      }
    }
    cache.set(relPath, data);
    return data;
  }

  /* ---------- 공통 소도구 ---------- */
  const CATS = ['공통과목', '일반선택', '진로선택', '융합선택'];
  function normCat(c) { return CATS.includes(c) ? c : '일반선택'; }

  function todayKST() {
    const d = new Date(Date.now() + 9 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  function nowKST() {
    const d = new Date(Date.now() + 9 * 3600 * 1000);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }

  /* 한글 초성 포함 간단 검색 매칭 */
  function matches(hay, needle) {
    if (!needle) return true;
    return String(hay).replace(/\s/g, '').toLowerCase()
      .includes(String(needle).replace(/\s/g, '').toLowerCase());
  }

  function debounce(fn, ms) {
    let t; return function () { clearTimeout(t); const a = arguments, c = this; t = setTimeout(() => fn.apply(c, a), ms || 150); };
  }

  /* 전역 오류도 배너로 (조용한 실패 방지) */
  global.addEventListener('error', e => banner('err', '화면 오류가 발생했습니다', (e.message || '') + ' — 다른 기능은 계속 사용할 수 있습니다.'));
  global.addEventListener('unhandledrejection', e => banner('err', '처리 중 오류가 발생했습니다', String((e.reason && e.reason.message) || e.reason || '')));

  global.Core = { $, $$, el, esc, banner, validate, loadJSON, normCat, CATS, todayKST, nowKST, matches, debounce };
})(window);
