// Le premier lancement, parade cliqué (#1434) : sa copie se fait, la phrase le dit sous parade-box, les autres projets attendent.
import { LISTEES, premierLancement } from "./premier-lancement-commun.ts";

export const ecran = premierLancement("Le premier lancement, parade cliqué (#1434) : sa copie en route, dite sous sa station", LISTEES, [{ cliquer: "section[aria-label=\"parade-box\"] button[title=\"benomite/parade\"]" }], {
  ouvrirDUneStation: { __enAttente: true },
});
