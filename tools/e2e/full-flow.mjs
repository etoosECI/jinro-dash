import { chromium } from '/tmp/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8899/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

const SAMPLE = `성명: 홍길동\n학번: 20240101\n수상경력\n과학탐구대회 (장려상, 2학년)\n창의적 체험활동상황\n자율활동: 학급에서 모둠 토론에 참여함.\n동아리활동: 물리탐구반에서 포물선 운동 실험을 설계하고 보고서를 작성함.\n진로활동: 반도체 공정에 관한 진로 특강을 듣고 소자 구조를 조사함.\n교과학습발달상황 세부능력 및 특기사항\n「물리학」 역학적 에너지 보존을 검증하는 실험을 직접 설계하고, 마찰에 의한 오차의 원인을 고찰함. 후속 탐구로 사면 각도를 바꾸어 가속도를 비교함.\n「화학」 산-염기 적정으로 식초의 아세트산 농도를 정량하고 표시값과 비교 분석함.\n행동특성 및 종합의견\n성실하고 책임감이 강하며 친구들에게 문제 풀이를 설명해 주는 자세가 돋보임.`;
const shot = n => page.screenshot({ path: `/tmp/shots/${n}.png`, fullPage: true });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// STEP 1
await page.click('#entrySeg button[data-entry="3"]');   // 3학년 진입 (분기 검증)
await page.fill('#idInput', '테스트-a1b2');
await shot('01-start');
await page.click('#toSchool');
await page.waitForTimeout(300);

// STEP 2 : 자동완성으로 학교 찾기
await page.fill('#schoolSearch', '경기고');
await page.waitForTimeout(400);
await shot('02-autocomplete');
await page.click('#acList button');
await page.waitForTimeout(600);
await shot('03-school');
const trackCount = await page.locator('#trackSeg button').count();
const currCols = await page.locator('.curr-col').count();
const achRows = await page.locator('.ach-table tbody tr').count();
const cmpRows = await page.locator('#compareBoard .cmp tbody tr').count();
const planChips = await page.locator('#creditPlan .subchip').count();
const scards = await page.locator('#achBody .scard').count();
await shot('03b-compare');

// STEP 3 : 생기부 진단 먼저
await page.click('#toRecordFromSchool');
await page.waitForTimeout(300);
await page.check('#cAgree'); await page.check('#cGuardian');
await page.click('#consentBtn');
await page.waitForTimeout(200);
await page.fill('#recText', SAMPLE);
await page.click('#analyzeBtn');
await page.waitForTimeout(800);
await shot('10-diagnosis');
const axes = await page.locator('.diag-card').count();
const gapChips = await page.locator('#diagBox .gapbanner .evd').count();
const maskedName = await page.inputValue('#recText');
await page.click('#toMajorFromRecord');
await page.waitForTimeout(300);

// STEP 4 : 계열 + 학과
const gapBannerMajor = await page.locator('#gapHintMajor .gapbanner').count();
await page.click('#fields .field[data-id="eng"]');
await page.waitForTimeout(500);
const progCards = await page.locator('#progGrid .progcard:not(.soon)').count();
await page.click('#progGrid .progcard:not(.soon)');
await page.waitForTimeout(400);
await shot('04-major');
await page.click('#toDesign');
await page.waitForTimeout(400);

// STEP 4 : 3학년 진입 → 2학년 이수과목 고정
await shot('05-taken');
const takenOpts = page.locator('#takenPool .opt');
const tn = await takenOpts.count();
for (const s of ['물리학', '화학', '기하']) {
  const l = page.locator(`#takenPool .opt`, { hasText: s }).first();
  if (await l.count()) await l.click();
}
await page.click('#lockTaken');
await page.waitForTimeout(400);
await shot('06-locked');

// 권장 자동 선택 + 비권장 과목 하나 추가
await page.click('#applyRec');
await page.waitForTimeout(300);
const nonRec = page.locator('#builder .opt:not(.rec):not(.locked)').first();
const nonRecName = await nonRec.textContent();
await nonRec.click();
await page.waitForTimeout(300);
await shot('07-design');
const redesign = await page.locator('#redesignBox .redesign').count();
const credits = await page.locator('#credits').textContent();
const recMatch = await page.locator('#recMatch').textContent();

const gapTags = await page.locator('#builder .tag-gap').count();
const gapBannerDesign = await page.locator('#gapBanner .gapbanner').count();

// 공동교육과정 과목 직접 추가
await page.fill('#manualSub', '고급생명과학');
await page.click('#addManual');
await page.waitForTimeout(300);
const manualChips = await page.locator('#builder .tag-ext').count();

// 구조화 탐구 설계 생성 + 주제 로테이션
await page.click('#genDesign');
await page.waitForTimeout(500);
const inqCards = await page.locator('#designOut .inq').count();
const firstTopic = await page.locator('#designOut .inq h4').first().textContent();
await shot('08-design-out');
const regen = page.locator('#designOut .regen').first();
let secondTopic = '';
if (await regen.count()) { await regen.click(); await page.waitForTimeout(400); secondTopic = await page.locator('#designOut .inq h4').first().textContent(); }


const UNUSED = `성명: 홍길동
학번: 20240101
수상경력
과학탐구대회 (장려상, 2학년)
창의적 체험활동상황
자율활동: 학급 부실장으로 모둠 토론을 이끌며 협업 과정을 조율함.
동아리활동: 물리탐구반에서 포물선 운동 실험을 설계하고 데이터를 분석하여 보고서를 작성함.
진로활동: 반도체 공정에 관한 진로 특강을 듣고 소자 구조를 조사하여 발표함.
교과학습발달상황 세부능력 및 특기사항
「물리학」 역학적 에너지 보존을 검증하는 실험을 직접 설계하고, 마찰에 의한 오차를 측정하여 원인을 고찰함. 후속 탐구로 사면 각도를 바꾸어 가속도를 비교함.
「화학」 산-염기 적정으로 식초의 아세트산 농도를 정량하고 표시값과 비교 분석함.
「미적분Ⅱ」 함수의 극한 개념을 이용해 물체의 순간속도를 도출하는 과정을 발표함.
독서활동상황
파인만의 여섯 가지 물리 이야기(리처드 파인만), 세상은 온통 화학이야(마이 티 응우옌 킴)
행동특성 및 종합의견
성실하고 책임감이 강하며 친구들에게 문제 풀이를 설명해 주는 나눔의 자세가 돋보임.`;
await page.click('#steps button[data-step="report"]');
await page.waitForTimeout(600);
await shot('11-report');
const reportH2 = await page.locator('#report h2').count();
const histRows = await page.locator('#hist div').count();

// 이어하기(저장 검증)
await page.click('#saveBtn');
await page.waitForTimeout(200);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.selectOption('#profileSel', '테스트-a1b2');
await page.click('#loadBtn');
await page.waitForTimeout(1200);
await shot('12-resume');
const resumedSchool = await page.locator('#hSchool').textContent();
const resumedSel = await page.locator('#selList span').count();

console.log(JSON.stringify({
  trackCount, currCols, cmpRows, planChips, subjectCards: scards,
  diagCards: axes, gapItems: gapChips,
  nameMasked: !maskedName.includes('홍길동'), idMasked: !maskedName.includes('20240101'),
  gapBannerMajor, programCards: progCards,
  takenOptions: tn, nonRecName: (nonRecName||'').trim(), redesignCards: redesign,
  credits, recMatch: (recMatch||'').trim(),
  gapTagsInBuilder: gapTags, gapBannerDesign, manualChips,
  inquiryCards: inqCards, topicRotated: firstTopic !== secondTopic && !!secondTopic,
  reportSections: reportH2, historyRows: histRows,
  resumedSchool: (resumedSchool||'').trim(), resumedSelected: resumedSel,
  errors: errs,
}, null, 2));

await browser.close();
