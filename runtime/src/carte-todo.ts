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

// Le seul chemin d'une carte vers TODO : la porte la juge, et le journal le
// retient — `todo.entered` admise, `todo.refused` et sa raison sinon. Rend le
// jugement. `auteur` : qui la pose (`manager`, `pass`, `station:<nom>`…).
export function entrerDansTodo(journal: Journal, projet: string, ticket: number, proposition: Proposition, auteur: string): Jugement {
  const jugement = jugerCarte(proposition);
  if (jugement.admise) {
    const { type: kind, enonce: statement, capture } = jugement.carte;
    journal.ajouter({ project: projet, ticket, author: auteur, type: "todo.entered", payload: { kind, statement, capture } });
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
