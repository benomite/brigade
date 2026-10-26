// Le closer de « parade », sur son onglet Cooks (#993), la dérive ayant franchi son seuil : ce que `closing --json` en
// dit (`drift`, runtime/src/fermeture-lecture/lecture.ts) — la proposition, en tête de la place du
// lancement, qui mène à la confirmation sans rien demander. Mêmes chiffres que closer.ts.
import { COOKS, ecran as closer, lu, OBSERVEE } from "./closer.ts";
import type { Ecran } from "./commun.ts";

const DERIVE = { declared: true, crossed: true, crossings: [{ measure: "ratio", observed: 3.2, limit: 3, text: "added / removed over the last 100 merges: 3.2 for a threshold of 3" }] };

export const ecran: Ecran = {
  ...closer,
  dit: "Le closer de « parade », sur son onglet Cooks, la dérive a franchi son seuil : la proposition de nettoyage, et le bouton qui mène à la confirmation",
  donnees: () => {
    const donnees = closer.donnees();
    return { ...donnees, envois: { ...donnees.envois, onglet: { [COOKS]: [lu({ ...OBSERVEE, drift: DERIVE })] } } };
  },
};
