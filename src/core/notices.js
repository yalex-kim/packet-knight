// 📢 마을 게시판 공지·이벤트 (Stage 13.15) — 순수 데이터. 새 소식은 맨 위에 한 줄씩 넣고 배포하면 된다.
// tag: "event"(🎉 이벤트, 금색으로 맨 위 강조) | "update"(🆕 업데이트) | "notice"(📌 공지)
// until: (선택) 이 날짜가 지나면 이벤트 강조를 끈다 (YYYY-MM-DD)

/** @type {ReadonlyArray<{ date: string, tag: "event"|"update"|"notice", title: string, body: string, until?: string }>} */
export const NOTICES = Object.freeze([
  { date: "2026-11-04", tag: "update", title: "💡 주민이 스펙 이야기를 들려줘요",
    body: "던전 층을 깨거나, 레벨이 오르거나, 상점에서 물건을 사면 마을 주민 머리 위에 💡가 떠요. 말을 걸면 블루투스 사양 한 조각을 들려주고, 🎯 맞혀 보면 CR2032를 줘요." },
  { date: "2026-11-04", tag: "update", title: "📚 문제가 장마다 10개 이상으로",
    body: "교과서 각 장에서 문제를 더 만들어 모두 144문제가 되었어요. 도서관 퀴즈, 주민 이야기, 알바 2배 받기가 같은 문제를 써요." },
  { date: "2026-11-04", tag: "update", title: "🎓 비콘 알바 2배 받기",
    body: "알바 정산 화면에서 블루투스 문제 하나를 맞히면 보수가 두 배! 틀려도 기본 보수는 그대로예요." },
  { date: "2026-11-04", tag: "update", title: "🍎 비밀의 사과나무 랭킹",
    body: "서쪽 숲 어딘가에 빨간 사과가 열린 나무가 있어요. 레벨 랭킹과 📡 비콘 알바 최고 점수 랭킹을 볼 수 있어요. 등대 안내판의 🍎 버튼으로도 열려요." },
  { date: "2026-11-04", tag: "notice", title: "☁️ 구글 로그인으로 클라우드 저장",
    body: "오른쪽 위 👤 버튼에서 구글로 로그인하면 진행도가 클라우드에 저장돼서 다른 기기에서도 이어서 할 수 있어요. 로그인하지 않아도 지금처럼 플레이할 수 있어요." }
]);

/** 지금 강조할 이벤트 (기간이 남은 event 중 가장 최근) */
export function activeEvent(today = new Date().toISOString().slice(0, 10)) {
  return NOTICES.find((n) => n.tag === "event" && (!n.until || n.until >= today)) ?? null;
}
