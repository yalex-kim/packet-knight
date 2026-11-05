// 주민 실습 의뢰 (Stage 13.27, 퀘스트 Q9~Q13) — 순수 로직 (THREE·DOM 없음)
// 장마다 주민 한 명이 의뢰를 맡긴다. 대부분은 계산·판단 문제 4라운드(3개 이상 맞히면 통과, 틀리면 순서를 섞어 다시),
// 메시(Q10)는 직접 릴레이를 골라 TTL을 맞추는 퍼즐 3단계. 수치·규칙은 교과서 각 장 본문(기준 사양 Core 6.3)에서 가져왔다.

/** @typedef {{ q: string, options: string[], answer: number, explain: string }} Round */

/** 판단·계산 의뢰 — villager: layout.js VILLAGERS id */
export const TRIALS = Object.freeze({
  coex: {
    id: "coex", quest: "Q9", villager: "walkerB", chapter: "coexistence", title: "📶 공존 조율 의뢰",
    intro: "QA 엔지니어: \"휴대폰 하나에 LTE·Wi-Fi·블루투스가 다 들어 있어. 같이 살게 조율 좀 도와줘.\"",
    pass: 3,
    rounds: [
      { q: "LTE 대역 40(2,300~2,400 MHz)이 바로 아래에서 송신 중이다. AFH로 먼저 뺄 LE 채널은?", options: ["대역 아래쪽 끝(2,402~2,410 MHz 근처) 채널", "가운데(2,440 MHz 근처) 채널", "위쪽 끝(2,480 MHz 근처) 채널", "광고 채널 38"], answer: 0,
        explain: "대역 40의 위쪽 끝과 채널 0(2,402 MHz)은 2 MHz밖에 안 떨어져 필터가 거의 못 깎는다. 멀리 떨어진 채널은 필터가 충분히 깎아 준다." },
      { q: "LTE +23 dBm, 안테나 격리 15 dB. LE 수신기의 대역 외 차단 한도 −35 dBm을 지키려면 필터가 최소 몇 dB를 깎아야 할까?", options: ["23 dB", "35 dB", "43 dB", "58 dB"], answer: 2,
        explain: "+23 − 15 = +8 dBm이 들어온다. +8에서 −35까지 내리려면 43 dB." },
      { q: "이웃 Wi-Fi가 1·6·11번을 모두 쓰면 LE 범용 채널 37개 중 덮이지 않고 남는 채널은 대략?", options: ["6개 남짓", "12개", "20개", "31개"], answer: 0,
        explain: "Wi-Fi 하나가 10개 안팎을 덮어 셋이면 30개 안팎이 덮인다. 비는 곳은 2,424 MHz, 2,448~2,450 MHz, 2,474~2,478 MHz 근처의 6개 남짓." },
      { q: "하이브리드 모드에서 '시간'으로 보호하는 것은?", options: ["블루투스 수신만", "블루투스 송신만", "송신·수신 모두", "아무것도 보호하지 않는다"], answer: 0,
        explain: "가파른 필터로 블루투스 송신이 이동통신 수신을 방해하지 않게 만들고, 블루투스 수신만 시간 나누기로 보호한다." }
    ]
  },
  audio: {
    id: "audio", quest: "Q11", villager: "walkerA", chapter: "audio", title: "🎧 방송 세팅 의뢰",
    intro: "펌웨어 개발자: \"광장에서 이어폰으로 음악을 틀어 볼 거야. 끊기지 않고 늦지 않게 세팅해 줘.\"",
    pass: 3,
    rounds: [
      { q: "사람 많은 지하철역처럼 간섭이 심한 곳에서 끊김을 줄이려면 어떤 코덱 설정이 유리할까?", options: ["비트레이트가 낮은 설정 (예: AAC 256 kb/s)", "LDAC 990 kb/s", "무압축 CD 음질 1,411 kb/s", "비트레이트와 상관없다"], answer: 0,
        explain: "비트레이트가 높으면 공중을 오래 차지해 부딪힐 기회가 늘고 재전송 여유가 줄어든다. 고음질 코덱이 먼저 끊기는 이유." },
      { q: "서브이벤트 하나가 깨질 확률이 30%일 때, CIS의 NSE = 3(재전송 기회 포함 세 번)이면 이벤트 안에 성공할 확률은?", options: ["70%", "91%", "약 97.3%", "100%"], answer: 2,
        explain: "세 번 모두 깨질 확률은 0.3³ = 2.7%. 그래서 1 − 0.027 ≈ 97.3%." },
      { q: "ISO_Interval 10 ms, FT(플러시 기한) 2면 재전송 여유로 더해지는 지연은?", options: ["2 ms", "10 ms", "20 ms", "100 ms"], answer: 2,
        explain: "한 페이로드를 FT개 이벤트 동안 보낼 수 있으므로 ISO_Interval × FT = 20 ms만큼 늦어질 수 있다. 신뢰도와 지연의 맞바꿈." },
      { q: "클래식 통화의 SCO가 깨진 패킷을 다시 보내지 않는 이유는?", options: ["음성은 늦게 오는 것보다 조금 깨지는 편이 낫기 때문", "SCO에는 CRC가 있어서", "통화는 암호화되지 않아서", "SCO는 LE만 쓰기 때문"], answer: 0,
        explain: "통화는 실시간성이 먼저다. 깨진 조각은 잡음으로 지나간다. eSCO는 예약 슬롯 뒤에 재전송 창을 두어 한두 번 다시 보낼 수 있게 했다." }
    ]
  },
  loc: {
    id: "loc", quest: "Q12", villager: "smith", chapter: "location", title: "📍 보물 탐지기 의뢰",
    intro: "대장장이: \"전파로 물건 위치를 잡는 탐지기를 만들고 있어. 숫자 좀 맞춰 봐.\"",
    pass: 3,
    rounds: [
      { q: "1 m 기준 세기 P1m = −59 dBm, 경로 손실 지수 n = 2. RSSI가 −71 dBm이면 추정 거리는?", options: ["약 1.2 m", "약 2 m", "약 4 m", "약 12 m"], answer: 2,
        explain: "d = 10^((P1m − RSSI) / (10 · n)) = 10^(12/20) ≈ 4 m. 같은 RSSI라도 n = 3이면 2.5 m — 환경을 모르면 n부터 틀린다." },
      { q: "2.44 GHz(파장 약 12.3 cm)에서 AoA 안테나 간격으로 알맞은 것은?", options: ["6 cm 이하 (반 파장 이하)", "10 cm", "20 cm", "1 m"], answer: 0,
        explain: "간격이 반 파장(약 6.1 cm)보다 크면 서로 다른 각도가 같은 위상 차이를 만들어 방향이 모호해진다." },
      { q: "채널 사운딩: 1 MHz 간격 위상으로 0.4 m, RTT로는 약 150 m가 나왔다. 실제 거리는?", options: ["0.4 m", "약 150.4 m", "150 m", "알 수 없다"], answer: 1,
        explain: "위상만으로는 150 m마다 같은 값으로 보인다(d_wrap = c / 2Δf). 거친 RTT로 몇 번째 150 m인지 고르고 위상으로 정밀하게 — 150 + 0.4 m." },
      { q: "채널 사운딩 스텝 모드 1이 하는 일은?", options: ["왕복 시간(RTT) 재기", "위상(PBR) 톤", "주파수·시간 맞추기(보정)", "광고"], answer: 0,
        explain: "모드 0은 보정, 모드 1은 RTT, 모드 2는 PBR 톤, 모드 3은 둘 다." }
    ]
  },
  design: {
    id: "design", quest: "Q13", villager: "librarian", chapter: "design", title: "🛠️ 제품 설계 심사",
    intro: "사서: \"설계는 무엇을 포기할지 고르는 일이란다. 내 심사를 통과해 보렴.\"",
    pass: 3,
    rounds: [
      { q: "연결 간격 100 ms, 페리페럴 지연 3인 센서. 휴대폰 → 센서 명령의 최악 반응 시간은?", options: ["100 ms", "300 ms", "400 ms", "1 s"], answer: 2,
        explain: "보낼 게 없으면 3번 건너뛰고 4번째에 깨어나므로 (1 + 3) × 100 = 400 ms. 센서 → 휴대폰 알림은 그대로 100 ms 안에." },
      { q: "같은 센서(간격 100 ms, 지연 3)의 감독 타임아웃으로 쓸 수 있는 가장 짧은 값(10 ms 단위)은?", options: ["400 ms", "800 ms", "810 ms", "1 s"], answer: 2,
        explain: "(1 + 3) × 100 ms × 2 = 800 ms보다 '커야' 한다. 10 ms 단위로는 810 ms가 가장 짧다." },
      { q: "SCI를 지원하는 두 기기가 반응 3 ms를 노린다. 상대가 반드시 지원한다고 믿고 쓸 수 있는 간격은?", options: ["2.5 ms", "3.0 ms", "3.5 ms", "4.0 ms"], answer: 0,
        explain: "SCI 컨트롤러가 반드시 받아야 하는 값은 1.25 ms의 배수(RCV)다. 2.5 ms = 2 × 1.25. 3.0·3.5·4.0 ms는 125 µs 단위(ECV)라 선택." },
      { q: "상대 기기가 무엇을 지원할지 모를 때, 제품이 먼저 동작해야 하는 '기본 경로'는?", options: ["LE 1M · 레거시 광고 · 7.5 ms 이상 간격", "LE 2M · 확장 광고 · 375 µs 간격", "Coded S=8 · 주기적 광고", "HDT 7.5 Mb/s"], answer: 0,
        explain: "기능 대부분은 선택이라 모든 기기가 지원하는 경로로 먼저 동작하고, 기능 교환으로 확인한 뒤에만 더 나은 경로로 올라간다." }
    ]
  },
  mesh: {
    id: "mesh", quest: "Q10", villager: "keeper", chapter: "mesh", title: "💡 릴레이 배치 의뢰", kind: "mesh",
    intro: "등대지기: \"등대 스위치로 마을 조명을 다 켜고 싶어. 릴레이를 몇 개만 켜고 TTL을 맞춰서, 공중을 시끄럽게 하지 말고 끝까지 닿게 해 줘.\"",
    pass: 3
  }
});
export const trialFor = (id) => TRIALS[id] ?? null;

/** 4라운드 채점 @returns {{ score: number, passed: boolean }} */
export function gradeTrial(trial, picks) {
  const score = trial.rounds.reduce((n, r, i) => n + (picks[i] === r.answer ? 1 : 0), 0);
  return { score, passed: score >= trial.pass };
}

// ---------- 💡 메시 릴레이 퍼즐 (Q10) ----------
// 격자 위 노드(조명)들. 스위치(출발지)가 TTL을 달아 한 번 외치면, 닿은 노드 중 릴레이로 켠 노드만 TTL을 1 줄여 다시 외친다(TTL ≥ 2일 때).
// 모든 노드가 받으면 성공. 단 릴레이 수가 한도 안이어야 한다 — 모두 켜면 공중이 혼잡해진다(관리된 플러딩).
/** @typedef {{ nodes: [number, number][], source: number, range: number, maxRelays: number, maxTtl: number, hint: string }} MeshLevel */
export const MESH_LEVELS = Object.freeze([
  { hint: "일직선 복도의 조명 여섯 개. 한 번 외치면 두 칸까지 닿는다 — 릴레이 둘, TTL 4 이하로.", range: 2.1, maxRelays: 2, maxTtl: 4, source: 0,
    nodes: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]] },
  { hint: "갈라지는 길. 갈림목을 잘 고르면 릴레이 셋이면 된다.", range: 2.1, maxRelays: 3, maxTtl: 4, source: 0,
    nodes: [[0, 1], [1, 1], [2, 1], [3, 0], [4, 0], [3, 2], [4, 2], [5, 2]] },
  { hint: "광장 둘레. 한쪽으로만 돌면 릴레이가 모자란다 — 양쪽으로 퍼뜨리자.", range: 2.1, maxRelays: 3, maxTtl: 4, source: 0,
    nodes: [[0, 1], [1, 0], [2, 0], [3, 0], [4, 1], [1, 2], [2, 2], [3, 2], [4, 2]] }
]);

/**
 * 플러딩 실행 @param {MeshLevel} lvl @param {Set<number>} relays 릴레이로 켠 노드 @param {number} ttl 처음 TTL
 * @returns {{ reached: Set<number>, transmissions: number, ok: boolean, why: string|null }}
 */
export function runMesh(lvl, relays, ttl) {
  const n = lvl.nodes.length;
  const near = (a, b) => Math.hypot(lvl.nodes[a][0] - lvl.nodes[b][0], lvl.nodes[a][1] - lvl.nodes[b][1]) <= lvl.range;
  const got = new Map([[lvl.source, ttl]]);   // 노드 → 받은 TTL (캐시: 처음 받은 것만)
  let frontier = [lvl.source], transmissions = 0;
  while (frontier.length) {
    const next = [];
    for (const tx of frontier) {
      const t = got.get(tx);
      const canSend = tx === lvl.source || (relays.has(tx) && t >= 2);   // 릴레이는 TTL ≥ 2일 때만 다시 보낸다
      if (!canSend) continue;
      transmissions++;
      const out = tx === lvl.source ? t : t - 1;
      for (let i = 0; i < n; i++) if (!got.has(i) && near(tx, i)) { got.set(i, out); next.push(i); }
    }
    frontier = next;
  }
  const reached = new Set(got.keys());
  const relayCount = [...relays].filter((r) => r !== lvl.source).length;
  const why = reached.size < n ? `${n - reached.size}개에 닿지 않았다` : relayCount > lvl.maxRelays ? `릴레이가 ${relayCount}개 — 한도 ${lvl.maxRelays}개를 넘어 공중이 혼잡하다` : ttl > lvl.maxTtl ? `TTL ${ttl} — 한도 ${lvl.maxTtl}을 넘는다` : null;
  return { reached, transmissions, ok: !why, why };
}
