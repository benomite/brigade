// La fiche de #12 sur le téléphone (ticket 1164), le merge confirmé et fait : la fiche dit ce que la station a fait.
import { gesteDeLaFiche } from "./telephone-gestes-commun.ts";

export const ecran = gesteDeLaFiche("La fiche de #12 sur le téléphone, mergée : ce que la station a fait, en 412 × 915", 12, "merger", true, { fait: "#12 merged into the integration branch", detail: "brigade : #12: merged (PR #40), the pass serves it" });
