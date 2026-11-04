// 개발자 카드 (Stage 11.19, 12.10) — 광고판을 누르면 home.yalex-k.com 히어로 한 장만 (스크롤 없음).
// 제목 오른쪽 빈자리에 홈페이지 링크.

let overlay, onClose = () => {};

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
          <div class="dc-titlerow">
            <h2 class="dc-title">Yalex의<br /><span>바이브코딩<br />아티팩트</span></h2>
            <a class="dc-home" href="https://home.yalex-k.com/" target="_blank" rel="noopener" aria-label="홈페이지 home.yalex-k.com 열기 (새 탭)">
              <span class="dc-home-ico">🏠</span><b>홈페이지</b><span class="dc-mono">home.yalex-k.com ↗</span></a>
          </div>
          <p class="dc-lede">만들고 싶은 걸 <b>말로 설계</b>하고, <b>AI와 짝 코딩</b>으로 굳혔습니다. 여기 있는 건 그렇게 나온 결과물이고, 지금도 계속 고쳐지며 돌아갑니다.</p>
        </div>
      </div>
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
  overlay.querySelector(".dc-close").focus({ preventScroll: true });
}
export function closeDevCard() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  onClose();
}
export const isDevCardOpen = () => Boolean(overlay && !overlay.hidden);
