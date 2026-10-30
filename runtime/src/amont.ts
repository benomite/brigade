// Ce qui n'est pas encore sur le rail : chaque issue ouverte du dépôt que le
// rail ne porte pas, et ce qui lui arrive, dans un mot d'une liste fermée. Un
// rail vide ne veut pas dire un projet fini — c'est ici que se lit le reste.
// La liste vient de GitHub, telle que le manager la sonde (PR écartées) ; ce qui
// arrive à chaque issue vient du journal — le rail, le manager, ses découpages —
// et de ce que l'issue porte, ses labels. Rien d'autre n'y est déduit, et cette
// lecture n'écrit rien. Le contrat : docs/runtime/manager.md, « En amont du rail ».
import { attentesDuChef, direAttenteEn } from "./attend.ts";
import { priorite } from "./alimenter.ts";
import { bilanDEpique } from "./bilan-epique.ts";
import { decrire, decrireEcart } from "./dire-manager.ts";
import type { Nature } from "./events/manager.ts";
import { HORS_CUISINE, LABEL, type Issue } from "./github.ts";
import type { Base } from "./base.ts";
import { decoupageDe, ticketDEpique, ticketsDEpique } from "./projections/splits.ts";
import { issueDuManager, remiseDe, seqDeDecision } from "./projections/manager.ts";
import { lireRail, sortDuTicket } from "./projections/rail.ts";
import { nomAbandonEn } from "./rail.ts";

// Ce qui arrive à une issue hors du rail — le premier vrai l'emporte, dans cet ordre :
//   `attend`    le manager attend ta réponse : elle est dans le bloc `attend`, comme dans T'attend
//   `en-route`  elle va entrer sur le rail : elle porte `fire`, le manager l'y a mise, ou elle est née d'un découpage
//   `sortie`    elle a quitté le rail sans être servie (`fire` retiré, `hors-cuisine` posé), et rien ne s'est décidé depuis
//   `servie`    servie, et son issue est encore ouverte
//   `decoupee`  une épique découpée : ses tickets portent le travail
//   `epique`    une épique pas encore découpée, ou dont le découpage est en cours
//   `ecartee`   écartée par le manager — refusée, ou laissée au chef —, avec sa raison
//   `non-lue`   le manager ne l'a pas encore jugée, ou doit la rejuger
export const ETATS = ["attend", "en-route", "sortie", "servie", "decoupee", "epique", "ecartee", "non-lue"] as const;
export type EtatAmont = (typeof ETATS)[number];

// Une issue hors du rail. `priorite` : celle de son label `prio:`, nulle sans.
// `dit` : ce que la box en dit, en une ligne — ses mots, ceux de `status` ou de `manager`.
export type IssueAmont = { ticket: number; titre: string; url: string; priorite: number | null; etat: EtatAmont; dit: string };

const LABEL_EPIQUE = "epic";

// Une raison du manager tient sur une ligne : ses retours à la ligne ne disent rien de plus.
const enUneLigne = (texte: string) => texte.replace(/\s+/g, " ").trim();
const pluriel = (nombre: number, mot: string) => `${nombre} ${mot}${nombre > 1 ? "s" : ""}`;

// Ce qui arrive à une issue ouverte que le rail ne porte pas.
function etatDe(base: Base, issue: Issue, attentes: Map<number, string>): { etat: EtatAmont; dit: string } {
  const { number: ticket, labels } = issue;
  const attendue = attentes.get(ticket);
  if (attendue !== undefined) return { etat: "attend", dit: attendue };

  const decision = issueDuManager(base, ticket);
  const decidee = seqDeDecision(base, ticket);
  const sort = sortDuTicket(base, ticket);
  // Ce que le rail en a fait ne vaut que s'il est plus récent que ce que le manager en a décidé.
  const sortRecent = sort !== null && (decidee === null || sort.seq > decidee) ? sort : null;
  const horsCuisine = labels.includes(HORS_CUISINE);

  if (!horsCuisine && labels.includes(LABEL)) return { etat: "en-route", dit: "it carries `fire`: the rail takes it on its next poll" };
  if (!horsCuisine && decision?.decision === "fire" && sortRecent === null) return { etat: "en-route", dit: `put on the rail by the manager, ${decision.model} / ${decision.effort} — \`fire\` is not set on it yet` };
  const ne = ticketDEpique(base, ticket);
  if (!horsCuisine && ne !== null && ne.index !== null && sortRecent === null) return { etat: "en-route", dit: `born of the split of epic #${ne.epic}: the rail takes it once \`fire\` is set` };

  if (sortRecent?.outcome === "left") return { etat: "sortie", dit: `left the rail: ${nomAbandonEn(sortRecent.reason ?? "")}` };
  if (sortRecent?.outcome === "served") return { etat: "servie", dit: "served, and its issue is still open" };

  const decoupage = decoupageDe(base, ticket);
  if (decoupage?.state === "split") {
    const tickets = ticketsDEpique(base, ticket);
    if (!decoupage.done) {
      const lances = tickets.filter((ne) => ne.index !== null && ne.fired).length;
      return { etat: "epique", dit: `split in progress, ${lances}/${decoupage.tickets.length} tickets created and fired` };
    }
    const { servis, manquants } = bilanDEpique(base, ticket);
    const manque = manquants.length === 0 ? "" : `, ${manquants.map(({ ditEn }) => ditEn).join(", ")}`;
    return { etat: "decoupee", dit: `split, ${servis.length}/${pluriel(tickets.length, "ticket")} served${tickets.length === 0 ? "" : ` (${tickets.map((ne) => `#${ne.ticket}`).join(", ")})`}${manque}` };
  }

  const epique = decision?.decision === "refused" && decision.kind === ("epic" satisfies Nature);
  if (decision !== null && !epique && decision.decision !== "fire") {
    return { etat: "ecartee", dit: enUneLigne(decision.decision === "aside" ? decrireEcart(decision) : decrire(decision)) };
  }
  if (epique || labels.includes(LABEL_EPIQUE)) return { etat: "epique", dit: epique ? enUneLigne(`not split yet — ${decision?.reason ?? ""}`) : "it carries `epic`: not split yet" };

  if (remiseDe(base, ticket) !== null) return { etat: "non-lue", dit: "returned to the manager, not rejudged yet" };
  // Mise sur le rail par le manager, puis dite hors cuisine avant d'y entrer : il ne l'a pas relue depuis.
  if (decision !== null) return { etat: "non-lue", dit: "it has carried `hors-cuisine` since the manager put it on the rail: it has not read it again yet" };
  return { etat: "non-lue", dit: "the manager has not judged it yet" };
}

// Une épique découpée dont tous les tickets sont servis n'attend plus rien : le
// manager la ferme, et d'ici là elle n'a pas sa place parmi ce qui vient.
function epiqueToutServie(base: Base, numero: number): boolean {
  const decoupage = decoupageDe(base, numero);
  return decoupage?.state === "split" && decoupage.done && bilanDEpique(base, numero).toutServi;
}

// Les issues ouvertes que le rail ne porte pas, dans l'ordre où le manager les
// lit : `prio:1` d'abord, sans priorité en dernier ; à priorité égale, la plus ancienne.
export function enAmont(base: Base, ouvertes: readonly Issue[]): IssueAmont[] {
  const rail = lireRail(base);
  const surLeRail = new Set(rail.map(({ ticket }) => ticket));
  // Ce qui attend le chef et n'est pas sur le rail : ce sont les attentes du manager.
  const attentes = new Map(attentesDuChef(base, rail).flatMap((attente) => (attente.ticket === null || surLeRail.has(attente.ticket) ? [] : [[attente.ticket, direAttenteEn(attente)] as const])));
  return ouvertes
    .filter((issue) => issue.pr !== true && !surLeRail.has(issue.number) && !epiqueToutServie(base, issue.number))
    .sort((a, b) => (priorite(a.labels) ?? 10) - (priorite(b.labels) ?? 10) || a.createdAt.localeCompare(b.createdAt) || a.number - b.number)
    .map((issue) => ({ ticket: issue.number, titre: issue.title, url: issue.url, priorite: priorite(issue.labels), ...etatDe(base, issue, attentes) }));
}

// Avant le rail (#1836) : ce qu'il reste à faire au projet, tel que la barre de
// la vue du rail le compte et que sa colonne Backlog le range. Les issues
// ouvertes que le rail ne porte pas et qui n'y sont pas en route — ni servies,
// ni portées par les tickets de leur découpage, ni déjà lancées (`fire` posé :
// le rail la prend à son prochain sondage) —, chacune dans un seul de cinq
// états, dans l'ordre où la vue les pose :
//   `non-lue`      le manager ne l'a pas jugée — ni calibrage (`model:`, `effort:`), ni décision
//   `incomplete`   le manager l'a refusée : un ticket incomplet, que le second doit réécrire
//   `epique`       une épique pas encore découpée — `epic` posé, jugée telle, ou son découpage en cours
//   `prete`        calibrée (`model:` et `effort:`, ou mise sur le rail par le manager), sans `fire`
//   `mise-de-cote` hors de la cuisine : `hors-cuisine` posé, ou retenue par le manager pour le chef
//                  (une question, une issue de décision, `blocked-on-human`, la roadmap…)
// `hors-cuisine` l'emporte sur tout le reste, comme pour le manager : le chef a
// dit que la cuisine ne la sert pas. Puis l'épique, le refus, le calibrage, la
// mise de côté par le manager ; sans rien de cela, elle n'est pas lue.
// `dit` : ce qui la retient, en une ligne — celle de `enAmont`.
export const ETATS_AVANT_LE_RAIL = ["non-lue", "incomplete", "epique", "prete", "mise-de-cote"] as const;
export type EtatAvantLeRail = (typeof ETATS_AVANT_LE_RAIL)[number];
export type IssueAvantLeRail = { ticket: number; titre: string; priorite: number | null; etat: EtatAvantLeRail; dit: string };

const calibree = (labels: readonly string[]) => labels.some((label) => label.startsWith("model:")) && labels.some((label) => label.startsWith("effort:"));

// L'état avant le rail d'une issue hors du rail, et ce qui la retient — ou null si elle n'est plus à faire avant lui.
function avantDe(base: Base, issue: Issue, amont: IssueAmont): { etat: EtatAvantLeRail; dit: string } | null {
  const { number: ticket, labels } = issue;
  const { dit } = amont;
  if (amont.etat === "servie" || amont.etat === "decoupee") return null;
  if (amont.etat === "en-route" && labels.includes(LABEL)) return null;
  if (labels.includes(HORS_CUISINE)) return { etat: "mise-de-cote", dit: `it carries \`${HORS_CUISINE}\`: this kitchen does not serve it` };
  const decision = issueDuManager(base, ticket);
  const decoupage = decoupageDe(base, ticket);
  const jugeeEpique = decision?.decision === "refused" && decision.kind === ("epic" satisfies Nature);
  if (amont.etat === "epique" || labels.includes(LABEL_EPIQUE) || jugeeEpique || (decoupage !== null && decoupage.state !== "skipped")) return { etat: "epique", dit };
  if (decision?.decision === "refused") return { etat: decision.kind === ("question" satisfies Nature) || decision.kind === ("decision" satisfies Nature) ? "mise-de-cote" : "incomplete", dit };
  if (amont.etat === "en-route" || amont.etat === "sortie" || decision?.decision === "fire") return { etat: "prete", dit };
  if (calibree(labels)) return { etat: "prete", dit: `calibrated (${labels.filter((label) => label.startsWith("model:") || label.startsWith("effort:")).join(", ")}), without \`fire\`: the rail takes it once \`fire\` is set` };
  if (decision?.decision === "aside") return { etat: "mise-de-cote", dit };
  return { etat: "non-lue", dit };
}

// Ce qui est avant le rail, dans l'ordre où le manager lit les issues (`enAmont`) :
// `prio:1` d'abord, sans priorité en dernier ; à priorité égale, la plus ancienne.
export function avantLeRail(base: Base, ouvertes: readonly Issue[]): IssueAvantLeRail[] {
  const parNumero = new Map(ouvertes.map((issue) => [issue.number, issue]));
  return enAmont(base, ouvertes).flatMap((amont) => {
    const issue = parNumero.get(amont.ticket);
    const avant = issue === undefined ? null : avantDe(base, issue, amont);
    return avant === null ? [] : [{ ticket: amont.ticket, titre: amont.titre, priorite: amont.priorite, ...avant }];
  });
}
