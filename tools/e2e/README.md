# 브라우저 자동 점검 (선택)

앱을 실제 브라우저로 돌려 보는 회귀 테스트입니다. 데이터만 고치는 경우에는 필요 없고,
`node tools/validate.mjs`만으로 충분합니다.

```bash
python3 -m http.server 8899          # 저장소 루트에서 실행
npm install playwright                # 최초 1회
node tools/e2e/full-flow.mjs          # 시작→학교·비교→생기부 진단→계열·학과→설계→리포트→이어하기
node tools/e2e/fault-and-print.mjs    # 깨진 JSON 내성 · 지연 로딩 · 2학년 진입 · 인쇄 레이아웃
```

스크립트 상단의 `executablePath` 는 환경에 맞게 고쳐야 할 수 있습니다.
`fault-and-print.mjs` 는 임시로 깨진 학교 JSON을 만들었다가 끝나면 되돌립니다.
