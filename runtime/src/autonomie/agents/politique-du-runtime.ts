// The autonomy policy on the runtime's tick (#4380): the station's kitchen (station/cuisine.ts) and main.ts branch it,
// with the quality figures as qualite.ts reads them and the chef's wake-up in the journal. The policy itself is politique.ts.
import { appliquerLaPolitique, type ChiffresDeQualite } from "./politique.ts";
import { lireLaQualite, type SourcesDeLaQualite } from "./qualite.ts";
import { notifierAuJournal } from "../../journal-du-jour/publication.ts";
import type { Runtime } from "../../runtime.ts";

// Runs again at most once per this delay: the quality figures are read from git and GitHub.
const INTERVALLE_MS = 60 * 60_000;

export type OptionsDuRuntime = {
  // The quality figures; a read that fails moves nothing, and is said.
  lire: () => Promise<ChiffresDeQualite>;
  reveillerLeChef: (raison: string) => void;
  horloge?: () => Date;
  avertir?: (message: string) => void;
};

// The policy on the runtime's tick, once an hour at most after a run that read its figures; a read or a file that fails
// is said, the runtime goes on, and the next tick tries again.
export function politiqueDuRuntime(runtime: Pick<Runtime, "projet" | "repertoireEtat" | "surReveil">, { lire, reveillerLeChef, horloge = () => new Date(), avertir = (texte) => console.error(texte) }: OptionsDuRuntime): void {
  const repertoire = runtime.repertoireEtat;
  if (repertoire === undefined) return;
  let dernier = -Infinity;
  let enCours = false;
  runtime.surReveil((cause) => {
    const maintenant = horloge().getTime();
    if (cause !== "tick" || enCours || maintenant - dernier < INTERVALLE_MS) return;
    enCours = true;
    void lire()
      .then((chiffres) => {
        dernier = maintenant;
        appliquerLaPolitique({ repertoire, projet: runtime.projet, chiffres, horloge, reveillerLeChef });
      })
      .catch((erreur: unknown) => avertir(`brigade : the autonomy policy moved nothing — ${erreur instanceof Error ? erreur.message : String(erreur)}`))
      .finally(() => (enCours = false));
  });
}

// The policy of a kitchen: its figures read from the project's clone and GitHub, a demotion written to the journal as
// the chef's notification (`chef.notified`), which the project view shows.
export function brancherLaPolitique(runtime: Pick<Runtime, "projet" | "repertoireEtat" | "surReveil" | "journal">, sources: SourcesDeLaQualite, avertir: (message: string) => void): void {
  const notifier = notifierAuJournal(runtime.journal, runtime.projet);
  politiqueDuRuntime(runtime, {
    lire: () => lireLaQualite(sources, new Date()),
    reveillerLeChef: (raison) => notifier({ title: "An agent's autonomy went back a step", at: new Date().toISOString(), line: raison, reason: raison }),
    avertir,
  });
}
