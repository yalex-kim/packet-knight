// 월드 렌더링 — 복셀 지형, 바다, 마을 건물·나무·가로등 (THREE 의존)
// 위치·충돌·문구 데이터는 core/layout.js, 지형 높이는 core/terrain.js 가 단일 진실 공급원이다.

import * as THREE from "three";
import { WORLD } from "../core/config.js";
import { forEachCell, groundHeightAt, surfaceTypeAt, cellHeight } from "../core/terrain.js";
import { landmark, TREE_POSITIONS, LAMP_POSITIONS, FOUNTAIN_RIM_HEIGHT, BILLBOARD } from "../core/layout.js";
import { NOTICES, activeEvent } from "../core/notices.js";

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
export function makeSign(text, topY) {
  const font = "bold 44px system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d", { willReadFrequently: true });
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

// ----- 건물 공용 도구 (Stage 11.19: 상자 2~3개 → 디테일 있는 복셀 건물) -----
const stoneLight = new THREE.MeshLambertMaterial({ color: 0xc9c3b6 });
const stoneDark  = new THREE.MeshLambertMaterial({ color: 0x8d877c });
const beamMat    = new THREE.MeshLambertMaterial({ color: 0x5b3a22 });
const trimWhite  = new THREE.MeshLambertMaterial({ color: 0xf6f3ea });
const redRoofDk  = new THREE.MeshLambertMaterial({ color: 0x8f2c24 });
const blueRoofDk = new THREE.MeshLambertMaterial({ color: 0x1a3f6b });
const copperDk   = new THREE.MeshLambertMaterial({ color: 0x8f4419 });
const leafMat    = new THREE.MeshLambertMaterial({ color: 0x5aa847 });
const flowerMats = [0xff7a8a, 0xffd76b, 0xb49bff].map((c) => new THREE.MeshLambertMaterial({ color: c }));
const goldMat    = new THREE.MeshLambertMaterial({ color: 0xf2c14e });
const forgeStone = new THREE.MeshLambertMaterial({ color: 0x6f665c });
/** 상자 하나 (cx, cy, cz = 부모 기준 중심) */
function bx(g, w, h, d, mat, cx, cy, cz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(cx, cy, cz);
  g.add(m);
  return m;
}
/** 계단식 박공 지붕 — 용마루는 x축, 앞뒤(z)로 층층이 좁아진다. 맨 아래 층은 처마(짙은 색) */
function gableRoof(g, w, d, y, steps, mat, eaveMat) {
  const stepH = 0.2;
  for (let i = 0; i < steps; i++) {
    const k = 1 - i / steps;
    bx(g, w + 0.3, stepH, (d + 0.5) * k, i === 0 ? eaveMat : mat, 0, y + stepH / 2 + i * stepH, 0);
  }
  bx(g, w + 0.36, 0.12, 0.22, eaveMat, 0, y + steps * stepH + 0.06, 0);   // 용마루
  return y + steps * stepH + 0.12;
}
/** 앞면(+z) 창문: 나무 테두리 + 유리 + 창턱 (+ 덧창) */
function windowFront(g, x, y, z, w, h, shutters = false) {
  bx(g, w + 0.14, h + 0.14, 0.06, beamMat, x, y, z + 0.02);
  bx(g, w, h, 0.07, glassMat, x, y, z + 0.035);
  bx(g, 0.05, h, 0.08, beamMat, x, y, z + 0.04);                 // 가운데 창살
  bx(g, w + 0.24, 0.07, 0.16, trimWhite, x, y - h / 2 - 0.08, z + 0.07);   // 창턱
  if (shutters) for (const sx of [-1, 1]) bx(g, w * 0.42, h + 0.1, 0.05, blueRoofDk, x + sx * (w / 2 + w * 0.26), y, z + 0.03);
}
/** 화분 (꽃 세 송이) */
function planter(g, x, y, z, w = 0.7) {
  bx(g, w, 0.18, 0.22, beamMat, x, y, z);
  bx(g, w - 0.08, 0.08, 0.16, leafMat, x, y + 0.12, z);
  [-0.22, 0, 0.22].forEach((dx, i) => bx(g, 0.1, 0.1, 0.1, flowerMats[i], x + dx * (w / 0.7), y + 0.2, z));
}

// ----- 3.1 🏛️ GATT 중앙 회관 — 돌 기단·현관 기둥·목조 뼈대·계단식 빨간 지붕·GATT 문양 (정면 +z) -----
const hall = new THREE.Group();
{
  const Z0 = -0.4;                                                   // 본채 중심 (현관은 앞쪽 +z)
  bx(hall, 3.9, 0.3, 2.6, stoneDark, 0, 0.15, Z0);                   // 기단
  bx(hall, 3.6, 2.0, 2.3, plasterMat, 0, 1.3, Z0);                   // 벽
  for (const x of [-1.8, 1.8]) for (const z of [Z0 - 1.15, Z0 + 1.15]) bx(hall, 0.2, 2.1, 0.2, beamMat, x, 1.35, z);   // 모서리 기둥
  bx(hall, 3.7, 0.16, 2.4, beamMat, 0, 2.25, Z0);                    // 위 띠
  bx(hall, 3.66, 0.1, 2.36, beamMat, 0, 1.45, Z0);                   // 가운데 띠
  // 앞면: 문(문틀·손잡이) + 창 두 개
  const FZ = Z0 + 1.15;
  bx(hall, 1.06, 1.5, 0.08, beamMat, 0, 1.05, FZ + 0.02);
  bx(hall, 0.86, 1.38, 0.08, woodMat, 0, 1.0, FZ + 0.05);
  bx(hall, 0.08, 0.08, 0.06, goldMat, 0.28, 1.0, FZ + 0.1);
  windowFront(hall, -1.15, 1.25, FZ, 0.55, 0.6, true);
  windowFront(hall, 1.15, 1.25, FZ, 0.55, 0.6, true);
  // 현관: 계단 3단 + 흰 기둥 4개 + 처마
  for (let i = 0; i < 3; i++) bx(hall, 2.4 - i * 0.2, 0.1, 0.3, stoneLight, 0, 0.05 + i * 0.1, FZ + 0.55 - i * 0.18);
  for (const x of [-1.05, -0.45, 0.45, 1.05]) {
    bx(hall, 0.2, 0.1, 0.2, stoneLight, x, 0.35, FZ + 0.42);
    bx(hall, 0.14, 1.9, 0.14, trimWhite, x, 1.35, FZ + 0.42);
    bx(hall, 0.22, 0.1, 0.22, stoneLight, x, 2.32, FZ + 0.42);
  }
  bx(hall, 2.5, 0.18, 0.7, trimWhite, 0, 2.45, FZ + 0.25);           // 현관 지붕판
  // 계단식 지붕 + 박공의 GATT 문양 (서비스 > 특성 > 디스크립터 = 넓은 막대에서 좁은 막대로)
  const top = gableRoof(hall, 3.7, 2.4, 2.33, 5, redRoof, redRoofDk);
  const gable = new THREE.Group(); gable.position.set(0, 0, Z0); hall.add(gable);
  [[0.7, 2.75], [0.5, 2.9], [0.3, 3.05]].forEach(([w, y]) => bx(gable, w, 0.08, 0.04, cyanEmblem, 0, y, 1.45));
  // 깃대 + 하늘색 깃발
  bx(hall, 0.06, 1.1, 0.06, metalMat, 0, top + 0.55, Z0);
  bx(hall, 0.5, 0.3, 0.03, cyanEmblem, 0.27, top + 0.92, Z0);
  const rune = bx(hall, 0.2, 0.2, 0.2, cyanEmblem, 0, top + 1.15, Z0);
  rune.rotation.set(0.6, 0.6, 0);
  planter(hall, -1.55, 0.35, FZ + 0.35, 0.6);
  planter(hall, 1.55, 0.35, FZ + 0.35, 0.6);
}
placeLandmark(hall, "hall");


// ----- 3.2 📚 RF 이론 도서관 — 아치 창·관측 돔과 접시 안테나·굴뚝·책 간판 (정면이 광장 쪽 = 동쪽) -----
const library = new THREE.Group();
{
  // 모델의 앞(+z)이 동쪽(+x)을 보도록 돌린다 (walkPos가 동쪽). 바닥: 로컬 x 2.6 × z 3.0
  bx(library, 2.7, 0.25, 3.1, stoneDark, 0, 0.125, 0);
  bx(library, 2.5, 1.9, 2.9, plasterMat, 0, 1.2, 0);
  for (const x of [-1.25, 1.25]) for (const z of [-1.45, 1.45]) bx(library, 0.18, 2.0, 0.18, beamMat, x, 1.25, z);
  bx(library, 2.6, 0.14, 3.0, beamMat, 0, 2.15, 0);
  const FZ = 1.45;
  // 문: 아치처럼 두 겹 + 계단
  bx(library, 0.9, 1.45, 0.08, beamMat, -0.55, 1.0, FZ + 0.02);
  bx(library, 0.72, 1.3, 0.08, woodMat, -0.55, 0.93, FZ + 0.05);
  bx(library, 0.5, 0.12, 0.08, woodMat, -0.55, 1.62, FZ + 0.05);
  bx(library, 1.1, 0.12, 0.35, stoneLight, -0.55, 0.06, FZ + 0.2);
  // 아치 창 (책장이 비치는 노란 창)
  for (const x of [0.45]) {
    windowFront(library, x, 1.2, FZ, 0.55, 0.7);
    bx(library, 0.4, 0.12, 0.07, glassMat, x, 1.62, FZ + 0.035);
    bx(library, 0.2, 0.08, 0.07, glassMat, x, 1.72, FZ + 0.035);
  }
  // 옆면 창 (양쪽)
  for (const sx of [-1, 1]) {
    const side = new THREE.Group(); side.rotation.y = sx * Math.PI / 2; side.position.set(sx * 1.25, 0, 0); library.add(side);
    windowFront(side, -0.6, 1.2, 0, 0.5, 0.6);
    windowFront(side, 0.6, 1.2, 0, 0.5, 0.6);
  }
  const top = gableRoof(library, 2.5, 2.9, 2.22, 4, blueRoof, blueRoofDk);
  // 굴뚝
  bx(library, 0.36, 0.9, 0.36, stoneDark, 0.8, top + 0.1, -0.7);
  bx(library, 0.44, 0.1, 0.44, stoneLight, 0.8, top + 0.55, -0.7);
  // 관측 돔 + 접시 안테나 (RF 이론)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), metalMat);
  dome.position.set(-0.6, top - 0.05, 0.3);
  library.add(dome);
  bx(library, 0.06, 0.5, 0.06, metalMat, -0.6, top + 0.55, 0.3);
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.16, 16, 1, true), trimWhite);
  dish.position.set(-0.6, top + 0.86, 0.36); dish.rotation.x = -0.9;
  dish.material.side = THREE.DoubleSide;
  library.add(dish);
  bx(library, 0.06, 0.06, 0.06, cyanEmblem, -0.6, top + 0.9, 0.48);
  // 책 더미 간판 (입구 옆)
  [[0x4f7bd9, 0.0], [0xd8443c, 0.09], [0xf2c14e, 0.18], [0x3ccf9c, 0.27]].forEach(([c, y], i) =>
    bx(library, 0.42 - i * 0.03, 0.08, 0.28, new THREE.MeshLambertMaterial({ color: c }), 0.95, 0.3 + y, FZ + 0.3));
  planter(library, 0.45, 0.35, FZ + 0.15, 0.55);
  library.rotation.y = Math.PI / 2;
}
placeLandmark(library, "library");


// ----- 3.3 🔨 패킷 대장간 — 돌벽·나무 기둥·차양·화로·모루·통과 상자·안테나 걸이 (정면 = 남쪽) -----
const forge = new THREE.Group();
{
  bx(forge, 2.7, 0.25, 3.1, stoneDark, 0, 0.125, 0);
  bx(forge, 2.5, 1.7, 2.3, forgeStone, 0, 1.1, -0.35);               // 본채 (뒤쪽)
  for (const x of [-1.25, 1.25]) bx(forge, 0.2, 1.8, 0.2, beamMat, x, 1.15, 0.8);
  bx(forge, 2.6, 0.14, 0.2, beamMat, 0, 1.98, 0.8);
  // 차양 (앞쪽으로 비스듬히)
  const awning = bx(forge, 2.8, 0.1, 0.9, copperRoof, 0, 2.05, 1.15);
  awning.rotation.x = 0.28;
  for (const x of [-1.2, 1.2]) bx(forge, 0.12, 1.75, 0.12, beamMat, x, 0.95, 1.5);
  const top = gableRoof(forge, 2.5, 2.3, 1.95, 4, copperRoof, copperDk);
  // 화로 (안쪽에서 이글거림) + 굴뚝 (끝이 빛남)
  bx(forge, 0.9, 0.7, 0.6, stoneDark, -0.55, 0.6, 0.55);
  const ember = bx(forge, 0.6, 0.3, 0.08, new THREE.MeshBasicMaterial({ color: 0xff7a1a }), -0.55, 0.6, 0.86);
  bx(forge, 0.5, 2.2, 0.5, stoneMat, -0.85, top - 0.4, -0.9);
  bx(forge, 0.6, 0.1, 0.6, stoneLight, -0.85, top + 0.72, -0.9);
  bx(forge, 0.3, 0.06, 0.3, new THREE.MeshBasicMaterial({ color: 0xffa040 }), -0.85, top + 0.78, -0.9);
  // 모루: 받침 + 몸통 + 뿔
  bx(forge, 0.2, 0.32, 0.2, stoneMat, 0.5, 0.41, 1.15);
  bx(forge, 0.5, 0.14, 0.24, metalMat, 0.5, 0.64, 1.15);
  bx(forge, 0.18, 0.1, 0.14, metalMat, 0.83, 0.64, 1.15);
  // 통·나무 상자·안테나 걸이 (RF 부품)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.5, 12), woodMat);
  barrel.position.set(1.05, 0.5, 1.3); forge.add(barrel);
  bx(forge, 0.42, 0.04, 0.44, beamMat, 1.05, 0.55, 1.3);
  bx(forge, 0.45, 0.4, 0.45, woodMat, -1.05, 0.45, 1.35);
  bx(forge, 0.47, 0.05, 0.47, beamMat, -1.05, 0.66, 1.35);
  bx(forge, 1.0, 0.06, 0.06, beamMat, 0.3, 1.5, 0.5);
  [-0.1, 0.15, 0.4, 0.65].forEach((x, i) => bx(forge, 0.03, 0.4 + (i % 2) * 0.15, 0.03, i % 2 ? goldMat : metalMat, x, 1.27, 0.53));
  // 매달린 간판 (모루 그림)
  bx(forge, 0.04, 0.3, 0.04, beamMat, 1.2, 1.75, 1.6);
  bx(forge, 0.5, 0.32, 0.05, woodMat, 1.2, 1.5, 1.62);
  bx(forge, 0.26, 0.08, 0.06, metalMat, 1.2, 1.52, 1.66);
  forge.userData.ember = ember;
  // 정면(+z)이 기본 카메라 쪽(남쪽)을 본다 (사용자 요청)
}
placeLandmark(forge, "forge");


// ----- 3.4 📡 전파의 등대 — 돌 기단·빨강/흰 띠 탑·전망대 난간·전구 케이지 (Stage 11.19) -----
const tower = new THREE.Group();
{
  const redBand = new THREE.MeshLambertMaterial({ color: 0xd8443c });
  bx(tower, 1.7, 0.3, 1.7, stoneDark, 0, 0.15, 0);
  bx(tower, 1.5, 0.55, 1.5, stoneLight, 0, 0.57, 0);
  bx(tower, 0.6, 0.9, 0.08, woodMat, 0, 0.6, 0.76);                  // 문
  // 몸통: 위로 갈수록 좁아지는 띠 (빨강·흰색 번갈아)
  const bands = [[1.04, 0.9], [0.97, 0.9], [0.9, 0.9], [0.83, 0.9], [0.76, 0.9], [0.69, 0.9], [0.62, 0.9]];   // 꼭대기 불빛이 7.7 m (광고 패킷 출발점, villagers.js)
  let y = 0.85;
  bands.forEach(([w, h], i) => { bx(tower, w, h, w, i % 2 ? redBand : trimWhite, 0, y + h / 2, 0); y += h; });
  for (const [yy, z] of [[1.8, 0.52], [3.6, 0.46], [5.4, 0.4]]) bx(tower, 0.22, 0.3, 0.06, glassMat, 0, yy, z);   // 작은 창
  // 전망대: 바닥판 + 난간 기둥 + 난간대
  bx(tower, 1.3, 0.12, 1.3, metalMat, 0, y + 0.06, 0);
  for (const [px, pz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6], [0, -0.6], [0, 0.6], [-0.6, 0], [0.6, 0]]) bx(tower, 0.05, 0.4, 0.05, beamMat, px, y + 0.32, pz);
  for (const [w, d, px, pz] of [[1.25, 0.05, 0, -0.6], [1.25, 0.05, 0, 0.6], [0.05, 1.25, -0.6, 0], [0.05, 1.25, 0.6, 0]]) bx(tower, w, 0.05, d, beamMat, px, y + 0.5, pz);
  // 전구 케이지 + 지붕 + 안테나
  for (const [px, pz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) bx(tower, 0.05, 0.8, 0.05, metalMat, px, y + 0.52, pz);
  bx(tower, 0.9, 0.16, 0.9, redBand, 0, y + 1.0, 0);
  bx(tower, 0.6, 0.16, 0.6, redBand, 0, y + 1.16, 0);
  bx(tower, 0.05, 1.1, 0.05, metalMat, 0, y + 1.8, 0);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), new THREE.MeshBasicMaterial({ color: 0x39d0ff }));
  beacon.position.y = y + 0.55;
  tower.add(beacon);
  tower.userData.beacon = beacon;
}
placeLandmark(tower, "tower");


// ----- 3.5 ⛲ 중앙 광장 분수대 — 2층 분수·블루투스 마크·흐르는 물 (Stage 11.20) -----
/** 블루투스 마크 (원 안의 룬 ᛒ) 캔버스 텍스처 */
function bluetoothTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d", { willReadFrequently: true });
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, "#2f8cff"); g.addColorStop(1, "#0b4fc4");
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
  x.strokeStyle = "#ffffff"; x.lineWidth = 9; x.lineJoin = "round"; x.lineCap = "round";
  x.beginPath();                                   // ᛒ: 왼쪽 위 → 오른쪽 아래 → 가운데 아래 → 가운데 위 → 오른쪽 위 → 왼쪽 아래
  x.moveTo(40, 42); x.lineTo(86, 84); x.lineTo(64, 104); x.lineTo(64, 24); x.lineTo(86, 44); x.lineTo(40, 86);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const fountain = new THREE.Group();
const fountainFx = { jets: [], falls: [], ripples: [] };
{
  const R = FOUNTAIN_RIM_HEIGHT;                   // 수반 턱 높이 0.7 — 걸어서는 못 오르고 점프로 올라선다
  const waterLight = new THREE.MeshLambertMaterial({ color: 0x4fb3e8, transparent: true, opacity: 0.85 });
  const spray = new THREE.MeshBasicMaterial({ color: 0xd8f3ff, transparent: true, opacity: 0.85 });
  // 1층: 팔각 돌 수반 (아래가 조금 넓다) + 턱 + 물
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.85, R, 8), stoneLight);
  basin.position.y = R / 2;
  fountain.add(basin);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.1, 8), stoneMat);
  lip.position.y = R + 0.02;
  fountain.add(lip);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.06, 32), waterLight);
  pool.position.y = R - 0.08;
  fountain.add(pool);
  // 기둥 + 2층 그릇 + 그 물
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.0, 8), stoneLight);
  stem.position.y = R + 0.4;
  fountain.add(stem);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.45, 0.32, 8), stoneLight);
  bowl.position.y = 1.55;
  fountain.add(bowl);
  const bowlLip = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.07, 8), stoneMat);
  bowlLip.position.y = 1.72;
  fountain.add(bowlLip);
  const upperWater = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.04, 24), waterLight);
  upperWater.position.y = 1.68;
  fountain.add(upperWater);
  // 꼭대기: 작은 기둥 + 회전하는 블루투스 마크
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.5, 8), stoneLight);
  top.position.y = 1.95;
  fountain.add(top);
  const rune = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ map: bluetoothTexture(), side: THREE.DoubleSide, transparent: true }));
  rune.position.y = 2.55;
  fountain.add(rune);
  fountain.userData.rune = rune;
  // 꼭대기에서 솟는 물줄기 (작은 물방울 상자들이 포물선)
  const dropGeo = new THREE.BoxGeometry(0.07, 0.12, 0.07);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(dropGeo, spray);
    fountain.add(m);
    fountainFx.jets.push({ m, a: (i / 16) * Math.PI * 2, phase: (i * 0.37) % 1 });
  }
  // 2층 그릇 가장자리에서 1층으로 떨어지는 물 (8곳 × 3방울)
  for (let k = 0; k < 8; k++) for (let j = 0; j < 3; j++) {
    const m = new THREE.Mesh(dropGeo, spray);
    fountain.add(m);
    fountainFx.falls.push({ m, a: (k / 8) * Math.PI * 2 + Math.PI / 8, phase: j / 3 });
  }
  // 1층 물 위 물결 고리
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.97, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = R - 0.04;
    fountain.add(ring);
    fountainFx.ripples.push({ m: ring, phase: i / 3 });
  }
}
/** 분수 물 애니메이션 (animateWorld에서) */
function animateFountain(t) {
  for (const d of fountainFx.jets) {               // 꼭대기 0.15 m 위에서 솟아 그릇으로
    const k = (t * 0.9 + d.phase) % 1;
    const r = 0.1 + k * 0.6;
    d.m.position.set(Math.cos(d.a) * r, 2.85 + Math.sin(k * Math.PI) * 0.55 - k * 1.1, Math.sin(d.a) * r);
  }
  for (const d of fountainFx.falls) {              // 그릇 가장자리(r 0.95, y 1.7)에서 수면(y 0.62)으로
    const k = (t * 1.3 + d.phase) % 1;
    const r = 0.98 + k * 0.25;
    d.m.position.set(Math.cos(d.a) * r, 1.7 - k * k * 1.08, Math.sin(d.a) * r);
    d.m.scale.y = 1 + k * 1.5;
  }
  for (const d of fountainFx.ripples) {
    const k = (t * 0.45 + d.phase) % 1;
    d.m.scale.setScalar(1 + k * 0.6);
    d.m.material.opacity = 0.5 * (1 - k);
  }
}
placeLandmark(fountain, "fountain");


// ----- 3.6 ⚔️ 37채널 호핑 던전 지하 입구 (Dungeon Portal Gate) -----
const dungeonGate = new THREE.Group();
{
  // 돌 블록을 쌓은 계단식 아치 (Stage 11.19)
  const runeMat = new THREE.MeshBasicMaterial({ color: 0xb539ff });
  for (const sx of [-1, 1]) {
    bx(dungeonGate, 0.8, 0.35, 0.9, stoneDark, sx * 1.4, 0.18, 0);                    // 받침
    for (let i = 0; i < 6; i++) bx(dungeonGate, 0.62, 0.42, 0.72, i % 2 ? darkStone : forgeStone, sx * 1.4, 0.55 + i * 0.42, 0);
    bx(dungeonGate, 0.1, 0.7, 0.04, runeMat, sx * 1.4, 1.4, 0.38);                     // 기둥 룬
  }
  [[2.1, 3.0], [1.6, 3.3], [0.9, 3.55]].forEach(([w, yy], i) => bx(dungeonGate, w * 1.6 + 0.4, 0.34, 0.8, i % 2 ? forgeStone : darkStone, 0, yy, 0));
  const rune = bx(dungeonGate, 0.34, 0.34, 0.12, runeMat, 0, 3.32, 0.44);
  rune.rotation.z = Math.PI / 4;
  const portalPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 2.6),
    new THREE.MeshBasicMaterial({ color: 0x7c1bd4, side: THREE.DoubleSide, transparent: true, opacity: 0.88 })
  );
  portalPlane.position.set(0, 1.45, 0);
  dungeonGate.add(portalPlane);
  dungeonGate.userData.portal = portalPlane;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: 0xd9a6ff }));
  ring.position.set(0, 1.5, 0.02);
  portalPlane.add(ring);
  ring.position.set(0, 0.05, 0.02);
  [-2.2, 2.2].forEach((fx) => {
    bx(dungeonGate, 0.42, 0.7, 0.42, stoneMat, fx, 0.35, 0.4);
    bx(dungeonGate, 0.56, 0.12, 0.56, stoneDark, fx, 0.76, 0.4);
    bx(dungeonGate, 0.26, 0.32, 0.26, new THREE.MeshBasicMaterial({ color: 0xc855ff }), fx, 1.0, 0.4);
    bx(dungeonGate, 0.14, 0.2, 0.14, new THREE.MeshBasicMaterial({ color: 0xf0d0ff }), fx, 1.22, 0.4);
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

TREE_POSITIONS.forEach(([tx, tz, s]) => { if (!(tx === -21 && tz === 1.5)) createVoxelTree(tx, tz, s); });   // (−21, 1.5) = 비밀의 사과나무 (아래)

// ----- 🍎 비밀의 사과나무 (Stage 13.3) — 서쪽 숲의 가장 큰 나무. 빨간 사과가 주렁주렁, 누르면 기사 랭킹 -----
const SECRET_TREE = TREE_POSITIONS.find(([tx, tz]) => tx === -21 && tz === 1.5);
export const secretTree = new THREE.Group();
const appleCrown = new THREE.Group();
const apples = [];
{
  const [tx, tz] = SECRET_TREE;
  const sc = 1.3;
  const bark = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  const barkDark = new THREE.MeshLambertMaterial({ color: 0x4e3520 });
  const leafA = new THREE.MeshLambertMaterial({ color: 0x3f9a3c });
  const leafB = new THREE.MeshLambertMaterial({ color: 0x53b34a });
  const leafC = new THREE.MeshLambertMaterial({ color: 0x2f7d34 });
  const box = (w, h, d, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; return m; };
  // 줄기 + 뿌리 + 두 갈래 가지
  secretTree.add(box(0.62 * sc, 2.0 * sc, 0.62 * sc, bark, 0, 1.0 * sc, 0));
  for (const [dx, dz, r] of [[0.42, 0, 0], [-0.42, 0, 0], [0, 0.42, Math.PI / 2], [0, -0.42, Math.PI / 2]]) secretTree.add(box(0.5 * sc, 0.22 * sc, 0.26 * sc, barkDark, dx * sc, 0.11 * sc, dz * sc, r));
  const br1 = box(0.26 * sc, 1.1 * sc, 0.26 * sc, bark, 0.42 * sc, 2.1 * sc, 0.1 * sc); br1.rotation.z = -0.6; secretTree.add(br1);
  const br2 = box(0.26 * sc, 1.0 * sc, 0.26 * sc, bark, -0.4 * sc, 2.2 * sc, -0.12 * sc); br2.rotation.z = 0.65; secretTree.add(br2);
  secretTree.add(box(0.18 * sc, 0.12 * sc, 0.05, barkDark, 0, 1.1 * sc, 0.32 * sc));   // 나무껍질에 새긴 자국 (랭킹의 단서)
  // 둥근 복셀 잎 무더기 (층층이)
  const crown = [
    [0, 2.75, 0, 2.6, 1.0, 2.6, leafA], [0, 3.55, 0, 2.1, 0.9, 2.1, leafB], [0, 4.2, 0, 1.3, 0.6, 1.3, leafA],
    [1.05, 2.9, 0.35, 1.1, 0.9, 1.3, leafC], [-1.05, 3.0, -0.25, 1.1, 0.9, 1.3, leafC], [0.25, 3.0, 1.05, 1.3, 0.8, 1.0, leafB], [-0.3, 2.95, -1.05, 1.4, 0.8, 1.0, leafB]
  ];
  for (const [x, y, z, w, h, d, m] of crown) appleCrown.add(box(w * sc, h * sc, d * sc, m, x * sc, y * sc, z * sc));
  secretTree.add(appleCrown);
  // 빨간 사과 (꼭지·잎사귀) — 잎 무더기 겉면에
  const appleMat = new THREE.MeshLambertMaterial({ color: 0xd8282c, emissive: 0x3a0606 });
  const appleHi = new THREE.MeshBasicMaterial({ color: 0xff8a7a });
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1e });
  const apple = (x, y, z, parent = appleCrown) => {
    const g = new THREE.Group();
    g.add(box(0.24, 0.22, 0.24, appleMat, 0, 0, 0));
    g.add(box(0.07, 0.07, 0.02, appleHi, -0.05, 0.04, 0.125));    // 반짝임
    g.add(box(0.04, 0.09, 0.04, stemMat, 0, 0.15, 0));
    g.add(box(0.1, 0.03, 0.06, leafB, 0.06, 0.18, 0));
    g.position.set(x, y, z);
    parent.add(g);
    apples.push(g);
    return g;
  };
  for (const [x, y, z] of [
    [1.6, 2.75, 0.5], [1.45, 3.1, -0.2], [-1.6, 2.9, 0.3], [-1.55, 3.2, -0.6], [0.6, 2.65, 1.6], [-0.5, 3.0, 1.5],
    [0.2, 2.6, -1.55], [-0.9, 2.7, -1.3], [1.2, 3.55, 0.9], [-1.0, 3.7, 0.8], [0.9, 3.8, -1.0], [0.1, 4.45, 0.7], [-0.6, 4.2, -0.6], [1.37, 2.2, -0.6]
  ]) apple(x * sc, y * sc, z * sc);
  // 떨어진 사과 몇 개
  for (const [x, z, r] of [[1.4, 1.1, 0.4], [-1.2, 1.5, 1.2], [0.6, -1.6, 2.0]]) { const g = apple(x, 0.11, z, secretTree); g.rotation.set(0.5, r, 0.3); apples.pop(); }
  // 누르기 쉬운 보이지 않는 상자 (나무 전체)
  const hit = new THREE.Mesh(new THREE.BoxGeometry(3.0 * sc, 4.8 * sc, 3.0 * sc), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 2.4 * sc;
  secretTree.add(hit);
  secretTree.position.set(tx, groundHeightAt(tx, tz), tz);
  secretTree.userData.secretTree = true;
  root.add(secretTree);
}
/** 잎이 바람에 살랑, 사과가 살짝 흔들린다 */
export function animateSecretTree(t) {
  appleCrown.rotation.z = Math.sin(t * 0.9) * 0.015;
  appleCrown.rotation.x = Math.sin(t * 0.7 + 1) * 0.012;
  apples.forEach((a, i) => { a.rotation.z = Math.sin(t * 1.6 + i * 1.3) * 0.12; });
}
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
  // 성벽 요새: 돌 기단·성가퀴·쇠창살 아치 문·금색 자물쇠·모서리 탑(빨간 감시 눈)·횃불 (Stage 11.19)
  const barMat = new THREE.MeshLambertMaterial({ color: 0x8a95a3 });
  bx(prison, 3.0, 0.3, 2.6, stoneDark, 0, 0.15, 0);
  bx(prison, 2.8, 2.1, 2.4, forgeStone, 0, 1.35, 0);
  for (let i = 0; i < 4; i++) bx(prison, 2.82, 0.04, 2.42, stoneDark, 0, 0.75 + i * 0.5, 0);   // 돌 줄눈
  for (let i = -3; i <= 3; i++) {                                                             // 성가퀴 (앞뒤)
    bx(prison, 0.3, 0.3, 0.3, stoneLight, i * 0.4, 2.55, 1.05);
    bx(prison, 0.3, 0.3, 0.3, stoneLight, i * 0.4, 2.55, -1.05);
  }
  for (const sx of [-1, 1]) for (let i = -2; i <= 2; i++) bx(prison, 0.3, 0.3, 0.3, stoneLight, sx * 1.25, 2.55, i * 0.45);
  // 아치 문 + 쇠창살
  bx(prison, 1.7, 1.75, 0.12, darkStone, 0, 1.1, 1.2);
  bx(prison, 1.4, 1.5, 0.06, new THREE.MeshBasicMaterial({ color: 0x0b0d12 }), 0, 1.0, 1.24);
  for (let i = 0; i < 6; i++) bx(prison, 0.07, 1.5, 0.07, barMat, -0.6 + i * 0.24, 1.0, 1.28);
  bx(prison, 1.4, 0.07, 0.07, barMat, 0, 1.3, 1.28);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.34, 0.12), new THREE.MeshBasicMaterial({ color: 0xffb020 }));
  lock.position.set(0, 1.0, 1.36);
  prison.add(lock);
  bx(prison, 0.2, 0.16, 0.06, goldMat, 0, 1.24, 1.36);
  prison.userData.lock = lock;
  // 모서리 탑 + 계단식 지붕 + 빨간 감시 눈
  for (const [tx, tz] of [[1.25, -1.0], [-1.25, -1.0]]) {
    bx(prison, 0.75, 3.3, 0.75, darkStone, tx, 1.65, tz);
    bx(prison, 0.9, 0.18, 0.9, stoneLight, tx, 3.35, tz);
    bx(prison, 0.55, 0.3, 0.55, redRoofDk, tx, 3.6, tz);
    bx(prison, 0.25, 0.25, 0.25, redRoofDk, tx, 3.85, tz);
  }
  const eye = bx(prison, 0.26, 0.26, 0.26, new THREE.MeshBasicMaterial({ color: 0xff3b30 }), 1.25, 2.9, -0.6);
  // 횃불 두 개
  for (const sx of [-1, 1]) {
    bx(prison, 0.08, 0.4, 0.08, beamMat, sx * 1.0, 1.75, 1.25);
    bx(prison, 0.14, 0.16, 0.14, new THREE.MeshBasicMaterial({ color: 0xffa040 }), sx * 1.0, 2.0, 1.25);
  }
  // 빨간 깃발 (보안)
  bx(prison, 0.04, 0.9, 0.04, metalMat, -1.25, 4.2, -1.0);
  bx(prison, 0.4, 0.26, 0.03, new THREE.MeshLambertMaterial({ color: 0xd8443c }), -1.04, 4.5, -1.0);
}
placeLandmark(prison, "prison");

// ----- Stage 10: 🪫 전력 잃은 지하묘지 입구 (남동) -----
const crypt = new THREE.Group();
{
  // 작은 영묘: 계단식 기단·앞 기둥 둘·박공 지붕·어두운 문·꺼져 가는 CR2032·이끼·작은 비석 (Stage 11.19)
  const slate = new THREE.MeshLambertMaterial({ color: 0x4a4f5a });
  const moss = new THREE.MeshLambertMaterial({ color: 0x5f8a4a });
  bx(crypt, 2.0, 0.2, 1.6, stoneDark, 0, 0.1, 0);
  bx(crypt, 1.8, 0.15, 1.5, stoneMat, 0, 0.27, 0.0);
  bx(crypt, 1.6, 1.3, 1.2, stoneLight, 0, 1.0, -0.1);
  for (const sx of [-1, 1]) {
    bx(crypt, 0.2, 1.35, 0.2, trimWhite, sx * 0.62, 1.02, 0.62);
    bx(crypt, 0.28, 0.1, 0.28, stoneMat, sx * 0.62, 0.38, 0.62);
  }
  bx(crypt, 1.75, 0.14, 1.5, slate, 0, 1.72, 0.05);
  bx(crypt, 1.4, 0.14, 1.1, slate, 0, 1.86, 0.05);
  bx(crypt, 0.9, 0.14, 0.7, slate, 0, 2.0, 0.05);
  bx(crypt, 0.7, 1.0, 0.06, new THREE.MeshBasicMaterial({ color: 0x0b0d12 }), 0, 0.85, 0.52);
  bx(crypt, 0.86, 0.1, 0.08, stoneDark, 0, 1.38, 0.53);
  // 꺼져 가는 CR2032 (코인 전지 모양 원판) — 가끔 깨어나는 센서 빛
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 20), new THREE.MeshBasicMaterial({ color: 0x9aa3ad }));
  coin.rotation.x = Math.PI / 2;
  coin.position.set(0, 1.58, 0.56);
  crypt.add(coin);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.04), new THREE.MeshBasicMaterial({ color: 0x7dffb5 }));
  glow.position.set(0, 1.58, 0.61);
  crypt.add(glow);
  crypt.userData.glow = glow;
  // 이끼·비석
  bx(crypt, 0.5, 0.08, 0.3, moss, -0.5, 1.8, 0.6);
  bx(crypt, 0.3, 0.3, 0.2, moss, 0.75, 0.42, -0.6);
  for (const [gx, gz] of [[-0.85, 0.85], [0.85, 0.85]]) {
    bx(crypt, 0.24, 0.4, 0.08, stoneMat, gx, 0.4, gz);
    bx(crypt, 0.12, 0.04, 0.1, stoneDark, gx, 0.48, gz + 0.01);
  }
  // 정면(+z)이 기본 카메라 쪽(남쪽)을 본다 (사용자 요청)
}
placeLandmark(crypt, "crypt");

animated.beacon = tower.userData.beacon;
animated.rune = fountain.userData.rune;
animated.portal = dungeonGate.userData.portal;
animated.lock = prison.userData.lock;
animated.cryptGlow = crypt.userData.glow;

/** 매 프레임 장식 애니메이션 */
// ----- 🛒 상점가 (Stage 12.2): 무기점(돌·나무, 교차한 검 간판, 무기 걸이) · 옷가게(파스텔 벽, 줄무늬 차양, 마네킹) — 정면 남쪽 -----
const weaponShop = new THREE.Group();
{
  bx(weaponShop, 2.8, 0.22, 2.3, stoneDark, 0, 0.11, 0);
  bx(weaponShop, 2.6, 1.8, 2.0, stoneLight, 0, 1.12, -0.1);
  for (const x of [-1.3, 1.3]) bx(weaponShop, 0.2, 1.9, 0.2, beamMat, x, 1.15, 0.9);
  bx(weaponShop, 2.7, 0.14, 0.22, beamMat, 0, 2.05, 0.9);
  const FZ = 0.9;
  bx(weaponShop, 0.9, 1.35, 0.08, beamMat, -0.55, 0.9, FZ + 0.02);
  bx(weaponShop, 0.74, 1.22, 0.08, woodMat, -0.55, 0.85, FZ + 0.05);
  windowFront(weaponShop, 0.6, 1.15, FZ, 0.75, 0.55);
  gableRoof(weaponShop, 2.6, 2.0, 2.02, 4, redRoof, redRoofDk);
  // 교차한 검 간판
  bx(weaponShop, 0.06, 0.4, 0.06, beamMat, 0, 2.9, FZ + 0.1);
  const sg = new THREE.Group(); sg.position.set(0, 2.55, FZ + 0.16); weaponShop.add(sg);
  bx(sg, 0.9, 0.42, 0.06, woodMat, 0, 0, 0);
  for (const a of [-0.6, 0.6]) { const b = bx(sg, 0.06, 0.5, 0.03, metalMat, 0, 0, 0.05); b.rotation.z = a; }
  bx(sg, 0.12, 0.12, 0.03, goldMat, 0, 0, 0.07);
  // 무기 걸이 (밖)
  bx(weaponShop, 0.8, 0.06, 0.1, beamMat, 0.75, 0.7, FZ + 0.32);
  [[0.5, 0x7de3ff], [0.75, 0xffd76b], [1.0, 0xb49bff]].forEach(([x, c]) => bx(weaponShop, 0.04, 0.55, 0.04, new THREE.MeshBasicMaterial({ color: c }), x, 0.42, FZ + 0.34));
  planter(weaponShop, -1.0, 0.3, FZ + 0.25, 0.5);
}
placeLandmark(weaponShop, "weaponShop");

const outfitShop = new THREE.Group();
{
  const pastel = new THREE.MeshLambertMaterial({ color: 0xf6d6e0 });
  const stripeA = new THREE.MeshLambertMaterial({ color: 0x7a5cc9 }), stripeB = new THREE.MeshLambertMaterial({ color: 0xf6f3ea });
  bx(outfitShop, 2.8, 0.22, 2.3, stoneLight, 0, 0.11, 0);
  bx(outfitShop, 2.6, 1.8, 2.0, pastel, 0, 1.12, -0.1);
  for (const x of [-1.3, 1.3]) bx(outfitShop, 0.16, 1.9, 0.16, trimWhite, x, 1.15, 0.9);
  const FZ = 0.9;
  bx(outfitShop, 0.8, 1.35, 0.08, trimWhite, 0.6, 0.9, FZ + 0.02);
  bx(outfitShop, 0.66, 1.22, 0.08, new THREE.MeshLambertMaterial({ color: 0x7a5cc9 }), 0.6, 0.85, FZ + 0.05);
  // 진열창 + 마네킹 (기사복)
  bx(outfitShop, 1.0, 1.0, 0.06, beamMat, -0.5, 1.05, FZ + 0.02);
  bx(outfitShop, 0.88, 0.88, 0.07, new THREE.MeshLambertMaterial({ color: 0xfff6d8 }), -0.5, 1.05, FZ + 0.04);
  bx(outfitShop, 0.22, 0.34, 0.06, new THREE.MeshLambertMaterial({ color: 0x0b62d6 }), -0.5, 1.0, FZ + 0.09);
  bx(outfitShop, 0.14, 0.14, 0.06, new THREE.MeshLambertMaterial({ color: 0xf1c7a1 }), -0.5, 1.28, FZ + 0.09);
  // 줄무늬 차양
  for (let i = 0; i < 7; i++) { const st = bx(outfitShop, 0.4, 0.06, 0.7, i % 2 ? stripeB : stripeA, -1.2 + i * 0.4, 2.05, FZ + 0.25); st.rotation.x = 0.35; }
  gableRoof(outfitShop, 2.6, 2.0, 2.02, 4, new THREE.MeshLambertMaterial({ color: 0x8b6bff }), new THREE.MeshLambertMaterial({ color: 0x5a3fa3 }));
  // 옷걸이 (밖): 색색의 겉옷
  bx(outfitShop, 0.05, 1.0, 0.05, metalMat, 1.55, 0.6, FZ + 0.45);
  bx(outfitShop, 0.6, 0.04, 0.04, metalMat, 1.55, 1.08, FZ + 0.45);
  [[0x0b62d6, -0.18], [0x2f8f5a, 0], [0xf2c14e, 0.18]].forEach(([c, dx]) => bx(outfitShop, 0.14, 0.4, 0.04, new THREE.MeshLambertMaterial({ color: c }), 1.55 + dx, 0.85, FZ + 0.45));
  planter(outfitShop, 0.0, 0.3, FZ + 0.3, 0.45);
}
placeLandmark(outfitShop, "outfitShop");

// ----- 📮 마을 게시판 (Stage 11.18 광고판 → 13.15) — 판에 새 소식 세 줄 + 의견 받기 안내 + 작은 만든 사람 표시 -----
const BOARD_W = 1024, BOARD_H = 620;
const mark = new Image();
mark.src = "./src/assets/yalex-mark-v1.webp";
function drawBoard(ctx) {
  const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
  const M = 'ui-monospace, "JetBrains Mono", "D2Coding", Consolas, monospace';
  const bg = ctx.createLinearGradient(0, 0, 0, BOARD_H);
  bg.addColorStop(0, "#123a5c"); bg.addColorStop(1, "#071a2c");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  ctx.fillStyle = "rgba(125, 216, 255, .10)";
  for (let x = 24; x < BOARD_W; x += 34) for (let y = 24; y < BOARD_H; y += 34) ctx.fillRect(x, y, 2, 2);
  ctx.textBaseline = "middle";
  // 머리: 📮 마을 게시판
  ctx.fillStyle = "rgba(255, 215, 107, .14)"; ctx.fillRect(0, 0, BOARD_W, 108);
  ctx.font = `900 56px ${F}`; ctx.fillStyle = "#ffe39a"; ctx.fillText("📮 마을 게시판", 40, 58);
  ctx.font = `600 24px ${F}`; ctx.fillStyle = "#cfe8ff"; ctx.textAlign = "right"; ctx.fillText("새 소식 · 이벤트 · 의견 받아요", BOARD_W - 40, 60); ctx.textAlign = "left";
  // 왼쪽: 📢 새 소식 세 줄 (이벤트는 금색)
  const ev = activeEvent();
  const list = (ev ? [ev, ...NOTICES.filter((n) => n !== ev)] : NOTICES).slice(0, 3);
  ctx.font = `800 30px ${F}`; ctx.fillStyle = "#7fd8ff"; ctx.fillText("📢 새 소식", 40, 150);
  list.forEach((n, i) => {
    const y = 210 + i * 92;
    ctx.fillStyle = n.tag === "event" ? "rgba(255, 215, 107, .22)" : "rgba(8, 26, 44, .75)";
    ctx.beginPath(); ctx.roundRect(36, y - 36, 600, 76, 16); ctx.fill();
    ctx.strokeStyle = n.tag === "event" ? "#ffd76b" : "rgba(57, 208, 255, .35)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = `800 26px ${F}`; ctx.fillStyle = "#ffffff";
    let t = n.title; while (ctx.measureText(t).width > 560 && t.length > 4) t = t.slice(0, -2) + "…";
    ctx.fillText(t, 58, y + 2);
  });
  // 오른쪽: 의견 받기 카드
  ctx.fillStyle = "rgba(57, 208, 255, .12)"; ctx.beginPath(); ctx.roundRect(668, 132, 320, 300, 22); ctx.fill();
  ctx.strokeStyle = "rgba(57, 208, 255, .6)"; ctx.lineWidth = 3; ctx.stroke();
  ctx.textAlign = "center";
  ctx.font = `64px ${F}`; ctx.fillText("💬", 828, 200);
  ctx.font = `900 34px ${F}`; ctx.fillStyle = "#ffffff"; ctx.fillText("의견 · 제안을", 828, 272); ctx.fillText("남겨 주세요!", 828, 316);
  ctx.font = `600 22px ${F}`; ctx.fillStyle = "#a9c7e2"; ctx.fillText("버그 · 아이디어 · 칭찬", 828, 370); ctx.fillText("눌러서 게시판 열기", 828, 402);
  ctx.textAlign = "left";
  // 아래 작게: 만든 사람
  if (mark.complete && mark.naturalWidth) ctx.drawImage(mark, BOARD_W - 300, BOARD_H - 62, 36, 36);
  ctx.font = `600 20px ${M}`; ctx.fillStyle = "#7fa6c6"; ctx.fillText("made by y.AI.ex", BOARD_W - 254, BOARD_H - 44);
}
const billboard = new THREE.Group();
{
  const W = BILLBOARD.width, H = W * BOARD_H / BOARD_W, BOTTOM = 1.9;
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5b4636 });
  for (const k of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, BOTTOM + H + 0.2, 0.22), postMat);
    post.position.set(k * (W / 2 - 0.15), (BOTTOM + H + 0.2) / 2, -0.08);
    billboard.add(post);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.24, H + 0.24, 0.14), new THREE.MeshLambertMaterial({ color: 0x1d2733 }));
  frame.position.set(0, BOTTOM + H / 2, 0);
  billboard.add(frame);
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_W; canvas.height = BOARD_H;
  // 큰 캔버스는 GPU 가속 캔버스가 되는데, 모바일 크롬은 앱을 내리거나 메모리가 부족하면 그 내용을 버린다 →
  // 그 뒤 텍스처를 다시 올리면 광고판이 까맣게 나온다 (Stage 12.10). willReadFrequently = CPU 캔버스라 버려지지 않는다.
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  drawBoard(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.set(0, BOTTOM + H / 2, 0.075);
  billboard.add(face);
  // 판 위 작은 조명 두 개 (밤에도 보일 것 같은 느낌)
  for (const k of [-0.33, 0.33]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), postMat);
    arm.position.set(k * W, BOTTOM + H + 0.22, 0.16);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.12), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    lamp.position.set(k * W, BOTTOM + H + 0.18, 0.36);
    billboard.add(arm, lamp);
  }
  // 아바타 이미지·글꼴(Pretendard)이 늦게 오면 그때 다시 그린다
  const redraw = () => { drawBoard(ctx); tex.needsUpdate = true; };
  mark.addEventListener("load", redraw);
  document.fonts?.ready?.then(redraw);
  // 그래도 내용이 사라졌을 때를 대비해: 캔버스 복구·탭 복귀·WebGL 복구 때 다시 그린다
  canvas.addEventListener("contextrestored", redraw);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) redraw(); });
  window.addEventListener("webglcontextrestored", redraw, true);
  billboard.rotation.y = BILLBOARD.facing;
}
placeLandmark(billboard, "billboard");

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
  animated.rune.rotation.y = t * 1.2;                                                 // 분수대 블루투스 마크 회전
  animated.rune.position.y = 2.55 + Math.sin(t * 2.5) * 0.06;
  animateFountain(t);
  animated.portal.scale.set(1 + 0.06 * Math.sin(t * 4), 1 + 0.06 * Math.cos(t * 3), 1); // 포털 맥동
  sea.position.z = Math.sin(t * 0.3) * 0.4;
  animated.lock.rotation.z = Math.sin(t * 2) * 0.15;                                   // 흔들리는 자물쇠
  animated.cryptGlow.material.color.setHSL(0.4, 0.9, 0.15 + 0.35 * Math.max(0, Math.sin(t * 0.8)) ** 4); // 가끔 깨어나는 센서
}

export { metalMat };
