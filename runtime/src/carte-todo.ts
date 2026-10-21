// La porte de TODO : ce qui entre dans la file du chef en carte typée. Deux
// sortes de cartes y entrent, pas une de plus : `product` (un choix qui change
// ce que l'utilisateur obtient) et `design` (un écran à valider). Chacune pose
// une seule question, précise, et ses choix — au moins un, chacun sur une
// ligne, que le chef clique ; il peut aussi répondre en texte libre
// (reponse-carte.ts). Une carte `design` montre ses captures, avant et après,
// celles que le cook a livrées pour le ticket (captures.ts, `cook.reported`) :
// sans elles, elle n'entre pas. Une carte `product` les montre aussi quand le
// ticket en a livré, et n'en montre aucune sinon.
//
// Une carte d'une autre sorte — un `gesture`, que le manager ou la pass
// proposent encore —, ou sans sa question et ses choix, n'entre pas : le refus
// s'écrit au journal avec sa raison (`todo.refused`), et la carte est renvoyée
// à l'agent de triage (triage/triage.ts), retenue (`todo.held`) jusqu'à ce
// qu'il la tranche ou la réécrive en carte qui passe.
//
// `jugerCarte` est la porte elle-même, sans E/S ; `entrerDansTodo`, le seul
// chemin par lequel une proposition de carte entre — celui que prend tout ce
// qui veut poser une carte devant le chef (le manager, la pass, une station).
// Une carte admise est relue du journal par la file du chef (attend.ts) : elle
// y est jusqu'à ce qu'elle en sorte (`sortirDeTodo`, la réponse du chef), que
// son ticket quitte le rail ou soit servi, ou qu'une autre carte du même
// ticket la remplace.
//
// Devant la porte, le triage : tant qu'il est branché sur le journal
// (`brancherLeTriage`), une carte proposée n'entre pas — elle est retenue
// (`todo.held`), et c'est l'agent de triage qui la tranche ou la fait entrer
// (`laisserEntrer`), telle qu'elle a été posée ou telle qu'il l'a réécrite.
// Elle n'est pas dans TODO tant qu'il décide.
import type { Base } from "./base.ts";
import { capturesManquantes, lireCaptures, type Captures } from "./captures.ts";
import type { Journal } from "./journal.ts";

// Les deux sortes de cartes qui entrent dans TODO.
export const TYPES_DE_CARTE = ["product", "design"] as const;
export type TypeDeCarte = (typeof TYPES_DE_CARTE)[number];

// Ce qu'un producteur peut encore proposer : les deux, et `gesture` — un accès
// ou une action que seul le chef ferait. Une telle proposition va au triage,
// jamais dans TODO.
export const TYPES_PROPOSES = [...TYPES_DE_CARTE, "gesture"] as const;
export type TypePropose = (typeof TYPES_PROPOSES)[number];

// Ce qui suit la réponse du chef (reponse-carte.ts). `resume` : la cuisine
// reprend le ticket avec sa réponse. `merge` : la livraison verte qui attend
// est mergée — valider un écran, garder une voie déjà livrée.
export const SUITES = ["resume", "merge"] as const;
export type Suite = (typeof SUITES)[number];

// Un choix de la carte : ce que le chef clique, en une ligne, et sa suite.
export type Choix = { texte: string; suite: Suite };

// Ce qu'on propose d'entrer : tel quel, rien n'y est encore vérifié.
// `enonce` : ce qui est demandé au chef — pour entrer, une seule question.
// `choix` : ses choix, chacun avec sa suite (`resume` sans elle). `capture` :
// l'écran qu'un producteur montre, que le triage lit — la carte, elle, montre
// les captures livrées.
export type ChoixPropose = { texte?: string | null; suite?: string | null };
export type Proposition = { type?: string | null; enonce?: string | null; capture?: string | null; choix?: readonly ChoixPropose[] | null };

// Une carte qui a passé la porte. `captures` : celles de la livraison du
// ticket, chaque écran avant et après — jamais nulles sur une carte `design`,
// nulles sur une carte `product` dont le ticket n'a livré aucun écran.
export type CarteDeTodo = { type: TypeDeCarte; question: string; choix: Choix[]; captures: Captures | null };

export type Jugement = { admise: true; carte: CarteDeTodo } | { admise: false; raison: string };

// Où une proposition est allée : dans TODO, ou au triage — retenue, avec la
// raison de la porte quand elle l'a refusée (nulle : le triage retient tout).
export type Entree = { porte: "todo"; carte: CarteDeTodo } | { porte: "triage"; raison: string | null };

const surPlusieursLignes = (texte: string) => /[\r\n]/.test(texte);
const estType = (mot: string): mot is TypeDeCarte => (TYPES_DE_CARTE as readonly string[]).includes(mot);
const estSuite = (mot: string): mot is Suite => (SUITES as readonly string[]).includes(mot);

// Une seule question : elle finit par son « ? », et n'en porte pas d'autre.
export const uneQuestion = (texte: string) => texte.endsWith("?") && texte.indexOf("?") === texte.length - 1;

// La porte : admise, la carte est rendue nettoyée (type en minuscules,
// question et choix sans blancs autour) ; refusée, la raison en clair — en
// anglais, c'est ce que disent les sorties du chef. `captures` : celles que le
// ticket a livrées, nulles sans elles.
export function jugerCarte({ type, enonce, choix }: Proposition, captures: Captures | null = null): Jugement {
  const mot = type?.trim().toLowerCase() ?? "";
  if (mot === "") return { admise: false, raison: "no kind: a TODO card is a product choice (product) or a design validation (design)" };
  if (!estType(mot)) return { admise: false, raison: `“${type?.trim()}” is not a TODO card: only a product choice (product) or a design validation (design) reaches the chef` };
  const question = enonce?.trim() ?? "";
  if (question === "") return { admise: false, raison: "no question: a TODO card asks the chef exactly one question" };
  if (surPlusieursLignes(question)) return { admise: false, raison: "question on several lines: a TODO card asks one question, on one line" };
  if (!uneQuestion(question)) return { admise: false, raison: "not exactly one question: a TODO card asks one question, ending with its only “?”" };
  if (!choix || choix.length === 0) return { admise: false, raison: "no choice: a TODO card offers at least one choice to click" };
  const lus: Choix[] = [];
  for (const [rang, propose] of choix.entries()) {
    const texte = propose.texte?.trim() ?? "";
    if (texte === "" || surPlusieursLignes(texte)) return { admise: false, raison: `choice ${rang + 1} is empty or on several lines: each choice is one line` };
    if (lus.some((lu) => lu.texte === texte)) return { admise: false, raison: `choice ${rang + 1} repeats another: each choice is a different way` };
    const suite = propose.suite?.trim().toLowerCase() || "resume";
    if (!estSuite(suite)) return { admise: false, raison: `choice ${rang + 1}: unknown follow-up “${propose.suite}” — ${SUITES.join(" or ")}` };
    lus.push({ texte, suite });
  }
  const montrees = captures !== null && captures.screens.length > 0 ? captures : null;
  if (mot === "design") {
    if (montrees === null) return { admise: false, raison: "design card without its captures: a design validation shows each screen before and after, as its delivery carries them" };
    const manquantes = capturesManquantes(montrees.screens);
    if (manquantes !== null) return { admise: false, raison: `design card with incomplete captures (missing: ${manquantes}): each screen is shown before and after` };
  }
  return { admise: true, carte: { type: mot, question, choix: lus, captures: montrees } };
}

// Les captures que le ticket a livrées : celles de sa dernière livraison
// finie, telles que la station les a rangées (`cook.reported`). Nulles quand
// elle n'en porte aucune.
export function capturesDuTicket(base: Base, ticket: number): Captures | null {
  const [derniere] = base.lire<{ captures: string | null }>(
    "SELECT json_extract(payload, '$.captures') AS captures FROM events WHERE ticket = ? AND type = 'cook.reported' AND json_extract(payload, '$.ending') = 'done' ORDER BY seq DESC LIMIT 1",
    ticket,
  );
  const captures = derniere?.captures == null ? null : lireCaptures(JSON.parse(derniere.captures));
  return captures === null || captures.screens.length === 0 ? null : captures;
}

// Le triage branché sur chaque journal, et s'il retient en ce moment : le
// manager le branche, et ne retient que tant qu'il est allumé.
const triages = new WeakMap<Base, () => boolean>();

// Branche le triage devant la porte de ce journal ; rend de quoi le débrancher.
export function brancherLeTriage(base: Base, retient: () => boolean): () => void {
  triages.set(base, retient);
  return () => {
    if (triages.get(base) === retient) triages.delete(base);
  };
}

const brut = (valeur: string | null | undefined) => (valeur === undefined || valeur === null || valeur.trim() === "" ? null : valeur);

// La proposition telle que le journal la garde : ce qui a été proposé, tel
// quel, nul quand il manque.
function proposee({ type, enonce, capture, choix }: Proposition) {
  return {
    kind: brut(type),
    statement: brut(enonce),
    capture: brut(capture),
    choices: choix ? choix.map(({ texte, suite }) => ({ text: brut(texte), then: brut(suite) })) : null,
  };
}

// La carte admise entre dans TODO, au nom de celui qui l'a posée.
function poserEnTodo(journal: Journal, projet: string, ticket: number, { type: kind, question: statement, choix, captures }: CarteDeTodo, auteur: string): void {
  journal.ajouter({ project: projet, ticket, author: auteur, type: "todo.entered", payload: { kind, statement, choices: choix.map(({ texte, suite }) => ({ text: texte, then: suite })), captures } });
}

// Le refus de la porte, au journal, avec ce qui a été proposé.
function noterLeRefus(journal: Journal, projet: string, ticket: number, proposition: Proposition, raison: string, auteur: string): void {
  journal.ajouter({ project: projet, ticket, author: auteur, type: "todo.refused", payload: { ...proposee(proposition), reason: raison } });
}

// Le seul chemin d'une proposition vers TODO. Devant un triage qui retient,
// elle est retenue (`todo.held`) : il la lira d'abord. Sinon la porte la juge :
// admise, `todo.entered` ; refusée, `todo.refused` et sa raison, et elle est
// renvoyée au triage — retenue, il la reprendra dès qu'il retiendra. Rien
// n'est jamais perdu : une proposition va dans TODO, ou au triage.
// `auteur` : qui la pose (`manager`, `pass`, `station:<nom>`…).
export function entrerDansTodo(journal: Journal, projet: string, ticket: number, proposition: Proposition, auteur: string): Entree {
  return journal.base.transaction((): Entree => {
    const retenir = () => journal.ajouter({ project: projet, ticket, author: auteur, type: "todo.held", payload: proposee(proposition) });
    if (triages.get(journal.base)?.() === true) {
      retenir();
      return { porte: "triage", raison: null };
    }
    const jugement = jugerCarte(proposition, capturesDuTicket(journal.base, ticket));
    if (jugement.admise) {
      poserEnTodo(journal, projet, ticket, jugement.carte, auteur);
      return { porte: "todo", carte: jugement.carte };
    }
    retenir();
    noterLeRefus(journal, projet, ticket, proposition, jugement.raison, auteur);
    return { porte: "triage", raison: jugement.raison };
  });
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

// Une carte retenue par le triage : ce qui a été proposé, son ticket, qui l'a
// posée, depuis quand elle attend (`since`) — et, si le triage attend une CI
// lente, jusqu'à quand (`until`) : il ne la retrie pas avant. `seq` : son
// entrée, qui la distingue d'une carte qui la remplacerait pendant son
// triage. `refus` : pourquoi la porte l'a refusée en dernier, nul tant
// qu'elle ne l'a pas jugée ; `renvois` : combien de fois l'agent l'a envoyée
// en TODO et que la porte la lui a renvoyée.
export type CarteRetenue = {
  type: string | null;
  enonce: string | null;
  capture: string | null;
  choix: ChoixPropose[] | null;
  ticket: number;
  since: string;
  seq: number;
  auteur: string;
  until: string | null;
  refus: string | null;
  renvois: number;
};

type PayloadPropose = { kind: string | null; statement: string | null; capture?: string | null; choices?: Array<{ text: string | null; then: string | null }> | null };

// Les cartes que le triage retient, dans l'ordre de leur entrée : ni entrées
// dans TODO, ni tranchées, ni parties avec leur ticket.
export function cartesRetenues(base: Base): CarteRetenue[] {
  const lignes = base.lire<{ seq: number; at: string; ticket: number; type: string; author: string; payload: string }>(
    `SELECT seq, at, ticket, type, author, payload FROM events
     WHERE type IN ('todo.held', 'todo.triaged', 'todo.refused', 'todo.entered', 'ticket.left', 'ticket.served')
       AND ticket IN (SELECT ticket FROM events WHERE type = 'todo.held')
     ORDER BY seq`,
  );
  const cartes = new Map<number, CarteRetenue>();
  for (const { seq, at, ticket, type, author, payload } of lignes) {
    const lu = JSON.parse(payload) as PayloadPropose & { action?: string; until?: string | null; reason?: string };
    const retenue = cartes.get(ticket);
    if (type === "todo.held") {
      cartes.delete(ticket);
      const choix = lu.choices ? lu.choices.map(({ text, then }) => ({ texte: text, suite: then })) : null;
      cartes.set(ticket, { ticket, since: at, seq, auteur: author, type: lu.kind, enonce: lu.statement, capture: lu.capture ?? null, choix, until: null, refus: null, renvois: 0 });
    } else if (type === "todo.refused") {
      if (retenue) retenue.refus = lu.reason ?? null;
    } else if (type === "todo.triaged" && lu.action === "wait") {
      if (retenue) retenue.until = lu.until ?? null;
    } else if (type === "todo.triaged" && lu.action === "back") {
      if (retenue) retenue.renvois++;
    } else cartes.delete(ticket);
  }
  return [...cartes.values()];
}

// La carte retenue tente d'entrer, telle qu'elle a été posée ou telle que le
// triage l'a réécrite (`proposition`), au nom de celui qui l'a posée. Admise,
// elle est dans TODO ; refusée, `todo.refused` — sauf si la porte vient de
// lui dire la même chose — et elle reste retenue : renvoyée au triage. Rend le
// jugement.
export function laisserEntrer(journal: Journal, projet: string, carte: CarteRetenue, proposition: Proposition = carte): Jugement {
  const jugement = jugerCarte(proposition, capturesDuTicket(journal.base, carte.ticket));
  if (jugement.admise) poserEnTodo(journal, projet, carte.ticket, jugement.carte, carte.auteur);
  else if (proposition !== carte || carte.refus !== jugement.raison) noterLeRefus(journal, projet, carte.ticket, proposition, jugement.raison, carte.auteur);
  return jugement;
}

// Une carte dans TODO : son ticket, depuis quand elle y est.
export type CarteEnTodo = CarteDeTodo & { ticket: number; since: string };

type PayloadEntre = { kind: string; statement: string; choices?: Array<{ text: string; then: Suite }>; captures?: unknown };

// La carte telle que le journal la porte, ou null : une entrée d'avant les
// deux sortes et leurs choix (`gesture`, une carte sans choix) ne pose aucune
// question au chef, et ne se lit pas comme une carte.
function lireCarte({ kind, statement, choices, captures }: PayloadEntre): CarteDeTodo | null {
  if (!estType(kind) || !choices || choices.length === 0) return null;
  return { type: kind, question: statement, choix: choices.map(({ text, then }) => ({ texte: text, suite: then })), captures: captures == null ? null : lireCaptures(captures) };
}

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
    // Remplacée, elle prend la place de l'ancienne : depuis sa propre entrée.
    cartes.delete(ticket);
    const carte = type === "todo.entered" ? lireCarte(JSON.parse(payload) as PayloadEntre) : null;
    if (carte !== null) cartes.set(ticket, { ticket, since: at, ...carte });
  }
  return [...cartes.values()];
}

// Combien de cartes sont entrées dans TODO entre `depuis` (compris) et `jusqua`
// (exclu), par sorte. Chaque entrée compte, une carte qui en remplace une autre
// aussi ; une carte refusée (`todo.refused`) ne compte nulle part, une entrée
// d'avant les deux sortes non plus. Les deux sortes y sont toujours, à zéro
// quand rien n'est entré.
export function entreesParType(base: Base, depuis: Date, jusqua: Date): Record<TypeDeCarte, number> {
  const comptes: Record<TypeDeCarte, number> = { product: 0, design: 0 };
  const lignes = base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'todo.entered' AND at >= ? AND at < ?", depuis.toISOString(), jusqua.toISOString());
  for (const { payload } of lignes) {
    const carte = lireCarte(JSON.parse(payload) as PayloadEntre);
    if (carte !== null) comptes[carte.type]++;
  }
  return comptes;
}

// Ce que le triage a fait un jour (UTC) : `decidedAlone`, les cartes qu'il a
// tranchées lui-même — l'une de ses cinq actions, faite — ; `sentToTodo`, celles
// qu'il a laissées entrer dans TODO. Une carte que la porte lui renvoie
// (`back`) n'est encore ni l'un ni l'autre.
export type TriagesDuJour = { day: string; decidedAlone: number; sentToTodo: number };

// Les comptes du triage par jour, entre `depuis` (compris) et `jusqua` (exclu),
// du plus ancien au plus récent ; un jour sans issue n'y est pas. Relus du
// journal, où chaque issue est écrite (`todo.triaged`) au moment où elle est
// connue : ils survivent à un redémarrage.
export function triagesParJour(base: Base, depuis: Date, jusqua: Date): TriagesDuJour[] {
  const lignes = base.lire<{ at: string; payload: string }>("SELECT at, payload FROM events WHERE type = 'todo.triaged' AND at >= ? AND at < ? ORDER BY seq", depuis.toISOString(), jusqua.toISOString());
  const jours = new Map<string, TriagesDuJour>();
  for (const { at, payload } of lignes) {
    const { action } = JSON.parse(payload) as { action?: string };
    if (action === "back") continue;
    const day = at.slice(0, 10);
    const jour = jours.get(day) ?? { day, decidedAlone: 0, sentToTodo: 0 };
    jours.set(day, jour);
    if (action === "through") jour.sentToTodo++;
    else jour.decidedAlone++;
  }
  return [...jours.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

// Les `jours` derniers jours (UTC), `maintenant` compris, du plus ancien au plus récent : chacun
// avec ses comptes, zéro pour un jour sans issue — c'est ce que `facts` donne à l'app, qui n'a
// rien à compléter.
export function triagesDesDerniersJours(base: Base, maintenant: Date, jours: number): TriagesDuJour[] {
  const fin = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()) + 86_400_000;
  const connus = new Map(triagesParJour(base, new Date(fin - jours * 86_400_000), new Date(fin)).map((jour) => [jour.day, jour]));
  return Array.from({ length: jours }, (_, rang) => {
    const day = new Date(fin - (jours - rang) * 86_400_000).toISOString().slice(0, 10);
    return connus.get(day) ?? { day, decidedAlone: 0, sentToTodo: 0 };
  });
}

// La ligne de `status` : les entrées de la période, par sorte.
export function direEntreesEn(comptes: Record<TypeDeCarte, number>, jours: number): string {
  const total = TYPES_DE_CARTE.reduce((somme, type) => somme + comptes[type], 0);
  return `todo       last ${jours} d: ${total} entered — ${TYPES_DE_CARTE.map((type) => `${type} ${comptes[type]}`).join(" · ")}`;
}

const nombreDEcrans = (captures: Captures, un: string, plusieurs: string) => `${captures.screens.length} ${captures.screens.length === 1 ? un : plusieurs}`;

// Ce que la carte dit dans la file du chef, sur une ligne : sa sorte, sa
// question, ses choix numérotés — le numéro que `rail choose` prend —, et ses
// écrans si elle en montre. En anglais : la ligne du bloc `awaiting`.
export function direCarteEn({ type, question, choix, captures }: CarteDeTodo): string {
  const choisis = choix.map(({ texte }, rang) => `${rang + 1}. ${texte}`).join(" · ");
  return `${type}: ${question} — choices: ${choisis}${captures === null ? "" : ` — captures: ${nombreDEcrans(captures, "screen", "screens")}, before and after`}`;
}

// La même, en français, pour les sorties que rien n'a encore traduites.
const TYPES_EN_FRANCAIS: Record<TypeDeCarte, string> = { product: "produit", design: "design" };
export function direCarte({ type, question, choix, captures }: CarteDeTodo): string {
  const choisis = choix.map(({ texte }, rang) => `${rang + 1}. ${texte}`).join(" · ");
  return `${TYPES_EN_FRANCAIS[type]} : ${question} — choix : ${choisis}${captures === null ? "" : ` — captures : ${nombreDEcrans(captures, "écran", "écrans")}, avant et après`}`;
}
