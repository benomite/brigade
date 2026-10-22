// L'interrupteur du projet (#1406) : un seul ON/OFF pour tout le projet, à la
// place de l'interrupteur du manager et du grant `merge`, qu'il fallait trouver
// et basculer un par un avant que rien ne se passe.
//
// - Allumé : les stations prennent les tickets lancés, le manager juge et
//   découpe les issues ouvertes (`managerAllume`), et une livraison verte est
//   mergée — sous le grant `merge`, que l'allumage active sans échéance.
// - Éteint : rien de neuf n'est pris (la station se dit retenue, `off`), jugé,
//   découpé ni mergé (la livraison verte attend, `project-off`). Les cooks en
//   cours finissent ; leurs livraisons sont jugées, puis attendent. Le grant
//   `merge` est révoqué. Rallumé, tout reprend : les livraisons qui attendaient
//   sont mergées.
//
// Allumé par défaut : le runtime le pose à son démarrage sur un journal qui ne
// le dit pas encore (`etablirLInterrupteur`). Un projet qui n'avait jamais
// touché aux anciens interrupteurs — tout projet ajouté depuis l'app — part
// allumé ; un projet d'avant garde ce qu'il faisait : allumé dès que le manager
// ou le grant `merge` l'était, éteint si aucun des deux ne l'était.
//
// Les commandes `grant` restent : le grant `merge` se prolonge, se borne ou se
// révoque à la main ; l'interrupteur, lui, ne regarde que lui-même.
import type { Fait } from "./evenements.ts";
import { constaterExtinction } from "./grant.ts";
import type { Journal } from "./journal.ts";
import { etatDuManager } from "./projections/manager.ts";
import { etatDuGrant } from "./projections/pass.ts";
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
  if (etat === null) return "NOT SET — the runtime sets it at its next start: on, unless both the manager and the `merge` grant were off";
  const depuis = `since ${etat.since} (by ${etat.by}${etat.cause === "default" ? ", on by default" : etat.cause === "carried-over" ? ", carried over from the manager and the `merge` grant" : ""})`;
  return etat.on ? `ON ${depuis} — ${CE_QUE_FAIT_ALLUME}` : `OFF ${depuis} — ${CE_QUE_FAIT_ETEINT}`;
}

const projetDuJournal = (journal: Journal) => journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;

export class InterrupteurRefuse extends Error {}

// Écrit la commande du chef si elle change quelque chose, et dit ce qu'il en
// est. Vérifier et écrire tiennent dans une seule transaction : l'interrupteur
// et le grant `merge` basculent ensemble.
export function commanderInterrupteur(journal: Journal, commande: "on" | "off", maintenant: Date): string {
  const { base } = journal;
  return base.transaction(() => {
    const projet = projetDuJournal(journal);
    if (!projet) throw new InterrupteurRefuse("empty log: the runtime has never started on this state directory");
    const etat = etatDeLInterrupteur(base);
    const absent = sessionEnCours(base) ? "" : " (no runtime is running: the command will take effect at its next start)";
    const ajouter = (fait: Fait) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR, ...fait });
    // Un grant échu que le journal ne dit pas encore éteint y est d'abord écrit éteint.
    constaterExtinction(journal, projet, AUTEUR_DU_DEMARRAGE, "merge", maintenant);
    const grant = etatDuGrant(base, "merge", maintenant);

    if (commande === "on") {
      if (etat?.on) return `project already on since ${etat.since}`;
      ajouter({ type: "project.switched-on", payload: {} });
      if (!grant?.active) ajouter({ type: "grant.activated", payload: { action: "merge" } });
      return `project on: ${CE_QUE_FAIT_ALLUME}. The deliveries that were waiting are merged; an issue carrying \`blocked-on-human\` or \`hors-cuisine\` is never judged${absent}`;
    }
    if (etat?.on === false) return `nothing to switch off: the project is off since ${etat.since}`;
    ajouter({ type: "project.switched-off", payload: {} });
    if (grant?.active) ajouter({ type: "grant.revoked", payload: { action: "merge" } });
    return `project off: ${CE_QUE_FAIT_ETEINT}. What the manager set stays set; switch it on again and everything resumes${absent}`;
  });
}

// Pose l'interrupteur au démarrage du runtime, sur un journal qui ne le dit pas
// encore, et rend ce qu'il faut en dire — rien s'il était déjà posé. Allumé, le
// grant `merge` est activé s'il ne l'est pas : allumé veut dire « mergé ».
export function etablirLInterrupteur(journal: Journal, projet: string, maintenant: Date): string | null {
  const { base } = journal;
  return base.transaction(() => {
    if (etatDeLInterrupteur(base) !== null) return null;
    constaterExtinction(journal, projet, AUTEUR_DU_DEMARRAGE, "merge", maintenant);
    const manager = etatDuManager(base);
    const grant = etatDuGrant(base, "merge", maintenant);
    const touche = manager !== null || grant !== null;
    const on = !touche || manager?.active === true || grant?.active === true;
    const cause = touche ? "carried-over" : "default";
    const noter = (fait: Fait) => journal.ajouter({ project: projet, ticket: null, author: AUTEUR_DU_DEMARRAGE, ...fait });
    noter({ type: on ? "project.switched-on" : "project.switched-off", payload: { cause } });
    if (on && !grant?.active) noter({ type: "grant.activated", payload: { action: "merge" } });
    if (!touche) return `brigade : interrupteur du projet allumé par défaut — ${CE_QUE_FAIT_ALLUME}`;
    return on
      ? `brigade : interrupteur du projet allumé — repris de l'ancien réglage (manager ${manager?.active ? "allumé" : "éteint"}, grant \`merge\` ${grant?.active ? "actif" : "inactif"})`
      : "brigade : interrupteur du projet éteint — repris de l'ancien réglage (manager et grant `merge` éteints tous les deux) : `switch on` le rallume";
  });
}
