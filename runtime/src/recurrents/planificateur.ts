// Le planificateur des tickets récurrents (#3230), branché sur le tick de la
// cuisine (`station/cuisine.ts`). À chaque tick, pour chaque ticket récurrent
// non suspendu dont `nextDate` est atteinte :
//   - si la dernière issue créée pour lui est encore ouverte, rien n'est créé :
//     l'occurrence précédente n'est pas servie, une seconde la doublerait ;
//   - sinon une issue est créée, son titre et son corps, avec le label `fire` :
//     elle arrive sur le rail comme tout ticket.
// Dans les deux cas, `nextDate` passe à l'occurrence qui suit aujourd'hui : les
// dates manquées ne s'empilent pas.
//
// Une lecture de GitHub ou une création qui échoue ne change rien au ticket
// récurrent : le tick suivant réessaie. Un fichier illisible ne crée rien et
// n'est pas réécrit. Chaque cas se dit sur le journal de service.
import { LABEL, type GitHub } from "../github.ts";
import type { Runtime } from "../runtime.ts";
import { changerUnRecurrent, lireLesRecurrents } from "./recurrents.ts";
import { jourDe, occurrenceApres } from "./rythme.ts";

export type GitHubDesRecurrents = Pick<GitHub, "issue" | "creerIssue">;

export type OptionsDuPlanificateur = {
  repertoireEtat: string;
  github: GitHubDesRecurrents;
  avertir: (ligne: string) => void;
  maintenant?: () => Date;
};

const uneLigne = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0] ?? "";

// Un passage sur les tickets récurrents ; rend les numéros des issues créées.
export async function planifierLesRecurrents({ repertoireEtat, github, avertir, maintenant = () => new Date() }: OptionsDuPlanificateur): Promise<number[]> {
  const aujourdhui = jourDe(maintenant());
  let recurrents;
  try {
    recurrents = lireLesRecurrents(repertoireEtat);
  } catch (erreur) {
    avertir(`recurring tickets — not read, nothing created: ${uneLigne(erreur)}`);
    return [];
  }
  const creees: number[] = [];
  for (const recurrent of recurrents.filter((r) => !r.paused && r.nextDate <= aujourdhui)) {
    const suivante = occurrenceApres(recurrent.rhythm, aujourdhui);
    let creee: number | undefined;
    try {
      const precedente = recurrent.lastIssue === undefined ? null : await github.issue(recurrent.lastIssue);
      if (precedente?.state === "open") avertir(`recurring ticket ${recurrent.id} — #${precedente.number} is still open: none created, next on ${suivante}`);
      else {
        creee = await github.creerIssue({ titre: recurrent.title, corps: recurrent.body, labels: [LABEL] });
        creees.push(creee);
        avertir(`recurring ticket ${recurrent.id} — #${creee} created with \`${LABEL}\`, next on ${suivante}`);
      }
    } catch (erreur) {
      avertir(`recurring ticket ${recurrent.id} — not served this tick, retried on the next: ${uneLigne(erreur)}`);
      continue;
    }
    try {
      // Relu juste avant d'écrire : une pause ou un retrait de la commande pendant l'appel à GitHub tient.
      changerUnRecurrent(repertoireEtat, recurrent.id, (actuel) => ({ ...actuel, nextDate: suivante, ...(creee === undefined ? {} : { lastIssue: creee }) }));
    } catch (erreur) {
      avertir(`recurring ticket ${recurrent.id} — ${creee === undefined ? "next date" : `#${creee}`} not recorded: ${uneLigne(erreur)}`);
    }
  }
  return creees;
}

// Le planificateur, à chaque tick du runtime : un passage à la fois.
export function brancherRecurrents<R extends Runtime>(runtime: R, options: OptionsDuPlanificateur): R {
  let enCours = false;
  runtime.surReveil((cause) => {
    if (cause !== "tick" || enCours) return;
    enCours = true;
    void planifierLesRecurrents(options).finally(() => {
      enCours = false;
    });
  });
  return runtime;
}
