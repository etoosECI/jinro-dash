/* 과천외국어고등학교 추가 검증
   경기도 → 과천시 → 과천외고를 고른 뒤 두 과정 모두에서
   편제·학업성취·학점배당표·과목 설계·탐구 주제가 제대로 나오는지 확인한다.
   실행: (저장소 루트에서) python3 -m http.server 8899  →  node tools/e2e/gwacheon.mjs  */
import { chromium } from '/tmp/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8899/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
const shotDir = '/tmp/shots';
const log = (k, v) => console.log(String(k).padEnd(46, '.'), v);
const clean = s => (s || '').replace(/\s+/g, ' ').trim();

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  return page;
}

async function run({ trackIdx, field, programText, entry, tag, first }) {
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  await page.click(`#entrySeg button[data-entry="${entry}"]`);
  await page.fill('#idInput', '과천-' + tag);
  await page.click('#toSchool');
  await page.waitForTimeout(400);

  await page.fill('#schoolSearch', '과천외');
  await page.waitForTimeout(500);
  await page.click('#acList button');
  await page.waitForTimeout(800);

  const trackLabels = (await page.locator('#trackSeg button').allTextContents()).map(clean);
  if (first) {
    log('시도 선택지', (await page.locator('#sidoSel option').allTextContents()).filter(Boolean).join(' / '));
    log('개설 과정', trackLabels.join(' / '));
    log('학업성취 과목 카드', await page.locator('#achBody .scard').count());
    log('학점배당표 과목 칩', await page.locator('#creditPlan .subchip').count());
    log('참조 바스켓 비교 행', await page.locator('#compareBoard .cmp tbody tr').count());
    log('편제 열', await page.locator('.curr-col').count());
    await page.screenshot({ path: `${shotDir}/gw-01-school.png`, fullPage: true });
  }
  await page.locator('#trackSeg button').nth(trackIdx).click();
  await page.waitForTimeout(500);

  await page.click('#toRecordFromSchool');
  await page.waitForTimeout(300);
  await page.click('#toMajorFromRecord');          // 진단은 건너뛴다
  await page.waitForTimeout(400);

  await page.click(`#fields .field[data-id="${field}"]`);
  await page.waitForTimeout(600);
  let pickedProgram = '계열만';
  if (programText) {
    const prog = page.locator('#progGrid .progcard:not(.soon)', { hasText: programText }).first();
    await prog.waitFor({ state: 'visible', timeout: 8000 });
    await prog.click();
    await page.waitForTimeout(500);
    pickedProgram = clean(await page.locator('#progGrid .progcard.on').first().textContent()).slice(0, 24);
  }
  await page.click('#toDesign');
  await page.waitForTimeout(800);

  const names = (await page.locator('#builder .opt.sel').allTextContents())
    .map(s => clean(s).replace(/(진로|일반|공통|융합)🔎?$/, '').replace(/🔎$/, ''));
  await page.click('#genDesign');
  await page.waitForTimeout(1000);
  const cards = await page.locator('#designOut .inq').count();
  const exhausted = clean(await page.locator('#designOut .redesign h4').first().textContent().catch(() => ''));

  const L = `[${trackLabels[trackIdx]} / ${pickedProgram}] ${entry}학년 진입`;
  log(`${L} · 개설 과목 표시`, await page.locator('#builder .opt').count());
  log(`${L} · 자동 선택`, names.length + '과목 — ' + names.join(', '));
  log(`${L} · 탐구 주제 카드`, cards + (exhausted ? ` (${exhausted})` : ''));
  await page.screenshot({ path: `${shotDir}/gw-${tag}.png`, fullPage: true });

  if (field === 'hum' || field === 'soc') {
    const sci = names.filter(n => /물리학|화학|생명과학|지구과학|미적분|물질과 에너지|생물의 유전|지구시스템/.test(n));
    log(`${L} · 자연계 과목 혼입`, sci.length ? '❌ ' + sci.join(', ') : '0건');
  }
  await page.close();
}

await run({ trackIdx: 0, field: 'hum', programText: '영어영문', entry: 2, tag: '02-eng-english', first: true });
await run({ trackIdx: 1, field: 'hum', programText: '독어독문', entry: 2, tag: '03-fl4-german' });
await run({ trackIdx: 0, field: 'soc', programText: '정치외교', entry: 2, tag: '04-eng-politics' });
await run({ trackIdx: 0, field: 'nat', programText: null, entry: 2, tag: '05-eng-nat' });
await run({ trackIdx: 0, field: 'hum', programText: '영어영문', entry: 3, tag: '06-eng-grade3' });

log('콘솔 오류', errs.length ? errs.join(' | ') : '0건');
await browser.close();
