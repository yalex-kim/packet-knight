// 알바(비콘 찾기) 봇 — 게임과 같은 core/rssiJob.js를 돌린다 (Stage 11.2)
//
// 봇은 사람이 하는 방법을 흉내 낸다: 멈춰 서서 패킷 targetN개를 평균해 거리 r을 재고(반응 지연 포함),
//   ① r이 MARK_R 이하면 "여기다!"
//   ② 잰 자리가 1~2곳뿐이면 STEP m 옆으로 (두 번째는 직각으로) 옮겨 다시 잰다
//   ③ 3곳 이상이면 최근 자리들의 거리로 삼변측량(최소제곱)해 그 점으로 걸어가 다시 잰다
//   ④ MAX_PROBES번 재도 못 찾으면 추정 위치에서 그냥 신고한다
// 비콘은 게임과 같은 반경 AREA_R m 측정 구역 안에 숨는다 (Stage 11.4). 봇은 구역 가장자리에서 시작하고(등대에서 걸어온 셈),
// 구역 밖으로는 나가지 않는다. 구역은 장애물 없는 잔디밭이라 게임과 거의 같다.
import { createJob, stepJob, markBeacon, distanceFromRssi, averageRssi } from "../../src/core/rssiJob.js";
import { PLAYER_BASE, RSSI_JOB } from "../../src/core/balance.js";

export const DT = 1 / 60;
export const REACTION = 0.35;   // 사람 반응 지연 (초)
const SPEED = PLAYER_BASE.hop;  // 걷는 속도 (m/s)
const AREA = { x: 0, z: 0, r: RSSI_JOB.AREA_R };
const MARK_R = 1.2;             // 이 거리 안이라고 재면 신고
const STEP = 3;                 // 처음 두 번 옮겨 재는 거리 (m)
const MAX_PROBES = 7;

/** 봇 전략: 한 자리에서 패킷 targetN개를 평균한다 (이름은 Stage 5와 같게 — 스모크·보고서가 이름으로 찾는다) */
export const RSSI_STRATEGIES = [
  { name: "성급 (N=1)", targetN: 1 },
  { name: "조급 (N=3)", targetN: 3 },
  { name: "적당 (N=6)", targetN: 6 },
  { name: "평균 (N=10)", targetN: 10 },
  { name: "신중 (N=15)", targetN: 15 },
  { name: "느긋 (N=25)", targetN: 25 },
  { name: "과신중 (N=40)", targetN: 40 }
];

function clampToArea(p) {
  const r = Math.hypot(p.x, p.z), lim = AREA.r;
  return r <= lim ? p : { x: (p.x / r) * lim, z: (p.z / r) * lim };
}

/** 최소제곱 삼변측량 — Σ(|p − pᵢ| − rᵢ)² 최소점 (가우스–뉴턴, 거리가 가까운 측정에 가중치) */
export function trilaterate(probes) {
  let wsum = 0, x = 0, z = 0;
  for (const p of probes) { const w = 1 / Math.max(0.5, p.r); wsum += w; x += p.x * w; z += p.z * w; }
  x /= wsum; z /= wsum;
  for (let it = 0; it < 30; it++) {
    let a = 0, b = 0, c = 0, gx = 0, gz = 0;
    for (const p of probes) {
      const dx = x - p.x, dz = z - p.z, d = Math.max(1e-6, Math.hypot(dx, dz));
      const w = 1 / Math.max(0.5, p.r) ** 2;
      const jx = dx / d, jz = dz / d, res = d - p.r;
      a += w * jx * jx; b += w * jx * jz; c += w * jz * jz; gx += w * jx * res; gz += w * jz * res;
    }
    const det = a * c - b * b;
    if (Math.abs(det) < 1e-9) break;
    const sx = (c * gx - b * gz) / det, sz = (a * gz - b * gx) / det;
    x -= sx; z -= sz;
    if (Math.hypot(sx, sz) < 1e-3) break;
  }
  return { x, z };
}

export function rssiSession(targetN, rng) {
  const pos = { x: 0, z: AREA.r };   // 구역 가장자리에서 시작
  const job = createJob(rng, { start: pos, area: AREA });
  let probes = [], target = null, readyAt = null, markAt = null, markOnArrive = false, round = -1, dir = 0;
  while (job.phase !== "done") {
    if (job.phase === "search" && round !== job.history.length) {   // 새 비콘
      round = job.history.length; probes = []; target = null; readyAt = null; markAt = null; markOnArrive = false; dir = rng() * Math.PI * 2;
    }
    if (job.phase === "search" && target) {                          // 걷는 중
      const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz), step = SPEED * DT;
      if (d <= step) {
        pos.x = target.x; pos.z = target.z; target = null;
        if (markOnArrive) { markOnArrive = false; markAt = job.phaseTime + REACTION; }
      }
      else { pos.x += (dx / d) * step; pos.z += (dz / d) * step; }
    }
    stepJob(job, DT, rng, pos);
    if (job.phase !== "search" || target) continue;

    if (markAt !== null) {
      if (job.phaseTime >= markAt) { markBeacon(job, pos); markAt = null; }
      continue;
    }
    if (readyAt === null && job.beacon.samples.length >= targetN) readyAt = job.phaseTime + REACTION;
    if (readyAt === null || job.phaseTime < readyAt) continue;
    readyAt = null;

    const r = distanceFromRssi(averageRssi(job));
    probes.push({ x: pos.x, z: pos.z, r });
    if (r <= MARK_R) { markAt = job.phaseTime; continue; }
    if (probes.length >= MAX_PROBES) {
      target = clampToArea(trilaterate(probes.slice(-4)));
      markOnArrive = true;   // 도착하면 신고
      continue;
    }
    if (probes.length === 1) target = clampToArea({ x: pos.x + STEP * Math.cos(dir), z: pos.z + STEP * Math.sin(dir) });
    else if (probes.length === 2) target = clampToArea({ x: pos.x + STEP * Math.cos(dir + Math.PI / 2), z: pos.z + STEP * Math.sin(dir + Math.PI / 2) });
    else target = clampToArea(trilaterate(probes.slice(-4)));
    if (Math.hypot(target.x - pos.x, target.z - pos.z) < 0.4) target = null;   // 제자리 → 다시 잰다
  }
  return job.result;
}
