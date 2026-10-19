// Settings → Closer de « parade » (#991), la demande de nettoyage en attente, et de quoi : ce que
// `closing --json` en dit (`request`, runtime/src/fermeture-lecture/lecture.ts). Mêmes chiffres que closer.ts.
import { ecran as closer, lu, OBSERVEE } from "./closer.ts";
import type { Ecran } from "./commun.ts";

const DEMANDE = { state: "waiting", since: "2026-10-13T09:58:00.000Z", stalledAt: null, reason: { code: "cooks", observed: 3, limit: 1, detail: "4", text: "start condition not met: 3 cooks in flight for a threshold of 1 — the pass leaves when there are fewer than the threshold, or when the rail is empty (it carries 4 unserved tickets)" }, text: "closing pass requested on 2026-10-13T09:58:00.000Z, it waits" };

export const ecran: Ecran = {
  ...closer,
  dit: "Settings → Closer de « parade », en attente, et de quoi : trois cooks en vol pour un seuil d'un — et le bouton qui l'annule",
  donnees: () => {
    const donnees = closer.donnees();
    return { ...donnees, envois: { ...donnees.envois, onglet: { "parade/closer": [lu({ ...OBSERVEE, request: DEMANDE })] } } };
  },
};
