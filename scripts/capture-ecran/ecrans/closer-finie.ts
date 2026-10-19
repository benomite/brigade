// Settings → Closer de « parade » (#991), la dernière passe de nettoyage finie : ce que
// `closing --json` en dit (`request`, runtime/src/fermeture-lecture/lecture.ts). Mêmes chiffres que closer.ts.
import { ecran as closer, lu, OBSERVEE } from "./closer.ts";
import type { Ecran } from "./commun.ts";

const DEMANDE = { state: "done", run: "closing-20261013-0901", at: "2026-10-13T09:40:00.000Z", outcome: "delivered", delivered: true, pr: "https://github.com/benomite/parade/pull/77", removed: [], removedLines: 140, addedLines: 3, files: ["app/src/main.ts"], kept: [], text: "delivered: 140 lines removed in 1 file, 0 candidates left for lack of certainty — https://github.com/benomite/parade/pull/77, handed to the pass" };

export const ecran: Ecran = {
  ...closer,
  dit: "Settings → Closer de « parade », la dernière passe finie — son bilan vient avec #992 — et le bouton qui relance",
  donnees: () => {
    const donnees = closer.donnees();
    return { ...donnees, envois: { ...donnees.envois, onglet: { "parade/closer": [lu({ ...OBSERVEE, request: DEMANDE })] } } };
  },
};
