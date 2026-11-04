// 전투 렌더링 — 훈련용 비콘 봇·Wi-Fi 간섭 몬스터 모델(Stage 11.11), ADV 패킷 투사체, 드롭(CR2032), HP 바, 처치 연출 (THREE 의존)
// 상태는 core/battle.js가 들고, 여기서는 매 프레임 메시를 맞춘다.

import * as THREE from "three";
import { MONSTERS, TRAINING_GROUND } from "../core/balance.js";
import { groundHeightAt } from "../core/terrain.js";

export const battleRoot = new THREE.Group();
/** 클릭(탭) 대상 — 몬스터 루트 그룹들 (userData.monsterId) */
export const monsterTargets = [];

const ledGeo = new THREE.SphereGeometry(0.09, 10, 10);
const projGeo = new THREE.BoxGeometry(0.16, 0.16, 0.55);
const coinGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.07, 18);
const barGeo = new THREE.PlaneGeometry(0.9, 0.1);

const projMat = new THREE.MeshBasicMaterial({ color: 0x7dfcff });
const coinMat = new THREE.MeshLambertMaterial({ color: 0xd9dde2, emissive: 0x2a2a20 });
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x1a0d0d, transparent: true, opacity: 0.75, depthTest: false });
const barFgMat = new THREE.MeshBasicMaterial({ color: 0xff5a4e, depthTest: false });

// ---------- 훈련장 바닥 표시 (충돌 없는 원형 경계 타일 + 표지판은 layout 랜드마크) ----------
{
  const tileMat = new THREE.MeshLambertMaterial({ color: 0xc9b37a });
  const tileGeo = new THREE.BoxGeometry(0.55, 0.06, 0.55);
  const R = 5.6;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const x = TRAINING_GROUND.x + Math.cos(a) * R, z = TRAINING_GROUND.z + Math.sin(a) * R;
    const t = new THREE.Mesh(tileGeo, tileMat);
    t.position.set(x, groundHeightAt(x, z) + 0.03, z);
    t.rotation.y = -a;
    battleRoot.add(t);
  }
}

/** @type {Map<number, THREE.Group>} */
const monsterMeshes = new Map();
/** @type {Map<number, THREE.Mesh>} */
const projMeshes = new Map();
/** @type {Map<number, THREE.Mesh>} */
const dropMeshes = new Map();
const bursts = [];
const tmpQ = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// ---------- 무기별 투사체 (Stage 12.6) ----------
const projStyle = {
  sword: { color: 0x7de3ff }, dagger: { color: 0xffd76b }, bow: { color: 0x7dffb5 }, fan: { color: 0xb49bff }
};
const haloMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
function makeProjectile(style = "sword") {
  const c = (projStyle[style] ?? projStyle.sword).color;
  const core = new THREE.MeshBasicMaterial({ color: c });
  const g = new THREE.Group();
  if (style === "sword") {          // 반달 참격: 가로로 누운 호
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 20, Math.PI * 0.9), core);
    arc.rotation.set(Math.PI / 2, 0, Math.PI * 0.05); g.add(arc);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.13, 6, 20, Math.PI * 0.9), haloMat(c));
    glow.rotation.copy(arc.rotation); g.add(glow);
  } else if (style === "dagger") {  // 가늘고 빠른 금빛 탄
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.42), core));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), haloMat(c)));
  } else if (style === "bow") {     // 화살: 자루 + 촉 + 깃 + 꼬리 빛
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.6), new THREE.MeshBasicMaterial({ color: 0x8a6a45 })); g.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), core); head.rotation.x = Math.PI / 2; head.position.z = 0.36; g.add(head);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 0.1), core); fl.position.z = -0.26; g.add(fl);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), haloMat(c)); tail.position.z = -0.1; g.add(tail);
  } else {                          // 부채: 돌아가는 보랏빛 크리스털 조각
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), core); shard.scale.set(0.7, 1, 0.5); g.add(shard);
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.28), haloMat(c)));
    g.userData.spin = true;
  }
  return g;
}

// ---------- 몬스터 모델 (Stage 11.11 — 상자 → 캐릭터) ----------
/** 상자 하나 (그림자 드리움, 빛나는 재질은 제외) */
function part(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = !mat.isMeshBasicMaterial;
  parent.add(m);
  return m;
}
function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

/** Wi-Fi 간섭 몬스터: 화난 눈·LED 이빨·꿈틀대는 안테나 3개·게 다리 4개의 공유기 괴물 + 간섭 전파 고리 + 광역 공격 예고 원 */
function makeRouter(g) {
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5a6378, emissive: 0x000000 });   // Stage 11.21: 어두운 던전에서도 보이게 밝게
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x343a48 });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff9a3c });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb340 });
  const rig = new THREE.Group();
  g.add(rig);
  // 다리 4개 (게처럼 옆으로 벌어진)
  const legs = [];
  for (const [x, z] of [[-0.45, 0.25], [0.45, 0.25], [-0.45, -0.25], [0.45, -0.25]]) {
    const j = joint(rig, x, 0.36, z);
    const seg = part(j, 0.12, 0.12, 0.36, trimMat, Math.sign(x) * 0.16, -0.08, 0);
    seg.rotation.z = Math.sign(x) * 0.7;
    part(j, 0.1, 0.24, 0.1, trimMat, Math.sign(x) * 0.3, -0.24, 0);
    legs.push(j);
  }
  // 몸통: 납작한 공유기 + 윗판 + 앞면 그릴
  part(rig, 1.15, 0.46, 0.8, bodyMat, 0, 0.6, 0);
  part(rig, 1.2, 0.08, 0.86, trimMat, 0, 0.86, 0);
  for (const x of [-0.42, -0.3, 0.3, 0.42]) part(rig, 0.06, 0.24, 0.02, trimMat, x, 0.6, 0.41);
  // 화난 눈 (기울어진 주황 빛) + 눈썹
  const eyeL = part(rig, 0.2, 0.09, 0.03, eyeMat, -0.17, 0.7, 0.415); eyeL.rotation.z = -0.35;
  const eyeR = part(rig, 0.2, 0.09, 0.03, eyeMat, 0.17, 0.7, 0.415); eyeR.rotation.z = 0.35;
  // LED 이빨 (트래픽처럼 깜빡)
  for (const x of [-0.15, -0.05, 0.05, 0.15]) part(rig, 0.06, 0.06, 0.03, ledMat, x, 0.5, 0.415);
  // 안테나 3개 + 빛나는 끝
  const antennas = [];
  for (const x of [-0.42, 0, 0.42]) {
    const j = joint(rig, x, 0.9, -0.28);
    part(j, 0.06, 0.8, 0.06, trimMat, 0, 0.4, 0);
    part(j, 0.13, 0.13, 0.13, ledMat, 0, 0.84, 0);
    j.rotation.z = x * 0.45;
    antennas.push(j);
  }
  // 간섭 전파 고리 (평소에도 몸에서 퍼진다)
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.86, 40),
    new THREE.MeshBasicMaterial({ color: 0xff7a3c, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }));
  wave.rotation.x = -Math.PI / 2;
  wave.position.y = 0.06;
  g.add(wave);
  const aoe = new THREE.Mesh(
    new THREE.RingGeometry(MONSTERS.wifiInterferer.attackRange - 0.15, MONSTERS.wifiInterferer.attackRange, 48),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false })
  );
  aoe.rotation.x = -Math.PI / 2;
  aoe.position.y = 0.04;
  aoe.visible = false;
  g.add(aoe);
  const aoeFill = new THREE.Mesh(
    new THREE.CircleGeometry(MONSTERS.wifiInterferer.attackRange, 48),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false })
  );
  aoeFill.rotation.x = -Math.PI / 2;
  aoeFill.position.y = 0.03;
  aoeFill.visible = false;
  g.add(aoeFill);
  return { rig, bodyMat, ledMat, eyeMat, aoe, aoeFill, legs, antennas, wave };
}

/** 훈련용 비콘 봇: 몸통 위 둥근 머리(얼굴 화면·픽셀 눈), 짧은 팔다리, 안테나 전구, 등에 CR2032 코인 전지 배낭 */
function makeBeaconBot(g) {
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x7f97b8, emissive: 0x000000 });
  const bellyMat = new THREE.MeshLambertMaterial({ color: 0xe8eef5 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x3b4658 });
  const coinMat2 = new THREE.MeshLambertMaterial({ color: 0xd9dde2 });
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x0d1b2a });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7de3ff });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x39d0ff });
  const rig = new THREE.Group();
  g.add(rig);
  const legs = [joint(rig, -0.12, 0.2, 0), joint(rig, 0.12, 0.2, 0)];
  for (const l of legs) { part(l, 0.12, 0.14, 0.14, darkMat, 0, -0.07, 0); part(l, 0.16, 0.06, 0.2, darkMat, 0, -0.16, 0.02); }
  // 몸통 (작게) + 배 패널
  part(rig, 0.44, 0.32, 0.36, bodyMat, 0, 0.36, 0);
  part(rig, 0.24, 0.16, 0.02, bellyMat, 0, 0.35, 0.185);
  // 머리: 몸통보다 넓은 둥근 상자 (모서리를 깎은 느낌으로 두 겹)
  const head = joint(rig, 0, 0.53, 0);
  part(head, 0.56, 0.38, 0.46, bodyMat, 0, 0.19, 0);
  part(head, 0.48, 0.46, 0.38, bodyMat, 0, 0.19, 0);
  part(head, 0.42, 0.24, 0.02, screenMat, 0, 0.2, 0.235);          // 얼굴 화면
  const eyeL = part(head, 0.08, 0.1, 0.02, eyeMat, -0.09, 0.21, 0.248);
  const eyeR = part(head, 0.08, 0.1, 0.02, eyeMat, 0.09, 0.21, 0.248);
  for (const x of [-0.29, 0.29]) part(head, 0.04, 0.14, 0.14, darkMat, x, 0.2, 0);   // 귀(스피커)
  part(head, 0.04, 0.26, 0.04, darkMat, 0, 0.5, 0);                 // 안테나
  const led = new THREE.Mesh(ledGeo, ledMat);
  led.position.y = 0.68;
  head.add(led);
  // 등: CR2032 코인 전지 배낭 (뒤에서 봐도 비콘 봇)
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 18), coinMat2);
  coin.rotation.x = Math.PI / 2;
  coin.position.set(0, 0.38, -0.22);
  coin.castShadow = true;
  rig.add(coin);
  part(rig, 0.06, 0.06, 0.02, ledMat, 0, 0.38, -0.262);              // 전지 + 표시등
  const arms = [joint(rig, -0.27, 0.46, 0), joint(rig, 0.27, 0.46, 0)];
  for (const a of arms) part(a, 0.09, 0.2, 0.1, darkMat, 0, -0.08, 0);
  return { rig, bodyMat, ledMat, eyeMat, eyes: [eyeL, eyeR], legs, arms, head };
}

/** "Wi-Fi N" 이름표 텍스처 (채널별 캐시) — 스캔으로 대역이 드러난 몬스터 위에 뜬다 */
const tagTextures = new Map();
function tagTexture(w) {
  if (!tagTextures.has(w)) {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 40;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(120, 20, 14, 0.85)";
    ctx.fillRect(0, 0, 128, 40);
    ctx.fillStyle = "#ffd6d2";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(w), 64, 21);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tagTextures.set(w, tex);
  }
  return tagTextures.get(w);
}

/** 광역 공격 예고 원 (반경 = 사거리) */
function makeAoe(g, range) {
  const mk = (geo, op) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3b30, side: THREE.DoubleSide, transparent: true, opacity: op, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.visible = false; g.add(mesh); return mesh;
  };
  const aoe = mk(new THREE.RingGeometry(range - 0.15, range, 48), 0); aoe.position.y = 0.04;
  const aoeFill = mk(new THREE.CircleGeometry(range, 48), 0); aoeFill.position.y = 0.03;
  return { aoe, aoeFill };
}

/** 광고 폭주 비콘 (Stage 12.1): 작은 주황 로봇 + 확성기 + 세 색(37·38·39) 안테나 */
function makeFlooder(g) {
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xff9a3c, emissive: 0x000000 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x5a3418 });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1d2733 });
  const rig = new THREE.Group(); g.add(rig);
  const legs = [joint(rig, -0.1, 0.16, 0), joint(rig, 0.1, 0.16, 0)];
  for (const l of legs) part(l, 0.1, 0.16, 0.12, dark, 0, -0.08, 0);
  part(rig, 0.42, 0.36, 0.36, bodyMat, 0, 0.35, 0);
  part(rig, 0.26, 0.12, 0.02, ledMat, 0, 0.4, 0.19);
  const eyes = [part(rig, 0.05, 0.07, 0.02, eyeMat, -0.06, 0.4, 0.2), part(rig, 0.05, 0.07, 0.02, eyeMat, 0.06, 0.4, 0.2)];
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xfff1a8, side: THREE.DoubleSide }));
  horn.rotation.x = -Math.PI / 2; horn.position.set(0.24, 0.45, 0.2); rig.add(horn);
  const antennas = [0x39d0ff, 0x7dffb5, 0xffd76b].map((c, i) => {
    const j = joint(rig, -0.12 + i * 0.12, 0.53, 0);
    part(j, 0.03, 0.22, 0.03, dark, 0, 0.11, 0);
    part(j, 0.08, 0.08, 0.08, new THREE.MeshBasicMaterial({ color: c }), 0, 0.25, 0);
    return j;
  });
  return { rig, bodyMat, ledMat, eyeMat, eyes, legs, antennas };
}

/** 전자레인지 재머 (Stage 12.1): 하얀 오븐 몸통 + 문 창(켜지면 주황 빛) + 다이얼 + 짧은 다리 */
function makeMicrowave(g) {
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe8ecf0, emissive: 0x000000 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x6b7480 });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });     // 문 안의 빛 (켜짐/꺼짐)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7dffb5 });     // 표시창
  const rig = new THREE.Group(); g.add(rig);
  const legs = [];
  for (const [x, z] of [[-0.5, 0.3], [0.5, 0.3], [-0.5, -0.3], [0.5, -0.3]]) { const j = joint(rig, x, 0.22, z); part(j, 0.14, 0.24, 0.14, trim, 0, -0.1, 0); legs.push(j); }
  part(rig, 1.3, 0.8, 0.9, bodyMat, 0, 0.66, 0);
  part(rig, 0.82, 0.58, 0.04, trim, -0.16, 0.66, 0.46);
  const doorGlow = part(rig, 0.7, 0.46, 0.03, ledMat, -0.16, 0.66, 0.48);
  part(rig, 0.26, 0.6, 0.03, trim, 0.46, 0.66, 0.46);
  part(rig, 0.18, 0.08, 0.02, eyeMat, 0.46, 0.86, 0.48);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), trim);
  dial.rotation.x = Math.PI / 2; dial.position.set(0.46, 0.6, 0.49); rig.add(dial);
  part(rig, 0.08, 0.2, 0.06, trim, -0.62, 1.12, 0);                    // 손잡이 같은 뿔
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0xffa040, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }));
  wave.rotation.x = -Math.PI / 2; wave.position.y = 0.06; g.add(wave);
  return { rig, bodyMat, ledMat, eyeMat, legs, wave, doorGlow, dial, ...makeAoe(g, MONSTERS.microwave.attackRange) };
}

/** 중간자 스니퍼 (Stage 12.1): 후드 쓴 그림자 + 큰 헤드폰 + 초록 외눈, 떠 다닌다. 조준선으로 원거리 공격 예고 */
function makeSniffer(g) {
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4f, emissive: 0x000000 });
  const hood = new THREE.MeshLambertMaterial({ color: 0x23262f });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x4fd89a });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7dffb5 });
  const rig = new THREE.Group(); g.add(rig);
  part(rig, 0.56, 0.7, 0.44, bodyMat, 0, 0.75, 0);                     // 망토 몸통
  part(rig, 0.66, 0.2, 0.5, hood, 0, 0.42, 0);                         // 옷자락
  const head = joint(rig, 0, 1.15, 0);
  part(head, 0.5, 0.44, 0.46, hood, 0, 0.18, 0);
  part(head, 0.36, 0.26, 0.04, new THREE.MeshBasicMaterial({ color: 0x0b0d12 }), 0, 0.14, 0.23);
  const eye = part(head, 0.12, 0.08, 0.03, eyeMat, 0, 0.16, 0.25);
  for (const sx of [-1, 1]) { part(head, 0.1, 0.24, 0.24, new THREE.MeshLambertMaterial({ color: 0x1b1f27 }), sx * 0.3, 0.16, 0); part(head, 0.04, 0.06, 0.06, ledMat, sx * 0.36, 0.16, 0); }
  part(head, 0.56, 0.06, 0.08, new THREE.MeshLambertMaterial({ color: 0x1b1f27 }), 0, 0.42, 0);   // 헤드폰 띠
  const arms = [joint(rig, -0.34, 0.95, 0), joint(rig, 0.34, 0.95, 0)];
  for (const a of arms) part(a, 0.12, 0.42, 0.14, hood, 0, -0.18, 0);
  // 조준선: 앞으로 사거리만큼 (예고 동안 차오른다)
  const laser = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, depthWrite: false }));
  laser.position.set(0, 1.1, MONSTERS.sniffer.attackRange / 2);
  laser.scale.z = MONSTERS.sniffer.attackRange;
  laser.visible = false;
  g.add(laser);
  return { rig, bodyMat, ledMat, eyeMat, eyes: [eye], arms, head, laser };
}

function makeMonster(m) {
  const g = new THREE.Group();
  if (m.type === "advFlooder" || m.type === "microwave" || m.type === "sniffer") {
    const parts = m.type === "advFlooder" ? makeFlooder(g) : m.type === "microwave" ? makeMicrowave(g) : makeSniffer(g);
    const bar = makeBar(g, m.type === "microwave" ? 1.5 : m.type === "sniffer" ? 1.9 : 1.05);
    let tag = null;
    if (m.type === "microwave") {
      tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      tag.scale.set(1.3, 0.34, 1); tag.position.y = 1.85; tag.visible = false; tag.renderOrder = 11; g.add(tag);
    }
    g.userData = { monsterId: m.id, ...parts, ...bar, tag, tagWifi: null };
    battleRoot.add(g);
    monsterTargets.push(g);
    monsterMeshes.set(m.id, g);
    return g;
  }
  if (m.type === "wifiInterferer") {
    const parts = makeRouter(g);
    const bar = makeBar(g, 2.05);   // 안테나 끝(약 1.9) 위
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    tag.scale.set(1.1, 0.34, 1);
    tag.position.y = 2.4;
    tag.visible = false;
    tag.renderOrder = 11;
    g.add(tag);
    g.userData = { monsterId: m.id, ...parts, ...bar, tag, tagWifi: null };
    battleRoot.add(g);
    monsterTargets.push(g);
    monsterMeshes.set(m.id, g);
    return g;
  }
  const parts = makeBeaconBot(g);
  const { bar, fg } = makeBar(g, 1.4);
  g.userData = { monsterId: m.id, ...parts, bar, fg };
  battleRoot.add(g);
  monsterTargets.push(g);
  monsterMeshes.set(m.id, g);
  return g;
}

function makeBar(g, height) {
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(barGeo, barBgMat);
  const fg = new THREE.Mesh(barGeo, barFgMat);
  fg.position.z = 0.001;
  bar.add(bg, fg);
  bar.position.y = height;
  bar.renderOrder = 10;
  g.add(bar);
  return { bar, fg };
}

/** 처치 연출: 퍼지는 고리 */
export function burstAt(x, y, z, color = 0x7dd8ff) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.45, 24),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.05, z);
  battleRoot.add(ring);
  bursts.push({ mesh: ring, t: 0 });
}

/**
 * 전투 상태 → 메시 동기화
 * @param {ReturnType<typeof import("../core/battle.js").createBattle>} battle
 */
export function syncBattle(battle, camera, t, dt) {
  // 몬스터 — 활성 전투(마을 훈련장 또는 던전 층)에 없는 몬스터는 숨긴다
  const live = new Set();
  for (const m of battle.monsters) {
    live.add(m.id);
    const g = monsterMeshes.get(m.id) ?? makeMonster(m);
    const { rig, bodyMat, ledMat, bar, fg, aoe, aoeFill } = g.userData;
    g.visible = m.state !== "dead";
    if (!g.visible) continue;
    const { tag } = g.userData;
    if (tag) {
      const label = m.wifi ? `Wi-Fi ${m.wifi}` : m.band ? (m.on ? "전자레인지 ON" : "전자레인지 OFF") : null;
      tag.visible = Boolean(m.revealed && label);
      if (tag.visible && g.userData.tagWifi !== label) {
        tag.material.map = tagTexture(label);
        tag.material.needsUpdate = true;
        g.userData.tagWifi = label;
      }
    }
    if (aoe) {
      // 광역 공격 예고: 바닥에 공격 범위가 차오른다 → 원 밖으로 피하라
      const on = m.state === "windup";
      aoe.visible = aoeFill.visible = on;
      if (on) {
        const k = 1 - m.t / MONSTERS[m.type].windup;
        aoe.material.opacity = 0.5 + 0.5 * k;
        aoeFill.material.opacity = 0.08 + 0.25 * k;
        aoeFill.scale.setScalar(Math.max(0.05, k));
      }
    }
    g.position.set(m.x, m.y, m.z);
    g.rotation.y = m.rotY;

    // LED: 평소엔 광고(비콘)·트래픽(Wi-Fi)처럼 깜빡, 공격 예고(windup) 중엔 빨갛게 → 피할 타이밍
    const { eyeMat, legs, arms, antennas, wave } = g.userData;
    const windup = m.state === "windup";
    if (windup) {
      ledMat.color.setHex(0xff3b30);
      eyeMat?.color.setHex(0xff3b30);
      const k = 1 - m.t / MONSTERS[m.type].windup;
      rig.scale.set(1 + 0.12 * k, 1 - 0.1 * k, 1 + 0.12 * k);
      rig.position.x = Math.sin(t * 60) * 0.03;
    } else {
      if (m.type === "wifiInterferer") { ledMat.color.setHex(Math.sin(t * 14 + m.id) > 0 ? 0xff9a3c : 0x5a2a10); eyeMat.color.setHex(0xffb340); }
      else { ledMat.color.setHex(Math.sin(t * 9 + m.id) > 0.2 ? 0x39d0ff : 0x0c3a4a); eyeMat?.color.setHex(0x7de3ff); }
      rig.scale.set(1, 1, 1);
      rig.position.x = 0;
    }
    // 몸짓 (Stage 11.11): 비콘 봇은 통통 뛰며 팔을 흔들고 가끔 눈을 깜빡, 공유기 괴물은 다리를 버둥대며 안테나를 꿈틀
    const ph = t * 7 + m.id * 1.7;
    if (m.type === "advFlooder") {                     // 통통 튀며 달려든다, 안테나가 번갈아 반짝
      rig.position.y = Math.abs(Math.sin(ph * 1.6)) * 0.14;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(ph * 3 + i * Math.PI) * 0.6; });
      antennas.forEach((a, i) => { a.scale.setScalar(Math.floor(t * 9 + m.id) % 3 === i ? 1.4 : 1); });
      if (!windup) ledMat.color.setHex(Math.sin(t * 20) > 0 ? 0xfff1a8 : 0xff9a3c);
    } else if (m.type === "microwave") {               // 켜지면 문 창이 주황으로 빛나고 잡음 고리가 퍼진다
      const on = m.on !== false;
      if (!windup) ledMat.color.setHex(on ? (Math.sin(t * 30) > 0 ? 0xffb050 : 0xff7a1a) : 0x2a1a10);
      g.userData.dial.rotation.z = t * (on ? 4 : 0.3);
      rig.position.y = on ? Math.abs(Math.sin(t * 25)) * 0.02 : 0;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(ph * 0.8 + i) * 0.2; });
      const w = (t * 0.9 + m.id * 0.3) % 1;
      wave.scale.setScalar(1 + w * 3);
      wave.material.opacity = on && !windup ? 0.5 * (1 - w) : 0;
    } else if (m.type === "sniffer") {                 // 둥둥 떠 있고, 예고 동안 조준선이 차오른다
      rig.position.y = 0.15 + Math.sin(t * 2 + m.id) * 0.08;
      g.userData.head.rotation.y = windup ? 0 : Math.sin(t * 1.3 + m.id) * 0.5;
      arms.forEach((a, i) => { a.rotation.x = windup ? -1.2 : Math.sin(ph * 0.5 + i) * 0.2; });
      const laser = g.userData.laser;
      laser.visible = windup;
      if (windup) laser.material.opacity = 0.25 + 0.65 * (1 - m.t / MONSTERS.sniffer.windup);
    } else if (m.type === "wifiInterferer") {
      rig.position.y = Math.abs(Math.sin(ph * 0.6)) * 0.05;
      legs?.forEach((l, i) => { l.rotation.x = Math.sin(ph + i * 1.6) * 0.35; });
      antennas?.forEach((a, i) => { a.rotation.x = Math.sin(t * 3 + i + m.id) * 0.18; });
      if (wave) {
        const w = (t * 0.7 + m.id * 0.37) % 1;          // 간섭 전파가 몸에서 퍼진다
        wave.scale.setScalar(1 + w * 2.6);
        wave.material.opacity = windup ? 0 : 0.45 * (1 - w);
      }
    } else {
      rig.position.y = Math.abs(Math.sin(ph)) * 0.09;
      legs?.forEach((l, i) => { l.rotation.x = Math.sin(ph * 2 + i * Math.PI) * 0.4; });
      arms?.forEach((a, i) => { a.rotation.x = Math.sin(ph * 2 + i * Math.PI) * 0.6; a.rotation.z = (i ? -1 : 1) * (windup ? 0.9 : 0.15); });
      if (g.userData.head) g.userData.head.rotation.z = Math.sin(ph) * 0.08;   // 고개를 까딱
      const blink = (t * 0.6 + m.id * 0.31) % 1 > 0.96;   // 가끔 눈을 감는다
      g.userData.eyes?.forEach((e) => { e.scale.y = blink ? 0.15 : 1; });
    }
    bodyMat.emissive.setHex(m.hitFlash > 0 ? 0xffffff : 0x000000);

    const ratio = m.hp / (m.maxHp ?? MONSTERS[m.type].hp);
    fg.scale.x = Math.max(0.001, ratio);
    fg.position.x = -0.45 * (1 - ratio);
    bar.visible = ratio < 1;
    // 빌보드: 부모(몸통) 회전을 상쇄하고 카메라를 바라보게
    bar.quaternion.copy(camera.quaternion).premultiply(tmpQ.setFromAxisAngle(Y_AXIS, -g.rotation.y));
  }
  for (const [id, g] of monsterMeshes) if (!live.has(id)) g.visible = false;

  // 투사체
  const liveProj = new Set();
  for (const p of battle.projectiles) {
    liveProj.add(p.id);
    let mesh = projMeshes.get(p.id);
    if (!mesh) {
      mesh = makeProjectile(p.style);
      battleRoot.add(mesh);
      projMeshes.set(p.id, mesh);
    }
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = Math.atan2(p.dx, p.dz);
    if (mesh.userData.spin) mesh.children[0].rotation.z += dt * 18;   // 부채 조각은 돌며 난다
  }
  for (const [id, mesh] of projMeshes) if (!liveProj.has(id)) { battleRoot.remove(mesh); projMeshes.delete(id); }

  // 드롭
  const liveDrops = new Set();
  for (const d of battle.drops) {
    liveDrops.add(d.id);
    let mesh = dropMeshes.get(d.id);
    if (!mesh) {
      mesh = new THREE.Mesh(coinGeo, coinMat);
      mesh.rotation.z = Math.PI / 2;
      battleRoot.add(mesh);
      dropMeshes.set(d.id, mesh);
    }
    mesh.position.set(d.x, d.y + 0.15 + Math.sin(t * 4 + d.id) * 0.08, d.z);
    mesh.rotation.y = t * 3;
  }
  for (const [id, mesh] of dropMeshes) if (!liveDrops.has(id)) { battleRoot.remove(mesh); dropMeshes.delete(id); }

  // 처치 고리
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.t += dt;
    const k = b.t / 0.4;
    b.mesh.scale.setScalar(1 + k * 3);
    b.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
    if (k >= 1) { battleRoot.remove(b.mesh); b.mesh.material.dispose(); b.mesh.geometry.dispose(); bursts.splice(i, 1); }
  }
}
