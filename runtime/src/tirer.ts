// Le geste d'une station distante : le seul point par lequel elle parle à la
// box. Elle ne tourne pas sur la machine du runtime — c'est le poste du chef —
// et la box n'a aucun chemin vers elle : c'est donc elle qui vient, par le
// geste de la box (`ssh <hote> brigade <projet> pull <station> …`), s'annoncer,
// réclamer un ticket, renouveler son bail et le rendre.
//
// Ce module tourne dans le process de ce geste, sur la box. Il n'ouvre aucune
// connexion et ne décide de rien : il écrit la demande au journal du projet,
// et y attend la réponse du runtime qui tourne (`distantes.ts`). Toutes les
// règles — bornes, bail, plafonds, pass — sont appliquées par le runtime.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { Demande, Reponse } from "./evenements/distante.ts";
import { cheminJournal, ouvrirJournal } from "./journal.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import { NOM_DE_STATION } from "./stations-declarees.ts";

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
  if (!NOM_DE_STATION.test(station)) throw new SansReponse(`« ${station} » n'est pas un nom de station — attendu \`<machine>/<moteur>\`, tel que le projet la déclare (mac/claude)`);
  // Le geste ouvre le journal en écriture : sans ce contrôle, il en créerait
  // un là où il n'y en a pas.
  if (!existsSync(cheminJournal(repertoireEtat))) throw new SansReponse(`aucun journal dans ${repertoireEtat} : le runtime n'a jamais démarré sur ce répertoire d'état`);
  const journal = ouvrirJournal(repertoireEtat, { maintenant: options.maintenant });
  try {
    const { base } = journal;
    const id = randomUUID();
    const ecrite = base.transaction(() => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) throw new SansReponse("journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
      // Sans runtime, personne ne répondrait : la demande n'est pas écrite.
      if (!sessionEnCours(base)) throw new SansReponse("aucun runtime ne tourne pour ce projet : personne ne répondrait à la station — le démarrer, puis redemander");
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
      if (performance.now() >= echeance) throw new SansReponse("le runtime n'a pas répondu à temps : rien n'est à supposer de ce qu'il a fait de la demande — redemander");
      await new Promise((resoudre) => setTimeout(resoudre, options.pasMs ?? PAS_MS));
    }
  } finally {
    journal.fermer();
  }
}
