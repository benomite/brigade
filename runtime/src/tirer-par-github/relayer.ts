// La principale relaie au journal du projet ce que ses stations secondaires
// demandent sur GitHub (`demande.ts`) : elle lit le gist de chacune, et écrit
// chaque demande neuve comme le geste `pull` l'écrirait (`remote.asked`,
// `tirer.ts`), avec `via: "github"`. Le runtime du projet y répond comme à
// toute station distante (`distantes.ts`) : une demande à la fois, sous les
// mêmes règles — c'est ce qui fait qu'un ticket ne part qu'une fois, même
// quand deux stations le réclament au même instant. Sa réponse se publie au
// Kitchen board (`tableau.ts`), où la station la lit.
//
// Rien ici ne joint une station : la principale lit GitHub, et n'écrit qu'au
// journal. Une demande déjà relayée ne l'est plus (sa clé d'unicité au
// journal) ; une demande que plus personne n'attend (`FRAICHEUR_MS`) non plus.
// Sans runtime qui tourne pour le projet, rien n'est écrit — personne ne
// répondrait : la demande reste dans le gist, relayée à la lecture suivante
// tant qu'elle est fraîche.
import { existsSync } from "node:fs";
import type { Fichiers } from "../appairage/canal.ts";
import { cheminJournal, ouvrirJournal } from "../journal.ts";
import { sessionEnCours } from "../projections/sessions.ts";
import { demandesDuGist, FRAICHEUR_MS } from "./demande.ts";

// Une station secondaire du projet : son nom, tel que le projet la déclare, et
// le gist où elle pose ses demandes (`projets/secondaires.ts`).
export type SecondaireARelayer = { station: string; gist: string };

export type OptionsDuRelais = {
  repertoireEtat: string;
  // `<owner>/<repo>` : les demandes d'un autre projet de la station restent dans son gist.
  depot: string;
  secondaires: readonly SecondaireARelayer[];
  // Les fichiers d'un gist, ou null s'il n'existe plus — le canal de la
  // principale (`appairage/canal.ts`), dont une relecture sans changement ne
  // coûte rien.
  lire: (gist: string) => Promise<Fichiers | null>;
  maintenant?: () => number;
};

// `relayees` : ce qui vient d'être écrit au journal. `sansRuntime` : rien ne
// l'a été, aucun runtime ne tourne pour le projet.
export type Relais = { relayees: Array<{ station: string; id: string; verb: string }>; sansRuntime: boolean };

export const cleDuRelais = (station: string, id: string) => `remote.asked:github:${station}:${id}`;

export async function relayerLesDemandes(options: OptionsDuRelais): Promise<Relais> {
  const { repertoireEtat, depot } = options;
  const instant = (options.maintenant ?? Date.now)();
  const lues: Array<{ station: string } & ReturnType<typeof demandesDuGist>[number]> = [];
  for (const { station, gist } of options.secondaires) {
    const fichiers = await options.lire(gist);
    if (fichiers === null) continue;
    for (const posee of demandesDuGist(fichiers, depot)) {
      if (instant - Date.parse(posee.le) <= FRAICHEUR_MS) lues.push({ station, ...posee });
    }
  }
  const relayees: Relais["relayees"] = [];
  if (lues.length === 0) return { relayees, sansRuntime: false };
  // Comme le geste `pull` : il n'ouvre pas de journal là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) return { relayees, sansRuntime: true };
  const journal = ouvrirJournal(repertoireEtat, { maintenant: () => new Date((options.maintenant ?? Date.now)()) });
  try {
    return journal.base.transaction(() => {
      const projet = journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet || !sessionEnCours(journal.base)) return { relayees, sansRuntime: true };
      for (const { station, id, demande } of lues) {
        const ecrite = journal.ajouter({ project: projet, ticket: null, author: `station:${station}`, type: "remote.asked", payload: { id, station, via: "github", ...demande }, dedupKey: cleDuRelais(station, id) });
        if (ecrite !== null) relayees.push({ station, id, verb: demande.verb });
      }
      return { relayees, sansRuntime: false };
    });
  } finally {
    journal.fermer();
  }
}
