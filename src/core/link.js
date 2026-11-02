// 전투 중 기사의 BLE 링크 — 연결 이벤트마다 채널 선택 알고리즘 #1로 도약, 채널맵 갱신은 instant에 적용 (순수 로직)
//
// PRD §4.3·§8.4 (Stage 8): "간섭이 심한 채널을 피해 도약해야 딜 누수 없이 싸울 수 있다" ·
//   "Wi-Fi 간섭 몬스터 광역 공격은 회피 불가, 대신 간섭 채널 밖이면 피해 0"
//   · 지금 채널이 살아 있는 Wi-Fi 몬스터의 대역 안 → 내 ADV 패킷은 손실, 그 몬스터의 광역 공격은 맞는다
//   · 대역 밖 → 패킷은 닿고, 그 몬스터의 광역 공격은 피해 0
// 채널맵 갱신: LL_CHANNEL_MAP_IND로 알리고 "몇 번째 이벤트(instant)부터 새 맵" — 두 기기가 같은 이벤트에 갈아탄다
//   (connectivityBook connection.html·hopping.html, [Vol 6] Part B §5.1.2). 이 게임은 instant = 지금 + 6 이벤트.

import { allChannelsMap, csa1Sequence, usedChannels, wifiBlockedChannels, MIN_USED_CHANNELS } from "./hopping.js";

export const LINK_COMBAT = Object.freeze({
  INTERVAL: 0.5,       // 연결 간격 (게임 시간 초) — 실제보다 훨씬 느리게, 눈으로 따라갈 수 있게
  INSTANT_DELAY: 6     // 채널맵 갱신이 적용되기까지의 이벤트 수
});

/** @param {number} hopIncrement 층의 hopIncrement */
export function createLink(hopIncrement) {
  const link = { hopIncrement, event: 0, since: 0, map: allChannelsMap(), pending: null, channel: 0, remapped: false };
  advance(link);
  return link;
}

function advance(link) {
  if (link.pending && link.event >= link.pending.instant) {
    link.map = link.pending.map;
    link.pending = null;
  }
  const [e] = csa1Sequence(link.hopIncrement, link.map, 1, link.event);
  link.channel = e.channel;
  link.remapped = e.remapped;
}

/** 시간 진행 — 연결 이벤트가 넘어가면 다음 채널로 도약. 넘어간 이벤트 수를 반환 */
export function stepLink(link, dt) {
  link.since += dt;
  let n = 0;
  while (link.since >= LINK_COMBAT.INTERVAL) {
    link.since -= LINK_COMBAT.INTERVAL;
    link.event += 1;
    advance(link);
    n++;
  }
  return n;
}

/** 다음에 적용될 맵 (대기 중이면 그것, 아니면 현재 맵) */
export const targetMap = (link) => (link.pending ? link.pending.map : link.map);

/**
 * 채널맵 갱신 요청 (LL_CHANNEL_MAP_IND) — instant = 지금 + INSTANT_DELAY. 최소 2채널을 지키지 못하면 거절.
 * @returns {boolean}
 */
export function requestMap(link, map) {
  if (usedChannels(map).length < MIN_USED_CHANNELS) return false;
  link.pending = { map: [...map], instant: link.event + LINK_COMBAT.INSTANT_DELAY };
  return true;
}

/** 채널 하나 넣고 빼기 (대기 중인 맵 기준) */
export function toggleLinkChannel(link, ch) {
  const next = [...targetMap(link)];
  next[ch] = !next[ch];
  return requestMap(link, next);
}

/** 여러 채널을 한꺼번에 빼기 (AFH) — 최소 2채널은 남긴다 */
export function excludeChannels(link, channels) {
  const next = [...targetMap(link)];
  for (const c of channels) {
    if (usedChannels(next).length <= MIN_USED_CHANNELS) break;
    next[c] = false;
  }
  return requestMap(link, next);
}

/**
 * AFH 한 번에: 채널맵 = 모든 채널 − 지금 드러난(스캔한) 살아 있는 몬스터들의 대역.
 * 누적으로 빼지 않고 다시 계산한다 — 몬스터가 채널을 옮기면(ACS) 예전 대역은 돌려받는다.
 * 남는 채널이 2개 미만이면 거절.
 */
export function applyAfh(link, battle) {
  const map = allChannelsMap();
  for (const m of battle.monsters) if (m.state !== "dead" && m.revealed) for (const c of monsterBand(m)) map[c] = false;
  return requestMap(link, map);
}

/** Wi-Fi 몬스터 한 마리가 덮는 LE 채널 */
export const monsterBand = (m) => (m.wifi ? wifiBlockedChannels([m.wifi]) : new Set());

/** 지금 채널이 이 몬스터의 대역 안인가 */
export const exposedTo = (link, m) => monsterBand(m).has(link.channel);

/**
 * battle.js에 넘기는 간섭 판정
 * @returns {{ packetLost: (battle: any) => boolean, playerHit: (m: any) => boolean }}
 */
export function interferenceFor(link) {
  return {
    // 살아 있는 Wi-Fi 몬스터 중 하나라도 지금 채널을 덮으면 내 패킷은 깨진다
    packetLost: (battle) => battle.monsters.some((m) => m.state !== "dead" && exposedTo(link, m)),
    // 광역 공격은 지금 채널이 그 몬스터 대역 안일 때만 들어온다
    playerHit: (m) => !m.wifi || exposedTo(link, m)
  };
}
