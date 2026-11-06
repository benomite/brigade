// `benomite/parade` choisi, vérifié prêt pour brigade (#2627) : la phrase, et le parcours continue sans geste de plus.
import { ajoutDuDepot } from "./ajout-projet-depot-commun.ts";

export const ecran = ajoutDuDepot("« add a project », benomite/parade choisi et prêt pour brigade : la phrase, et l'ajout part (#2627)", [], {
  checkRepoSetup: { ready: true, missingBindings: [], missingLabels: [] },
});
