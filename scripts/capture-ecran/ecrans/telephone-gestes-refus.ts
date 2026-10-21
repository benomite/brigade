// La fiche de #12 sur le téléphone (ticket 1164), le merge refusé : une ligne, ce que la station a répondu au survol —
// et la file telle qu'elle était.
import { gesteDeLaFiche } from "./telephone-gestes-commun.ts";

export const ecran = gesteDeLaFiche("La fiche de #12 sur le téléphone, le merge refusé par GitHub, en 412 × 915", 12, "merger", true, { refus: "#12 was not merged: GitHub refused the merge", detail: "brigade : #12: merge refused — Pull Request is not mergeable" });
