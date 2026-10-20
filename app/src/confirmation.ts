// Ce qu'un geste confirmé dit avant de partir : son prix, en clair. Un geste destructif ou
// lourd (gestes.ts, `CONFIRMES`) ne part qu'après un « oui » du chef, et ce « oui » se donne
// devant ce qu'il coûte — pas devant « es-tu sûr ? » (docs/superpowers/specs/
// 2026-10-13-app-poste-de-travail-design.md, « Le modèle, en quatre règles », la troisième).
// La convention est celle du geste de désinstallation : dire ce qu'il va faire. Aucun LLM.
// Le prix se tire de ce que la box a déjà dit : les cooks en cours (`faits`), le rail. Ce qui
// n'est pas lu se dit tel — jamais « aucun cook en vol » à la place d'un « pas lu ». Le prix
// d'« allumer » se complète d'une lecture à la box, au moment du geste (allumage.ts) : la vue
// la demande. Chaque « oui » est un geste du socle, qui part dans le second. Ce module ne lance
// rien, n'écrit dans aucun terminal, et ne fait rien partir : il dit.
import { AVERTISSEMENT as ALLUMER } from "./allumage.ts";
import type { Cuisine } from "./box.ts";
import type { Projet } from "./config.ts";
import type { Faits } from "./faits.ts";
import { commandeDuGeste, CONFIRMES } from "./gestes.ts";
import { nombre } from "./format.ts";

// Un « oui » : le geste du socle qu'il fait partir, ce que son bouton dit, et ce qu'il engage.
export type Choix = { id: string; libelle: string; dit: string };
// `titre` : ce que le geste fait. `prix` : ce qu'il coûte, dans les mots de l'app, une phrase par
// ligne. `lu` : l'heure de la
// lecture de `faits` dont le prix est tiré — absente, il n'en doit rien. `chiffrer` : le prix
// se complète de `manager backlog`, que la vue demande à la box dès que la confirmation s'ouvre.
// `choix` : les « oui » ; `renoncer` : le « non », qui ne fait rien partir.
export type Confirmation = { titre: string; prix: string[]; lu?: string; chiffrer?: true; choix: Choix[]; renoncer: string };

// Les derniers faits lus d'un projet, et l'heure de leur lecture — ou pourquoi il n'y en a pas.
export type Lus = { faits: Faits; a: string } | { sans: string };

const s = (combien: number) => (combien > 1 ? "s" : "");

// Ce que le runtime fait d'un « stop » (docs/runtime/garde-fous.md, « Les garde-fous », et « Ce qu'un arrêt récolte »).
const STOP = [
  "All running cooks are stopped within the second, and nothing is harvested: their tickets go back to queued and will start again from zero — what they already spent delivers nothing.",
  "No more cooks are launched — runtime restarts included — until “resume”.",
];
const REPRENDRE = "The “stop” is lifted, and the breaker closed: queued tickets start again right away, on your quota.";
const MERGE_SANS_TOI = "A green pass will be merged without you: the pass merges what it judges green, with no expiry or number of uses — until you revoke it.";
const PLUS_SANS_TOI = "Nothing is merged without you any more: the pass stops at the open PR, and every green delivery awaits you — until you enable it again.";

// Les cooks en vol à cette lecture, d'après `faits` : ce qu'il en donne, et ce qui manque, dit tel.
function cooksEnVol(lus: Lus): { prix: string[]; lu?: string } {
  if ("sans" in lus) return { prix: [`Cooks in flight are not read: ${lus.sans}. This is not “no cook in flight”.`] };
  const { faits, a } = lus;
  if (faits.cooks === undefined) return { prix: ["Cooks in flight are not read: this station's runtime does not give them in `facts`. This is not “no cook in flight”."], lu: a };
  const tickets = faits.cooks.map(({ ticket }) => `#${ticket}`).join(", ");
  return {
    prix: [
      faits.cooks.length === 0
        ? "No cook running at this reading — what they would have spent, this station's runtime does not say."
        : `${faits.cooks.length} cook${s(faits.cooks.length)} running at this reading (${tickets}) — what they spent, this station's runtime does not say in \`facts\`.`,
    ],
    lu: a,
  };
}

// Les tickets que « reprendre » laisse partir, d'après `faits`.
const surLeRail = (lus: Lus): string[] => ("sans" in lus ? [] : [`${nombre(lus.faits.compteurs.rail)} ticket${s(lus.faits.compteurs.rail)} on the rail at this reading.`]);

// Ce que ce geste confirmé dira avant de partir, pour ce projet — ou pourquoi il ne s'offre
// pas. Rien pour un geste qui ne se confirme pas, ou que le socle ne connaît pas. `cuisine` : là
// où celle du projet tourne à cet instant — sa box, ou cet ordinateur, où le geste part sans `ssh`.
export function confirmationDe(id: unknown, projet: Projet, lus: Lus, grant?: unknown, cuisine: Cuisine | undefined = projet.box): Confirmation | { refus: string } | undefined {
  if (typeof id !== "string" || !CONFIRMES.includes(id)) return undefined;
  // Un geste qui n'écrirait rien n'a rien à confirmer : son refus se dit à la place.
  const ecrit = commandeDuGeste(id, projet, grant, cuisine);
  if (ecrit === undefined || "refus" in ecrit) return ecrit;
  const nomme = String(grant);
  switch (id) {
    case "stop": {
      const { prix, lu } = cooksEnVol(lus);
      return { titre: "stop the kitchen", prix: [...STOP, ...prix], ...(lu === undefined ? {} : { lu }), choix: [{ id, libelle: "yes, stop the kitchen", dit: "running cooks are stopped" }], renoncer: "no, let it run" };
    }
    case "reprendre": {
      const { prix, lu } = cooksEnVol(lus);
      return { titre: "resume the kitchen", prix: [REPRENDRE, ...surLeRail(lus), ...prix], ...(lu === undefined ? {} : { lu }), choix: [{ id, libelle: "yes, resume the kitchen", dit: "queued tickets start again, on your quota" }], renoncer: "no, leave it stopped" };
    }
    case "grant-activer":
      return { titre: `enable the \`${nomme}\` grant`, prix: [MERGE_SANS_TOI], choix: [{ id, libelle: `yes, enable \`${nomme}\``, dit: "a green pass will be merged without you" }], renoncer: "no, keep control" };
    case "grant-revoquer":
      return { titre: `revoke the \`${nomme}\` grant`, prix: [PLUS_SANS_TOI], choix: [{ id, libelle: `yes, revoke \`${nomme}\``, dit: "nothing is merged without you any more" }], renoncer: "no, leave it active" };
    case "manager-allumer":
      return { titre: "turn the manager on", prix: [ALLUMER], chiffrer: true, choix: [{ id, libelle: "yes, turn the manager on", dit: "what it judges executable is taken up right away" }], renoncer: "no, leave it off" };
    default:
      return undefined;
  }
}
