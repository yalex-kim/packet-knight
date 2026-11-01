// HUD — 상태 배지와 랜드마크 정보 모달 (DOM)

const badge = document.getElementById("badge");
const modal = document.getElementById("info-modal");
const modalTitle = document.getElementById("modal-title");
const modalSub = document.getElementById("modal-sub");
const modalDesc = document.getElementById("modal-desc");
const modalLore = document.getElementById("modal-lore");
const modalLink = document.getElementById("modal-link");

document.getElementById("modal-close").addEventListener("click", hideModal);

export function setBadge(text) {
  badge.textContent = text;
}
export function getBadge() {
  return badge.textContent;
}

/** @param {import("../core/layout.js").LandmarkInfo} info */
export function showModal(info) {
  modalTitle.textContent = info.title;
  modalSub.textContent = info.sub;
  modalDesc.textContent = info.desc;
  modalLore.textContent = "📶 RF 이론: " + info.lore;
  modalLink.href = info.link;
  modal.style.display = "block";
}
export function hideModal() {
  modal.style.display = "none";
}
/** 열려 있는 모달 제목 (없으면 null) */
export function openModalTitle() {
  return modal.style.display === "block" ? modalTitle.textContent : null;
}
