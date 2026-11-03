// 월드 렌더링 — 복셀 지형, 바다, 마을 건물·나무·가로등 (THREE 의존)
// 위치·충돌·문구 데이터는 core/layout.js, 지형 높이는 core/terrain.js 가 단일 진실 공급원이다.

import * as THREE from "three";
import { WORLD } from "../core/config.js";
import { forEachCell, groundHeightAt, surfaceTypeAt, cellHeight } from "../core/terrain.js";
import { landmark, TREE_POSITIONS, LAMP_POSITIONS, FOUNTAIN_RIM_HEIGHT } from "../core/layout.js";

/** 월드 전체를 담는 루트 그룹 */
export const root = new THREE.Group();
/** 클릭 가능한 랜드마크 그룹 (userData.interactive = LandmarkInfo) */
export const interactiveObjects = [];
/** 매 프레임 애니메이션 대상 */
export const animated = {};

// ---------- 재질 ----------
// 팔레트 (Stage 11.7): 원색에 가깝던 색을 부드러운 파스텔 쪽으로 — 그림자·톤 매핑과 함께 디오라마 느낌
const grassMat  = new THREE.MeshLambertMaterial({ color: 0x86c25c });
const pathMat   = new THREE.MeshLambertMaterial({ color: 0xbdb39e });
const plazaMat  = new THREE.MeshLambertMaterial({ color: 0xd3cab5 });
const sandMat   = new THREE.MeshLambertMaterial({ color: 0xead9a8 });
const dirtMat   = new THREE.MeshLambertMaterial({ color: 0x9c7552 });
const dirtDark  = new THREE.MeshLambertMaterial({ color: 0x7e5c40 });   // 절벽 지층
const stoneMat  = new THREE.MeshLambertMaterial({ color: 0x8c9198 });
const darkStone = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
const waterMat  = new THREE.MeshLambertMaterial({ color: 0x226cb5, transparent: true, opacity: 0.88 });

// ---------- 복셀 지형 ----------
// 복셀 레이어 빌더 — p = [칸 x, 블록 윗면 y, 칸 z]
function buildVoxelLayer(list, material) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  const m = new THREE.Matrix4();
  list.forEach((p, i) => {
    m.makeTranslation(p[0] + 0.5, p[1] - 0.5, p[2] + 0.5);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

const layer = { grass: [], path: [], plaza: [], sand: [], dirt: [], dirtDark: [], stone: [], darkStone: [] };
// 떠 있는 섬 (Stage 11.7): 가장자리 칸은 지층이 보이는 깊은 절벽으로, 바닥은 칸마다 조금씩 다르게 (디오라마)
const isEdgeCell = (i, j) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => cellHeight(i + di, j + dj) === -Infinity);
const hash = (i, j) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };
forEachCell((i, j, top) => {
  const type = surfaceTypeAt(i + 0.5, j + 0.5); // 칸 중심 기준
  layer[type].push([i, top, j]);

  if (type === "darkStone") {
    for (let y = top - 1; y > WORLD.BEDROCK_Y; y--) layer.stone.push([i, y, j]);
    return;
  }
  // 하부 층: 안쪽 칸은 얕게(보이지 않음), 가장자리 칸은 지층 절벽 — 흙 → 짙은 흙 → 돌, 바닥은 들쭉날쭉
  const edge = isEdgeCell(i, j);
  const depth = edge ? 6 + Math.floor(hash(i, j) * 4) : 2;
  for (let d = 1; d <= depth; d++) {
    const y = top - d;
    const kind = d === 1 ? (type === "sand" ? "sand" : "dirt") : d <= 2 ? "dirt" : d <= 4 ? (d % 2 ? "dirtDark" : "dirt") : "stone";
    layer[kind].push([i, y, j]);
  }
});

/** 클릭 이동 레이캐스트 대상 지형 */
export const terrain = new THREE.Group();
terrain.add(buildVoxelLayer(layer.grass,     grassMat));
terrain.add(buildVoxelLayer(layer.path,      pathMat));
terrain.add(buildVoxelLayer(layer.plaza,     plazaMat));
terrain.add(buildVoxelLayer(layer.sand,      sandMat));
terrain.add(buildVoxelLayer(layer.dirt,      dirtMat));
terrain.add(buildVoxelLayer(layer.dirtDark,  dirtDark));
terrain.add(buildVoxelLayer(layer.stone,     stoneMat));
terrain.add(buildVoxelLayer(layer.darkStone, darkStone));
root.add(terrain);

export const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), waterMat);
sea.rotation.x = -Math.PI / 2;
sea.position.y = WORLD.SEA_LEVEL - 0.2;
root.add(sea);

// ---------- 랜드마크 ----------
/** 건물 위 이름 표지판 — 멀리서도 어느 건물이 무엇인지 보이게 (캔버스 텍스처 스프라이트) */
export const signs = [];
function makeSign(text, topY) {
  const font = "bold 44px system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = font;
  const pad = 22, h = 72;
  c.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  c.height = h;
  ctx.font = font;                                   // 크기를 바꾸면 컨텍스트가 초기화된다
  ctx.fillStyle = "rgba(15, 18, 30, 0.78)";
  ctx.beginPath(); ctx.roundRect(0, 0, c.width, h, 18); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.textBaseline = "middle";
  ctx.fillText(text, pad, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const worldH = 0.55;
  sprite.scale.set(worldH * c.width / h, worldH, 1);
  sprite.position.y = topY + 0.55;
  sprite.renderOrder = 10;
  sprite.userData.signText = text;
  sprite.raycast = () => {};                         // 보기 전용 — 뒤에 있는 건물·몬스터 클릭을 가로채지 않는다
  return sprite;
}

function placeLandmark(group, id) {
  const { pos, info } = landmark(id);
  if (info.sign) {
    const top = new THREE.Box3().setFromObject(group).max.y;  // 위치를 옮기기 전 = 그룹 기준 높이
    const sign = makeSign(info.sign, Number.isFinite(top) ? top : 2);
    sign.userData.landmarkId = id;
    sign.userData.baseScale = sign.scale.clone();
    group.add(sign);
    signs.push(sign);
  }
  group.position.set(pos.x, pos.y, pos.z);
  group.userData.interactive = info;
  interactiveObjects.push(group);
  root.add(group);
}

// 공용 복셀 건물 재질
const woodMat   = new THREE.MeshLambertMaterial({ color: 0x7a4f2b });
const plasterMat= new THREE.MeshLambertMaterial({ color: 0xecf0f2 });
const redRoof   = new THREE.MeshLambertMaterial({ color: 0xb53c30 });
const blueRoof  = new THREE.MeshLambertMaterial({ color: 0x24558f });
const copperRoof= new THREE.MeshLambertMaterial({ color: 0xbf5d28 });
const glassMat  = new THREE.MeshBasicMaterial({ color: 0xffea88 });
const cyanEmblem= new THREE.MeshBasicMaterial({ color: 0x39d0ff });
const metalMat  = new THREE.MeshLambertMaterial({ color: 0xb5c1cd });

// ----- 3.1 🏛️ GATT 중앙 회관 (Central Service Hall) -----
const hall = new THREE.Group();
{
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.2, 3.0), plasterMat);
  b1.position.y = 1.1;
  hall.add(b1);

  [[-1.8, -1.4], [1.8, -1.4], [-1.8, 1.4], [1.8, 1.4]].forEach(([px, pz]) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.3, 0.35), woodMat);
    pillar.position.set(px, 1.15, pz);
    hall.add(pillar);
  });

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.5, 0.08), woodMat);
  door.position.set(0, 0.75, 1.52);
  hall.add(door);

  [-1.1, 1.1].forEach(wx => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.04), glassMat);
    win.position.set(wx, 1.25, 1.52);
    hall.add(win);
  });

  const r1 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.45, 3.4), redRoof);
  r1.position.y = 2.35;
  hall.add(r1);

  const r2 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.45, 2.4), redRoof);
  r2.position.y = 2.75;
  hall.add(r2);

  const rune = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), cyanEmblem);
  rune.position.set(0, 3.25, 0);
  hall.add(rune);
}
placeLandmark(hall, "hall");


// ----- 3.2 📚 RF 이론 도서관 (Theory Library) -----
const library = new THREE.Group();
{
  const b = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.0, 2.6), plasterMat);
  b.position.y = 1.0;
  library.add(b);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.08), woodMat);
  door.position.set(0.8, 0.7, 1.32);
  library.add(door);

  [-0.65, 0.1].forEach(wx => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.04), glassMat);
    win.position.set(wx, 1.1, 1.32);
    library.add(win);
  });

  const roof1 = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, 3.1), blueRoof);
  roof1.position.y = 2.15;
  library.add(roof1);

  const roof2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 2.0), blueRoof);
  roof2.position.y = 2.5;
  library.add(roof2);

  const dome = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), darkStone);
  dome.position.set(-0.6, 2.85, 0);
  library.add(dome);

  const domeRod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), metalMat);
  domeRod.position.set(-0.6, 3.3, 0);
  library.add(domeRod);
}
placeLandmark(library, "library");


// ----- 3.3 🔨 패킷 대장간 (Packet Forge & Battery Shop) -----
const forge = new THREE.Group();
{
  const b = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 2.6), darkStone);
  b.position.y = 0.9;
  forge.add(b);

  const r = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, 3.0), copperRoof);
  r.position.y = 1.95;
  forge.add(r);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.2, 0.65), stoneMat);
  chimney.position.set(0.9, 1.7, -0.7);
  forge.add(chimney);

  const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.28), metalMat);
  anvil.position.set(-1.0, 0.18, 1.7);
  forge.add(anvil);

  const fire = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xff6600 }));
  fire.position.set(0.35, 0.2, 1.4);
  forge.add(fire);
}
placeLandmark(forge, "forge");


// ----- 3.4 📡 전파의 등대 (Beacon Tower) -----
const tower = new THREE.Group();
{
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.6), stoneMat);
  base.position.y = 0.4;
  tower.add(base);

  const segs = [[0.85, 2.2, 0.0], [0.6, 1.8, 2.2], [0.4, 1.4, 4.0]];
  for (const [w, h, y] of segs) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), metalMat);
    seg.position.y = y + 0.8 + h / 2;
    tower.add(seg);
  }

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), metalMat);
  rod.position.y = 6.8;
  tower.add(rod);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), new THREE.MeshBasicMaterial({ color: 0x39d0ff }));
  beacon.position.y = 7.7;
  tower.add(beacon);
  tower.userData.beacon = beacon;
}
placeLandmark(tower, "tower");


// ----- 3.5 ⛲ 중앙 광장 분수대 (Central Bluetooth Fountain) -----
const fountain = new THREE.Group();
{
  // 수반 턱 높이 0.7 — 걸어서는 못 오르고(STEP_MAX 0.55) 점프로 올라설 수 있다
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, FOUNTAIN_RIM_HEIGHT, 12), stoneMat);
  basin.position.y = FOUNTAIN_RIM_HEIGHT / 2;
  fountain.add(basin);

  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.5, 12), waterMat);
  water.position.y = 0.48;
  fountain.add(water);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.1, 8), stoneMat);
  pillar.position.y = 0.75;
  fountain.add(pillar);

  const rune = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), cyanEmblem);
  rune.position.y = 1.5;
  fountain.add(rune);
  fountain.userData.rune = rune;
}
placeLandmark(fountain, "fountain");


// ----- 3.6 ⚔️ 37채널 호핑 던전 지하 입구 (Dungeon Portal Gate) -----
const dungeonGate = new THREE.Group();
{
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.8, 0.7), darkStone);
  p1.position.set(-1.4, 1.4, 0);
  dungeonGate.add(p1);

  const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.8, 0.7), darkStone);
  p2.position.set(1.4, 1.4, 0);
  dungeonGate.add(p2);

  const arch = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.7, 0.8), darkStone);
  arch.position.set(0, 2.9, 0);
  dungeonGate.add(arch);

  const rune = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.15), new THREE.MeshBasicMaterial({ color: 0xb539ff }));
  rune.position.set(0, 3.0, 0.45);
  dungeonGate.add(rune);

  const portalPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 2.5),
    new THREE.MeshBasicMaterial({ color: 0x7c1bd4, side: THREE.DoubleSide, transparent: true, opacity: 0.88 })
  );
  portalPlane.position.set(0, 1.3, 0);
  dungeonGate.add(portalPlane);
  dungeonGate.userData.portal = portalPlane;

  [-2.1, 2.1].forEach(fx => {
    const brazier = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), stoneMat);
    brazier.position.set(fx, 0.45, 0.35);
    dungeonGate.add(brazier);

    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), new THREE.MeshBasicMaterial({ color: 0xc855ff }));
    flame.position.set(fx, 1.0, 0.35);
    dungeonGate.add(flame);
  });
}
placeLandmark(dungeonGate, "dungeonGate");


// ----- 3.7 복셀 나무 & 가로등 데코레이션 -----
const treeMatWood  = new THREE.MeshLambertMaterial({ color: 0x6e4a2e });
const treeMatLeaf1 = new THREE.MeshLambertMaterial({ color: 0x5aa847 });
const treeMatLeaf2 = new THREE.MeshLambertMaterial({ color: 0x7cc25a });

function createVoxelTree(x, z, scale = 1.0) {
  const tree = new THREE.Group();
  const y = groundHeightAt(x, z);

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 1.8 * scale, 0.5 * scale), treeMatWood);
  trunk.position.y = 0.9 * scale;
  tree.add(trunk);

  const l1 = new THREE.Mesh(new THREE.BoxGeometry(1.8 * scale, 1.2 * scale, 1.8 * scale), treeMatLeaf1);
  l1.position.y = 2.1 * scale;
  tree.add(l1);

  const l2 = new THREE.Mesh(new THREE.BoxGeometry(1.2 * scale, 0.9 * scale, 1.2 * scale), treeMatLeaf2);
  l2.position.y = 3.0 * scale;
  tree.add(l2);

  tree.position.set(x, y, z);
  root.add(tree);
}


function createStreetLamp(x, z) {
  const lamp = new THREE.Group();
  const y = groundHeightAt(x, z);

  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 0.16), darkStone);
  post.position.y = 0.9;
  lamp.add(post);

  const light = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), glassMat);
  light.position.y = 1.85;
  lamp.add(light);

  lamp.position.set(x, y, z);
  root.add(lamp);
}

TREE_POSITIONS.forEach(([tx, tz, s]) => createVoxelTree(tx, tz, s));
LAMP_POSITIONS.forEach(([lx, lz]) => createStreetLamp(lx, lz));

// ----- ⚔️ 패킷 훈련장 표지판 -----
const trainingSign = new THREE.Group();
{
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), woodMat);
  post.position.y = 0.75;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.62, 0.1), woodMat);
  board.position.y = 1.45;
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.12), cyanEmblem);
  mark.position.set(0, 1.45, 0.02);
  trainingSign.add(post, board, mark);
}
placeLandmark(trainingSign, "trainingSign");

// ----- Stage 10: 🔒 보안의 감옥 (북동) -----
const prison = new THREE.Group();
{
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.4, 2.6), darkStone);
  wall.position.y = 1.2;
  prison.add(wall);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.4, 2.9), stoneMat);
  roof.position.y = 2.6;
  prison.add(roof);
  // 정면 창살 (8개) + 자물쇠
  const barMat = new THREE.MeshLambertMaterial({ color: 0x8a95a3 });
  for (let i = 0; i < 8; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), barMat);
    bar.position.set(-1.05 + i * 0.3, 1.0, 1.34);
    prison.add(bar);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.14), new THREE.MeshBasicMaterial({ color: 0xffb020 }));
  lock.position.set(0, 2.0, 1.36);
  prison.add(lock);
  prison.userData.lock = lock;
  // 감시탑 (모서리)
  const turret = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.4, 0.8), darkStone);
  turret.position.set(1.3, 1.7, -1.0);
  prison.add(turret);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  eye.position.set(1.3, 3.6, -1.0);
  prison.add(eye);
}
placeLandmark(prison, "prison");

// ----- Stage 10: 🪫 전력 잃은 지하묘지 입구 (남동) -----
const crypt = new THREE.Group();
{
  const slab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 1.6), stoneMat);
  slab.position.y = 0.8;
  crypt.add(slab);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.3, 1.9), darkStone);
  cap.position.y = 1.75;
  crypt.add(cap);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.06), new THREE.MeshBasicMaterial({ color: 0x0b0d12 }));
  door.position.set(0, 0.6, -0.82); // 마을 쪽(북)을 향한다
  crypt.add(door);
  // 꺼져 가는 CR2032 (코인 전지 모양 원판)
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 20), new THREE.MeshBasicMaterial({ color: 0x9aa3ad }));
  coin.rotation.x = Math.PI / 2;
  coin.position.set(0, 1.45, -0.84);
  crypt.add(coin);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.05), new THREE.MeshBasicMaterial({ color: 0x7dffb5 }));
  glow.position.set(0, 1.45, -0.91);
  crypt.add(glow);
  crypt.userData.glow = glow;
}
placeLandmark(crypt, "crypt");

animated.beacon = tower.userData.beacon;
animated.rune = fountain.userData.rune;
animated.portal = dungeonGate.userData.portal;
animated.lock = prison.userData.lock;
animated.cryptGlow = crypt.userData.glow;

/** 매 프레임 장식 애니메이션 */
/** 선택한 건물의 표지판을 금색으로 키운다 (Stage 11.8 — 정보 카드와 짝). id가 null이면 모두 원래대로 */
let highlighted = undefined;
export function highlightSign(id) {
  if (id === highlighted) return;
  highlighted = id;
  for (const s of signs) {
    const on = s.userData.landmarkId === id;
    s.material.color.setHex(on ? 0xffd76b : 0xffffff);
    s.scale.copy(s.userData.baseScale).multiplyScalar(on ? 1.3 : 1);
  }
}

/** 그림자 (Stage 11.7): 빛나는 것(MeshBasic)·반투명은 그림자를 드리우지 않고, 나머지는 드리우고 받는다 */
export function enableShadows(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const glow = o.material?.isMeshBasicMaterial || o.material?.transparent;
    o.castShadow = !glow;
    o.receiveShadow = !o.material?.isMeshBasicMaterial;
  });
}

export function animateWorld(t) {
  animated.beacon.material.color.setHSL(0.55, 0.9, 0.45 + 0.35 * Math.sin(t * 3.5)); // 비콘 점멸
  animated.rune.rotation.y = t * 1.5;                                                 // 분수대 룬 회전
  animated.rune.position.y = 1.5 + Math.sin(t * 2.5) * 0.08;
  animated.portal.scale.set(1 + 0.06 * Math.sin(t * 4), 1 + 0.06 * Math.cos(t * 3), 1); // 포털 맥동
  sea.position.z = Math.sin(t * 0.3) * 0.4;
  animated.lock.rotation.z = Math.sin(t * 2) * 0.15;                                   // 흔들리는 자물쇠
  animated.cryptGlow.material.color.setHSL(0.4, 0.9, 0.15 + 0.35 * Math.max(0, Math.sin(t * 0.8)) ** 4); // 가끔 깨어나는 센서
}

export { metalMat };
