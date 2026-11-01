// Les deux sorties d'un ticket en WAITING faute de capacité (#1958) : sa
// carte dit qu'il attend « a station that provides `macos` », et le chef a
// deux façons d'en sortir, d'un geste chacune.
//
// - Le donner à une station : la capacité s'ajoute à ce que cette station
//   fournit. C'est le geste qui change une station seule
//   (`installation stations set`, une-station.ts) : rien n'est ajouté ici
//   pour le jouer. La station relit ses capacités à son passage suivant, le
//   ticket revient seul sur le rail (`capabilities-reread`) et part chez la
//   seule qui fournit ce qu'il demande — et ne revient pas en WAITING pour
//   elle. Ce module dit seulement, à `facts`, ce que la carte demande
//   (`requiert`) : l'app l'ajoute à la station choisie, sans le deviner.
// - C'est le travail d'un humain (`rail human <ticket> [qui]`) : aucune
//   station ne le fournira. Le ticket quitte le rail — son issue perd `fire`
//   et prend `hors-cuisine`, aucune cuisine ne le reprend — et entre dans
//   TODO comme une tâche, pour le chef ou pour qui il nomme : son titre, son
//   contexte et ses critères d'acceptation, repris de son issue, et la
//   capacité qu'aucune station ne fournit. Rejoué sur un ticket déjà confié,
//   le geste nomme quelqu'un d'autre.
//
// La tâche entre dans TODO comme une carte `product` de la forme unique
// (carte-todo.ts, `jugerCarte`), sans passer par le triage : ce n'est pas la
// proposition d'un producteur, c'est le geste du chef lui-même. Elle en sort
// à la réponse du chef (reponse-carte.ts) : « it is done » ou « it will not
// be done » s'écrit sur l'issue, et rien d'autre ne bouge.
import type { Base } from "../base.ts";
import { manqueDuTicket } from "../capacites.ts";
import { cartesEnTodo, jugerCarte } from "../carte-todo.ts";
import { requises } from "../fiche.ts";
import type { Resultat } from "../geste-ticket.ts";
import { HORS_CUISINE, LABEL, type GitHub } from "../github.ts";
import type { Journal } from "../journal.ts";
import { ticketDuRail, type TicketRail } from "../projections/rail.ts";
import type { FaitSortieDeCapacite } from "./evenements.ts";

// Le geste de `rail` qui confie le ticket à un humain.
export const GESTE_HUMAIN = "human";

// À qui la tâche revient quand le chef ne nomme personne.
export const CHEF = "chef";

const AUTEUR = "chef";
const RIEN_TOUCHE = "none: nothing was changed";
const refuse = (reason: string): Resultat => ({ done: false, reason, price: RIEN_TOUCHE });

// Ce qu'une tâche confiée à un humain porte, tel que `facts` le donne dans
// l'entrée de TODO de son ticket.
export type TacheHumaine = { assignee: string; missing: string[]; title: string; context: string; criteria: string[] };

// Ce que demande la carte d'un ticket en WAITING faute de capacité : toutes
// les capacités de sa ligne `requiert` — la station qui le prend doit les
// fournir toutes, pas seulement celle qui manque. Null pour tout autre ticket.
export function requisDUnWaiting(ticket: TicketRail): string[] | null {
  const manque = manqueDuTicket(ticket);
  if (manque === null) return null;
  const demande = requises(ticket.card);
  return demande.length === 0 ? manque.capacites : demande;
}

// Le champ de `facts` d'un ticket du rail : `requiert`, présent sur une carte
// en WAITING faute de capacité seulement.
export const requisDuRail = (ticket: TicketRail): { requiert?: string[] } => {
  const requiert = requisDUnWaiting(ticket);
  return requiert === null ? {} : { requiert };
};

// Qui le chef nomme : un nom, sur une ligne. Rien : le chef.
const QUI = /^[^\p{Cc}]{1,60}$/u;
export function assigneeLu(qui: string): string | { refus: string } {
  const nom = qui.trim().replace(/^@/, "");
  if (nom === "") return CHEF;
  if (!QUI.test(nom)) return { refus: `“${qui.slice(0, 20)}” is not someone to hand the task to: a name, on one line, at most 60 characters` };
  return nom;
}

const SECTION = /^#{2,3}\s+(.+?)\s*$/;
const CONTEXTE = /^(contexte|context)$/i;
const CRITERES = /^(critères d'acceptation|criteres d'acceptation|acceptance criteria)$/i;
const PUCE = /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/;

// Le contexte et les critères d'acceptation de la carte, lus de son issue : ses
// sections « Contexte » (ou « Context ») et « Critères d'acceptation » (ou
// « Acceptance criteria »), chaque critère une puce. Ce qui suit un `---` — le
// pied que le découpage pose — n'en est pas. Sans section de contexte, le
// texte de l'issue avant sa première section en tient lieu.
export function lireLaCarte(corps: string): { context: string; criteria: string[] } {
  const lignes = corps.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
  const fin = lignes.findIndex((ligne) => ligne.trim() === "---");
  const avant: string[] = [];
  const sections: Array<{ titre: string; lignes: string[] }> = [];
  for (const ligne of fin === -1 ? lignes : lignes.slice(0, fin)) {
    const titre = SECTION.exec(ligne);
    if (titre) sections.push({ titre: titre[1] ?? "", lignes: [] });
    else (sections.at(-1)?.lignes ?? avant).push(ligne);
  }
  const contexte = sections.find(({ titre }) => CONTEXTE.test(titre))?.lignes ?? avant;
  const criteres = sections.find(({ titre }) => CRITERES.test(titre))?.lignes ?? [];
  return {
    context: contexte.join("\n").trim(),
    criteria: criteres.flatMap((ligne) => {
      const puce = PUCE.exec(ligne);
      return puce?.[1] === undefined ? [] : [puce[1]];
    }),
  };
}

const pour = (assignee: string) => (assignee === CHEF ? "the chef" : assignee);
const capacitesDites = (missing: readonly string[]) => missing.join(" or ");

// La carte de TODO de la tâche : ce qui se passe, et ce que le chef en dit
// une fois fait — la réponse s'écrit sur l'issue.
export function carteDeLaTache(assignee: string, missing: readonly string[]) {
  const jugee = jugerCarte({
    type: "product",
    resume: `No station can provide ${capacitesDites(missing)}: this ticket left the rail and is a human's job, for ${pour(assignee)}.`,
    enonce: "What became of this task?",
    choix: [
      { texte: "It is done", suite: "resume" },
      { texte: "It will not be done", suite: "resume" },
    ],
  });
  if (!jugee.admise) throw new Error(`the card of a human's job does not pass the TODO gate: ${jugee.raison}`);
  return jugee.carte;
}

// Le commentaire posé sur l'issue : la tâche, telle que TODO la montre.
export function direLaTache(tache: TacheHumaine, reassignee: boolean): string {
  if (reassignee) return `**Human's job — now for ${pour(tache.assignee)}.**`;
  return [
    `**Human's job — no station provides ${tache.missing.map((nom) => `\`${nom}\``).join(" or ")}: this ticket left the rail, for ${pour(tache.assignee)}.**`,
    "",
    `It waits in the chef's TODO as a task, and carries \`${HORS_CUISINE}\`: no kitchen takes it again.`,
  ].join("\n");
}

// Les tâches confiées à un humain dont la carte est encore dans TODO, par
// ticket : la dernière que le chef a confiée.
export function tachesHumaines(base: Base): Map<number, TacheHumaine> {
  const enTodo = new Set(cartesEnTodo(base).map(({ ticket }) => ticket));
  const taches = new Map<number, TacheHumaine>();
  if (enTodo.size === 0) return taches;
  const lignes = base.lire<{ ticket: number; payload: string }>("SELECT ticket, payload FROM events WHERE type = 'capability.human-job' ORDER BY seq");
  for (const { ticket, payload } of lignes) if (enTodo.has(ticket)) taches.set(ticket, JSON.parse(payload) as TacheHumaine);
  return taches;
}

// Le ticket a été confié à un humain : sa carte de TODO est la tâche, que
// personne d'autre ne sort de TODO (sans-capacite.ts).
export const confieAUnHumain = (journal: Journal, ticket: number): boolean => journal.duTicket(ticket).some(({ type }) => type === "capability.human-job");

// Le champ de `facts` d'une entrée de TODO : `tache`, présent sur celle d'une
// tâche confiée à un humain seulement.
export const tacheDuTicket = (taches: ReadonlyMap<number, TacheHumaine> | undefined, ticket: number): { tache?: TacheHumaine } => {
  const tache = taches?.get(ticket);
  return tache === undefined ? {} : { tache };
};

function entrer(journal: Journal, projet: string, ticket: number, tache: TacheHumaine): void {
  const { type: kind, resume: summary, question: statement, choix } = carteDeLaTache(tache.assignee, tache.missing);
  const fait: FaitSortieDeCapacite = { type: "capability.human-job", payload: tache };
  journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });
  journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "todo.entered", payload: { kind, summary, statement, choices: choix.map(({ texte, suite }) => ({ text: texte, then: suite })), captures: null } });
}

// « It is a human's job » : le ticket en WAITING faute de capacité quitte le
// rail et entre dans TODO, tâche de `qui` — le chef s'il ne nomme personne.
// Sur un ticket déjà confié dont la tâche est dans TODO, nomme quelqu'un
// d'autre. Tout autre ticket est refusé, et rien n'est touché.
export async function confierAUnHumain(journal: Journal, github: GitHub, projet: string, ticket: number, qui = ""): Promise<Resultat> {
  const assignee = assigneeLu(qui);
  if (typeof assignee !== "string") return refuse(assignee.refus);
  const { base } = journal;
  const sur = ticketDuRail(base, ticket);
  const deja = sur === null ? tachesHumaines(base).get(ticket) : undefined;

  if (deja !== undefined) {
    if (deja.assignee === assignee) return refuse(`#${ticket} is already ${pour(assignee)}'s job`);
    const tache = { ...deja, assignee };
    await github.commenter(ticket, direLaTache(tache, true));
    base.transaction(() => entrer(journal, projet, ticket, tache));
    return { done: true, price: `the task stays in TODO, now for ${pour(assignee)}; nothing is spent` };
  }
  if (sur === null) return refuse(`#${ticket} is not on the rail, and no human's job of it is in TODO`);
  const manque = manqueDuTicket(sur);
  if (manque === null) return refuse(`#${ticket} does not wait for a capability no station provides: only such a WAITING card becomes a human's job`);

  const issue = await github.issue(ticket);
  const { context, criteria } = lireLaCarte(issue?.body ?? "");
  const tache: TacheHumaine = { assignee, missing: manque.capacites, title: sur.title, context, criteria };
  // Le rail se lit de GitHub : les labels d'abord, puis le fait que le sondage
  // aurait écrit (geste-ticket.ts, `retirerDuRail`).
  await github.labelliser(ticket, [HORS_CUISINE]);
  await github.delabelliser(ticket, LABEL);
  const fait = base.transaction(() => {
    const encore = ticketDuRail(base, ticket);
    if (encore === null || manqueDuTicket(encore) === null) return false;
    journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "ticket.left", payload: { reason: "hors-cuisine" } });
    entrer(journal, projet, ticket, tache);
    return true;
  });
  if (!fait) return { done: false, reason: `#${ticket} left WAITING meanwhile`, price: `its issue lost \`${LABEL}\` and carries \`${HORS_CUISINE}\`: put \`${LABEL}\` back and remove \`${HORS_CUISINE}\` to bring it back on the rail` };
  await github.commenter(ticket, direLaTache(tache, false));
  return {
    done: true,
    price: `the ticket leaves the rail and is not cooked — its issue loses \`${LABEL}\` and carries \`${HORS_CUISINE}\`, so no kitchen takes it again; it waits in TODO as ${pour(assignee)}'s task. Nothing is spent`,
  };
}
