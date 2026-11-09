// WAITING, côté app : les trois gestes qui mettent un ticket en attente d'un tiers et l'en
// sortent (docs/runtime/journal-et-rail.md, « Un ticket attend un tiers : WAITING »). Les deux
// premiers sont la commande `waiting` du runtime, dans sa forme de poste (`brigade <nom>
// waiting …`), envoyée dans le second comme un geste du socle (gestes.ts) — l'app n'en double aucune :
//   - « waiting for… », sur une carte de TODO : `waiting set <ticket> --what … --from … --remind <date>`,
//     d'après le formulaire que le chef a rempli — ce qu'il attend, dans ses mots, de qui, et
//     la date de relance, proposée à sept jours ;
//   - « resume », sur une carte de WAITING : `waiting resume <ticket>`, il revient dans TODO ;
//   - « it arrived, back to the kitchen », sur une carte de WAITING : il repart en cuisine sans
//     repasser par TODO. Ce n'est pas une commande de la box : l'app le poste sur le tableau de la
//     cuisine, `/brigade arrived #<ticket>` (tableau-gestes/rail.ts, `arriveeDeCarte`, #1740) —
//     ce module n'en compose rien.
// Les trois sont directs : ils ne détruisent rien, et le formulaire validé est le geste du chef.
// Ce que le chef tape est cité pour le shell du Mac, et rien n'y est exécuté (`enPoste`). Ce module
// ne lance rien : il n'a que l'`envoyer` du registre pour toucher au monde.
import type { Cuisine } from "./box.ts";
import type { Projet } from "./config.ts";
import { enPoste, mot } from "./gestes.ts";
import type { Terminal } from "./terminaux.ts";
import { saisieLue } from "./vue/attente/saisie.ts";

// Les trois gestes, par leur nom, ce qu'ils écrivent après `brigade <nom>` — rien pour celui qui part sur le tableau
// de la cuisine —, et leur libellé.
export const GESTES_D_ATTENTE = [
  { id: "attente-poser", commande: "waiting set", libelle: "waiting for…" },
  { id: "attente-reprendre", commande: "waiting resume", libelle: "resume" },
  { id: "attente-arrivee", commande: null, libelle: "it arrived, back to the kitchen" },
] as const;
export type GesteDAttente = (typeof GESTES_D_ATTENTE)[number]["id"];

// Ce que le chef remplit, et sa lecture : partagées avec le téléphone (vue/attente/saisie.ts).
export { jourDe, RELANCE_PROPOSEE_JOURS, relanceProposee, type Saisie } from "./vue/attente/saisie.ts";

// Un texte tel que le shell de la box le rendra à la commande : un seul argument, toujours
// cité — c'est le chef qui l'a tapé, rien n'en est exécuté.
const libre = (texte: string) => `'${texte.replaceAll("'", `'\\''`)}'`;

// Ce que le geste écrit pour ce ticket de ce projet — ou pourquoi il n'écrit rien. La vue nomme
// le geste et le ticket, et donne ce que le chef a rempli ; rien d'autre ne s'écrit. Un projet
// dont la cuisine n'est nulle part n'a rien à écrire, ni un geste qui part sur le tableau. `aujourdhui` : le jour du poste, qui borne la
// relance. `cuisine` : là où elle tourne à cet instant — cet ordinateur.
export function commandeDAttente(id: unknown, projet: Projet, ticket: unknown, saisie: unknown, aujourdhui: Date, cuisine: Cuisine | undefined): { commande: string } | { refus: string } | undefined {
  const geste = GESTES_D_ATTENTE.find((candidat) => candidat.id === id);
  if (geste === undefined || geste.commande === null || cuisine === undefined) return undefined;
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing is written: the action names no ticket" };
  if (geste.id !== "attente-poser") return enPoste(cuisine, projet.nom, `${geste.commande} ${ticket}`);
  const lue = saisieLue(saisie, aujourdhui);
  if ("refus" in lue) return lue;
  const { quoi, qui, relance: jour } = lue;
  return enPoste(cuisine, projet.nom, `${geste.commande} ${ticket} --what ${mot(libre(quoi))} --from ${mot(libre(qui))} --remind ${jour}`);
}

// Envoie le geste dans le second du projet — ou dit pourquoi rien n'est parti : un projet qui
// ne s'ouvre pas, un second qui n'est pas dit libre (terminaux.ts), un formulaire incomplet.
type Registre = { envoyer(projet: Projet, commande: string): Promise<Terminal | { refus: string }> };
export function ecrireAttente(terminaux: Registre, id: unknown, projet: Projet, ticket: unknown, saisie: unknown, aujourdhui: Date, cuisine: Cuisine | undefined): { refus: string } | undefined | Promise<Terminal | { refus: string }> {
  const ecrit = commandeDAttente(id, projet, ticket, saisie, aujourdhui, cuisine);
  if (ecrit === undefined || "refus" in ecrit) return ecrit;
  if (projet.refus !== undefined) return { refus: `nothing is written: “${projet.nom}” does not open — ${projet.refus}` };
  return terminaux.envoyer(projet, `!${ecrit.commande}`);
}
