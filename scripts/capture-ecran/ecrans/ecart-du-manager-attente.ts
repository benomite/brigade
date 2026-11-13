// La carte de #50 dans TODO (#3434) : le manager l'a jugée `decision`, mais sa question attend le client, pas le chef — la
// carte propose de la mettre en WAITING, en disant qui elle attend. Le commentaire est celui que runtime/src/manager.ts écrit.
import type { Ecran } from "./commun.ts";
import { donneesDeLEcart, OUVRIR_PARADE } from "./ecart-du-manager-commun.ts";

const REFUS = [
  "<!-- brigade:manager -->",
  "**Manager — not a workable ticket: a decision issue.** Nothing is set, no cook will start.",
  "",
  "The issue waits for the client to say whether the respondent is recontacted after the beta.",
  "",
  "**What would make it workable.** The client's answer on the recontact.",
  "",
  "**Not yours to answer: it waits on AF, the client.** The manager sets `decision` on this issue: its card in your TODO proposes to put it in WAITING, awaiting AF, the client. If you already have the answer, give it there instead — one of its answers or your own words — and the manager judges the issue again with it.",
  "",
  "Does AF want direct automatic recontact of the respondent after the beta?",
  "- [wait] Wait for AF, the client",
  "- [resume] Yes: recontact automatically",
  "- [close] Close it: out of scope",
  "",
  "**Recommended:** Wait for AF, the client — the answer is theirs to give, not yours.",
  "",
  "_Judged by the manager in `sonnet` / `medium` · 1 turn · 3,390 tokens · 7.6 s._",
].join("\n");

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#3434) : #50 jugé `decision` par le manager, sa question attend le client — sa carte dans TODO propose WAITING, en disant qui elle attend",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees: donneesDeLEcart("decision", REFUS, "Recontact the respondent after the beta"),
};
