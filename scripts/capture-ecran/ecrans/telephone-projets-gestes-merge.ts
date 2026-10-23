// La fiche de #12 sur le téléphone appairé (#1420), « merge the PR » confirmé : le guichet de la station l'a fait, et la
// fiche dit en une ligne ce qu'elle en a dit — ce qu'elle a lancé et écrit au survol.
import { gesteDUneCarte } from "./telephone-projets-gestes-commun.ts";

export const ecran = await gesteDUneCarte("La fiche de #12 sur le téléphone appairé, mergée par le guichet de la station, en 412 × 915", 12, "merger", {
  status: 200,
  data: { done: true, said: "#12 merged into the integration branch (PR #40)", detail: "$ brigade parade rail merge 12\nbrigade : #12 merged into the integration branch (PR #40)\n→ exit code 0" },
});
