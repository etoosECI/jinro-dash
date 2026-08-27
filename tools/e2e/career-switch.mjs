import { chromium } from '/tmp/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{width:1300,height:1200} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const dump = async (label) => {
  const sel = await p.locator('#selList span').allTextContents();
  const rm = (await p.locator('#recMatch').textContent()).trim();
  const sci = sel.filter(s=>/물리|화학|생명|지구|세포|유전|역학|전자기|융합과학|기후변화와 환경/.test(s));
  console.log(`\n[${label}] 선택 ${sel.length}과목`);
  console.log('  ', sel.join(', '));
  console.log('   이과 과목:', sci.length ? sci.join(', ') : '없음');
  console.log('   ', rm);
};
await p.goto('http://localhost:8899/', { waitUntil:'networkidle' });
await p.waitForTimeout(400);
await p.click('#entrySeg button[data-entry="2"]'); await p.fill('#idInput','전환-점검');
await p.click('#toSchool'); await p.waitForTimeout(300);
await p.fill('#schoolSearch','단국대사대부고'); await p.waitForTimeout(450);
await p.click('#acList button'); await p.waitForTimeout(700);

// ① 공학·의약·AI → 기계공학과로 설계
await p.click('#steps button[data-step="major"]'); await p.waitForTimeout(250);
await p.click('#fields .field[data-id="eng"]'); await p.waitForTimeout(450);
await p.locator('#progGrid .progcard:not(.soon)', { hasText:'기계공학과' }).first().click();
await p.waitForTimeout(500);
await p.click('#toDesign'); await p.waitForTimeout(400);
await dump('① 기계공학과');

// ② 사회·상경 → 사회학과로 전환 (사용자가 겪은 상황)
await p.click('#steps button[data-step="major"]'); await p.waitForTimeout(250);
await p.click('#fields .field[data-id="soc"]'); await p.waitForTimeout(500);
await p.locator('#progGrid .progcard:not(.soon)', { hasText:'사회학과' }).first().click();
await p.waitForTimeout(600);
await p.click('#toDesign'); await p.waitForTimeout(400);
await dump('② 사회학과로 전환 후');
await p.click('#genDesign'); await p.waitForTimeout(600);
const cards = (await p.locator('#designOut .inq h4').allTextContents()).filter(t=>t.includes('🔬'));
console.log('\n   탐구 카드', cards.length + '장');
cards.forEach(c=>console.log('    ·', c.replace('🔬','').trim()));
await p.screenshot({ path:'/tmp/shots/90-switch.png', fullPage:true });
console.log('\n콘솔 오류:', errs.length?errs:'없음');
await b.close();
