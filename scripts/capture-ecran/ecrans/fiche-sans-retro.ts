// La fiche d'un ticket servi sans rétro (#1038) : la même fiche que `fiche-retro`, #9, mais la box
// ne lui connaît aucune rétro — `retro` nulle dans `pass 9 --json` : une phrase le dit.
import { histoireDe } from "../../../app/src/histoire.ts";
import type { Ecran } from "./commun.ts";
import { ecran as avecRetro, PASS } from "./fiche-retro.ts";

export const ecran: Ecran = {
  ...avecRetro,
  dit: "La fiche de #9, servi, quand la box ne lui connaît aucune rétro : à la place des leçons, la phrase qui le dit",
  donnees: () => {
    const donnees = avecRetro.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, lireHistoire: histoireDe(JSON.stringify({ ...PASS, retro: null })) } };
  },
};
