import { chromium } from '/tmp/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const idx = JSON.parse(fs.readFileSync('/home/claude/jinro-dash/data/programs/index.json','utf8'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{width:1300,height:1000} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8899/', { waitUntil:'networkidle' });
await p.waitForTimeout(500);
await p.click('#entrySeg button[data-entry="2"]');
await p.fill('#idInput','전학과-점검');
await p.click('#toSchool'); await p.waitForTimeout(300);
await p.fill('#schoolSearch','경기고'); await p.waitForTimeout(400);
await p.click('#acList button'); await p.waitForTimeout(700);

// 계열 성격에 반하는 과목 패턴
const SCI = /물리|화학|생명과학|지구과학|역학|전자기|양자|세포|물질대사|행성|생물의 유전|고급 물리|고급 화학|지구시스템/;
const HUMSOC = /문학|독서|언어|매체|화법|작문|역사|윤리|사상|지리|정치|법과|사회|경제|세계사|여행|국제 관계|도시의 미래/;
const rows = [];
for (const prog of idx.programs) {
  await p.click('#steps button[data-step="major"]'); await p.waitForTimeout(200);
  await p.click(`#fields .field[data-id="${prog.majorId}"]`); await p.waitForTimeout(350);
  const names = await p.locator('#progGrid .progcard:not(.soon) .m').allTextContents();
  const i = names.indexOf(prog.name);
  if (i < 0) { rows.push({ name: prog.name, err: '카드 없음' }); continue; }
  await p.locator('#progGrid .progcard:not(.soon)').nth(i).click();
  await p.waitForTimeout(300);
  await p.click('#toDesign'); await p.waitForTimeout(300);
  await p.click('#resetBtn'); await p.waitForTimeout(200);
  await p.click('#applyRec'); await p.waitForTimeout(400);
  const sel = await p.locator('#selList span').allTextContents();
  await p.click('#genDesign'); await p.waitForTimeout(450);
  const cards = (await p.locator('#designOut .inq h4').allTextContents()).filter(t=>t.includes('🔬'));
  const isSciMajor = ['eng','nat'].includes(prog.majorId);
  const wrong = sel.filter(s => isSciMajor ? (HUMSOC.test(s) && !SCI.test(s)) : SCI.test(s));
  rows.push({ name: prog.name, major: prog.majorId, sel: sel.length, cards: cards.length, wrong });
}
// 준비 중 카드 개수 (중복 확인)
await p.click('#steps button[data-step="major"]'); await p.waitForTimeout(200);
let soon = 0;
for (const m of ['eng','nat','soc','hum']) {
  await p.click(`#fields .field[data-id="${m}"]`); await p.waitForTimeout(350);
  soon += await p.locator('#progGrid .progcard.soon').count();
}
console.log('학과명'.padEnd(16),'계열','선택','카드','성격 어긋난 과목');
rows.forEach(r => console.log(
  String(r.name).padEnd(16), String(r.major||'').padEnd(4), String(r.sel).padStart(3), String(r.cards).padStart(4),
  r.err ? '  ⚠ '+r.err : (r.wrong.length ? '  ❌ '+r.wrong.join(', ') : '  ✓')));
console.log('\n준비 중 카드 총합:', soon, '| 콘솔 오류:', errs.length ? errs : '없음');
await b.close();
