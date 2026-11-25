/* 생기부 '칸으로 읽기 → 확인·수정 → 저장 → 저장본으로 진단' 검증
   실제 학교생활기록부는 표 모양(학년·영역·시간·내용)이라, 말머리를 찾는 방식으로는 읽히지 않는다.
   이 검사는 표 모양 원문을 넣었을 때
     ① 창의적 체험활동이 자율/동아리/진로로 학년까지 갈려 들어가는지
     ② 세특이 과목·학년·학기로 갈려 들어가는지 (성적표 행은 섞이지 않는지)
     ③ 행동특성이 학년별로 갈려 들어가는지
     ④ 화면에서 고친 내용이 저장되고, 그 저장본으로 진단이 돌아가는지
     ⑤ 다시 진단해도 고친 내용이 살아 있는지
   를 확인한다.
   실행: (저장소 루트에서) python3 -m http.server 8899  →  node tools/e2e/record-edit.mjs */
import { chromium } from '/tmp/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8899/';
const clean = s => (s || '').replace(/\s+/g, ' ').trim();
const L = (k, v) => console.log(String(k).padEnd(34, '.'), v);

/* 표 모양 원문 — NEIS 출력물을 붙여넣었을 때의 생김새 */
const SAMPLE = `6. 창의적 체험활동상황
학년 영역 시간 특기사항
1 자율·자치활동 34 학급 1인 1역으로 환경부장을 맡아 분리배출 캠페인을 기획하고 4주간 실천율을 기록하여 학급 회의에서 발표함.
동아리활동 30 (과학탐구반)(30시간) 효소 활성 실험을 설계하고 온도별 반응 속도를 측정해 그래프로 정리함.
진로활동 28 학과 탐색 활동에서 의예과 교육과정을 조사하고, 의료 윤리 특강을 들은 뒤 환자 자기결정권에 대한 보고서를 작성함.
2 자율·자치활동 32 학급 토의 규칙을 직접 만들고 발표가 어려운 친구를 도와 모둠 발표를 끝까지 이끎.
동아리활동 28 (과학탐구반)(28시간) 중화 적정 실험의 오차 원인을 분석하고 후속 실험을 설계함.
진로활동 24 생명과학 분야 진로 로드맵을 작성하고 대학 전공 설명회에 참여함.
8. 교과학습발달상황
[1학년]
학기 교과 과목 학점수 원점수/과목평균(표준편차) 성취도(수강자수) 석차등급
1 국어 공통국어1 4 88/71.2(14.3) B(312) 4
1 수학 공통수학1 4 82/65.4(17.1) B(312) 4
1 영어 공통영어1 4 93/74.8(13.2) A(312) 3
세부능력 및 특기사항
(1학기)
공통국어1: 비문학 지문의 논증 구조를 도식화하여 정리하고, 반론 가능성을 스스로 제기함.
공통수학1: 이차함수의 최대·최소를 실생활 자료에 적용해 모둠원에게 설명함.
공통영어1: 원서 기사를 요약하고 영어로 발표함.
(2학기)
공통국어2: 매체 자료의 신뢰성을 검증하는 기준을 세워 발표함.
9. 독서활동상황
(1학년) 「코스모스」(칼 세이건), 「이기적 유전자」(리처드 도킨스)
10. 행동특성 및 종합의견
1 성실하며 모둠에서 역할을 조율하고 느린 친구를 끝까지 기다려 함께 결과를 냄.
2 자기 주도적으로 탐구 주제를 정하고 끝까지 밀고 나가는 집중력이 돋보임.`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1350, height: 1200 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + clean(m.text()).slice(0, 110)); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.click('#entrySeg button[data-entry="2"]');
await page.check('#nameConsent');
await page.fill('#nameInput', '기록검사');
await page.click('#toSchool');
await page.waitForTimeout(400);
await page.fill('#schoolSearch', '유성여');
await page.waitForTimeout(500);
await page.click('#acList button');
await page.waitForTimeout(800);
await page.click('#toRecordFromSchool');
await page.waitForTimeout(300);
await page.check('#cAgree'); await page.check('#cGuardian');
await page.click('#consentBtn');
await page.waitForTimeout(300);

await page.fill('#recText', SAMPLE);
await page.click('#analyzeBtn');
await page.waitForTimeout(1600);

const box = page.locator('#recEdit');
const groups = box.locator('.redesign');
L('확인·수정 패널', (await box.isHidden()) ? '❌ 안 뜸' : '✅');
L('창의적 체험활동 칸', await groups.nth(0).locator('.recrow').count() + ' (기대 6)');
L('과목별 세특 칸', await groups.nth(1).locator('.recrow').count() + ' (기대 4)');
L('행동특성 칸', await groups.nth(2).locator('.recrow').count() + ' (기대 2)');

const areas = await groups.nth(0).locator('.recrow select').evaluateAll(els => els.filter((_, i) => i % 2 === 0).map(e => e.value));
L('창체 영역 분류', areas.join(', '));
const subs = await groups.nth(1).locator('.recrow input').evaluateAll(els => els.map(e => e.value));
L('세특 과목 분류', subs.join(', '));
const sems = await groups.nth(1).locator('.recrow select').evaluateAll(els => els.map(e => e.value).join(''));
L('세특 학년·학기', sems);
L('성적표 행 혼입', subs.some(s => /\d{2,3}\/\d/.test(s)) ? '❌ 섞임' : '0건');
L('진단 축 카드', await page.locator('.diag-card').count());
L('인식 과목칩', clean(await page.locator('#diagBox .kv').nth(1).innerText()).slice(0, 80));

/* 사람이 고친 내용이 저장되고 진단에 반영되는가 */
await groups.nth(1).locator('.recrow input').first().fill('공통국어Ⅰ');
await page.waitForTimeout(200);
L('고친 뒤 저장 상태', clean(await page.locator('#recSaveState').innerText()).slice(0, 24));
await page.locator('#recEdit button', { hasText: '저장하고 다시 진단' }).click();
await page.waitForTimeout(1400);
L('저장 후 상태', clean(await page.locator('#recSaveState').innerText()).slice(0, 10));
L('고친 과목이 진단에 반영', clean(await page.locator('#diagBox .kv').nth(1).innerText()).includes('공통국어Ⅰ') ? '✅' : '❌');

await page.click('#analyzeBtn');
await page.waitForTimeout(1400);
L('재진단 후에도 유지', await groups.nth(1).locator('.recrow input').first().inputValue());

L('콘솔 오류', errs.length ? [...new Set(errs)].slice(0, 3).join(' | ') : '0건');
await page.screenshot({ path: '/tmp/shots/record-edit.png', fullPage: true });
await browser.close();
