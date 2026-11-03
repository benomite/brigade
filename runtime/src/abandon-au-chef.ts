// Un ticket que la cuisine sort du rail sans l'avoir servi est une décision que
// le chef doit voir (#2118) : il entre dans sa file (attend.ts) en carte, qui
// dit quel ticket, pourquoi en une phrase, et ses trois gestes — le remettre sur
// le rail, le prendre en session de dev, fermer son issue
// (carte-todo/cartes.ts, reponse-carte.ts).
//
// Les trois voies par lesquelles la cuisine sort un ticket du rail sans le
// servir, et le fait qui en ouvre la carte :
// - la pass l'abandonne : rien ne peut plus monter, ou sa cause n'est pas au
//   cook (`pass.kitchen-took-over` `drop`, remontee-a-la-cuisine.ts) ;
// - il en attend un que la pass abandonne, et sort du rail avec lui
//   (`ticket.dropped-with`, abandon-en-chaine.ts) ;
// - le triage le retire du rail au lieu de poser sa carte devant le chef
//   (`todo.triaged` `remove`, triage/triage.ts).
// Un retrait que le chef fait lui-même — `rail drop`, la réponse à une carte,
// la tâche confiée à un humain — n'en ouvre aucune : la décision est la sienne.
//
// La carte ne sort jamais seule : seule la réponse du chef l'ôte — ses mots sur
// la carte (`todo.answered`), `fire` qu'il remet (le ticket revient sur le
// rail, `ticket.arrived`), l'issue qu'il ferme (le manager le constate,
// `manager.closed`), ou la PR qu'il merge à la main (`merge.done`,
// `ticket.served`). Tant que le ticket est encore sur le rail — le sondage n'a
// pas encore vu `fire` retiré —, c'est sa carte du rail qui parle : il n'est pas
// encore sorti.
//
// Rien n'est tenu ici : tout se relit du journal.
import type { Base } from "./base.ts";
import { SANS_RENVOI } from "./remontee-a-la-cuisine.ts";

// Qui a sorti le ticket du rail : la pass (`pass`), la chaîne d'un ticket que
// la pass abandonne (`chain`), ou le triage (`triage`).
export type Voie = "pass" | "chain" | "triage";

// Un ticket que la cuisine a sorti du rail sans le servir, et que le chef n'a
// pas encore tranché. `since` : l'abandon ; `cause` : celle de la remontée
// abandonnée — pour la chaîne, celle de la racine —, nulle pour le triage ;
// `reason` : ce que la cuisine en a dit sur l'issue, en ses mots ; `root` : la
// racine abandonnée qu'il attend, pour la chaîne seulement ; `title` : le
// dernier titre que le rail lui a lu.
export type Abandon = { ticket: number; since: string; seq: number; voie: Voie; cause: string | null; reason: string | null; root: number | null; title: string | null };

// Ce qui ôte la carte : chacun est un geste du chef, ou sa suite.
const REPONSES = ["todo.answered", "ticket.arrived", "manager.closed", "merge.done", "ticket.served"];

const texte = (valeur: unknown): string | null => (typeof valeur === "string" && valeur.trim() !== "" ? valeur : null);

// Les tickets que la cuisine a sortis du rail sans les servir, et dont le chef
// n'a pas encore tranché le sort, du plus ancien au plus récent — ou ce seul
// `ticket`. Un ticket encore sur le rail y est aussi : c'est au lecteur de
// l'écarter.
export function abandonsAuChef(base: Base, ticket: number | null = null): Abandon[] {
  const lignes = base.lire<{ seq: number; at: string; ticket: number; type: string; payload: string }>(
    `SELECT seq, at, ticket, type, payload FROM events
     WHERE ${ticket === null ? "ticket IS NOT NULL" : "ticket = ?"}
       AND ((type = 'pass.kitchen-took-over' AND json_extract(payload, '$.move') = 'drop')
         OR type = 'ticket.dropped-with'
         OR (type = 'todo.triaged' AND json_extract(payload, '$.action') = 'remove')
         OR type IN (${REPONSES.map(() => "?").join(", ")}))
     ORDER BY seq`,
    ...(ticket === null ? [] : [ticket]),
    ...REPONSES,
  );
  const abandons = new Map<number, Omit<Abandon, "title">>();
  for (const { seq, at, ticket, type, payload } of lignes) {
    const lu = JSON.parse(payload) as { cause?: unknown; reason?: unknown; root?: unknown; sentence?: unknown };
    const commun = { ticket, since: at, seq };
    if (type === "pass.kitchen-took-over") abandons.set(ticket, { ...commun, voie: "pass", cause: texte(lu.cause), reason: texte(lu.reason), root: null });
    else if (type === "ticket.dropped-with") abandons.set(ticket, { ...commun, voie: "chain", cause: texte(lu.cause), reason: texte(lu.reason), root: typeof lu.root === "number" ? lu.root : null });
    else if (type === "todo.triaged") abandons.set(ticket, { ...commun, voie: "triage", cause: null, reason: texte(lu.sentence) ?? texte(lu.reason), root: null });
    else abandons.delete(ticket);
  }
  return [...abandons.values()].map((abandon) => ({ ...abandon, title: titreLu(base, abandon.ticket) }));
}

// Le dernier titre que le rail a lu du ticket : il a quitté le rail, qui ne le
// donne plus.
function titreLu(base: Base, ticket: number): string | null {
  const [ligne] = base.lire<{ title: string | null }>(
    "SELECT json_extract(payload, '$.title') AS title FROM events WHERE ticket = ? AND type IN ('ticket.arrived', 'ticket.changed') AND json_extract(payload, '$.title') IS NOT NULL ORDER BY seq DESC LIMIT 1",
    ticket,
  );
  return texte(ligne?.title);
}

// Pourquoi la cuisine l'a sorti du rail, en une phrase de mots fixes — la
// carte n'y met ni le texte libre de la cuisine ni celui de l'agent, qui sont
// sur l'issue.
export function pourquoiEn({ voie, cause, root }: Pick<Abandon, "voie" | "cause" | "root">): string {
  const dite = cause === null ? "" : ` (${cause})`;
  if (voie === "chain") return `It waits for #${root ?? "?"}, which the kitchen dropped${dite}, and it left the rail with it.`;
  if (voie === "triage") return "The triage took it off the rail instead of asking you.";
  if (cause !== null && Object.hasOwn(SANS_RENVOI, cause)) return `Its cause${dite} is not one a cook can lift, and the fix ticket the kitchen could open on it was tried.`;
  return `Its delivery stayed blocked${dite} after everything the kitchen could try, up to the highest calibration it sets.`;
}

// La même, en français : la ligne d'urgence et ce que rien n'a encore traduit.
export function pourquoi({ voie, cause, root }: Pick<Abandon, "voie" | "cause" | "root">): string {
  const dite = cause === null ? "" : ` (${cause})`;
  if (voie === "chain") return `il attend #${root ?? "?"}, que la cuisine a abandonné${dite}, et il est sorti du rail avec lui`;
  if (voie === "triage") return "le triage l'a retiré du rail au lieu de te poser la question";
  if (cause !== null && Object.hasOwn(SANS_RENVOI, cause)) return `sa cause${dite} n'est pas au cook, et le ticket \`fix\` que la cuisine pouvait ouvrir sur elle l'a été`;
  return `sa livraison est restée bloquée${dite} après tout ce que la cuisine pouvait tenter, jusqu'au plus haut calibrage qu'elle pose`;
}
