// Pourquoi une station installée ne cuit pas encore, en quelques mots, et le bouton qui y remédie (#1758) : une
// pastille grise ne reste jamais sans explication. Chaque raison a une clé ; sa phrase tient sur la ligne, son
// bouton est un geste que l'app fait — relire GitHub, ouvrir la page de la station, ouvrir l'ajout d'un projet —,
// et ce que le chef fait ailleurs (démarrer Brigade sur l'autre ordinateur) se lit au survol.
// Hors ligne, illisible, sans projet : c'est l'app qui les lit sur la station. Une station ajoutée à un projet mais
// pas atteinte, c'est la principale du projet qui le dit, avec son geste (l'ancien runtime/src/projets/secondaires.ts,
// retiré par #2713 : aucun runtime ne le publie plus).
export type ActionOfReason = "relire" | "ouvrir-la-page" | "ajouter-un-projet";
export type ReasonOfStation = { cle: "hors-ligne" | "illisible" | "sans-projet"; phrase: string; survol: string; bouton: { libelle: string; geste: ActionOfReason } };

export const REASONS = {
  "hors-ligne": (name: string): Omit<ReasonOfStation, "cle"> => ({ phrase: "not reached", survol: `start Brigade on ${name}'s computer: this line turns green when it signs again`, bouton: { libelle: "check again", geste: "relire" } }),
  illisible: (name: string): Omit<ReasonOfStation, "cle"> => ({ phrase: "cannot be read", survol: `remove ${name} from its page, then pair it again with a new code`, bouton: { libelle: "open its page", geste: "ouvrir-la-page" } }),
  "sans-projet": (name: string): Omit<ReasonOfStation, "cle"> => ({ phrase: "not added to any project", survol: `add a project to ${name}: it cooks nothing until then`, bouton: { libelle: "add a project", geste: "ajouter-un-projet" } }),
} as const satisfies Record<ReasonOfStation["cle"], (name: string) => Omit<ReasonOfStation, "cle">>;

export const reasonOf = (key: ReasonOfStation["cle"], name: string): ReasonOfStation => ({ cle: key, ...REASONS[key](name) });
