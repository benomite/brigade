// La fiche de #12 sur le téléphone appairé (#1420), « merge the PR » confirmé quand la station ne se joint pas : une
// phrase, ce que le réseau a dit au survol — et la carte où elle était.
import { gesteDUneCarte, INJOIGNABLE } from "./telephone-projets-gestes-commun.ts";

export const ecran = await gesteDUneCarte("La fiche de #12 sur le téléphone appairé, son merge parti vers une station injoignable, en 412 × 915", 12, "merger", INJOIGNABLE);
