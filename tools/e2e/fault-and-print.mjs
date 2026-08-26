import { chromium } from '/tmp/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const ROOT='/home/claude/jinro-dash';
const REG=ROOT+'/data/regions.json';
const regBackup=fs.readFileSync(REG,'utf8');
fs.writeFileSync(ROOT+'/data/schools/seoul/gangnam/broken-test.json','{ "schoolId": "broken-test", "tracks": [ ,, ]');
const reg=JSON.parse(regBackup);
reg.sido[0].sigungu.find(g=>g.name==='강남구').schools.push({schoolId:'broken-test',name:'깨진데이터고등학교',type:'일반고',path:'schools/seoul/gangnam/broken-test.json',hasAchievement:false});
fs.writeFileSync(REG, JSON.stringify(reg,null,2));
const cleanup=()=>{ try{fs.writeFileSync(REG,regBackup); fs.unlinkSync(ROOT+'/data/schools/seoul/gangnam/broken-test.json');}catch(e){} };
process.on('exit', cleanup);

const BASE = 'http://localhost:8899/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errs = [], reqs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
page.on('request', r => { const u = r.url(); if (u.includes('/data/')) reqs.push(u.split('/data/')[1]); });
const shot = n => page.screenshot({ path: `/tmp/shots/${n}.png`, fullPage: true });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// (f) 초기 로드 시 학교 상세는 하나도 불러오지 않아야 한다
const initialSchoolFetches = reqs.filter(u => u.startsWith('schools/'));

// 2학년 진입 경로
await page.click('#entrySeg button[data-entry="2"]');
await page.fill('#idInput', '점검-g2');
await page.click('#toSchool');
await page.waitForTimeout(300);

// (a) 깨진 JSON 학교 선택 → 앱이 죽지 않고 배너만 떠야 함
await page.fill('#schoolSearch', '깨진');
await page.waitForTimeout(300);
await page.click('#acList button');
await page.waitForTimeout(700);
await shot('20-broken');
const bannerText = await page.locator('#banners .banner').first().innerText().catch(() => '');
const stillAlive = await page.locator('#steps button').count();

// 정상 학교로 복귀
await page.fill('#schoolSearch', '휘문');
await page.waitForTimeout(300);
await page.click('#acList button');
await page.waitForTimeout(700);
const schoolOK = await page.locator('#hSchool').textContent();
const afterSchoolFetches = reqs.filter(u => u.startsWith('schools/'));

await page.click('#toMajor'); await page.waitForTimeout(200);
await page.click('#fields .field[data-id="hum"]'); await page.waitForTimeout(300);
await page.click('#toDesign'); await page.waitForTimeout(400);
const takenVisible = await page.locator('#takenBox').isVisible();   // 2학년 진입이면 숨겨져야 함
const poolGroups = await page.locator('#builder .pool-group').count();
await shot('21-g2-design');

// (k) 인쇄 레이아웃
await page.click('#steps button[data-step="report"]'); await page.waitForTimeout(700);
await page.pdf({ path: '/tmp/shots/report.pdf', format: 'A4', printBackground: false });
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(200);
await shot('22-print');
const stepsHiddenInPrint = await page.locator('#steps').isVisible();

console.log(JSON.stringify({
  initialSchoolFetches, afterSchoolFetches,
  brokenBanner: bannerText.replace(/\s+/g, ' ').slice(0, 140),
  stillAlive, schoolOK: (schoolOK || '').trim(),
  takenBoxVisibleOnGrade2: takenVisible, poolGroups,
  stepsVisibleInPrintMedia: stepsHiddenInPrint,
  errors: errs,
}, null, 2));
await browser.close();
cleanup();
