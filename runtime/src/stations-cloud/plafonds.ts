// Les plafonds d'un projet pour ses stations cloud (#2228, épique #2223) :
// combien à la fois, combien d'heures par jour, combien par mois. C'est le
// compte de l'utilisateur chez l'hôte qui paie : rien ne démarre tant qu'il n'a
// pas posé au moins un plafond. Un plafond absent ne borne rien ; les autres
// bornent seuls.
//
// `peutDemarrer` répond, avant chaque démarrage, si une station de plus peut
// partir, et sinon quel plafond la retient. Quand plusieurs la retiennent, il
// nomme celui qui la retiendra le plus longtemps — le mois, puis le jour, puis
// les stations à la fois — : c'est lui qu'il faut lever pour qu'elle parte. Il
// ne lit que ce qu'on lui donne : l'usage se compte ailleurs, sur les stations
// de l'hôte (`fournisseur.ts`). Les raisons sont en anglais : c'est l'app qui
// les montre. Sans E/S.

export type Plafonds = {
  aLaFois?: number;
  heuresParJour?: number;
  heuresParMois?: number;
};

// L'usage du projet jusqu'ici : les stations qui tournent, et les heures déjà
// consommées ce jour et ce mois — celles des stations en cours comprises.
export type Usage = {
  enCours: number;
  heuresDuJour: number;
  heuresDuMois: number;
};

export type Plafond = "aucun" | "a-la-fois" | "par-jour" | "par-mois";

export type Verdict = { peut: true } | { peut: false; plafond: Plafond; raison: string };

const valide = (valeur: number) => Number.isFinite(valeur) && valeur >= 0;
const heures = (valeur: number) => `${Number(valeur.toFixed(2))} h`;

export function peutDemarrer(plafonds: Plafonds, usage: Usage): Verdict {
  const { aLaFois, heuresParJour, heuresParMois } = plafonds;
  if (aLaFois === undefined && heuresParJour === undefined && heuresParMois === undefined) {
    return { peut: false, plafond: "aucun", raison: "No cloud station starts until the project sets a ceiling: stations at once, hours a day or hours a month." };
  }
  if (heuresParMois !== undefined) {
    if (!valide(heuresParMois)) return { peut: false, plafond: "par-mois", raison: `The monthly ceiling (${heuresParMois}) is not a number of hours: no cloud station starts.` };
    if (usage.heuresDuMois >= heuresParMois) return { peut: false, plafond: "par-mois", raison: `This month's ${heures(heuresParMois)} of cloud stations are used (${heures(usage.heuresDuMois)}).` };
  }
  if (heuresParJour !== undefined) {
    if (!valide(heuresParJour)) return { peut: false, plafond: "par-jour", raison: `The daily ceiling (${heuresParJour}) is not a number of hours: no cloud station starts.` };
    if (usage.heuresDuJour >= heuresParJour) return { peut: false, plafond: "par-jour", raison: `Today's ${heures(heuresParJour)} of cloud stations are used (${heures(usage.heuresDuJour)}).` };
  }
  if (aLaFois !== undefined) {
    if (!valide(aLaFois) || !Number.isInteger(aLaFois)) return { peut: false, plafond: "a-la-fois", raison: `The ceiling of stations at once (${aLaFois}) is not a whole number: no cloud station starts.` };
    if (usage.enCours >= aLaFois) return { peut: false, plafond: "a-la-fois", raison: `${usage.enCours} of ${aLaFois} cloud stations at once are already running.` };
  }
  return { peut: true };
}
