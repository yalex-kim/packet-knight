// 가방·랭킹·캐릭터 만들기 창의 기사 미리보기 (Stage 12.4) — 작은 렌더러로 기사 모델을 복제해 천천히 돌린다 (창이 열린 동안만)
// Stage 13.34: 사람 아바타면 뼈째 복제(SkeletonUtils)하고 대기 동작을 재생한다. 아직 없으면 복셀 몸을 복제.
import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { previewSource } from "./knight.js";

let renderer = null, scene, camera, model, raf = 0, mixer = null, last = 0;

function makeModel() {
  const src = previewSource();
  mixer = null;
  if (!src.avatar) { const m = src.object.clone(true); m.visible = true; m.position.set(0, 0, 0); return m; }
  const m = cloneSkinned(src.object);
  m.position.set(0, 0, 0); m.scale.set(1, 1, 1);
  mixer = new THREE.AnimationMixer(m);
  mixer.clipAction(src.avatar.clips.idle).play();
  return m;
}

/** @param {HTMLCanvasElement} canvas */
export function startPreview(canvas) {
  // 같은 캔버스(랭킹에서 다른 기사를 고를 때)는 렌더러를 그대로 두고 모델만 다시 복제한다 —
  // forceContextLoss 한 캔버스에서 새 컨텍스트를 얻으면 실패한다 (Stage 13.3)
  if (renderer && renderer.domElement === canvas) {
    scene.remove(model);
    model = makeModel();
    scene.add(model);
    return;
  }
  stopPreview();
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth || 200, canvas.clientHeight || 240, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe6f2ff, 0x3a4660, 1.4));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
  key.position.set(2, 3, 3);
  scene.add(key);
  camera = new THREE.PerspectiveCamera(32, (canvas.clientWidth || 200) / (canvas.clientHeight || 240), 0.1, 20);
  camera.position.set(0, 1.15, 4.4);
  camera.lookAt(0, 0.8, 0);
  model = makeModel();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.08, 32), new THREE.MeshLambertMaterial({ color: 0x23476e }));
  base.position.y = -0.04;
  scene.add(model, base);
  last = 0;
  const loop = (t) => {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
    mixer?.update(dt);
    model.rotation.y = window.__previewYaw ?? Math.sin(t * 0.0007) * 0.9 + 0.35;   // 정면 위주로 좌우로 살짝 돈다 (뒤로 돌지 않게)
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
}
export function stopPreview() {
  cancelAnimationFrame(raf);
  mixer = null;
  if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); renderer = null; }
}
