// Ce qui n'est pas encore sur le rail : chaque issue ouverte du dépôt que le
// rail ne porte pas, et ce qui lui arrive, dans un mot d'une liste fermée. Un
// rail vide ne veut pas dire un projet fini — c'est ici que se lit le reste.
// La liste vient de GitHub, telle que le manager la sonde (PR écartées) ; ce qui
// arrive à chaque issue vient du journal — le rail, le manager, ses découpages —
// et de ce que l'issue porte, ses labels. Rien d'autre n'y est déduit, et cette
// lecture n'écrit rien. Le contrat : docs/runtime/manager.md, « En amont du rail ».
import { attentesDuChef, direAttente } from "./attend.ts";
import { priorite } from "./alimenter.ts";
import { bilanDEpique } from "./bilan-epique.ts";
import { decrire, decrireEcart } from "./dire-manager.ts";
import type { Nature } from "./evenements/manager.ts";
import { HORS_CUISINE, LABEL, type Issue } from "./github.ts";
import type { Base } from "./base.ts";
import { decoupageDe, ticketDEpique, ticketsDEpique } from "./projections/decoupages.ts";
import { issueDuManager, remiseDe, seqDeDecision } from "./projections/manager.ts";
import { lireRail, sortDuTicket } from "./projections/rail.ts";
import { nomAbandon } from "./rail.ts";

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

  if (!horsCuisine && labels.includes(LABEL)) return { etat: "en-route", dit: "elle porte `fire` : le rail la prend à son prochain sondage" };
  if (!horsCuisine && decision?.decision === "fire" && sortRecent === null) return { etat: "en-route", dit: `mise sur le rail par le manager, ${decision.model} / ${decision.effort} — \`fire\` n'y est pas encore posé` };
  const ne = ticketDEpique(base, ticket);
  if (!horsCuisine && ne !== null && ne.index !== null && sortRecent === null) return { etat: "en-route", dit: `née du découpage de l'épique #${ne.epic} : le rail la prend une fois \`fire\` posé` };

  if (sortRecent?.outcome === "left") return { etat: "sortie", dit: `sortie du rail : ${nomAbandon(sortRecent.reason ?? "")}` };
  if (sortRecent?.outcome === "served") return { etat: "servie", dit: "servie, et son issue est encore ouverte" };

  const decoupage = decoupageDe(base, ticket);
  if (decoupage?.state === "split") {
    const tickets = ticketsDEpique(base, ticket);
    if (!decoupage.done) {
      const lances = tickets.filter((ne) => ne.index !== null && ne.fired).length;
      return { etat: "epique", dit: `découpage en cours, ${lances}/${decoupage.tickets.length} tickets créés et lancés` };
    }
    const { servis, manquants } = bilanDEpique(base, ticket);
    const manque = manquants.length === 0 ? "" : `, ${manquants.map(({ dit }) => dit).join(", ")}`;
    return { etat: "decoupee", dit: `découpée, ${servis.length}/${pluriel(tickets.length, "ticket")} servi${servis.length > 1 ? "s" : ""}${tickets.length === 0 ? "" : ` (${tickets.map((ne) => `#${ne.ticket}`).join(", ")})`}${manque}` };
  }

  const epique = decision?.decision === "refused" && decision.kind === ("epic" satisfies Nature);
  if (decision !== null && !epique && decision.decision !== "fire") {
    return { etat: "ecartee", dit: enUneLigne(decision.decision === "aside" ? decrireEcart(decision) : decrire(decision)) };
  }
  if (epique || labels.includes(LABEL_EPIQUE)) return { etat: "epique", dit: epique ? enUneLigne(`pas encore découpée — ${decision?.reason ?? ""}`) : "elle porte `epic` : pas encore découpée" };

  if (remiseDe(base, ticket) !== null) return { etat: "non-lue", dit: "rendue au manager, pas encore rejugée" };
  // Mise sur le rail par le manager, puis dite hors cuisine avant d'y entrer : il ne l'a pas relue depuis.
  if (decision !== null) return { etat: "non-lue", dit: "elle porte `hors-cuisine` depuis que le manager l'a mise sur le rail : il ne l'a pas encore relue" };
  return { etat: "non-lue", dit: "le manager ne l'a pas encore jugée" };
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
  const attentes = new Map(attentesDuChef(base, rail).flatMap((attente) => (attente.ticket === null || surLeRail.has(attente.ticket) ? [] : [[attente.ticket, direAttente(attente)] as const])));
  return ouvertes
    .filter((issue) => issue.pr !== true && !surLeRail.has(issue.number) && !epiqueToutServie(base, issue.number))
    .sort((a, b) => (priorite(a.labels) ?? 10) - (priorite(b.labels) ?? 10) || a.createdAt.localeCompare(b.createdAt) || a.number - b.number)
    .map((issue) => ({ ticket: issue.number, titre: issue.title, url: issue.url, priorite: priorite(issue.labels), ...etatDe(base, issue, attentes) }));
}
