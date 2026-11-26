// The autonomy policy on the runtime's tick (#4380): main.ts branches it, with the quality figures as qualite.ts reads
// them and the chef's wake-up. The policy itself is politique.ts.
import { appliquerLaPolitique, type ChiffresDeQualite } from "./politique.ts";
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

// The policy on the runtime's tick, once an hour at most. A read or a file that fails is said; the runtime goes on.
export function politiqueDuRuntime(runtime: Pick<Runtime, "projet" | "repertoireEtat" | "surReveil">, { lire, reveillerLeChef, horloge = () => new Date(), avertir = (texte) => console.error(texte) }: OptionsDuRuntime): void {
  const repertoire = runtime.repertoireEtat;
  if (repertoire === undefined) return;
  let dernier = -Infinity;
  let enCours = false;
  runtime.surReveil((cause) => {
    const maintenant = horloge().getTime();
    if (cause !== "tick" || enCours || maintenant - dernier < INTERVALLE_MS) return;
    dernier = maintenant;
    enCours = true;
    void lire()
      .then((chiffres) => appliquerLaPolitique({ repertoire, projet: runtime.projet, chiffres, horloge, reveillerLeChef }))
      .catch((erreur: unknown) => avertir(`brigade : the autonomy policy moved nothing — ${erreur instanceof Error ? erreur.message : String(erreur)}`))
      .finally(() => (enCours = false));
  });
}
