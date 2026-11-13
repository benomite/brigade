// La carte de #50 dans TODO (#3434) : le manager l'a jugée `decision` — sa question, un bouton par réponse dans ses mots, la
// réponse qu'il recommande avec sa raison, et le champ libre. Le commentaire est celui que runtime/src/manager.ts écrit.
import type { Ecran } from "./commun.ts";
import { donneesDeLEcart, OUVRIR_PARADE } from "./ecart-du-manager-commun.ts";

const REFUS = [
  "<!-- brigade:manager -->",
  "**Manager — not a workable ticket: a decision issue.** Nothing is set, no cook will start.",
  "",
  "The issue asks whether the CSV export carries the VAT of each line or only the invoice total, and says the call is the chef's.",
  "",
  "**What would make it workable.** The chef's call on the VAT breakdown.",
  "",
  "**Yours to settle.** The manager sets `decision` on this issue: it is a card in your TODO. Answer it there — one of its answers or your own words — and the manager judges the issue again with your answer; or close the issue.",
  "",
  "Does the CSV export carry the VAT of each line, or is the invoice total enough?",
  "- [resume] The invoice total is enough",
  "- [resume] Add the VAT of each line",
  "- [close] Close it: out of scope",
  "",
  "**Recommended:** The invoice total is enough — the accounting tool of the chef reads only totals.",
  "",
  "_Judged by the manager in `sonnet` / `medium` · 1 turn · 3,390 tokens · 7.6 s._",
].join("\n");

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#3434) : #50 jugé `decision` par le manager — sa carte dans TODO, un bouton par réponse à sa question, la réponse recommandée avec sa raison",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees: donneesDeLEcart("decision", REFUS, "Export the invoices as CSV"),
};
