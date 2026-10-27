// Ce que fait, dans un test, une station distante qui parle à la box : écrire sa
// demande au journal du projet (`remote.asked`) et y attendre la réponse du
// runtime (`distantes.ts`). Les stations réelles passent par GitHub
// (`tirer-par-github/`) ; ce chemin direct ne sert qu'à jouer la demande.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { Demande, Reponse } from "../../src/events/remote.ts";
import { cheminJournal, ouvrirJournal } from "../../src/journal.ts";
import { sessionEnCours } from "../../src/projections/sessions.ts";
import { NOM_DE_STATION } from "../../src/stations-declarees.ts";

// Ce que le geste attend la réponse du runtime : un peu plus que le délai
// passé lequel le runtime ne répond plus à une demande (`DELAI_DE_REPONSE_MS`).
export const ATTENTE_MS = 30_000;
const PAS_MS = 100;
const MESSAGE_MAX = 20_000;
const RAISON_MAX = 200;

// La demande n'a pas pu être faite, ou n'a pas reçu de réponse : rien n'est à
// supposer de ce que la box en a fait.
export class SansReponse extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SansReponse";
  }
}

export type OptionsDeDemande = {
  maintenant?: () => Date;
  // Combien de temps la réponse est attendue, et à quel pas le journal est relu.
  attenteMs?: number;
  pasMs?: number;
};

// Écrit la demande de la station au journal du projet, et rend la réponse du
// runtime. Lève `SansReponse` si aucun runtime ne tourne sur ce répertoire
// d'état, ou s'il n'a pas répondu à temps.
export async function demander(repertoireEtat: string, station: string, demande: Demande, options: OptionsDeDemande = {}): Promise<Reponse> {
  if (!NOM_DE_STATION.test(station)) throw new SansReponse(`“${station}” is not a station name — expected \`<machine>/<engine>\`, as the project declares it (mac/claude)`);
  // Le geste ouvre le journal en écriture : sans ce contrôle, il en créerait
  // un là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) throw new SansReponse(`no log in ${repertoireEtat}: the runtime has never started on this state directory`);
  const journal = ouvrirJournal(repertoireEtat, { maintenant: options.maintenant });
  try {
    const { base } = journal;
    const id = randomUUID();
    const ecrite = base.transaction(() => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) throw new SansReponse("empty log: the runtime has never started on this state directory");
      // Sans runtime, personne ne répondrait : la demande n'est pas écrite.
      if (!sessionEnCours(base)) throw new SansReponse("no runtime is running for this project: nobody would answer the station — start it, then ask again");
      // Le dernier message d'un cook est gardé comme celui d'un cook de la box :
      // borné. Une empreinte et un motif sont courts.
      const ecrire =
        demande.verb === "deliver"
          ? { ...demande, message: demande.message?.slice(0, MESSAGE_MAX) ?? null, reason: demande.reason?.slice(0, RAISON_MAX) ?? null }
          : demande.verb === "renew"
            ? { ...demande, proof: demande.proof?.slice(0, RAISON_MAX) ?? null }
            : demande;
      return journal.ajouter({ project: projet, ticket: null, author: `station:${station}`, type: "remote.asked", payload: { id, station, ...ecrire } });
    });
    const depuis = ecrite?.seq ?? journal.dernierSeq();
    const echeance = performance.now() + (options.attenteMs ?? ATTENTE_MS);
    for (;;) {
      const reponse = journal.depuis(depuis).find((evenement) => evenement.type === "remote.answered" && evenement.payload.id === id);
      if (reponse?.type === "remote.answered") {
        const { id: _id, station: _station, ...rendue } = reponse.payload;
        return rendue as Reponse;
      }
      if (performance.now() >= echeance) throw new SansReponse("the runtime did not answer in time: nothing can be assumed about what it did with the request — ask again");
      await new Promise((resoudre) => setTimeout(resoudre, options.pasMs ?? PAS_MS));
    }
  } finally {
    journal.fermer();
  }
}
