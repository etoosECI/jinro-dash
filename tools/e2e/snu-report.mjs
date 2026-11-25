/* ⑦ 서울대 배출 분석이 비지 않는지 — 특히 '리포트(⑥)를 먼저 연 뒤' 들어갔을 때.
   리포트가 ensure()로 데이터만 먼저 불러오면 V.data가 채워지고, 그 뒤 STEP 7에 들어가도
   build()가 건너뛰어져 화면이 통째로 비던 문제가 있었다.
   실행: python3 -m http.server 8899 → node tools/e2e/snu-report.mjs [학교검색어] */
import { chromium } from '/tmp/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await b.newPage({viewport:{width:1350,height:1100}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text().slice(0,140));});
const clean=s=>(s||'').replace(/\s+/g,' ').trim();
const L=(k,v)=>console.log(String(k).padEnd(30,'.'),v);
await p.goto('http://localhost:8899/',{waitUntil:'networkidle'}); await p.waitForTimeout(400);
await p.click('#entrySeg button[data-entry="2"]');
await p.check('#nameConsent'); await p.fill('#nameInput','스누'); await p.click('#toSchool'); await p.waitForTimeout(400);
await p.fill('#schoolSearch', process.argv[2] || '경기고'); await p.waitForTimeout(500); await p.click('#acList button'); await p.waitForTimeout(900);
// ★ 리포트를 먼저 연 뒤 STEP 7을 연다
await p.click('#steps button[data-step="report"]'); await p.waitForTimeout(2200);
L('리포트 먼저 — 서울대 절', await p.locator('#report .snu-report').count());
await p.click('#steps button[data-step="snu"]'); await p.waitForTimeout(2500);
L('STEP7 본문 길이', clean(await p.locator('#snuBody').innerText()).length + '자');
L('STEP7 내 학교 상자', clean(await p.locator('#snuMine').innerText().catch(()=> '')).slice(0,60) || '(비어 있음)');
// 리포트 첫 진입
await p.click('#steps button[data-step="report"]'); await p.waitForTimeout(2000);
L('리포트 서울대 절(1회차)', await p.locator('#report .snu-report').count());
// 다른 화면 갔다가 다시
await p.click('#steps button[data-step="school"]'); await p.waitForTimeout(500);
await p.click('#steps button[data-step="report"]'); await p.waitForTimeout(2000);
L('리포트 서울대 절(2회차)', await p.locator('#report .snu-report').count());
await p.click('#steps button[data-step="snu"]'); await p.waitForTimeout(600);
await p.click('#steps button[data-step="report"]'); await p.waitForTimeout(2500);
L('리포트 서울대 절(3회차)', await p.locator('#report .snu-report').count());
const sec = clean(await p.locator('#report .snu-report').innerText().catch(()=> ''));
L('절 내용 길이', sec.length+'자');
L('절 앞부분', sec.slice(0,110) || '(없음)');
L('오류', errs.length?[...new Set(errs)].slice(0,3).join(' | '):'0건');
await b.close();
