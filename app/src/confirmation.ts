// Ce qu'un geste confirmé dit avant de partir : son prix, en clair. Un geste destructif ou
// lourd (actions.ts, `CONFIRMES`) ne part qu'après un « oui » du chef, et ce « oui » se donne
// devant ce qu'il coûte — pas devant « es-tu sûr ? » (docs/superpowers/specs/
// 2026-10-13-app-poste-de-travail-design.md, « Le modèle, en quatre règles », la troisième).
// La convention est celle du geste de désinstallation : dire ce qu'il va faire. Aucun LLM.
// Le prix se tire de ce que la box a déjà dit : les cooks en cours (`faits`), le rail. Ce qui
// n'est pas lu se dit tel — jamais « aucun cook en vol » à la place d'un « pas lu ». Le prix
// d'« allumer » se complète d'une lecture à la box, au moment du geste (power-up.ts) : la vue
// la demande. Chaque « oui » est un geste du socle, qui part dans le second. Ce module ne lance
// rien, n'écrit dans aucun terminal, et ne fait rien partir : il dit.
import { WARNING as TURN_ON } from "./power-up.ts";
import type { Kitchen } from "./box.ts";
import type { Project } from "./config.ts";
import type { Facts } from "./facts.ts";
import { commandOfAction, CONFIRMED } from "./actions.ts";
import { count } from "./format.ts";

// Un « oui » : le geste du socle qu'il fait partir, ce que son bouton dit, et ce qu'il engage.
export type Choice = { id: string; libelle: string; dit: string };
// `titre` : ce que le geste fait. `prix` : ce qu'il coûte, dans les mots de l'app, une phrase par
// ligne. `lu` : l'heure de la
// lecture de `faits` dont le prix est tiré — absente, il n'en doit rien. `chiffrer` : le prix
// se complète de `manager backlog`, que la vue demande à la box dès que la confirmation s'ouvre.
// `choix` : les « oui » ; `renoncer` : le « non », qui ne fait rien partir.
export type Confirmation = { titre: string; prix: string[]; lu?: string; chiffrer?: true; choix: Choice[]; renoncer: string };

// Les derniers faits lus d'un projet, et l'heure de leur lecture — ou pourquoi il n'y en a pas.
export type Read = { faits: Facts; a: string } | { sans: string };

const s = (howMany: number) => (howMany > 1 ? "s" : "");

// Ce que le runtime fait d'un « stop » (docs/runtime/garde-fous.md, « Les garde-fous », et « Ce qu'un arrêt récolte »).
const STOP = [
  "All running cooks are stopped within the second, and nothing is harvested: their tickets go back to queued and will start again from zero — what they already spent delivers nothing.",
  "No more cooks are launched — runtime restarts included — until “resume”.",
];
const RESUME = "The “stop” is lifted, and the breaker closed: queued tickets start again right away, on your quota.";

// Les cooks en vol à cette lecture, d'après `faits` : ce qu'il en donne, et ce qui manque, dit tel.
function cooksEnFlight(readOnes: Read): { prix: string[]; lu?: string } {
  if ("sans" in readOnes) return { prix: [`Cooks in flight are not read: ${readOnes.sans}. This is not “no cook in flight”.`] };
  const { faits: facts, a } = readOnes;
  if (facts.cooks === undefined) return { prix: ["Cooks in flight are not read: this station's runtime does not give them in `facts`. This is not “no cook in flight”."], lu: a };
  const tickets = facts.cooks.map(({ ticket }) => `#${ticket}`).join(", ");
  return {
    prix: [
      facts.cooks.length === 0
        ? "No cook running at this reading — what they would have spent, this station's runtime does not say."
        : `${facts.cooks.length} cook${s(facts.cooks.length)} running at this reading (${tickets}) — what they spent, this station's runtime does not say in \`facts\`.`,
    ],
    lu: a,
  };
}

// Les tickets que « reprendre » laisse partir, d'après `faits`.
const onTheRail = (readOnes: Read): string[] => ("sans" in readOnes ? [] : [`${count(readOnes.faits.compteurs.rail)} ticket${s(readOnes.faits.compteurs.rail)} on the rail at this reading.`]);

// Ce que ce geste confirmé dira avant de partir, pour ce projet — ou pourquoi il ne s'offre
// pas. Rien pour un geste qui ne se confirme pas, ou que le socle ne connaît pas. `cuisine` : là
// où celle du projet tourne à cet instant — cet ordinateur.
export function confirmationOf(id: unknown, project: Project, readOnes: Read, kitchen: Kitchen | undefined): Confirmation | { refus: string } | undefined {
  if (typeof id !== "string" || !CONFIRMED.includes(id)) return undefined;
  // Un geste qui n'écrirait rien n'a rien à confirmer : son refus se dit à la place.
  const written = commandOfAction(id, project, kitchen);
  if (written === undefined || "refus" in written) return written;
  switch (id) {
    case "stop": {
      const { prix: price, lu: readOne } = cooksEnFlight(readOnes);
      return { titre: "stop the kitchen", prix: [...STOP, ...price], ...(readOne === undefined ? {} : { lu: readOne }), choix: [{ id, libelle: "yes, stop the kitchen", dit: "running cooks are stopped" }], renoncer: "no, let it run" };
    }
    case "reprendre": {
      const { prix: price, lu: readOne } = cooksEnFlight(readOnes);
      return { titre: "resume the kitchen", prix: [RESUME, ...onTheRail(readOnes), ...price], ...(readOne === undefined ? {} : { lu: readOne }), choix: [{ id, libelle: "yes, resume the kitchen", dit: "queued tickets start again, on your quota" }], renoncer: "no, leave it stopped" };
    }
    case "projet-allumer":
      return { titre: "switch the project on", prix: [TURN_ON], chiffrer: true, choix: [{ id, libelle: "yes, switch the project on", dit: "what the manager judges executable is taken up right away, and green deliveries are merged" }], renoncer: "no, leave it off" };
    default:
      return undefined;
  }
}
