import { json } from "../../server/cloud.js";
/** 공개 설정 — 구글 클라이언트 ID(공개 값). 비어 있으면 게임은 로그인 기능을 숨긴다 */
export const onRequestGet = ({ env }) => json({ googleClientId: env.GOOGLE_CLIENT_ID || "" });
