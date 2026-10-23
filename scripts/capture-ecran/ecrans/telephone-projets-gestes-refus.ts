// La fiche de #31 sur le téléphone appairé (#1420), « remove from the rail » refusé par la station (409) : sa phrase en
// une ligne, ce qu'elle a lancé au survol — et la carte où elle était.
import { gesteDUneCarte } from "./telephone-projets-gestes-commun.ts";

export const ecran = await gesteDUneCarte("La fiche de #31 sur le téléphone appairé, son retrait du rail refusé par la station, en 412 × 915", 31, "retirer", {
  status: 409,
  data: { done: false, said: "#31 is not on the rail of parade any more", detail: "$ brigade parade rail remove 31\nbrigade : #31 is not on the rail of parade any more\n→ exit code 1" },
});
