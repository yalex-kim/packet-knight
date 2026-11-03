// 주민 대사 (Stage 11.14) — BT 펌웨어·RF 엔지니어가 공감할 만한 한마디. 순수 데이터 (THREE·DOM 없음)
// 근거는 connectivityBook Bluetooth 각 장의 핵심 정리(core/chapters.data.js). chapter = 그 장 id (대사창의 📖 링크)
// 주민은 자기 관심 장(layout.js VILLAGERS.topics)에서 70%, 아무 장에서 30% 무작위로 꺼낸다 (pickLine).
// 새 대사는 이 배열에 한 줄씩 넣으면 된다.

/** @type {ReadonlyArray<{ chapter: string, text: string }>} */
export const VILLAGER_LINES = Object.freeze([
  // ---- 연결 (connection) ----
  { chapter: "connection", text: "연결 간격을 7.5 ms로 줄이면 반응은 날아다니지. 대신 배터리는 금방 닳고." },
  { chapter: "connection", text: "감독 타임아웃은 (1 + 지연) × 간격 × 2보다 커야 해. 이거 틀려서 밤새 디버깅했었지." },
  { chapter: "connection", text: "페리페럴 지연 걸어 두면 푹 자. 근데 센트럴이 급하게 부를 땐 한 박자 늦어." },
  { chapter: "connection", text: "1.4 Mb/s 나온다며? 2M에 DLE 251, MTU 247까지 다 맞춰야 겨우 근처야." },
  { chapter: "connection", text: "SN·NESN 1비트씩으로 재전송을 다 처리한다니, 볼 때마다 신기해." },
  { chapter: "connection", text: "MD 비트 하나 깜빡하면 이벤트가 바로 닫혀서 처리량이 반토막 나더라." },
  { chapter: "connection", text: "6.2부터 연결 간격이 375 µs까지 내려간대. 상대 컨트롤러가 SCI를 지원해야 하지만." },
  { chapter: "connection", text: "앵커 포인트 뒤 150 µs 안에 답해야 해. T_IFS는 기다려 주지 않아." },
  // ---- 광고 (advertising) ----
  { chapter: "advertising", text: "광고 간격 20 ms면 금방 찾지. 그 대신 코인 전지가 울어." },
  { chapter: "advertising", text: "advDelay 0~10 ms 난수 덕에 두 비콘이 영원히 부딪히진 않아. 작은 난수의 힘이지." },
  { chapter: "advertising", text: "AdvData 31바이트… 이름 넣고 UUID 넣으면 끝이야. 스캔 응답 없으면 못 살아." },
  { chapter: "advertising", text: "확장 광고면 1,650바이트까지 되는데, 상대 폰이 5.0이 아니면 말짱 꽝이지." },
  { chapter: "advertising", text: "CONNECT_IND 한 방에 연결 간격·채널 맵까지 약속을 다 넘긴다니, 멋있지 않아?" },
  { chapter: "advertising", text: "처음 30초는 빠른 광고, 그다음엔 1초 남짓. 그게 국룰이지." },
  // ---- 호핑 (hopping) ----
  { chapter: "hopping", text: "Wi-Fi 하나가 LE 채널 9~10개를 덮어. 채널맵에서 빼는 게 답이야." },
  { chapter: "hopping", text: "CSA #2는 이벤트 카운터만 있으면 아무 이벤트 채널이나 계산돼. #1보다 훨씬 고르게 퍼지고." },
  { chapter: "hopping", text: "LE 채널맵은 최소 2채널이면 된대. 클래식은 20채널인데 말이야." },
  { chapter: "hopping", text: "같은 칩 안의 Wi-Fi랑은 도약으로 못 피해. PTA로 시간을 나눠 써야지." },
  { chapter: "hopping", text: "나쁜 채널 한 번 밟아도 괜찮아. 다음 이벤트는 다른 채널이니까 재전송이면 돼." },
  // ---- 전파 (radio) ----
  { chapter: "radio", text: "RSSI로 거리 재지 마. ±6 dB에 페이딩까지 얹으면 거리가 두 배씩 틀려." },
  { chapter: "radio", text: "사람 몸이 10 dB 넘게 깎아 먹어. 뒷주머니에 넣은 폰이 끊기는 이유지." },
  { chapter: "radio", text: "+3 dB는 두 배, 거리 두 배면 −6 dB. 이것만 외워도 링크 버짓 절반은 끝." },
  { chapter: "radio", text: "다중 경로 페이딩은 몇 cm 차이로 20 dB가 출렁여. 그래서 채널을 바꿔 가며 쓰는 거야." },
  { chapter: "radio", text: "안테나 매칭 한 번 잘못하면 데이터시트 감도는 다 무용지물이더라." },
  // ---- PHY ----
  { chapter: "phy", text: "가까우면 2M, 멀면 Coded. 느린 PHY는 전력도 충돌 기회도 늘어나." },
  { chapter: "phy", text: "Coded S=8이면 감도가 확 좋아지지. 대신 125 kb/s라 펌웨어 업데이트는 꿈도 꾸지 마." },
  { chapter: "phy", text: "SNR 몇 dB만 떨어져도 BER은 자릿수로 뛰어. 긴 패킷부터 깨지지." },
  // ---- 전력 (power) ----
  { chapter: "power", text: "평균 전류 = 수면 전류 + 이벤트 전하 ÷ 간격. 간격만 늘린다고 끝이 아니야, 바닥은 수면 전류가 정해." },
  { chapter: "power", text: "32 kHz 크리스털 아끼려다 RC 발진기 쓰면 창 넓히기로 배터리가 줄줄 새." },
  { chapter: "power", text: "데이터는 모아서 보내. 이벤트마다 붙는 고정 비용이 생각보다 커." },
  { chapter: "power", text: "CR2032로 몇 년 간다는 거, 수면 전류 1 µA 차이로 1년이 갈려." },
  { chapter: "power", text: "LE 전력 제어 켜 두면 상대가 RSSI 보고 송신 전력을 낮춰 줘. 배터리도 간섭도 줄지." },
  // ---- GATT ----
  { chapter: "gatt", text: "ATT_MTU 23이면 알림에 20바이트밖에 못 실어. MTU 교환부터 하자." },
  { chapter: "gatt", text: "표시(Indication)는 응답을 기다려서 연결 간격당 하나야. 처리량이 필요하면 알림을 써." },
  { chapter: "gatt", text: "CCCD에 0x0001 쓰는 걸 깜빡해서 알림이 안 온다고 하루를 날렸지." },
  { chapter: "gatt", text: "서비스 찾기는 왕복이 많아서 느려. 본딩했으면 캐시하고 Database Hash로 확인해." },
  { chapter: "gatt", text: "Service Changed 안 보내고 펌웨어를 바꾸면 폰이 옛날 핸들로 계속 읽어." },
  // ---- 보안 (security) ----
  { chapter: "security", text: "Just Works는 미인증이야. 입출력 없는 기기라면 어쩔 수 없지만." },
  { chapter: "security", text: "레거시 페어링은 녹음해서 대입하면 풀려. 무조건 Secure Connections!" },
  { chapter: "security", text: "RPA는 15분 안쪽으로 바뀌어. IRK를 가진 친구만 날 알아보지." },
  { chapter: "security", text: "숫자 비교에서 확인도 안 하고 '예'만 누르는 사람 꼭 있어. 그게 중간자를 잡는 유일한 순간인데." },
  // ---- 공존 (coexistence) ----
  { chapter: "coexistence", text: "LTE 대역 40이 바로 옆이라 공존 테스트는 늘 지옥이야." },
  { chapter: "coexistence", text: "같은 기기 안 격리가 10~20 dB뿐이라 옆 무선이 수신기에 100 dB 가깝게 꽂혀." },
  { chapter: "coexistence", text: "블루투스–Wi-Fi 공존 신호는 사양에 없어. 결국 칩 안 PTA 우선순위 싸움이지." },
  // ---- 오디오 (audio) ----
  { chapter: "audio", text: "A2DP는 버퍼 때문에 100 ms는 그냥 넘어. LE 오디오면 수십 ms까지 줄지." },
  { chapter: "audio", text: "코덱 비트레이트를 올리면 공중 시간도 늘어서 간섭에 약해져. 음질만 볼 게 아니야." },
  { chapter: "audio", text: "Auracast는 청취자가 천 명이어도 송신기는 그대로야. 방송이니까." },
  // ---- 메시 (mesh) ----
  { chapter: "mesh", text: "메시에서 릴레이를 다 켜면 다 같이 외쳐서 아무도 못 들어. TTL을 잘 잡아." },
  { chapter: "mesh", text: "PAwR이면 송신기 하나로 전자 가격표 수천 개를 깨운대. 각자 자기 서브이벤트만 듣고." },
  // ---- 위치 (location) ----
  { chapter: "location", text: "채널 사운딩은 세기 대신 위상이랑 시간을 재. 시간은 증폭기로 못 꾸미거든." },
  { chapter: "location", text: "AoA 안테나 간격이 반 파장, 6 cm를 넘으면 방향이 헷갈려." },
  // ---- 설계 (design) · 시작 (intro) ----
  { chapter: "design", text: "요구 사항부터 숫자로 정해. '1초마다 2바이트, 반응 100 ms, 1년'. 파라미터는 그다음이야." },
  { chapter: "design", text: "상대가 SCI를 지원 안 할 때의 기본 경로도 꼭 만들어 둬. 현장엔 별의별 폰이 다 있어." },
  { chapter: "intro", text: "shall은 필수, should는 권장, may는 허용. 사양서 읽을 땐 이것부터 봐." },
  { chapter: "intro", text: "시간에 민감한 건 컨트롤러가, 나머진 호스트가. HCI 로그를 보면 다 보여." }
]);

/**
 * 주민의 다음 대사 — 관심 장(topics)에서 70%, 아무 장에서 30%. 바로 앞 대사는 피한다.
 * @param {string[]} topics @param {() => number} rng @param {string|null} last 바로 앞 대사
 */
export function pickLine(topics, rng = Math.random, last = null) {
  const fav = VILLAGER_LINES.filter((l) => topics.includes(l.chapter));
  const pool = fav.length && rng() < 0.7 ? fav : VILLAGER_LINES;
  for (let i = 0; i < 6; i++) {
    const line = pool[Math.floor(rng() * pool.length)];
    if (line.text !== last) return line;
  }
  return pool[0];
}
