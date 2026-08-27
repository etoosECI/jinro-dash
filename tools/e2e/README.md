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

`all-programs.mjs` 는 34개 학과를 모두 돌며 계열이 뒤섞인 과목이 없는지,
탐구 주제가 배정되는지, "준비 중" 카드가 중복되지 않는지 한 번에 점검합니다.

```bash
node tools/e2e/all-programs.mjs
```

`majors-only.mjs` 는 학과를 고르지 않고 **계열만** 선택했을 때도
중심 교과군 밖 과목이 접히는지, 계열 공통 주제로 설계가 되는지 확인합니다.

`program-subjects.mjs` 는 34개 학과가 **자기 핵심 과목만** 고르는지,
목록 밖 과목이 자동 선택되지 않는지 확인합니다. 학과 ID를 인자로 주면 그 학과만 자세히 봅니다.

```bash
node tools/e2e/program-subjects.mjs                 # 34개 전수
node tools/e2e/program-subjects.mjs medicine,law    # 지정 학과 상세
```

`career-switch.mjs` 는 **계열·학과를 바꿨을 때 과목 선택이 새 진로 기준으로 다시 잡히는지**를 확인합니다.
(기계공학과로 설계 → 사회학과로 전환 → 이과 과목이 남아 있지 않아야 정상)
