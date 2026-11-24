/* 학과 전수 점검 — 한 학교에서 35개 학과를 차례로 골라 보며
   ⑤ 과목 설계가 비지 않는지(개설 과목 수 · 자동 선택 수 · 탐구 주제 수 · 핵심 과목 매칭)를 확인한다.
   실행: (저장소 루트에서) python3 -m http.server 8899
        node tools/e2e/program-sweep.mjs <학교검색어> <진입학년> <과정번호>
   예:  node tools/e2e/program-sweep.mjs 경기고 2 0
        node tools/e2e/program-sweep.mjs 유성여 3 1   ← 2015 개정 과정
   한 학교에 6~8분 걸린다. */
import { chromium } from '/tmp/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const clean=s=>(s||'').replace(/\s+/g,' ').trim();
const SCHOOL = process.argv[2] || '경기고';
const ENTRY  = process.argv[3] || '2';
const TRACK  = Number(process.argv[4] || 0);
const p = await b.newPage({viewport:{width:1350,height:1100}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+clean(m.text()).slice(0,90));});
await p.goto('http://localhost:8899/',{waitUntil:'networkidle'}); await p.waitForTimeout(260);
await p.click(`#entrySeg button[data-entry="${ENTRY}"]`);
await p.check('#nameConsent'); await p.fill('#nameInput','점검');
await p.click('#toSchool'); await p.waitForTimeout(260);
await p.fill('#schoolSearch', SCHOOL); await p.waitForTimeout(320);
await p.click('#acList button'); await p.waitForTimeout(320);
if (TRACK) { await p.locator('#trackSeg button').nth(TRACK).click(); await p.waitForTimeout(600); }
console.log('학교:', clean(await p.locator('#schoolTitle, .schoolchip, h2').first().innerText().catch(()=>SCHOOL)).slice(0,40),
            '| 과정:', clean(await p.locator('#trackSeg button.on').innerText().catch(()=>'-')), '| 진입', ENTRY+'학년');
await p.click('#toRecordFromSchool'); await p.waitForTimeout(200);
await p.click('#toMajorFromRecord'); await p.waitForTimeout(320);

const fields = await p.locator('#fields .field').evaluateAll(els=>els.map(e=>({id:e.dataset.id, label:(e.textContent||'').replace(/\s+/g,' ').trim().slice(0,12)})));
const rows=[];
for (const f of fields) {
  await p.locator('#steps button[data-step="major"]').click(); await p.waitForTimeout(200);
  await p.click(`#fields .field[data-id="${f.id}"]`); await p.waitForTimeout(320);
  const cards = await p.locator('#progGrid .progcard').evaluateAll(els=>els.map((e,i)=>({
    i, soon:e.classList.contains('soon'), name:(e.textContent||'').replace(/\s+/g,' ').trim().slice(0,22) })));
  for (const c of cards) {
    if (c.soon) { rows.push([f.label, c.name, '준비중','-','-','-']); continue; }
    await p.locator('#steps button[data-step="major"]').click(); await p.waitForTimeout(180);
    await p.click(`#fields .field[data-id="${f.id}"]`); await p.waitForTimeout(260);
    await p.locator('#progGrid .progcard').nth(c.i).click(); await p.waitForTimeout(260);
    await p.click('#toDesign'); await p.waitForTimeout(450);
    const opts = await p.locator('#builder .opt').count();
    const sel  = await p.locator('#builder .opt.sel').count();
    const core = clean(await p.locator('#recMatch, .recmatch').first().innerText().catch(()=>''));
    await p.click('#genDesign'); await p.waitForTimeout(320);
    const inq = await p.locator('#designOut .inq').count();
    const warn = clean(await p.locator('#designOut .redesign h4').first().innerText().catch(()=>''));
    const row=[f.label, c.name, String(opts), String(sel), String(inq), (core.match(/핵심 과목 \d+ \/ \d+/)||[''])[0] + (warn?' ⚠'+warn.slice(0,22):'')];
    rows.push(row); console.log('  · '+row.map(v=>String(v)).join(' | '));
  }
}
const w=[10,22,6,6,6,44];
console.log(['계열','학과','개설','선택','주제','핵심 과목 매칭 / 비고'].map((h,i)=>h.padEnd(w[i])).join(''));
rows.forEach(r=>console.log(r.map((v,i)=>String(v).padEnd(w[i])).join('')));
const bad = rows.filter(r=>r[2]!=='준비중' && (Number(r[4])===0 || Number(r[3])===0));
console.log('\n❗ 설계가 비는 학과:', bad.length? bad.map(r=>r[1]).join(', ') : '없음');
console.log('콘솔 오류:', errs.length?[...new Set(errs)].slice(0,3).join(' | '):'0건');
await b.close();
