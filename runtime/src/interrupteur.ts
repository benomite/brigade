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
// Allumé par défaut : tant que le journal ne dit rien, il se lit comme
// non posé. Un projet qui n'avait jamais
// touché aux anciens interrupteurs — tout projet ajouté depuis l'app — part
// allumé ; un projet d'avant part allumé lui aussi, quels qu'aient été ses
// anciens interrupteurs : ses stations prenaient les tickets lancés sans
// regarder le manager, il cuisinait, et il continue.
import type { EtatInterrupteur } from "./projections/switch.ts";

// Ce que chaque position fait, dans les mots que `switch`, `status` et `manager` emploient.
export const CE_QUE_FAIT_ALLUME = "fired tickets are taken, the manager judges and splits the open issues, a green delivery is merged";
export const CE_QUE_FAIT_ETEINT = "nothing new is taken, judged, split or merged — running cooks finish, their deliveries are judged and wait";

// La ligne de l'interrupteur, pour `switch` et `status`. L'app la relit
// (app/src/alerts.ts, `INTERRUPTEUR`) : tout changement de forme se répercute là-bas.
export function direInterrupteur(etat: EtatInterrupteur | null): string {
  if (etat === null) return "NOT SET — the runtime sets it at its next start, on";
  const depuis = `since ${etat.since} (by ${etat.by}${etat.cause === "default" ? ", on by default" : etat.cause === "carried-over" ? ", in place of the manager's switch" : ""})`;
  return etat.on ? `ON ${depuis} — ${CE_QUE_FAIT_ALLUME}` : `OFF ${depuis} — ${CE_QUE_FAIT_ETEINT}`;
}
