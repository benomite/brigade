// La même conversation (#1426), un message tapé et envoyé : le guichet l'a mis dans la conversation du desktop, et le
// second écrit sa réponse.
import { LUE, MESSAGES, secondAuGuichet, TEXTE } from "./telephone-projets-second-commun.ts";

export const ecran = await secondAuGuichet("La conversation de « parade » sur le téléphone appairé, le message parti au guichet, le second qui répond, en 412 × 915", LUE, {
  status: 202,
  data: { sent: true, project: "parade", session: "0b6c1c2e-4f5a-4b7c-9d8e-1f2a3b4c5d6e", messages: [...MESSAGES, { from: "chef", at: "2026-10-13T10:04:00.000Z", text: TEXTE }], answering: true },
});
