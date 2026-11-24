/* 유성여자고등학교(충청권) 추가 검증
   ① 충청권 → 대전 유성구 → 유성여고가 검색·선택되는지
   ② 두 교육과정(2022 개정 / 2015 개정)이 '개설 과정'에 나오고, 고른 과정에 따라
      학점배당표가 바뀌는지
   ③ 학생부에 적힌 과목으로 어느 교육과정인지 가려내는 '편제 대조'가 맞는지
      (2015 과목 학생부 → 2015로 바꾸기 버튼 / 2022 과목 학생부 → 전환 권유 없음)
   실행: (저장소 루트에서) python3 -m http.server 8899  →  node tools/e2e/yuseong.mjs */
import { chromium } from '/tmp/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8899/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
const log = (k, v) => console.log(String(k).padEnd(40, '.'), v);
const clean = s => (s || '').replace(/\s+/g, ' ').trim();

const HEAD = `교과학습발달상황 세부능력 및 특기사항\n`;
const TAIL = `\n창의적 체험활동상황
동아리활동: 과학탐구반에서 실험을 주도하고 결과를 발표함.
독서활동상황: 과학 교양서를 읽고 요약하여 친구들과 나눔.
행동특성 및 종합의견
성실하며 모둠에서 역할을 조율하고 느린 친구를 도움.`;

const REC2015 = HEAD + `「독서」 비문학 지문의 논증 구조를 분석해 정리함.
「수학Ⅰ」 지수함수 그래프를 그려 비교하고 오차를 확인함.
「영어Ⅰ」 원서 기사를 요약하고 발표함.
「생활과 윤리」 공리주의와 의무론을 사례로 비교함.
「화학Ⅰ」 중화 적정 실험을 설계하고 오차를 분석함.
「생명과학Ⅰ」 효소 활성 실험 결과를 그래프로 정리함.
「사회·문화」 설문을 설계해 자료를 수집하고 통계로 해석함.` + TAIL;

const REC2022 = HEAD + `「주제 탐구 독서」 관심 분야 논문을 찾아 읽고 요약함.
「대수」 함수의 변화를 표와 그래프로 비교함.
「세계 문화와 영어」 자료를 조사해 영어로 발표함.
「현대사회와 윤리」 쟁점을 정리해 토론함.
「화학 반응의 세계」 반응 속도 실험을 설계하고 변인을 통제함.
「생물의 유전」 유전 현상을 모델로 설명함.
「역학과 에너지」 운동량 보존을 측정하여 검증함.` + TAIL;

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1350, height: 1100 } });
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  return page;
}

async function openSchool(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('#entrySeg button[data-entry="3"]');
  await page.check('#nameConsent');
  await page.fill('#nameInput', '유성-' + tag);
  await page.click('#toSchool');
  await page.waitForTimeout(400);
  await page.fill('#schoolSearch', '유성여');
  await page.waitForTimeout(500);
  await page.click('#acList button');
  await page.waitForTimeout(800);
}

/* ①② 학교·편제·배당표 */
{
  const page = await newPage();
  await openSchool(page, '01');
  log('시도 선택지', (await page.locator('#sidoSel option').allTextContents()).filter(Boolean).join(' / '));
  log('개설 과정', (await page.locator('#trackSeg button').allTextContents()).map(clean).join(' / '));
  log('학업성취 과목 카드', await page.locator('#achBody .scard').count());
  log('학점배당표 칩 (2022)', await page.locator('#creditPlan .subchip').count());
  log('편제 열', await page.locator('.curr-col').count());
  await page.locator('#trackSeg button').nth(1).click();
  await page.waitForTimeout(600);
  log('학점배당표 칩 (2015)', await page.locator('#creditPlan .subchip').count());
  log('배당표 출처 (2015)', clean(await page.locator('#creditPlan p.note').first().innerText()).slice(0, 56));
  await page.screenshot({ path: '/tmp/shots/ys-01-school.png', fullPage: true });
  await page.close();
}

/* ③ 편제 대조 */
async function matchTest({ text, tag, expectSwitch }) {
  const page = await newPage();
  await openSchool(page, tag);
  await page.click('#toRecordFromSchool');
  await page.waitForTimeout(300);
  await page.check('#cAgree'); await page.check('#cGuardian');
  await page.click('#consentBtn');
  await page.waitForTimeout(300);
  await page.fill('#recText', text);
  await page.click('#analyzeBtn');
  await page.waitForTimeout(1600);

  const box = clean(await page.locator('#currMatch').innerText().catch(() => ''));
  const btn = page.locator('#currMatch button');
  const hasBtn = await btn.count() > 0;
  log(`[${tag}] 편제 대조`, box.slice(0, 150) || '(상자 없음)');
  log(`[${tag}] 전환 버튼`, hasBtn ? clean(await btn.innerText()) : '없음');
  log(`[${tag}] 기대와 일치`, hasBtn === expectSwitch ? '✅' : '❌');
  if (hasBtn) {
    await btn.click();
    await page.waitForTimeout(1000);
    log(`[${tag}] 전환 후 과정`, clean(await page.locator('#trackSeg button.on').innerText()));
    log(`[${tag}] 전환 후 배당표 칩`, await page.locator('#creditPlan .subchip').count());
  }
  await page.screenshot({ path: `/tmp/shots/ys-${tag}.png`, fullPage: true });
  await page.close();
}

await matchTest({ text: REC2015, tag: '02-rec2015', expectSwitch: true });
await matchTest({ text: REC2022, tag: '03-rec2022', expectSwitch: false });

log('콘솔 오류', errs.length ? errs.join(' | ') : '0건');
await browser.close();
