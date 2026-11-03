// 개발자 카드 (Stage 11.19) — 광고판을 누르면 home.yalex-k.com 히어로 디자인 + 아티팩트·만드는 방식 설명 (DOM)

const ARTIFACTS = [
  ["ART-01", "ConnectivityBook", "interactive textbook", "시뮬레이터를 직접 만지며 배우는 한국어 무선 통신 교과서 서재. 규격 문서와 공개 구현으로 사실을 확인합니다.", "LIVE"],
  ["ART-02", "Packet Knight", "3D voxel RPG", "패킷 기사가 되어 BLE를 몸으로 배우는 3D 복셀 RPG — 지금 플레이 중인 바로 이 게임!", "LIVE"],
  ["ART-03", "Barbell Fund", "multi-agent investing", "잃지 않는 코어 70% + 성장 신호로 고른 위성 30%. 바벨 구조 자동 투자 시스템과 매매 승인 콘솔.", "PRIVATE"],
  ["ART-04", "K-History Studio", "video agent", "주제나 속담 하나를 넣으면 리서치 → 대본 → 스토리보드 → 렌더링까지. 출처를 확인하며 한국사 학습 영상을 만드는 AI 에이전트.", "PRIVATE"]
];
const VIBE = [
  ["01 · VIBE", "말로 설계", "무엇을, 누구를 위해, 어디까지. 코드보다 문장을 먼저 씁니다."],
  ["02 · PAIR", "AI와 짝 코딩", "Claude Code와 함께 만들고, 결정은 사람이 합니다."],
  ["03 · VERIFY", "돌려서 확인", "테스트·스모크·팩트체크. 출처와 숫자는 직접 확인합니다."],
  ["04 · SHIP", "바로 내보내기", "git push 하면 바로 배포. 쓰면서 계속 고칩니다."]
];

let overlay, onClose = () => {};
const esc = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function build() {
  overlay = document.createElement("div");
  overlay.id = "devcard";
  overlay.className = "overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "개발자 광고판 — y.AI.ex");
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="panel dc">
      <div class="dc-top">
        <img class="dc-mini" src="./src/assets/yalex-mark-v1.webp" alt="" width="40" height="40" />
        <div><b class="dc-brand">y.<i>AI</i>.ex</b><span class="dc-mono">vibe-coding artifacts</span></div>
        <span class="dc-online"><i></i>online</span>
        <button type="button" class="dc-close" aria-label="닫기">×</button>
      </div>
      <div class="dc-hero">
        <div class="dc-ring"><img src="./src/assets/yalex-mark-v1.webp" alt="y.AI.ex 아바타" width="512" height="512" /><i class="d1"></i><i class="d2"></i><i class="d3"></i></div>
        <div class="dc-copy">
          <div class="dc-mono dc-prompt">~/Yalex $ ls artifacts/</div>
          <h2 class="dc-title">Yalex의<br /><span>바이브코딩<br />아티팩트</span></h2>
          <p class="dc-lede">만들고 싶은 걸 <b>말로 설계</b>하고, <b>AI와 짝 코딩</b>으로 굳혔습니다. 여기 있는 건 그렇게 나온 결과물이고, 지금도 계속 고쳐지며 돌아갑니다.</p>
        </div>
      </div>
      <div class="dc-mono dc-prompt">$ ls -l ~/Yalex/artifacts</div>
      <div class="dc-list">${ARTIFACTS.map(([id, name, kind, desc, tag]) => `
        <div class="dc-item${name === "Packet Knight" ? " here" : ""}">
          <div class="dc-item-head"><span class="dc-mono">${id}</span><b>${esc(name)}</b><span class="dc-kind">${esc(kind)}</span><span class="dc-tag ${tag === "LIVE" ? "live" : ""}">${tag}</span></div>
          <p>${esc(desc)}</p>
        </div>`).join("")}</div>
      <div class="dc-mono dc-prompt">$ cat ~/Yalex/VIBE.md</div>
      <div class="dc-vibe">${VIBE.map(([k, t, d]) => `<div><span class="dc-mono">${k}</span><b>${t}</b><p>${d}</p></div>`).join("")}</div>
      <p class="dc-note">이 게임도 그렇게 만들었어요 — PRD를 먼저 쓰고, Claude Code와 짝 코딩하고, 스모크 테스트를 돌려 확인한 뒤 바로 배포합니다.</p>
      <div class="dc-actions"><a class="dc-home" href="https://home.yalex-k.com/" target="_blank" rel="noopener">🏠 home.yalex-k.com 열기 ↗</a></div>
    </div>`;
  document.body.append(overlay);
  overlay.querySelector(".dc-close").addEventListener("click", closeDevCard);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDevCard(); });
  window.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") { e.stopPropagation(); closeDevCard(); } }, { capture: true });
}

export function openDevCard(close = () => {}) {
  if (!overlay) build();
  onClose = close;
  overlay.hidden = false;
  overlay.querySelector(".panel").scrollTop = 0;
  overlay.querySelector(".dc-close").focus({ preventScroll: true });
}
export function closeDevCard() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  onClose();
}
export const isDevCardOpen = () => Boolean(overlay && !overlay.hidden);
