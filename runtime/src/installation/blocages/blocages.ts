// Ce qui bloque un projet, de son ajout à son service : un seul modèle, que
// chaque partie de l'installation alimente (le clone, la préparation, ce qui
// manque à la station…) et que la page du projet, dans l'app, montre (#1393).
//
// Un blocage dit, en une phrase chacun, ce qui est bloqué (`message`) et
// pourquoi (`cause`). Il porte, au besoin, le geste que l'app sait faire pour
// le lever (`action`, son identifiant) ou, quand le geste se fait hors de
// l'app, la page exacte où le faire (`link`). Ce qu'une commande a dit — git,
// le shell, le runtime — n'est jamais le message : il ne tient que dans
// `detail`, que l'app ne montre qu'en second. Un message, ou une cause, qui
// n'est que la sortie brute d'une commande est assaini à l'écriture : il passe
// dans `detail`, et une phrase le remplace.
//
// Les blocages s'écrivent au journal du projet (`evenements.ts`) : la station
// et la cuisine du projet y écrivent chacune de leur process, et la station
// les publie dans le suivi du projet (`projets/demande.ts`, `blocages`). Le
// même blocage — le même `id` — posé deux fois n'en fait qu'un : posé à
// l'identique, rien ne s'écrit ; posé autrement, il remplace l'ancien, à sa
// place. Levé, il quitte la liste ; reposé ensuite, il y revient, en dernier.
import { mkdirSync } from "node:fs";
import type { Base } from "../../base.ts";
import { masquerIdentifiants } from "../../identifiants.ts";
import { ouvrirJournal, type Journal } from "../../journal.ts";
import type { BlocageEcrit } from "./evenements.ts";

export type Blocage = BlocageEcrit;

// Ce qu'un producteur pose : `action`, `link` et `detail` peuvent manquer, ou valoir null.
export type NouveauBlocage = { id: string; message: string; cause: string; action?: string | null; link?: string | null; detail?: string | null };

// Qui pose ou lève un blocage, et pour quel projet : l'enveloppe du fait.
export type Auteur = { projet: string; auteur: string };

// Un blocage mal formé par son producteur — une erreur de code, pas de
// l'installation : un identifiant, une action ou un lien illisible, un message
// ou une cause vide.
export class BlocageInvalide extends Error {}

const ID = /^[a-z0-9][a-z0-9.:_-]{0,79}$/;
const ACTION = /^[a-z0-9][a-z0-9.:_-]{0,79}$/;
// Une phrase se lit d'un coup : au-delà, ce n'en est plus une.
const PHRASE_MAX = 400;
// Ce que `detail` garde, au plus — comme le clone en échec (`projets/echec-du-clone.ts`).
export const DETAIL_MAX = 2000;

// Ce qui remplace un message, ou une cause, qui n'était que la sortie brute d'une commande.
export const MESSAGE_DE_REPLI = "Something blocks this project, and the station could not say it in one sentence: the details hold what it saw.";
export const CAUSE_DE_REPLI = "The station did not recognise what went wrong.";

// Ce que dit une commande, et jamais une phrase pour le chef : une fin de
// process (`exit status 128`), le message d'un `execFile` (`Command failed:`),
// l'enveloppe de git que gh pose (`failed to run git`), une ligne de git ou
// d'un outil (`fatal:`, `error:`, `npm ERR!`), un code d'erreur de Node ou de
// pnpm (`ERR_…`, `ENOENT`), un signal, une erreur JavaScript ou Python, une
// trace de pile, une invite de shell — ou plus d'une ligne.
const BRUTS: readonly RegExp[] = [
  /[\r\n]/,
  /\bexit (?:status|code) -?\d+/i,
  /\bexited with (?:code|status) -?\d+/i,
  /\bcommand failed:/i,
  /\bfailed to run git\b/i,
  /^\s*(?:fatal|error|warning|hint|usage)\s*:/i,
  /^\s*(?:npm )?(?:err|warn)!/i,
  /\b(?:ERR|ERR_PNPM)_[A-Z0-9_]{2,}\b/,
  /\b(?:ENOENT|EACCES|EPERM|EEXIST|ENOTDIR|EISDIR|ENOTEMPTY|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|EADDRINUSE)\b/,
  /\bSIG(?:TERM|KILL|INT|HUP|SEGV|ABRT|PIPE|QUIT)\b/,
  /^\s*(?:[A-Z]\w*)?(?:Error|Exception)(?: \[[A-Z0-9_]+\])?:/,
  /\bTraceback \(most recent call last\)/,
  /\bat (?:async )?\S+ \(\S*:\d+:\d+\)/,
  /\bat (?:file:\/\/|node:|\/)\S*:\d+(?::\d+)?/,
  /^\s*[$#>] \S/,
];

// Vrai si le texte est la sortie brute d'une commande plutôt qu'une phrase pour le chef.
export function estUneSortieBrute(texte: string): boolean {
  const net = texte.trim();
  return net.length > PHRASE_MAX || BRUTS.some((motif) => motif.test(net));
}

const optionnel = (valeur: string | null | undefined): string | null => {
  if (valeur === undefined || valeur === null) return null;
  const net = valeur.trim();
  return net === "" ? null : net;
};

function lien(valeur: string): string {
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    throw new BlocageInvalide(`blocage : lien illisible — ${valeur.slice(0, 80)}`);
  }
  if (url.protocol !== "https:") throw new BlocageInvalide(`blocage : un lien s'ouvre en https, pas en ${url.protocol} — ${valeur.slice(0, 80)}`);
  return valeur;
}

// Le blocage tel qu'il s'écrit : vérifié, et assaini — jamais la sortie brute
// d'une commande comme message ni comme cause. Pur.
export function blocage(nouveau: NouveauBlocage): Blocage {
  const { id } = nouveau;
  if (typeof id !== "string" || !ID.test(id)) throw new BlocageInvalide(`blocage : identifiant illisible — attendu une clé courte en minuscules, chiffres, « . : _ - » : ${String(id).slice(0, 80)}`);
  const message = optionnel(nouveau.message);
  const cause = optionnel(nouveau.cause);
  if (message === null) throw new BlocageInvalide(`blocage ${id} : message vide`);
  if (cause === null) throw new BlocageInvalide(`blocage ${id} : cause vide`);
  const action = optionnel(nouveau.action);
  if (action !== null && !ACTION.test(action)) throw new BlocageInvalide(`blocage ${id} : action illisible — attendu l'identifiant d'un geste de l'app : ${action.slice(0, 80)}`);
  const link = optionnel(nouveau.link);
  // Ce qu'une commande a dit, gardé en second : le message brut d'abord, puis
  // la cause brute, puis le détail donné.
  const [messageBrut, causeBrute] = [estUneSortieBrute(message), estUneSortieBrute(cause)];
  const detail = [messageBrut ? message : null, causeBrute ? cause : null, optionnel(nouveau.detail)]
    .filter((partie): partie is string => partie !== null)
    .join("\n\n")
    .slice(0, DETAIL_MAX);
  return {
    id,
    message: messageBrut ? MESSAGE_DE_REPLI : message,
    cause: causeBrute ? CAUSE_DE_REPLI : cause,
    ...(action === null ? {} : { action }),
    ...(link === null ? {} : { link: lien(link) }),
    ...(detail === "" ? {} : { detail }),
  };
}

const memes = (a: Blocage, b: Blocage) => JSON.stringify(a) === JSON.stringify(b);

// Les blocages en cours d'un projet, d'après son journal, dans l'ordre où ils ont été posés.
export function blocagesDuJournal(base: Base): Blocage[] {
  const faits = base.lire<{ type: string; payload: string }>("SELECT type, payload FROM events WHERE type IN ('blocker.raised', 'blocker.resolved') ORDER BY seq");
  const enCours = new Map<string, Blocage>();
  for (const { type, payload } of faits) {
    const lu = JSON.parse(payload) as Blocage;
    if (type === "blocker.resolved") enCours.delete(lu.id);
    else enCours.set(lu.id, lu);
  }
  return [...enCours.values()];
}

// Pose un blocage au journal du projet. Rend le blocage tel qu'il est en
// cours, et s'il a fallu l'écrire : posé à l'identique, rien ne s'écrit. La
// lecture et l'écriture tiennent dans une transaction : deux process qui
// posent le même blocage ensemble n'en écrivent qu'un. Il se compare masqué,
// tel que le journal l'écrit (`identifiants.ts`) : un jeton dans `detail` ne
// le fait pas réécrire à chaque fois.
export function poserBlocage(journal: Journal, { projet, auteur }: Auteur, nouveau: NouveauBlocage): { blocage: Blocage; ecrit: boolean } {
  const pose = JSON.parse(masquerIdentifiants(JSON.stringify(blocage(nouveau))).texte) as Blocage;
  return journal.base.transaction(() => {
    const deja = blocagesDuJournal(journal.base).find(({ id }) => id === pose.id);
    if (deja !== undefined && memes(deja, pose)) return { blocage: deja, ecrit: false };
    journal.ajouter({ project: projet, ticket: null, author: auteur, type: "blocker.raised", payload: pose });
    return { blocage: pose, ecrit: true };
  });
}

// Lève un blocage : il quitte la liste. Rend faux s'il n'était pas posé — rien ne s'écrit.
export function leverBlocage(journal: Journal, { projet, auteur }: Auteur, id: string): boolean {
  return journal.base.transaction(() => {
    if (!blocagesDuJournal(journal.base).some((enCours) => enCours.id === id)) return false;
    journal.ajouter({ project: projet, ticket: null, author: auteur, type: "blocker.resolved", payload: { id } });
    return true;
  });
}

// Les mêmes, dans le répertoire d'état d'un projet, pour qui n'en tient pas le
// journal ouvert — la station, avant que la cuisine du projet ne s'ouvre :
// le répertoire est créé au besoin.
function avecLeJournal<T>(repertoireEtat: string, faire: (journal: Journal) => T): T {
  mkdirSync(repertoireEtat, { recursive: true });
  const journal = ouvrirJournal(repertoireEtat);
  try {
    return faire(journal);
  } finally {
    journal.fermer();
  }
}

export const poserBlocageDans = (repertoireEtat: string, auteur: Auteur, nouveau: NouveauBlocage) => avecLeJournal(repertoireEtat, (journal) => poserBlocage(journal, auteur, nouveau));

export const leverBlocageDans = (repertoireEtat: string, auteur: Auteur, id: string) => avecLeJournal(repertoireEtat, (journal) => leverBlocage(journal, auteur, id));

// Les blocages en cours d'un projet, lus dans son répertoire d'état, en
// lecture seule : la cuisine qui y écrit n'est pas dérangée. Sans journal, ou
// illisible, aucun.
export function lireBlocages(repertoireEtat: string): Blocage[] {
  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch {
    return [];
  }
  try {
    return blocagesDuJournal(journal.base);
  } catch {
    return [];
  } finally {
    journal.fermer();
  }
}
