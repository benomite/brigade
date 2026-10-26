// Pourquoi une station installée ne cuit pas encore, en quelques mots, et le bouton qui y remédie (#1758) : une
// pastille grise ne reste jamais sans explication. Chaque raison a une clé ; sa phrase tient sur la ligne, son
// bouton est un geste que l'app fait — relire GitHub, ouvrir la page de la station, ouvrir l'ajout d'un projet —,
// et ce que le chef fait ailleurs (démarrer Brigade sur l'autre ordinateur) se lit au survol.
// Hors ligne, illisible, sans projet : c'est l'app qui les lit sur la station. Une station ajoutée à un projet mais
// pas atteinte, c'est la principale du projet qui le dit, avec son geste (runtime/src/projets/secondaires.ts).
export type GesteDeRaison = "relire" | "ouvrir-la-page" | "ajouter-un-projet";
export type RaisonDeStation = { cle: "hors-ligne" | "illisible" | "sans-projet"; phrase: string; survol: string; bouton: { libelle: string; geste: GesteDeRaison } };

export const RAISONS = {
  "hors-ligne": (nom: string): Omit<RaisonDeStation, "cle"> => ({ phrase: "not reached", survol: `start Brigade on ${nom}'s computer: this line turns green when it signs again`, bouton: { libelle: "check again", geste: "relire" } }),
  illisible: (nom: string): Omit<RaisonDeStation, "cle"> => ({ phrase: "cannot be read", survol: `remove ${nom} from its page, then pair it again with a new code`, bouton: { libelle: "open its page", geste: "ouvrir-la-page" } }),
  "sans-projet": (nom: string): Omit<RaisonDeStation, "cle"> => ({ phrase: "not added to any project", survol: `add a project to ${nom}: it cooks nothing until then`, bouton: { libelle: "add a project", geste: "ajouter-un-projet" } }),
} as const satisfies Record<RaisonDeStation["cle"], (nom: string) => Omit<RaisonDeStation, "cle">>;

export const raisonDe = (cle: RaisonDeStation["cle"], nom: string): RaisonDeStation => ({ cle, ...RAISONS[cle](nom) });
