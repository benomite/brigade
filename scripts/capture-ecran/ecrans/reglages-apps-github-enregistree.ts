// Les GitHub Apps de la station de ce Mac (#2317) : l'App de la pass saisie — son ID, sa clé collée — et « save »
// cliqué ; la station l'a rangée. Sa ligne dit `configured`, et le champ de la clé est vide : elle ne se relit plus.
import { LARGEURS } from "./reglages-commun.ts";
import { CLE, donneesDesApps, SAISIR } from "./reglages-apps-github-commun.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  dit: "Les GitHub Apps de la station de ce Mac : l'App de la pass rangée d'un clic sur « save » — configurée, le champ de sa clé vidé",
  ...LARGEURS.mac,
  hauteur: 1400,
  etapes: SAISIR("pass", "1203457", CLE),
  donnees: () => donneesDesApps({ rangerUneApp: { rangee: { role: "pass", id: "1203457" } } }),
};
