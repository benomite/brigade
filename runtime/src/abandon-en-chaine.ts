// Un ticket que la cuisine abandonne ne laisse personne l'attendre (#1902).
// Abandonné, il sort du rail, son issue ouverte : un ticket qui l'attend ne
// partirait plus jamais. La décision se prend donc une fois, pour toute la
// chaîne : chaque ticket qui l'attend, directement ou de proche en proche, sort
// du rail avec lui — son label `fire` retiré, la même raison dite sur sa carte,
// et un commentaire sur son issue qui nomme le ticket abandonné, la racine.
// Une seule règle, sans exception : remettre `fire` sur la racine est le seul
// chemin du retour, et ceux qui sont sortis avec elle la suivent d'eux-mêmes.
//
// Rien n'est tenu ici : tout se relit du journal. La racine est abandonnée tant
// que son dernier `pass.kitchen-took-over` `drop` suit sa dernière entrée sur le
// rail ; un ticket sorti avec elle porte `ticket.dropped-with`, et
// `ticket.back-with` quand il l'a suivie au retour.
import type { Base } from "./base.ts";
import { LABEL, type GitHub } from "./github.ts";
import type { Journal } from "./journal.ts";
import { LimiteGitHubAtteinte } from "./limite-github.ts";
import { lireRail, sortDuTicket, ticketDuRail, type TicketRail } from "./projections/rail.ts";

// Pourquoi un ticket sort du rail avec sa racine : la racine, et ce que la
// cuisine a dit de son abandon — sa cause, sa raison.
export type AbandonEnChaine = { root: number; cause: string; reason: string };

const derniereEntree = (base: Base, ticket: number): number =>
  base.lire<{ seq: number | null }>("SELECT max(seq) AS seq FROM events WHERE ticket = ? AND type = 'ticket.arrived'", ticket)[0]?.seq ?? 0;

const lu = (payload: string) => JSON.parse(payload) as { cause?: unknown; reason?: unknown; root?: unknown };
const texte = (valeur: unknown, sinon: string) => (typeof valeur === "string" && valeur !== "" ? valeur : sinon);

// Les tickets que la cuisine a abandonnés et qui ne sont pas revenus sur le
// rail depuis : chacun est sa propre racine.
function racinesAbandonnees(base: Base): Map<number, AbandonEnChaine> {
  const racines = new Map<number, AbandonEnChaine>();
  const abandons = base.lire<{ ticket: number; seq: number; payload: string }>(
    "SELECT ticket, seq, payload FROM events WHERE type = 'pass.kitchen-took-over' AND ticket IS NOT NULL AND json_extract(payload, '$.move') = 'drop' ORDER BY seq",
  );
  for (const { ticket, seq, payload } of abandons) {
    racines.delete(ticket);
    if (seq < derniereEntree(base, ticket)) continue;
    const { cause, reason } = lu(payload);
    racines.set(ticket, { root: ticket, cause: texte(cause, "?"), reason: texte(reason, "la raison est sur son issue") });
  }
  return racines;
}

// Le dernier `ticket.dropped-with` de chaque ticket qui en porte un.
function sortisAvec(base: Base): Map<number, AbandonEnChaine & { seq: number }> {
  const sortis = new Map<number, AbandonEnChaine & { seq: number }>();
  for (const { ticket, seq, payload } of base.lire<{ ticket: number; seq: number; payload: string }>("SELECT ticket, seq, payload FROM events WHERE type = 'ticket.dropped-with' AND ticket IS NOT NULL ORDER BY seq")) {
    const { root, cause, reason } = lu(payload);
    if (typeof root === "number") sortis.set(ticket, { root, cause: texte(cause, "?"), reason: texte(reason, "la raison est sur son issue"), seq });
  }
  return sortis;
}

// Ce que la cuisine abandonne à cette heure : les racines, et les tickets sortis
// avec l'une d'elles qui ne sont pas revenus sur le rail depuis.
export function abandonsEnCours(base: Base): Map<number, AbandonEnChaine> {
  const racines = racinesAbandonnees(base);
  const abandons = new Map(racines);
  for (const [ticket, sorti] of sortisAvec(base)) {
    const racine = racines.get(sorti.root);
    if (racine === undefined || abandons.has(ticket) || sorti.seq < derniereEntree(base, ticket)) continue;
    abandons.set(ticket, racine);
  }
  return abandons;
}

// Ceux qui attendent : en attente sur le rail, ou mis de côté. Un ticket pris
// ou en pass cuit — il sera jugé de retour en attente.
const attendant = ({ state }: TicketRail) => state === "waiting" || state === "86";

// Les tickets du rail qui doivent en sortir avec une racine abandonnée, chacun
// avec elle : ceux qui en attendent une, ou attendent un ticket qui en attend
// une, de proche en proche — et ceux qui en sont déjà sortis avec elle mais
// sont encore là. `nouveau` : la cuisine ne l'a pas encore dit.
export function aSortirAvec(base: Base, rail: TicketRail[] = lireRail(base)): Map<number, AbandonEnChaine & { nouveau: boolean }> {
  const abandons = abandonsEnCours(base);
  const aSortir = new Map<number, AbandonEnChaine & { nouveau: boolean }>();
  for (const ticket of rail) {
    const deja = abandons.get(ticket.ticket);
    if (deja !== undefined && deja.root !== ticket.ticket) aSortir.set(ticket.ticket, { ...deja, nouveau: false });
  }
  for (let change = true; change; ) {
    change = false;
    for (const ticket of rail) {
      if (!attendant(ticket) || abandons.has(ticket.ticket)) continue;
      const racine = ticket.awaits.map(({ ticket: attendu }) => abandons.get(attendu)).find((abandon) => abandon !== undefined);
      if (racine === undefined) continue;
      abandons.set(ticket.ticket, racine);
      aSortir.set(ticket.ticket, { ...racine, nouveau: true });
      change = true;
    }
  }
  return aSortir;
}

// La carte d'un ticket qui sort du rail avec sa racine, en anglais (`status`).
export const direSortieAvecEn = ({ root, cause }: AbandonEnChaine) => `the kitchen drops it with #${root} (${cause}), which it awaits: it leaves the rail, the reason is on its issue`;

const majuscule = (phrase: string) => `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`;

export function corpsDeSortieAvec({ root, cause, reason }: AbandonEnChaine): string {
  return [
    `**Cuisine — ticket abandonné avec #${root} (\`${cause}\`).**`,
    "",
    `Ce ticket attend #${root}, directement ou de proche en proche, et la cuisine vient d'abandonner #${root}. **Pourquoi.** ${majuscule(reason)}.`,
    "",
    `Plutôt que de le laisser attendre un ticket qui ne partira plus, la cuisine retire son label \`${LABEL}\` : il sort du rail avec #${root}. Son issue reste ouverte, et il n'entre pas dans TODO — ce n'est pas un choix de produit. Il revient sur le rail de lui-même quand \`${LABEL}\` revient sur #${root} : c'est le seul chemin du retour.`,
  ].join("\n");
}

export function corpsDeRetourAvec(root: number): string {
  return [
    `**Cuisine — #${root} est revenu sur le rail : ce ticket aussi.**`,
    "",
    `Ce ticket était sorti du rail avec #${root}, que la cuisine avait abandonné. \`${LABEL}\` est revenu sur #${root} : la cuisine repose le sien, et il reprend sa place sur le rail.`,
  ].join("\n");
}

// Les tickets sortis avec une racine qu'il faut ramener : la racine est revenue
// sur le rail, et eux en sont sortis parce que la cuisine a retiré leur `fire`
// — pas fermés depuis, ni revenus, ni déjà ramenés.
export function aRamenerAvec(base: Base): Array<{ ticket: number; root: number }> {
  const abandons = racinesAbandonnees(base);
  const ramenes = new Map(base.lire<{ ticket: number; seq: number }>("SELECT ticket, max(seq) AS seq FROM events WHERE type = 'ticket.back-with' AND ticket IS NOT NULL GROUP BY ticket").map(({ ticket, seq }) => [ticket, seq]));
  return [...sortisAvec(base)].flatMap(([ticket, { root, seq }]) => {
    if (abandons.has(root) || ticketDuRail(base, root) === null || ticketDuRail(base, ticket) !== null) return [];
    if ((ramenes.get(ticket) ?? 0) > seq) return [];
    const sort = sortDuTicket(base, ticket);
    return sort?.outcome === "left" && sort.reason === "unfired" && sort.seq > seq ? [{ ticket, root }] : [];
  });
}

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Fait sortir du rail ceux qui attendent un ticket abandonné, et ramène ceux
// dont la racine est revenue. Joué après chaque sondage : c'est lui qui voit la
// racine partir, puis revenir. Le commentaire d'abord : sans lui, rien n'est
// écrit, et le sondage suivant y revient. GitHub en panne sur un ticket : dit,
// et repris au sondage suivant. Rend le nombre de tickets sortis ou ramenés.
export async function abandonnerEnChaine(journal: Journal, github: GitHub, projet: string): Promise<number> {
  const { base } = journal;
  let faits = 0;
  for (const [ticket, abandon] of aSortirAvec(base)) {
    try {
      if (abandon.nouveau) {
        await github.commenter(ticket, corpsDeSortieAvec(abandon));
        const { root, cause, reason } = abandon;
        journal.ajouter({ project: projet, ticket, author: "runtime", type: "ticket.dropped-with", payload: { root, cause, reason } });
        console.error(`brigade : la cuisine abandonne le ticket #${ticket} avec #${root}, qu'il attend (${cause}) — il sort du rail, hors de TODO`);
        faits++;
      }
      // Déjà absent, le label n'est pas à retirer : redemandé, il ne coûte rien.
      await github.delabelliser(ticket, LABEL);
    } catch (erreur) {
      if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
      console.error(`brigade : la cuisine n'a pas pu sortir du rail le ticket #${ticket}, qui attend #${abandon.root} qu'elle abandonne — ${message(erreur)}. Repris au sondage suivant`);
    }
  }
  for (const { ticket, root } of aRamenerAvec(base)) {
    try {
      const issue = await github.issue(ticket);
      // Fermée ou disparue depuis : il n'y a rien à ramener.
      const ramene = issue !== null && issue.state === "open";
      if (ramene && !issue.labels.includes(LABEL)) await github.labelliser(ticket, [LABEL]);
      journal.ajouter({ project: projet, ticket, author: "runtime", type: "ticket.back-with", payload: { root, refired: ramene } });
      if (ramene) {
        console.error(`brigade : #${root} est revenu sur le rail — la cuisine y ramène le ticket #${ticket}, sorti avec lui`);
        faits++;
        await github.commenter(ticket, corpsDeRetourAvec(root)).catch((erreur: unknown) => {
          // Le label est reposé, le journal le dit : un commentaire qui ne part pas ne retient rien.
          console.error(`brigade : commentaire non posté sur le ticket #${ticket} — ${message(erreur)}`);
        });
      }
    } catch (erreur) {
      if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
      console.error(`brigade : la cuisine n'a pas pu ramener le ticket #${ticket} avec #${root} — ${message(erreur)}. Repris au sondage suivant`);
    }
  }
  return faits;
}
