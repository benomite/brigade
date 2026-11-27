// Lever le refus d'un projet depuis sa page (#1205, épique #1202) : le chef clique sur le bouton que le
// refus publie (`remedy`, demande.ts), et la station du projet joue le remède elle-même, par son point
// d'entrée (runtime/src/remedes/executer.ts). L'app ne connaît aucun remède : elle renvoie l'identifiant
// que la station a publié, et dit ce que la station en répond.
//
// La demande passe par le gist de la station — le seul canal entre elles —, que la station soit
// l'ordinateur du chef ou une station distante : c'est l'opération du runtime qui l'écrit, attend la
// réponse et retire la demande (runtime/src/remedes/distant.ts, `demanderLeRemede`). L'app ne lui
// donne que son canal : les gists, lus et écrits par le `gh` du poste (stations/github.ts).
import type { Canal } from "../../../runtime/src/appairage/canal.ts";
import type { DemandeDeRemede, IssueDuRemede as IssueDuRuntime } from "../../../runtime/src/remedes/executer.ts";
import type { GitHubDesStations } from "../stations/github.ts";

export type { DemandeDeRemede };
// L'opération du runtime : demander le remède à la station de ce gist, attendre sa réponse.
export type DemanderLeRemede = (options: { canal: Canal; gist: string; demande: DemandeDeRemede }) => Promise<IssueDuRuntime>;

// Ce que la page en dit : levé, ou il tient — avec pourquoi, en une phrase —, ou rien n'a été fait.
export type IssueDuRemede = { outcome: "lifted" } | { outcome: "holds"; reason: string } | { outcome: "error"; error: string };

// Ce que `stations/github.ts` dit d'un gist disparu, à l'écriture.
const GIST_DISPARU = /no longer on GitHub/;

// Les gists des stations, sous la forme du canal du runtime. L'app n'en crée aucun.
export function canalDesGists(github: GitHubDesStations): Canal {
  return {
    creer: () => Promise.reject(new Error("the app creates no station gist")),
    lire: (id) => github.lire(id),
    async ecrire(id, fichiers) {
      try {
        await github.ecrire(id, fichiers);
        return "ecrit";
      } catch (erreur) {
        if (erreur instanceof Error && GIST_DISPARU.test(erreur.message)) return "absent";
        throw erreur;
      }
    },
  };
}

// L'issue du runtime, pour la page : le refus tel qu'il est maintenant, la page le relit dans le suivi.
export function pourLaPage(issue: IssueDuRuntime): IssueDuRemede {
  if (issue.outcome === "lifted") return { outcome: "lifted" };
  if (issue.outcome === "holds") return { outcome: "holds", reason: issue.reason };
  return { outcome: "error", error: issue.error };
}
