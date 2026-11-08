// L'interrupteur du projet (#1406) : un seul ON/OFF pour tout le projet, à la
// place de l'interrupteur du manager et de l'ancien grant `merge`, qu'il fallait
// trouver et basculer un par un avant que rien ne se passe.
//
// - Allumé : les stations prennent les tickets lancés, le manager juge et
//   découpe les issues ouvertes (`managerAllume`), et une livraison verte est
//   mergée.
// - Éteint : rien de neuf n'est pris (la station se dit retenue, `off`), jugé,
//   découpé ni mergé (la livraison verte attend, `project-off`). Les cooks en
//   cours finissent ; leurs livraisons sont jugées, puis attendent. Rallumé, tout reprend : les livraisons qui attendaient
//   sont mergées.
//
// Allumé par défaut : le runtime le pose à son démarrage sur un journal qui ne
// le dit pas encore (`etablirLInterrupteur`). Un projet qui n'avait jamais
// touché aux anciens interrupteurs — tout projet ajouté depuis l'app — part
// allumé ; un projet d'avant part allumé lui aussi, quels qu'aient été ses
// anciens interrupteurs : ses stations prenaient les tickets lancés sans
// regarder le manager, il cuisinait, et il continue.
import type { Fait } from "./evenements.ts";
import type { Journal } from "./journal.ts";
import { etatDuManager } from "./projections/manager.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import { etatDeLInterrupteur, type EtatInterrupteur } from "./projections/switch.ts";

const AUTEUR = "chef";
const AUTEUR_DU_DEMARRAGE = "runtime";

// Ce que chaque position fait, dans les mots que `switch`, `status` et `manager` emploient.
export const CE_QUE_FAIT_ALLUME = "fired tickets are taken, the manager judges and splits the open issues, a green delivery is merged";
export const CE_QUE_FAIT_ETEINT = "nothing new is taken, judged, split or merged — running cooks finish, their deliveries are judged and wait";

// La ligne de l'interrupteur, pour `switch` et `status`. L'app la relit
// (app/src/alertes.ts, `INTERRUPTEUR`) : tout changement de forme se répercute là-bas.
export function direInterrupteur(etat: EtatInterrupteur | null): string {
  if (etat === null) return "NOT SET — the runtime sets it at its next start, on";
  const depuis = `since ${etat.since} (by ${etat.by}${etat.cause === "default" ? ", on by default" : etat.cause === "carried-over" ? ", in place of the manager's switch" : ""})`;
  return etat.on ? `ON ${depuis} — ${CE_QUE_FAIT_ALLUME}` : `OFF ${depuis} — ${CE_QUE_FAIT_ETEINT}`;
}

const projetDuJournal = (journal: Journal) => journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;

export class InterrupteurRefuse extends Error {}

// Écrit la commande du chef si elle change quelque chose, et dit ce qu'il en
// est. Vérifier et écrire tiennent dans une seule transaction : un seul fait s'écrit.
export function commanderInterrupteur(journal: Journal, commande: "on" | "off"): string {
  const { base } = journal;
  return base.transaction(() => {
    const projet = projetDuJournal(journal);
    if (!projet) throw new InterrupteurRefuse("empty log: the runtime has never started on this state directory");
    const etat = etatDeLInterrupteur(base);
    const absent = sessionEnCours(base) ? "" : " (no runtime is running: the command will take effect at its next start)";
    const ajouter = (fait: Fait) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
    if (commande === "on") {
      if (etat?.on) return `project already on since ${etat.since}`;
      ajouter({ type: "project.switched-on", payload: {} });
      return `project on: ${CE_QUE_FAIT_ALLUME}. The deliveries that were waiting are merged; an issue carrying \`blocked-on-human\` or \`hors-cuisine\` is never judged${absent}`;
    }
    if (etat?.on === false) return `nothing to switch off: the project is off since ${etat.since}`;
    ajouter({ type: "project.switched-off", payload: {} });
    return `project off: ${CE_QUE_FAIT_ETEINT}. What the manager set stays set; switch it on again and everything resumes${absent}`;
  });
}

// Pose l'interrupteur au démarrage du runtime, sur un journal qui ne le dit pas
// encore, et rend ce qu'il faut en dire — rien s'il était déjà posé.
export function etablirLInterrupteur(journal: Journal, projet: string): string | null {
  const { base } = journal;
  return base.transaction(() => {
    if (etatDeLInterrupteur(base) !== null) return null;
    const manager = etatDuManager(base);
    // Toujours allumé : un projet d'avant cuisinait, quel qu'ait été le
    // manager — `carried-over` dit seulement d'où il vient.
    const touche = manager !== null;
    const cause = touche ? "carried-over" : "default";
    const noter = (fait: Fait) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR_DU_DEMARRAGE, ...fait });
    noter({ type: "project.switched-on", payload: { cause } });
    if (!touche) return `brigade : interrupteur du projet allumé par défaut — ${CE_QUE_FAIT_ALLUME}`;
    return `brigade : interrupteur du projet allumé — il remplace l'ancien réglage (manager ${manager?.active ? "allumé" : "éteint"}) : un projet d'avant continue de cuisiner, \`switch off\` l'éteint`;
  });
}
