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

저장소를 클론하고 `index.html`을 브라우저로 열면 끝입니다. 빌드도 서버도 필요 없습니다.

```bash
git clone https://github.com/yalex-kim/packet-knight.git
cd packet-knight
open index.html          # macOS (Windows: start index.html)
```

- 조작: **WASD** / **바닥 터치 및 마우스 클릭** / **모바일 가상 조이스틱** · **화면 드래그/우클릭** 시점 회전 · **두 손가락 핀치/마우스 휠** 줌인·아웃
- GitHub Pages 라이브 데모: https://yalex-kim.github.io/packet-knight/
- 현재 진행: **Stage 2 완료** (GATT 빌리지 평지화, 37채널 호핑 던전 지하 계단 입구, 마을 건물 3채, 비콘 타워, 건물 상호작용 툴팁 모달)
- Stage 1~3은 단일 `index.html`(CDN import map)로 동작하며, Stage 4부터 Vite 프로젝트로 전환됩니다.

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

## 🗺️ 로드맵 (요약)

Stage 1 빈 복셀 섬 ✅ → Stage 2 건물 배치 → Stage 3 컨트롤 고도화 → Stage 4 교육 루프 → Stage 5 알바 미니게임 → Stage 6 첫 전투 → Stage 7 호핑 던전 → Stage 8 간섭 전투 → Stage 9 교과서 연동 → Stage 10 보안·전력 콘텐츠 → Stage 11 사운드 → Stage 12 서재(교과서 사이트) 임베드

각 단계의 완료 기준(DoD)은 [PRD.md §7](PRD.md)에 정의되어 있습니다.

## 📄 라이선스

게임 코드: [MIT](LICENSE) · 교과서 콘텐츠: connectivityBook의 CC BY 4.0 / MIT 듀얼 라이선스를 따릅니다.
