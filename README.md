# 🛡️ Packet Knight (패킷 나이트)

> **2.4GHz RF 세계를 탐험하며 배우는 3D 무선통신 RPG**
> [connectivityBook](https://github.com/yalex-kim/connectivityBook) 연동 인터랙티브 학습 게임

패킷 나이트는 브라우저에서 **설치 없이** 실행되는 3D 복셀 RPG입니다. 플레이어는 2.4GHz 무선 세계의 "패킷 기사"가 되어 호핑 던전을 탐험하고 Wi-Fi 간섭 몬스터를 격퇴하며, 그 과정에서 Bluetooth Core 6.3의 무선통신 원리(Advertising · Hopping · Connection · GATT · Security)를 자연스럽게 배웁니다.

<!-- TODO: Stage 2 이후 스크린샷 자리
![게임 스크린샷](docs/screenshot-stage2.png)
-->

```
        📡        ← 안테나 타워 (전파의 등대)
   ▓▓▓▓█▓▓▓▓      ← GATT 빌리지
  ▓░░░░░░░░░▓     ← 37채널 호핑 던전
 ~~~~~~~~~~~~~~~  ← 2.4GHz 노이즈 늪지대
      🟥          ← 주인공 큐브 나이트
```

## ✨ 핵심 특징

- **무설치 브라우저 게임** — WebGL(Three.js) 기반, 링크 하나로 실행
- **놀면서 배우는 RF 이론** — 스킬이 곧 스펙: 채널 점프(주파수 호핑), Connect Request 돌진, AES 암호화 실드
- **교과서 1:1 퀘스트 매핑** — 게임 퀘스트 12개가 connectivityBook Bluetooth 챕터와 하나씩 연결. 클리어하면 원문 읽기 배지
- **게임오버가 없다** — 죽으면 "Connection Timeout": 마지막 연결 체크포인트로 재연결(롤백)
- **수치로 검증하는 밸런스** — 터미널 봇 시뮬레이터가 수천 판을 돌려 경제·전투 밸런스를 자동 점검

## 🚀 빠른 실행

빌드는 필요 없습니다. 다만 ES 모듈(`src/*.js`)은 `file://`로 열면 브라우저가 막기 때문에, 의존성 없는 로컬 서버로 엽니다.

```bash
git clone https://github.com/yalex-kim/packet-knight.git
cd packet-knight
npm start                # → http://localhost:5173  (Node만 있으면 됨, npm install 불필요)
# 또는: python3 -m http.server 5173
```

- 조작: **WASD/방향키**(한글 입력 상태에서도 동작) / **바닥 터치 및 마우스 클릭** / **모바일 가상 조이스틱** · **스페이스바 / 점프 버튼** 점프 · **화면 드래그/우클릭** 시점 회전 · **두 손가락 핀치/마우스 휠** 줌인·아웃
- GitHub Pages 라이브 데모: https://yalex-kim.github.io/packet-knight/
- 현재 진행: **Stage 5 완료** (전파의 등대 → 비콘 신호 측정소 알바: 흔들리는 RSSI를 평균 내 비콘 거리를 재고 CR2032 획득) → 다음: Stage 6 첫 전투
- 지금 할 수 있는 것: 📚 도서관 퀴즈로 스탯 올리기 · 📡 등대 알바로 CR2032 벌기 (진행도는 브라우저에 자동 저장)
- 빌드 도구 없이 CDN import map + ES 모듈로 동작합니다. 번들러 도입은 Stage 12에서 재평가합니다.

## 🤖 봇 시뮬레이션

밸런스는 손으로 느끼지 않고 수치로 검증합니다. 게임과 같은 `src/core` 로직을 Node에서 수천 판 돌립니다.

```bash
node scripts/simulate.mjs --game=rssi --bots=2000   # 알바 전략별 점수·등급·CR2032 분포
```

결과와 보정 이력은 [PRD.md §8.5](PRD.md)에 기록합니다.

## 🧱 코드 구조

```
index.html            DOM 오버레이(HUD·조이스틱·모달) + import map + 엔트리
src/
  main.js             조립: 씬·게임 상태·메인 루프·테스트 훅(window.__PK)
  core/               순수 로직 — THREE·DOM 의존 금지, Node에서 import 가능 (봇 시뮬레이터 재사용)
    config.js         월드·물리 상수
    terrain.js        칸 단위 높이맵 (시각·물리 단일 진실 공급원)
    layout.js         랜드마크 위치·문구·충돌 형상 데이터
    collision.js      높이 인식 충돌 (STEP_MAX)
    motor.js          이동·점프·낙하 물리
    balance.js        밸런스 수치 (PRD §8.4 원본)
    quiz.js           퀴즈 출제(시드 고정 가능)·채점
    progress.js       진행도 저장/복원·보상·학습 지표 (저장소 주입)
    chapters.data.js  교과서 레슨·퀴즈 데이터 (자동 생성)
    rssiJob.js        알바: RSSI 거리 측정 미니게임 상태 기계
  render/             THREE 렌더링 — world(지형·건물), knight(기사·이펙트), camera(오빗 카메라)
  ui/                 DOM — input(키보드·조이스틱·포인터), hud(배지·스탯·모달), library(강의실), jobPanel(알바)
scripts/
  serve.mjs           무의존 로컬 정적 서버 (npm start)
  import-chapters.mjs connectivityBook 챕터 → chapters.data.js 생성
  simulate.mjs        봇 시뮬레이션 (게임과 같은 core 로직을 Node에서 실행)
  smoke.mjs           DoD 자동 검증 (npm run smoke)
```

의존 방향은 `core → render/ui → main` 한 방향입니다. `core/`가 THREE나 DOM을 import 하면 스모크 테스트가 실패합니다.

## ✅ DoD 자동 검증 (스모크 테스트)

각 스테이지의 완료 기준(DoD)은 Playwright 헤드리스 테스트로 검증합니다. 스테이지를 커밋하기 전에 반드시 통과시킵니다.

```bash
npm install          # playwright, three(오프라인용 사본)
npx playwright install chromium   # 최초 1회
npm run smoke        # → 50/50 통과
```

- 게임을 `index.html?test`로 열면 실시간 시뮬레이션이 멈추고, 테스트가 `window.__PK.tick(초)`로 고정 1/60초 스텝을 진행시킵니다. 헤드리스 FPS와 무관하게 결정적으로 검증됩니다.

## 📚 connectivityBook 연동

게임의 모든 퀘스트는 교과서 챕터와 1:1로 연결됩니다:

| 게임 | 교과서 |
|---|---|
| 광고의 숲 (채널 37/38/39) | [bluetooth/chapters/advertising.html](https://yalex-kim.github.io/connectivityBook/bluetooth/chapters/advertising.html) |
| 37채널 호핑 던전 | [bluetooth/chapters/hopping.html](https://yalex-kim.github.io/connectivityBook/bluetooth/chapters/hopping.html) |
| 연결의 다리 | [bluetooth/chapters/connection.html](https://yalex-kim.github.io/connectivityBook/bluetooth/chapters/connection.html) |
| GATT 빌리지 | [bluetooth/chapters/gatt.html](https://yalex-kim.github.io/connectivityBook/bluetooth/chapters/gatt.html) |
| 보안의 감옥 | [bluetooth/chapters/security.html](https://yalex-kim.github.io/connectivityBook/bluetooth/chapters/security.html) |

전체 매핑은 [PRD.md §6](PRD.md)를 참고하세요.

도서관 강의실의 레슨(핵심 정리)과 퀴즈는 교과서 원문 각 챕터의 "핵심 정리"·"확인 퀴즈"를 그대로 가져온 것입니다. 교과서가 바뀌면 다시 생성합니다.

```bash
git clone --depth 1 https://github.com/yalex-kim/connectivityBook ../connectivityBook
node scripts/import-chapters.mjs ../connectivityBook   # → src/core/chapters.data.js
```

## 🗺️ 로드맵 (요약)

Stage 1 빈 복셀 섬 ✅ → Stage 2 건물 배치 ✅ → Stage 3 컨트롤 고도화 ✅ (3.1 결함 수정 ✅) → Stage 3.5 모듈 분리 ✅ → Stage 4 교육 루프 ✅ → Stage 5 알바 미니게임 ✅ → Stage 6 첫 전투 → Stage 6.5 봇 시뮬레이션 v1 → Stage 7 호핑 던전 → Stage 8 간섭 전투 → Stage 9 교과서 연동 → Stage 10 보안·전력 콘텐츠 → Stage 11 사운드 → Stage 12 서재(교과서 사이트) 임베드

각 단계의 완료 기준(DoD)은 [PRD.md §7](PRD.md)에 정의되어 있습니다.

## 📄 라이선스

게임 코드: [MIT](LICENSE) · 교과서 콘텐츠: connectivityBook의 CC BY 4.0 / MIT 듀얼 라이선스를 따릅니다.
