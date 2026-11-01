// LE 데이터 채널 호핑 — 채널 선택 알고리즘 #1, 채널맵, Wi-Fi 간섭 (순수 로직)
// 출처: connectivityBook hopping.html (본문 공식과 시뮬레이터 코드), Bluetooth Core 6.3 [Vol 6] Part B §4.5.8
//   · unmappedChannel = (lastUnmappedChannel + hopIncrement) mod 37, hopIncrement 5~16, 첫 이벤트의 last = 0
//   · 안 쓰는 채널이면 remappingIndex = unmapped mod (쓰는 채널 수) → 쓰는 채널 오름차순 표에서 선택
//   · 채널맵은 최소 2채널 [Vol 6] Part B §4.5.8.1
//   · Wi-Fi 채널 w의 중심 2407 + 5w MHz, 중심 ±10 MHz를 막는다 (교과서 시뮬레이터: |f − fc| < 11)

export const DATA_CHANNELS = 37;
export const MIN_USED_CHANNELS = 2;
export const HOP_MIN = 5, HOP_MAX = 16;

/** LE 데이터(범용) 채널 0~36의 중심 주파수 (MHz) — 광고 채널 2402·2426·2480을 건너뛴다 */
export const dataChannelFreq = (ch) => (ch <= 10 ? 2404 + 2 * ch : 2428 + 2 * (ch - 11));

/** Wi-Fi(2.4 GHz) 채널 1~13의 중심 주파수 (MHz) */
export const wifiCenterFreq = (w) => 2407 + 5 * w;

/** Wi-Fi 채널들이 덮는 LE 데이터 채널 집합 */
export function wifiBlockedChannels(wifiChannels) {
  const out = new Set();
  for (const w of wifiChannels) {
    const fc = wifiCenterFreq(w);
    for (let c = 0; c < DATA_CHANNELS; c++) if (Math.abs(dataChannelFreq(c) - fc) < 11) out.add(c);
  }
  return out;
}

/** 채널맵(37개 boolean) → 쓰는 채널 오름차순 목록 */
export const usedChannels = (map) => map.map((u, c) => (u ? c : -1)).filter((c) => c >= 0);

export const allChannelsMap = () => Array(DATA_CHANNELS).fill(true);

/**
 * 채널 선택 알고리즘 #1로 이벤트 n개의 채널 열
 * @returns {Array<{ event: number, unmapped: number, channel: number, remapped: boolean }>}
 */
export function csa1Sequence(hopIncrement, map, n, startEvent = 0) {
  const used = usedChannels(map);
  if (used.length < MIN_USED_CHANNELS) throw new Error(`채널맵은 최소 ${MIN_USED_CHANNELS}채널`);
  const out = [];
  let last = (hopIncrement * startEvent) % DATA_CHANNELS; // 이벤트 k의 unmapped = hop·(k+1) mod 37
  for (let e = startEvent; e < startEvent + n; e++) {
    const unmapped = (last + hopIncrement) % DATA_CHANNELS;
    last = unmapped;
    if (map[unmapped]) out.push({ event: e, unmapped, channel: unmapped, remapped: false });
    else out.push({ event: e, unmapped, channel: used[unmapped % used.length], remapped: true });
  }
  return out;
}

/**
 * 링크 테스트: 이벤트 n개 동안 막힌 채널에 걸리면 실패 (간섭원이 늘 말하고 있다고 보는 결정적 판정 — 퍼즐용)
 * @returns {{ ok: boolean, events: Array<{ event: number, channel: number, remapped: boolean, lost: boolean }>, streak: number }}
 */
export function linkTest(hopIncrement, map, blocked, n, startEvent = 0) {
  const events = csa1Sequence(hopIncrement, map, n, startEvent).map((e) => ({ ...e, lost: blocked.has(e.channel) }));
  let streak = 0, best = 0;
  for (const e of events) { streak = e.lost ? 0 : streak + 1; best = Math.max(best, streak); }
  return { ok: events.every((e) => !e.lost), events, streak: best };
}
