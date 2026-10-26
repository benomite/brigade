// Le closer de « parade », sur son onglet Cooks (#991), la demande de nettoyage en cours : ce que
// `closing --json` en dit (`request`, runtime/src/fermeture-lecture/lecture.ts). Mêmes chiffres que closer.ts.
import { COOKS, ecran as closer, lu, OBSERVEE } from "./closer.ts";
import type { Ecran } from "./commun.ts";

const DEMANDE = { state: "running", run: "closing-20261013-1001", since: "2026-10-13T10:01:00.000Z", base: "48638df", zone: ["app/src", "runtime/src"], candidates: 8 };

export const ecran: Ecran = {
  ...closer,
  dit: "Le closer de « parade », sur son onglet Cooks, en cours : partie, elle ne s'annule plus",
  donnees: () => {
    const donnees = closer.donnees();
    return { ...donnees, envois: { ...donnees.envois, onglet: { [COOKS]: [lu({ ...OBSERVEE, request: DEMANDE })] } } };
  },
};
