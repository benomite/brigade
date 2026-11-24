// Le calendrier branché sur la cuisine (#4138) : à chaque tick, les entrées
// `recurring` de la fiche du projet passent par `ouvrirRecurrences`, avec GitHub.
// Une fiche qui ne se lit pas, ou sans entrée, n'ouvre rien ; une lecture des
// issues qui échoue n'ouvre rien non plus (sans elle, l'issue d'une période
// pourrait s'ouvrir deux fois) : le tick suivant réessaie, et chaque cas se dit
// sur le journal de service.
import type { Runtime } from "../runtime.ts";
import { ouvrirRecurrences } from "./recurrences.ts";

// Le premier instant couvert par les périodes en cours : le plus ancien du début
// du mois et du lundi de la semaine ISO. Les issues d'une période y sont toutes modifiées depuis.
function debutDesPeriodes(instant: Date): string {
  const jour = Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
  const lundi = jour - (((instant.getUTCDay() + 6) % 7) * 86_400_000);
  const mois = Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), 1);
  return new Date(Math.min(lundi, mois)).toISOString();
}

export type OptionsDuCalendrier = {
  // Les entrées de la fiche, relues à chaque passage ; null si la fiche ne se lit pas.
  entrees: () => unknown[] | null;
  github: {
    issuesDepuis(instant: string): Promise<{ number: number; state: "open" | "closed"; title: string; body: string; labels: string[] }[]>;
    creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  };
  avertir: (ligne: string) => void;
  maintenant?: () => Date;
};

// Un passage sur la fiche, avec GitHub ; chaque erreur se dit sur le journal.
async function passerLeCalendrier({ entrees, github, avertir, maintenant = () => new Date() }: OptionsDuCalendrier): Promise<number[]> {
  const brutes = entrees();
  if (brutes === null || brutes.length === 0) return [];
  const instant = maintenant();
  try {
    const { ouverts, erreurs } = await ouvrirRecurrences({
      entrees: brutes,
      maintenant: instant,
      github: {
        listerTickets: async () => (await github.issuesDepuis(debutDesPeriodes(instant))).map((i) => ({ numero: i.number, etat: i.state, titre: i.title, corps: i.body, etiquettes: i.labels })),
        ouvrirTicket: ({ titre, corps, etiquettes }) => github.creerIssue({ titre, corps, labels: etiquettes }),
      },
    });
    for (const erreur of erreurs) avertir(`calendar — ${erreur.message}`);
    for (const numero of ouverts) avertir(`calendar — #${numero} opened`);
    return ouverts;
  } catch (erreur) {
    avertir(`calendar — issues not read, nothing opened: ${(erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0]}`);
    return [];
  }
}

// Le calendrier, à chaque tick du runtime : un passage à la fois. Une ligne déjà dite ne se redit pas à chaque tick.
export function brancherCalendrier<R extends Runtime>(runtime: R, options: OptionsDuCalendrier): R {
  let enCours = false;
  const dites = new Set<string>();
  const avertir = (ligne: string) => {
    if (dites.has(ligne)) return;
    dites.add(ligne);
    options.avertir(ligne);
  };
  runtime.surReveil((cause) => {
    if (cause !== "tick" || enCours) return;
    enCours = true;
    void passerLeCalendrier({ ...options, avertir }).finally(() => {
      enCours = false;
    });
  });
  return runtime;
}
