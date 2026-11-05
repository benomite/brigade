// Les GitHub Apps de la station de ce Mac (#2317) : sous cette machine, la ligne qui dit que les clés y restent, puis
// une ligne par rôle — le cook `configured`, la pass et le manager `not configured` —, chacune avec son App ID, sa clé
// et « save ».
import { LARGEURS, OUVRIR } from "./reglages-commun.ts";
import { donneesDesApps } from "./reglages-apps-github-commun.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  dit: "Les GitHub Apps de la station de ce Mac, dans Settings : où restent les clés, et une ligne par rôle — le cook configuré, la pass et le manager non",
  ...LARGEURS.mac,
  hauteur: 1400,
  etapes: OUVRIR,
  donnees: () => donneesDesApps(),
};
