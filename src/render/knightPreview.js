// 가방 창의 기사 미리보기 (Stage 12.4) — 작은 렌더러로 기사 모델을 복제해 천천히 돌린다 (창이 열린 동안만)
import * as THREE from "three";
import { knight } from "./knight.js";

let renderer = null, scene, camera, model, raf = 0;

/** @param {HTMLCanvasElement} canvas */
export function startPreview(canvas) {
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
  camera.position.set(0, 1.25, 4.6);   // 안테나 끝(약 1.9 m)까지 다 보이게
  camera.lookAt(0, 0.85, 0);
  model = knight.children[0].clone(true);   // rig — 재질을 공유하므로 무기·옷 변경이 그대로 보인다
  model.position.set(0, 0, 0);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.08, 32), new THREE.MeshLambertMaterial({ color: 0x23476e }));
  base.position.y = -0.04;
  scene.add(model, base);
  const loop = (t) => {
    raf = requestAnimationFrame(loop);
    model.rotation.y = window.__previewYaw ?? Math.sin(t * 0.0007) * 0.9 + 0.35;   // 정면 위주로 좌우로 살짝 돈다 (뒤로 돌지 않게)
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
}
export function stopPreview() {
  cancelAnimationFrame(raf);
  if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); renderer = null; }
}
