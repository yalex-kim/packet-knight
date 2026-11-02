// connectivityBook(BluetoothBook) 주소 — 교과서 링크는 모두 여기서 만든다 (주소가 바뀌면 이 파일만 고친다)
// 2026-11: yalex-kim.github.io/connectivityBook → connbook.yalex-k.com 으로 이전 (경로 구조는 같다고 가정)

export const BOOK_ORIGIN = "https://connbook.yalex-k.com";
export const BLUETOOTH_CHAPTERS = `${BOOK_ORIGIN}/bluetooth/chapters`;

/** 챕터 파일(예: "hopping.html")과 선택적 절 id → 원문 URL */
export const chapterUrl = (file, section = null) => `${BLUETOOTH_CHAPTERS}/${file}${section ? `#${section}` : ""}`;
