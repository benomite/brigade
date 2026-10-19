// Les corrections proposées, dans la forme qu'une carte de la file du projet
// dessine : la cause, les tickets concernés — chacun avec l'adresse de son
// issue —, le diff, et ce que la proposition a coûté. C'est `facts` qui les
// porte (`facts.ts`) : l'app n'y déduit rien.
//
// Seule une `correction.proposed` en fait une, et seulement si son diff, relu
// ici, ne touche que les consignes du projet (`portee.ts`) : une proposition
// écartée n'a pas de carte, et n'en aura jamais.
import { DEPOT_GITHUB } from "../etat.ts";
import type { Log } from "../log.ts";
import { lireDiff } from "./portee.ts";

// `proposition` : le fait qui la porte, par son `seq` — ce que le « oui » ou le
// « non » du chef nommera. `url` : l'issue du ticket, nulle quand la box ne
// connaît pas son dépôt. `motif` : pourquoi cette correction, nul si le modèle
// n'en a rien dit. `base` : le commit sur lequel le diff s'applique.
// `cout.tokens` : les tokens du lancement qui l'a écrite.
export type CarteDeCorrection = {
  proposition: number;
  cause: string;
  titre: string;
  tickets: Array<{ ticket: number; url: string | null }>;
  motif: string | null;
  diff: string;
  fichiers: string[];
  base: string;
  cout: { tokens: number };
  proposee: string;
};

// Les corrections proposées, la plus ancienne d'abord.
export function cartesDeCorrection(log: Log, depot?: string): CarteDeCorrection[] {
  const adresse = (ticket: number) => (depot !== undefined && DEPOT_GITHUB.test(depot) ? `https://github.com/${depot}/issues/${ticket}` : null);
  return log.duType("correction.proposed", Number.MAX_SAFE_INTEGER).flatMap(({ seq, at, payload }) => {
    if ("refus" in lireDiff(payload.diff)) return [];
    return [
      {
        proposition: seq,
        cause: payload.cause,
        titre: payload.title,
        tickets: payload.tickets.map((ticket) => ({ ticket, url: adresse(ticket) })),
        motif: payload.reason,
        diff: payload.diff,
        fichiers: payload.files,
        base: payload.base,
        cout: { tokens: payload.tokens },
        proposee: at,
      },
    ];
  });
}
