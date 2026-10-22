// Le premier lancement, le clone de parade refusé (#1434) : la phrase du runtime, son détail au survol, la page qui le lève et « try again ».
import { ACCES_REFUSE, LISTEES, premierLancement } from "./premier-lancement-commun.ts";

export const ecran = premierLancement("Le premier lancement, le clone de parade refusé (#1434) : la raison en une phrase, sous sa station", LISTEES, [{ cliquer: "section[aria-label=\"parade-box\"] button[title=\"benomite/parade\"]" }], {
  ouvrirDUneStation: ACCES_REFUSE,
});
