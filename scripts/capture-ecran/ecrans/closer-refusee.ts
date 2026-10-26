// Le closer de « parade », sur son onglet Cooks (#991), la dernière demande de nettoyage refusée, et pourquoi : ce que
// `closing --json` en dit (`request`, runtime/src/fermeture-lecture/lecture.ts). Mêmes chiffres que closer.ts.
import { COOKS, ecran as closer, lu, OBSERVEE } from "./closer.ts";
import type { Ecran } from "./commun.ts";

const DEMANDE = { state: "refused", at: "2026-10-12T16:20:00.000Z", reason: { code: "cooks", observed: 2, limit: 1, detail: "6", text: "start condition not met: 2 cooks in flight for a threshold of 1 — the pass leaves when there are fewer than the threshold, or when the rail is empty (it carries 6 unserved tickets)" }, text: "start condition not met" };

export const ecran: Ecran = {
  ...closer,
  dit: "Le closer de « parade », sur son onglet Cooks, la dernière demande refusée, et pourquoi — et le bouton qui relance",
  donnees: () => {
    const donnees = closer.donnees();
    return { ...donnees, envois: { ...donnees.envois, onglet: { [COOKS]: [lu({ ...OBSERVEE, request: DEMANDE })] } } };
  },
};
