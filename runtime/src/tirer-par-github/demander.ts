// Le côté de la station secondaire : demander à la principale par GitHub
// seulement, sans ssh vers la box. La station pose sa demande dans son propre
// gist (`demande.ts`), puis lit le Kitchen board du projet jusqu'à y trouver la
// réponse que la principale y publie (`tableau.ts`) — celle même que le geste
// `pull` lui aurait rendue (`tirer.ts`).
//
// Rien ici n'ouvre le journal du projet, ni ne joint la box : la station écrit
// dans un gist et lit une issue, par le `gh` de sa machine (`canal.ts`,
// `tableau/publication/client.ts`). C'est la principale qui lit sa demande, la
// relaie à son journal et décide — elle seule.
import { randomUUID } from "node:crypto";
import type { Canal } from "../appairage/canal.ts";
import type { Reponse } from "../events/remote.ts";
import type { ClientDuTableau } from "../tableau/publication/client.ts";
import { LABEL_DU_TABLEAU } from "../tableau/publication/publier.ts";
import { OUVERTURE_DU_BLOC } from "../tableau/rendu/bloc.ts";
import { FRAICHEUR_MS, poserLaDemande, type DemandeParGitHub } from "./demande.ts";
import { reponseDuTableau } from "./tableau.ts";

// Ce que la station attend sa réponse : le double de ce que la principale
// relaie encore une demande. Une demande relayée a donc toujours sa réponse
// publiée avant que la station ne cesse de l'attendre.
export const ATTENTE_MS = 2 * FRAICHEUR_MS;
// Entre deux lectures du tableau — que la box réécrit au plus une fois par minute.
export const PAS_MS = 30_000;

// La demande n'a pas reçu de réponse au tableau dans l'attente, ou n'a pas pu
// être posée : rien n'est à supposer de ce que la principale en a fait.
export class SansReponseDeGitHub extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SansReponseDeGitHub";
  }
}

export type OptionsDeLaStation = {
  // Son nom, tel que le projet la déclare : `<machine>/claude`.
  station: string;
  // `<owner>/<repo>` du projet.
  depot: string;
  // Son gist d'appairage, où elle pose sa demande, et le canal qui l'écrit.
  gist: string;
  canal: Pick<Canal, "ecrire">;
  // Le corps du Kitchen board du projet, lu sur GitHub ; null tant qu'il n'y en a pas.
  lireLeTableau: () => Promise<string | null>;
  maintenant?: () => number;
  attenteMs?: number;
  pasMs?: number;
  id?: () => string;
};

// Pose la demande, puis attend sa réponse au tableau. Lève `SansReponseDeGitHub`
// si elle n'a pas pu être posée, ou n'a pas eu de réponse à temps.
export async function demanderParGitHub(options: OptionsDeLaStation, demande: DemandeParGitHub): Promise<Reponse> {
  const maintenant = options.maintenant ?? Date.now;
  const id = (options.id ?? randomUUID)();
  const fichiers = poserLaDemande({ id, depot: options.depot, le: new Date(maintenant()).toISOString(), demande });
  if ((await options.canal.ecrire(options.gist, fichiers)) === "absent") throw new SansReponseDeGitHub("the station's gist no longer exists on GitHub: pair the station again in the app, then ask again");
  const echeance = performance.now() + (options.attenteMs ?? ATTENTE_MS);
  let illisible: string | null = null;
  for (;;) {
    const corps = await options.lireLeTableau().catch(() => null);
    const lue = corps === null ? null : reponseDuTableau(corps, options.station, id);
    if (lue !== null && "illisible" in lue) illisible = lue.illisible;
    else if (lue !== null) return lue;
    if (performance.now() >= echeance) {
      throw new SansReponseDeGitHub(`the main station did not answer on the project's Kitchen board in time${illisible === null ? "" : ` (${illisible})`}: nothing can be assumed about what it did with the request — ask again`);
    }
    await new Promise((resoudre) => setTimeout(resoudre, options.pasMs ?? PAS_MS));
  }
}

// Le corps du Kitchen board d'un dépôt, lu par le client du tableau : l'issue
// ouverte au label `kitchen-board` que la box a écrite, la plus ancienne.
export function lecteurDuTableau(client: Pick<ClientDuTableau, "auLabel">): () => Promise<string | null> {
  return async () => {
    const issues = (await client.auLabel(LABEL_DU_TABLEAU)).filter((issue) => issue.ouverte && issue.corps.includes(OUVERTURE_DU_BLOC));
    issues.sort((a, b) => a.numero - b.numero);
    return issues[0]?.corps ?? null;
  };
}
