// La fiche de #12 sur le téléphone (ticket 1164), le merge confirmé, la station pas encore revenue : la fiche le dit, et
// ses gestes attendent.
import { gesteDeLaFiche } from "./telephone-gestes-commun.ts";

export const ecran = gesteDeLaFiche("La fiche de #12 sur le téléphone, le merge parti, la station pas encore revenue, en 412 × 915", 12, "merger", true, { __enAttente: true });
