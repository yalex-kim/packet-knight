// 🧑‍🎤 사람 기사 아바타 (Stage 13.34) — Tripo로 만든 남·여 기사 GLB + Mixamo 동작 (THREE 의존)
// 모델: src/assets/avatar/knight-{m,f}-v1.glb (텍스처 1024 webp, 메시 양자화)
// 동작: anim-{m,f}-v1.json — Mixamo FBX 10종을 이 모델 뼈대에 맞게 미리 옮겨 둔 것 (리타게팅은 빌드 밖 도구로 한 번):
//   { 이름: { d: 길이, t: [시각], hips: [엉덩이 높이], q: { 뼈: [x,y,z,w, …] } } } — 제자리 동작(엉덩이 x·z 고정)
// 아직 못 불러왔거나 실패하면 예전 복셀 기사가 그대로 보인다 (knight.js).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

export const AVATAR_HEIGHT = 1.45;
const url = (f) => new URL(`./src/assets/avatar/${f}`, document.baseURI).href;
const FILES = { m: ["knight-m-v1.glb", "anim-m-v1.json"], f: ["knight-f-v1.glb", "anim-f-v1.json"] };
const cache = {};

/** 동작 JSON → AnimationClip들 */
function buildClips(json, hipsBind) {
  const clips = {};
  for (const [name, c] of Object.entries(json)) {
    const tracks = [];
    if (c.hips) tracks.push(new THREE.VectorKeyframeTrack("mixamorigHips.position", c.t, c.hips.flatMap((y) => [hipsBind.x, y, hipsBind.z])));
    for (const [bone, v] of Object.entries(c.q)) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, c.t, v));
    clips[name] = new THREE.AnimationClip(name, c.d, tracks);
  }
  return clips;
}

/** 원본 모델 + 동작 불러오기 (성별마다 한 번) @returns {Promise<{ scene: THREE.Object3D, clips: Record<string, THREE.AnimationClip> }>} */
export function loadAvatarAsset(gender) {
  const g = gender === "f" ? "f" : "m";
  return (cache[g] ??= (async () => {
    const [gltf, json] = await Promise.all([
      new GLTFLoader().loadAsync(url(FILES[g][0])),
      fetch(url(FILES[g][1])).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    ]);
    const scene = gltf.scene;
    let hips = null;
    scene.traverse((o) => {
      if (o.isBone && o.name === "mixamorigHips") hips = o;
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;   // 뼈로 움직이면 경계 상자가 안 맞아 잘려 보인다
        const m = o.material;      // Tripo가 갑옷을 '완전 금속'으로 내보내 환경맵 없는 장면에서 새까맣게 보였다 → 금속성을 낮춘다
        m.metalness = Math.min(m.metalness ?? 0, 0.15);
        m.roughness = Math.max(m.roughness ?? 1, 0.55);
        m.metalnessMap = null;
        if ("transmission" in m) m.transmission = 0;
        m.needsUpdate = true;
      }
    });
    const box = new THREE.Box3().setFromObject(scene);
    scene.userData.unitScale = AVATAR_HEIGHT / Math.max(0.01, box.max.y - box.min.y);
    return { scene, clips: buildClips(json, hips.position) };
  })().catch((e) => { delete cache[g]; throw e; }));
}

const LOOP = new Set(["idle", "standard_walk", "running"]);
/** 공격 동작 — 무기 종류 → 동작 이름, 재생 길이(초) */
const ATTACK = { sword: ["attack_slash", 0.42], dagger: ["attack_dualwield", 0.3], bow: ["bow_fire", 0.48], fan: ["attack_combo", 0.45] };

/**
 * 장면에 놓을 아바타 하나 (원본을 뼈째 복제) — 상태에 맞춰 동작을 바꾼다
 * @returns {Promise<Avatar>}
 */
export async function createAvatar(gender) {
  const { scene, clips } = await loadAvatarAsset(gender);
  const root = new THREE.Group();
  const model = cloneSkinned(scene);
  model.scale.setScalar(scene.userData.unitScale);
  root.add(model);
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [n, c] of Object.entries(clips)) {
    const a = mixer.clipAction(c);
    if (!LOOP.has(n)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    actions[n] = a;
  }
  let base = null, oneShot = null, oneShotLeft = 0;
  const fadeTo = (name, dur = 0.15) => {
    const next = actions[name];
    if (!next || base === next) return;
    next.reset().setEffectiveWeight(1).fadeIn(dur).play();
    if (base) base.fadeOut(dur);
    base = next;
  };
  fadeTo("idle", 0);
  const playOnce = (name, seconds) => {
    const a = actions[name];
    if (!a) return;
    if (oneShot && oneShot !== a) oneShot.fadeOut(0.05);
    a.reset();
    a.timeScale = a.getClip().duration / seconds;
    a.setEffectiveWeight(1).fadeIn(0.05).play();
    if (base) base.fadeOut(0.05);
    oneShot = a; oneShotLeft = seconds;
  };
  return {
    gender: gender === "f" ? "f" : "m",
    root, model, bones, mixer, clips,
    handR: bones.mixamorigRightHand, handL: bones.mixamorigLeftHand,
    /** 매 프레임: 땅·이동 상태로 대기/달리기/점프를 고르고 동작을 진행 */
    update(dt, { moving, grounded, speed = 1 }) {
      const want = !grounded ? "jump" : moving ? "running" : "idle";
      if (oneShot) {
        oneShotLeft -= dt;
        if (oneShotLeft <= 0) { oneShot.fadeOut(0.12); oneShot = null; const b = base; base = null; fadeTo(want, 0.12); if (b && b !== base) b.stop(); }
      } else if (actions[want] !== base) {
        fadeTo(want, want === "jump" ? 0.08 : 0.18);
        if (want === "jump") actions.jump.time = 0.18;   // 웅크리는 앞부분은 건너뛴다 (이미 떠 있다)
      }
      if (base === actions.running) base.timeScale = 1.25 * speed;
      mixer.update(dt);
    },
    attack(kind) { const [n, s] = ATTACK[kind] ?? ATTACK.sword; playOnce(n, s); },
    roll(seconds = 0.45) { playOnce("roll", seconds); },
    dodge() { playOnce("dodging_back", 0.4); },
    /** 지금 재생 중인 동작 이름들 (테스트·디버그) */
    state: () => ({ base: base?.getClip().name ?? null, oneShot: oneShot?.getClip().name ?? null })
  };
}

