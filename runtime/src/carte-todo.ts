// La porte de TODO : ce qui entre dans la file du chef en carte typée. Une
// carte dit son type — `product` (un choix entre plusieurs voies, qui change
// ce que l'utilisateur obtient), `design` (un écran ou un rendu à valider,
// montré avec sa capture) ou `gesture` (un accès ou une action que seul le
// chef peut faire : un `sudo`, un compte client, un secret) — et, en une
// ligne, ce qu'on attend de lui. Une carte qui n'est d'aucun de ces trois
// types n'entre pas, une carte `design` sans sa capture non plus : le refus
// s'écrit au journal avec sa raison (`todo.refused`), et la carte n'est pas
// dans TODO.
//
// `jugerCarte` est la porte elle-même, sans E/S ; `entrerDansTodo`, le seul
// chemin par lequel une carte entre — celui que prend tout ce qui veut poser
// une carte devant le chef (le manager, la pass, une station). Une carte
// admise est relue du journal par la file du chef (attend.ts) : elle y est
// jusqu'à ce qu'elle en sorte (`sortirDeTodo`), que son ticket quitte le rail
// ou soit servi, ou qu'une autre carte du même ticket la remplace.
//
// Devant la porte, le triage (triage/triage.ts) : tant qu'il est branché sur
// le journal (`brancherLeTriage`), une carte admise n'entre pas — elle est
// retenue (`todo.held`), et c'est l'agent de triage qui la tranche ou la
// laisse entrer (`laisserEntrer`). Elle n'est pas dans TODO tant qu'il décide.
import type { Base } from "./base.ts";
import type { Journal } from "./journal.ts";

export const TYPES_DE_CARTE = ["product", "design", "gesture"] as const;
export type TypeDeCarte = (typeof TYPES_DE_CARTE)[number];

// Ce qu'on propose d'entrer : tel quel, rien n'y est encore vérifié.
export type Proposition = { type?: string | null; enonce?: string | null; capture?: string | null };

// Une carte qui a passé la porte. `capture` : nulle sur une carte qui n'en
// porte pas — jamais sur une carte `design`.
export type CarteDeTodo = { type: TypeDeCarte; enonce: string; capture: string | null };

export type Jugement = { admise: true; carte: CarteDeTodo } | { admise: false; raison: string };

const LES_TROIS = TYPES_DE_CARTE.join(", ").replace(/, (?=[^,]*$)/, " or ");
const estType = (mot: string): mot is TypeDeCarte => (TYPES_DE_CARTE as readonly string[]).includes(mot);
const surPlusieursLignes = (texte: string) => /[\r\n]/.test(texte);

// La porte : admise, la carte est rendue nettoyée (type en minuscules, énoncé
// et capture sans blancs autour) ; refusée, la raison en clair — en anglais,
// c'est ce que disent les sorties du chef.
export function jugerCarte({ type, enonce, capture }: Proposition): Jugement {
  const mot = type?.trim().toLowerCase() ?? "";
  if (mot === "") return { admise: false, raison: `no type: a TODO card says whether it is ${LES_TROIS}` };
  if (!estType(mot)) return { admise: false, raison: `unknown type “${type?.trim()}”: a TODO card is ${LES_TROIS}` };
  const dit = enonce?.trim() ?? "";
  if (dit === "") return { admise: false, raison: "no statement: a TODO card says in one line what is expected of the chef" };
  if (surPlusieursLignes(dit)) return { admise: false, raison: "statement on several lines: a TODO card says in one line what is expected of the chef" };
  const montree = capture?.trim() ?? "";
  if (surPlusieursLignes(montree)) return { admise: false, raison: "capture on several lines: a capture is one path or one address" };
  if (mot === "design" && montree === "") return { admise: false, raison: "design card without a capture: a screen or render to validate is shown with its capture" };
  return { admise: true, carte: { type: mot, enonce: dit, capture: montree === "" ? null : montree } };
}

// Le triage branché sur chaque journal, et s'il retient en ce moment : le
// manager le branche, et ne retient que tant qu'il est allumé. Rien n'est
// branché — un outil du chef, un test qui n'en veut pas — : la carte entre
// comme avant.
const triages = new WeakMap<Base, () => boolean>();

// Branche le triage devant la porte de ce journal ; rend de quoi le débrancher.
export function brancherLeTriage(base: Base, retient: () => boolean): () => void {
  triages.set(base, retient);
  return () => {
    if (triages.get(base) === retient) triages.delete(base);
  };
}

// Le seul chemin d'une carte vers TODO : la porte la juge, et le journal le
// retient — `todo.entered` admise, `todo.refused` et sa raison sinon ; admise
// devant un triage qui retient, `todo.held` : elle attend son triage. Rend le
// jugement. `auteur` : qui la pose (`manager`, `pass`, `station:<nom>`…).
export function entrerDansTodo(journal: Journal, projet: string, ticket: number, proposition: Proposition, auteur: string): Jugement {
  const jugement = jugerCarte(proposition);
  if (jugement.admise) {
    const { type: kind, enonce: statement, capture } = jugement.carte;
    const type = triages.get(journal.base)?.() === true ? "todo.held" : "todo.entered";
    journal.ajouter({ project: projet, ticket, author: auteur, type, payload: { kind, statement, capture } });
  } else {
    const brut = (valeur: string | null | undefined) => (valeur === undefined || valeur === null || valeur.trim() === "" ? null : valeur);
    journal.ajouter({
      project: projet,
      ticket,
      author: auteur,
      type: "todo.refused",
      payload: { kind: brut(proposition.type), statement: brut(proposition.enonce), capture: brut(proposition.capture), reason: jugement.raison },
    });
  }
  return jugement;
}

// La carte du ticket sort de TODO : la décision est prise, ou elle n'est plus
// au chef. Rend faux, sans rien écrire, quand le ticket n'en a pas.
export function sortirDeTodo(journal: Journal, projet: string, ticket: number, pourquoi: string, auteur: string): boolean {
  return journal.base.transaction(() => {
    if (!cartesEnTodo(journal.base).some((carte) => carte.ticket === ticket)) return false;
    journal.ajouter({ project: projet, ticket, author: auteur, type: "todo.left", payload: { why: pourquoi } });
    return true;
  });
}

// Une carte retenue par le triage : son ticket, qui l'a posée, depuis quand
// elle attend (`since`) — et, si le triage attend une CI lente, jusqu'à quand
// (`until`) : il ne la retrie pas avant. `seq` : son entrée, qui la distingue
// d'une carte qui la remplacerait pendant son triage.
export type CarteRetenue = CarteDeTodo & { ticket: number; since: string; seq: number; auteur: string; until: string | null };

// Les cartes que le triage retient, dans l'ordre de leur entrée : ni entrées
// dans TODO, ni tranchées, ni parties avec leur ticket.
export function cartesRetenues(base: Base): CarteRetenue[] {
  const lignes = base.lire<{ seq: number; at: string; ticket: number; type: string; author: string; payload: string }>(
    `SELECT seq, at, ticket, type, author, payload FROM events
     WHERE type IN ('todo.held', 'todo.triaged', 'todo.entered', 'ticket.left', 'ticket.served')
       AND ticket IN (SELECT ticket FROM events WHERE type = 'todo.held')
     ORDER BY seq`,
  );
  const cartes = new Map<number, CarteRetenue>();
  for (const { seq, at, ticket, type, author, payload } of lignes) {
    const lu = JSON.parse(payload) as { kind: TypeDeCarte; statement: string; capture: string | null; action?: string; until?: string | null };
    const retenue = cartes.get(ticket);
    if (type === "todo.held") {
      cartes.delete(ticket);
      cartes.set(ticket, { ticket, since: at, seq, auteur: author, type: lu.kind, enonce: lu.statement, capture: lu.capture, until: null });
    } else if (type === "todo.triaged" && lu.action === "wait" && retenue) retenue.until = lu.until ?? null;
    else cartes.delete(ticket);
  }
  return [...cartes.values()];
}

// La carte retenue entre dans TODO, telle qu'elle a été posée et au nom de
// celui qui l'a posée : le triage ne l'a pas tranchée.
export function laisserEntrer(journal: Journal, projet: string, carte: CarteRetenue): void {
  const { ticket, auteur, type: kind, enonce: statement, capture } = carte;
  journal.ajouter({ project: projet, ticket, author: auteur, type: "todo.entered", payload: { kind, statement, capture } });
}

// Une carte dans TODO : son ticket, depuis quand elle y est.
export type CarteEnTodo = CarteDeTodo & { ticket: number; since: string };

// Les cartes dans TODO, relues du journal, dans l'ordre de leur entrée. Seuls
// les tickets qui ont eu une carte sont lus.
export function cartesEnTodo(base: Base): CarteEnTodo[] {
  const lignes = base.lire<{ at: string; ticket: number; type: string; payload: string }>(
    `SELECT at, ticket, type, payload FROM events
     WHERE type IN ('todo.entered', 'todo.left', 'ticket.left', 'ticket.served')
       AND ticket IN (SELECT ticket FROM events WHERE type = 'todo.entered')
     ORDER BY seq`,
  );
  const cartes = new Map<number, CarteEnTodo>();
  for (const { at, ticket, type, payload } of lignes) {
    if (type !== "todo.entered") {
      cartes.delete(ticket);
      continue;
    }
    const { kind, statement, capture } = JSON.parse(payload) as { kind: TypeDeCarte; statement: string; capture: string | null };
    // Remplacée, elle prend la place de l'ancienne : depuis sa propre entrée.
    cartes.delete(ticket);
    cartes.set(ticket, { ticket, since: at, type: kind, enonce: statement, capture });
  }
  return [...cartes.values()];
}

// Combien de cartes sont entrées dans TODO entre `depuis` (compris) et `jusqua`
// (exclu), par type. Chaque entrée compte, une carte qui en remplace une autre
// aussi ; une carte refusée (`todo.refused`) ne compte nulle part. Les trois
// types y sont toujours, à zéro quand rien n'est entré.
export function entreesParType(base: Base, depuis: Date, jusqua: Date): Record<TypeDeCarte, number> {
  const comptes: Record<TypeDeCarte, number> = { product: 0, design: 0, gesture: 0 };
  const lignes = base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'todo.entered' AND at >= ? AND at < ?", depuis.toISOString(), jusqua.toISOString());
  for (const { payload } of lignes) comptes[(JSON.parse(payload) as { kind: TypeDeCarte }).kind]++;
  return comptes;
}

// La ligne de `status` : les entrées de la période, par type.
export function direEntreesEn(comptes: Record<TypeDeCarte, number>, jours: number): string {
  const total = TYPES_DE_CARTE.reduce((somme, type) => somme + comptes[type], 0);
  return `todo       last ${jours} d: ${total} entered — ${TYPES_DE_CARTE.map((type) => `${type} ${comptes[type]}`).join(" · ")}`;
}

// Ce que la carte dit dans la file du chef, sur une ligne : son type, son
// énoncé, et sa capture si elle en a une. En anglais : la ligne du bloc
// `awaiting`.
export function direCarteEn({ type, enonce, capture }: CarteDeTodo): string {
  return `${type}: ${enonce}${capture === null ? "" : ` — capture: \`${capture}\``}`;
}

// La même, en français, pour les sorties que rien n'a encore traduites.
const TYPES_EN_FRANCAIS: Record<TypeDeCarte, string> = { product: "produit", design: "design", gesture: "geste" };
export function direCarte({ type, enonce, capture }: CarteDeTodo): string {
  return `${TYPES_EN_FRANCAIS[type]} : ${enonce}${capture === null ? "" : ` — capture : \`${capture}\``}`;
}
