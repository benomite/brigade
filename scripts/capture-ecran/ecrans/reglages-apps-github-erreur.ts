// Les GitHub Apps de la station de ce Mac (#2317) : « save » cliqué sur la ligne de la pass sans App ID, et avec un
// texte qui n'est pas une clé privée. Chaque erreur se dit sous son champ ; rien n'est parti vers la station.
import { LARGEURS } from "./reglages-commun.ts";
import { donneesDesApps, SAISIR } from "./reglages-apps-github-commun.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  dit: "Les GitHub Apps de la station de ce Mac : « save » sur la pass sans App ID et sans clé PEM — une erreur sous chaque champ, rien d'écrit",
  ...LARGEURS.mac,
  hauteur: 1400,
  etapes: SAISIR("pass", " ", "my key"),
  donnees: () => donneesDesApps(),
};
