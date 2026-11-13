// Pourquoi la file du rail ne part pas, dans l'app (ticket 3433) : la phrase est celle du runtime
// (runtime/src/attente-du-rail/raison.ts) — l'app n'en écrit aucune. La lecture du rail sur GitHub
// (vue/rail/github.ts, `avecLeRail`) la pose dans `facts` sous `attenteDuRail` ; trois endroits la disent :
//   - le rail du projet, en tête (ligne-de-l-attente.js) ;
//   - chaque carte en file qui ne part pas la prochaine, sa ligne (faits.ts, `ligneEnAttente`) ;
//   - la file du second (tableau/rail.ts), au-dessus de la ligne `rail` de `status` — les lignes mêmes que
//     `brigade <project> status` écrit.
import { expliquerLAttente, lignesDesCartes, type AttenteDuRail, type Raison, type TicketDuRail } from "../../../../runtime/src/attente-du-rail/raison.ts";
import type { Geste, StationsLues } from "../../../../runtime/src/rail-bloque/rail-bloque.ts";

// Ce que `facts` porte : `attenteDuRail`, la raison, sa phrase et son geste, absente quand rien n'attend ou qu'un cook tourne ;
// `lignesDesCartes`, la ligne de chaque carte en file qui ne part pas la prochaine, absente sans aucune.
export type LignesDesCartes = Record<number, string>;

const RAISONS: readonly Raison[] = ["aucune-station", "arretee", "hors-ligne", "quota-github", "plafond", "pass", "autre-ticket", "normale"];
const GESTES: readonly Geste[] = ["demarrer-la-station", "ajouter-a-une-station"];

// GitHub ne publie pas le plafond de cooks de la station : il n'est jamais la raison d'un rail lu ici.
export function attenteDuRailDe(depot: string, tickets: readonly TicketDuRail[], stations: StationsLues, maintenant: number): { attenteDuRail?: AttenteDuRail; lignesDesCartes?: LignesDesCartes } {
  const attente = expliquerLAttente({ depot, tickets, stations, plafondAtteint: false, maintenant });
  const cartes = lignesDesCartes(tickets);
  return { ...(attente === null ? {} : { attenteDuRail: attente }), ...(Object.keys(cartes).length === 0 ? {} : { lignesDesCartes: cartes }) };
}

// `attenteDuRail`, de la racine de `facts` (faits.ts, `comprendre`) : rien de mal formé ne le pose.
export function attenteDuRailLue(valeur: unknown): { attenteDuRail?: AttenteDuRail } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const { raison, phrase, geste } = valeur as Record<string, unknown>;
  if (!RAISONS.includes(raison as Raison) || typeof phrase !== "string" || phrase === "") return {};
  if (geste !== null && !GESTES.includes(geste as Geste)) return {};
  return { attenteDuRail: { raison: raison as Raison, phrase, geste: geste as Geste | null } };
}

// `lignesDesCartes`, de la racine de `facts` : un ticket, sa ligne ; rien de mal formé ne le pose.
export function lignesDesCartesLues(valeur: unknown): { lignesDesCartes?: LignesDesCartes } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const lignes: LignesDesCartes = {};
  for (const [ticket, ligne] of Object.entries(valeur)) {
    if (!/^[1-9]\d*$/.test(ticket) || typeof ligne !== "string" || ligne === "") return {};
    lignes[Number(ticket)] = ligne;
  }
  return Object.keys(lignes).length === 0 ? {} : { lignesDesCartes: lignes };
}
