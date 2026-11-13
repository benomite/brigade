// GitHub vu du runtime : le sondage des issues qui portent le label `fire`,
// celui des issues ouvertes que le manager qualifie, et ce que le manager, la
// station et la pass y lisent et y écrivent — labels, commentaires, issues
// nées d'un découpage, corps d'une épique, PR, CI, merge. Seul module qui lance `gh`. Sous l'identité unique de la
// machine, c'est `gh` qui porte l'authentification ; sous une identité de rôle,
// le jeton lui est remis à chaque appel (voir `identites.ts`).
import { refusDeLaCreation } from "./conflit-main/renvoi.ts";
import { execFile } from "./sans-invite.ts";
import { lienDuCorps } from "./besoin/besoin.ts";
import { porteListe } from "./epique.ts";
import type { Check } from "./events/pass.ts";
import { masquerIdentifiants } from "./identifiants.ts";
import { mesuresGitHubDuProcess } from "./mesures-github.ts";
import { limitesDuProcess, lireLaLimite, type LimitesDuCompte } from "./github-limite.ts";
import { COMPTE_DE_LA_MACHINE, appelerGitHub, constaterLimite, estUneEcriture, etiquetteDe, lectureDe, limiteDuProcess, noterLesEntetes, refusPourLimite, type Limite, type Usage } from "./limite-github.ts";
import { reponseDUnHumainDeclare, type HumainDeclare } from "./reponse-humain-declare/reponse-humain-declare.ts";

// Le label par lequel une issue entre sur le rail.
export const LABEL = "fire";
// Le label par lequel un ticket dit qu'il ne se sert pas sur cette box — sa base
// n'est pas celle du projet, par exemple. Il l'emporte sur `fire`.
export const HORS_CUISINE = "served-elsewhere";

export type Issue = {
  number: number;
  title: string;
  labels: string[];
  state: "open" | "closed";
  createdAt: string;
  // Change à chaque modification de l'issue : c'est lui qui distingue deux
  // faits successifs sur le même ticket.
  updatedAt: string;
  url: string;
  // Une PR, que l'API des issues rend comme une issue. Une PR n'est jamais un
  // ticket.
  pr?: true;
  // Son corps porte la liste des tickets d'une épique (`epique.ts`) : elle se
  // sert par ses tickets, jamais elle-même. Seul le sondage des tickets le dit.
  epique?: true;
  // Le besoin dont son corps se dit né (`Part of #N`, `Epic: #N`) : le rail ne
  // montre pas ce besoin à côté de lui (`besoin/besoin.ts`). Seul le sondage
  // des tickets le dit.
  besoin?: number;
};

// Une issue telle que le manager la juge : avec son corps, et le lien de son
// auteur avec le dépôt, tel que GitHub le nomme (`OWNER`, `MEMBER`, `NONE`…).
export type IssueOuverte = Issue & { body: string; association: string; author?: string };

// Une issue lue parmi celles modifiées depuis un instant : fermée, avec quand
// elle l'a été, si GitHub le dit.
export type IssueDepuis = IssueOuverte & { closedAt?: string };

export type Sondage<I extends Issue = Issue> =
  // GitHub répond que rien n'a changé depuis le dernier sondage confirmé.
  | { inchange: true }
  // `confirmer` : à appeler une fois la liste entièrement traitée. Sans cela,
  // le sondage suivant la redemande en entier.
  | { inchange: false; issues: I[]; confirmer(): void };

// Un commentaire d'issue. `association` : le lien de son auteur avec le dépôt,
// tel que GitHub le nomme (`OWNER`, `MEMBER`, `COLLABORATOR`, `NONE`…).
// `createdAt` : quand il a été posté, tel que GitHub le date.
export type Commentaire = { body: string; author: string; association: string; createdAt: string };

// Une PR telle que la pass la lit. `enRetard` : sa branche n'est pas à jour de la base, et une
// protection de branche l'exige — GitHub en refusera le merge. `mergeePar` : le
// compte qui l'a mergée, tel que GitHub le nomme — nul tant qu'elle ne l'est
// pas, ou s'il ne le dit pas.
export type PR = {
  number: number;
  url: string;
  base: string;
  sha: string;
  state: "open" | "closed";
  merged: boolean;
  enRetard: boolean;
  // Sa branche ne se fusionne pas avec la base : un conflit, que seul un cook résout.
  enConflit?: boolean;
  mergeePar: string | null;
  // Le commit que son merge a posé sur la base (`merge_commit_sha`) : seul
  // `prQuiFerme` le lit, pour l'annulation d'un ticket servi (undo/, #3274).
  commitDeMerge?: string;
  // Ce qui change dès que GitHub change quoi que ce soit à la PR — sa tête, sa
  // base, ce qu'il dit de sa fusion — : l'ETag de sa fiche. Absent s'il n'en
  // donne pas.
  version?: string;
};

// Un statut de commit tel que GitHub le garde : `id` croît avec l'ordre où il
// les reçoit ; `description` tient en 140 caractères.
export type StatutDeCommit = { id: number; state: "pending" | "success" | "failure" | "error"; context: string; description: string; createdAt: string };

// `fait: false` : GitHub a refusé, et dit pourquoi. Une panne — rien ne dit
// alors si le merge a eu lieu — lève.
export type Merge = { fait: true } | { fait: false; motif: string };

export type GitHub = {
  // Les issues ouvertes qui portent le label, PR écartées.
  tickets(): Promise<Sondage>;
  // Toutes les issues ouvertes, quels que soient leurs labels, PR écartées.
  // Un sondage à part, avec sa propre confirmation.
  ouvertes(): Promise<Sondage<IssueOuverte>>;
  // Une issue, avec son corps et le compte qui l'a ouverte, ou null si elle
  // n'existe plus.
  // `closedAt` : quand elle a été fermée, si GitHub le dit.
  issue(numero: number): Promise<(Issue & { body?: string; author?: string; closedAt?: string }) | null>;
  // Les commentaires d'une issue, du plus ancien au plus récent.
  commentaires(numero: number): Promise<Commentaire[]>;
  // Les commentaires de tout le dépôt modifiés depuis `instant`, du plus ancien au
  // plus récent : une liste paginée, au lieu d'une lecture par issue (#3030).
  commentairesDepuis?(instant: string): Promise<Commentaire[]>;
  // Les instants où le label `fire` a été retiré de l'issue, du plus ancien au
  // plus récent : l'historique des labels, que l'état courant ne garde pas.
  retraitsDeFire(numero: number): Promise<string[]>;
  // Les instants où le label `fire` a été posé sur l'issue, du plus ancien au
  // plus récent : quand elle a été mise sur le rail (#2662).
  posesDeFire?(numero: number): Promise<string[]>;
  // Les retraits de label de l'issue, tous labels confondus, du plus ancien au
  // plus récent : ce que la prise lit pour savoir si le chef a lâché le ticket.
  retraitsDeLabels?(numero: number): Promise<{ label: string; createdAt: string }[]>;
  // Les événements de l'issue tels que l'API REST de GitHub les rend, du plus
  // ancien au plus récent : ce que les chiffres d'autonomie lisent (#3222) pour
  // le résumé hebdomadaire (#3261). Facultatif : seul le client réel le porte.
  evenements?(numero: number): Promise<unknown[]>;
  // Les labels que l'issue porte, posés par un compte qui a l'écriture sur le
  // dépôt (le chef, ou le second sous son compte) : ce que GitHub dit de qui a
  // posé le label, pas de qui a écrit l'issue (#2619).
  // Vaut aussi le label d'un humain déclaré sur une carte qui lui est assignée (#2762).
  labelsPosesParDeConfiance?(numero: number): Promise<string[]>;
  // Poste un commentaire sur une issue.
  commenter(numero: number, corps: string): Promise<void>;
  // Ajoute des labels à une issue, sans toucher à ceux qu'elle porte.
  labelliser(numero: number, labels: string[]): Promise<void>;
  // Retire un label d'une issue. Déjà absent, il n'y a rien à faire.
  delabelliser(numero: number, label: string): Promise<void>;
  // Assigne l'issue à ces comptes, sans retirer ceux qui l'ont déjà (#2760).
  // Facultatif : seul le client réel le porte.
  assigner?(numero: number, logins: string[]): Promise<void>;
  // Crée une issue ; rend son numéro.
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  // Les issues modifiées depuis `instant`, ouvertes ou fermées, PR écartées,
  // avec leur corps.
  issuesDepuis(instant: string): Promise<IssueDepuis[]>;
  // Remplace le corps d'une issue.
  ecrireCorps(numero: number, corps: string): Promise<void>;
  // Ouvre une PR de `branche` vers `base` ; rend son adresse.
  ouvrirPR(pr: { branche: string; base: string; titre: string; corps: string }): Promise<string>;
  // La PR la plus récente dont `branche` est la tête, ou null.
  prDeBranche(branche: string): Promise<PR | null>;
  // Les PR ouvertes, avec la branche dont chacune est la tête et les fichiers
  // qu'elle change. Facultatif : seul le client réel le porte
  // (`brigade-github.ts`, la zone tenue d'un ticket).
  // `externe` : sa tête vient d'un autre dépôt — un fork (#2933).
  prsOuvertes?(): Promise<{ number: number; branche: string; fichiers: string[]; sha?: string; externe?: boolean }[]>;
  // Les checks du commit : ses *check runs* et ses statuts.
  ci(sha: string): Promise<Check[]>;
  // Tous les statuts du commit sous ce contexte, chacun tel qu'il a été posé,
  // du plus ancien au plus récent (#2456). Facultatif : seul le client réel le porte.
  statuts?(sha: string, contexte: string): Promise<StatutDeCommit[]>;
  // Pose un statut sur le commit ; rend son id (#2456). Facultatif, de même.
  poserStatut?(sha: string, statut: { state: StatutDeCommit["state"]; context: string; description: string }): Promise<number>;
  // Une requête GraphQL de lecture, ses variables en texte : son `data`, ou une erreur.
  lireGraphql?(requete: string, variables: Record<string, string | number>): Promise<unknown>;
  // Les checks des derniers commits de la branche d'intégration, mis bout à
  // bout : de quoi dire quel job y a déjà été vu vert.
  ciDeLaBase(branche: string): Promise<Check[]>;
  // Le sha du dernier commit de la branche d'intégration. Facultatif : seul le
  // client réel le porte (`brigade-github.ts`, le contrôle de la base).
  teteDeLaBase?(branche: string): Promise<string>;
  // Vrai si ce compte existe sur GitHub, faux s'il n'existe pas (#2929).
  // Facultatif, comme les trois suivants : seul le client réel le porte
  // (`humains/service.ts`, les humains du projet).
  compteExiste?(login: string): Promise<boolean>;
  // Vrai si ce compte a accès au dépôt, quel que soit son droit (lecture
  // comprise) ; faux s'il n'en a aucun.
  aAccesAuDepot?(login: string): Promise<boolean>;
  // Un fichier du dépôt tel que `ref` le porte — son texte, et l'empreinte de
  // son blob que sa réécriture doit citer —, ou null s'il n'y est pas.
  fichier?(chemin: string, ref: string): Promise<{ texte: string; sha: string } | null>;
  // Crée la branche `branche` sur la tête de `base`, et y commite `texte` dans
  // `chemin`. `sha` : l'empreinte du fichier remplacé, null s'il est neuf.
  ecrireSurBranche?(ecriture: { base: string; branche: string; chemin: string; texte: string; sha: string | null; message: string }): Promise<void>;
  // Le diff d'une PR, tel que GitHub le rend.
  diff(numero: number): Promise<string>;
  // Le journal du job d'un check de GitHub Actions, ou null si le check n'en
  // est pas un, ou que GitHub ne le rend plus.
  journalDuCheck(check: Check): Promise<string | null>;
  // Les annotations d'échec d'un check de GitHub Actions — les tests en échec,
  // par leur nom et leur erreur, que la CI y écrit (`.github/workflows/tests.yml`).
  // Elles se lisent par l'API, quand le journal du job ne se lit pas de la box
  // (#2545). Aucune si le check n'est pas un job, ou que GitHub ne les rend pas.
  // Facultatif : seul le client réel le porte.
  annotationsDuCheck?(check: Check): Promise<AnnotationDeCheck[]>;
  // Les étapes en échec du job d'un check de GitHub Actions, par leur nom, dans
  // leur ordre (#3028) : un job qui joue plusieurs étapes — `Lint + Format +
  // Typecheck + Tests` — ne dit pas, par son nom, laquelle est rouge. Aucune si
  // le check n'est pas un job, ou que GitHub ne les rend pas.
  // Facultatif : seul le client réel le porte.
  etapesEnEchec?(check: { name: string; url?: string | null }): Promise<string[]>;
  // Relance les jobs en échec d'un run de GitHub Actions, et eux seuls.
  relancerLesEchecs(run: number): Promise<void>;
  // La tentative en cours d'un run de GitHub Actions (1 tant qu'il n'a pas été
  // relancé), et si elle est finie.
  etatDuRun(run: number): Promise<{ tentative: number; termine: boolean }>;
  // Remplace, sur l'issue, le commentaire dont le corps est `ancien` par
  // `nouveau` : rend faux si aucun ne l'est plus.
  remplacerCommentaire(numero: number, ancien: string, nouveau: string): Promise<boolean>;
  // Merge la PR, à condition que sa tête soit encore `sha`.
  merger(numero: number, sha: string): Promise<Merge>;
  // Demande à GitHub de mettre la branche de la PR à jour de sa base, à
  // condition que sa tête soit encore `sha` (`brigade-github.ts`). Facultatif :
  // seul le client réel le porte.
  mettreAJour?(numero: number, sha: string): Promise<void>;
  // Les fichiers qui changent de `de` à `a` (depuis leur ancêtre commun), et
  // si la liste est complète : GitHub n'en rend que 300. Null si GitHub ne
  // connaît pas l'un des deux commits. Ce que la pass lit pour savoir si la
  // mise à jour d'une PR validée a changé son écran (#3426). Facultatif : seul
  // le client réel le porte.
  fichiersEntre?(de: string, a: string): Promise<{ fichiers: string[]; complet: boolean } | null>;
  fermerIssue(numero: number): Promise<void>;
  // Ferme une PR sans toucher à sa branche. Facultatif : seul le client réel le porte.
  fermerPR?(numero: number): Promise<void>;
  // Ce que l'annulation d'un ticket servi écrit (undo/, #3274), facultatif :
  // seul le client réel le porte. Rouvrir une issue fermée.
  rouvrirIssue?(numero: number): Promise<void>;
  // Un commit tel que l'API Git le garde : son arbre et ses parents, dans
  // leur ordre ; null si GitHub ne le connaît pas.
  commitGit?(sha: string): Promise<{ arbre: string; parents: string[] } | null>;
  // Crée un commit sur `arbre`, fils de `parents`, posé sur aucune branche ;
  // rend son sha.
  creerCommit?(commit: { message: string; arbre: string; parents: string[] }): Promise<string>;
  // Crée la branche `branche` sur le commit `sha`.
  creerBranche?(branche: string, sha: string): Promise<void>;
  // Fusionne le commit `sha` dans `branche`, chez GitHub : le sha du commit de
  // fusion, ou `conflit` quand les deux ne se fusionnent pas sans conflit.
  fusionnerDansLaBranche?(branche: string, sha: string, message: string): Promise<{ sha: string } | { conflit: true }>;
  // Supprime une branche ; une branche qui n'existe pas n'est pas une erreur.
  supprimerBranche?(branche: string): Promise<void>;
  // La PR mergée qui a fermé cette issue (`Closes #n`), ou null si rien ne dit
  // qu'une PR l'ait fermée.
  prQuiFerme(numero: number): Promise<PR | null>;
  // Le compte sous lequel ce GitHub agit, s'il a une identité à lui (une App
  // de rôle) ; null sous l'identité unique du `gh` de la machine, que rien ne
  // distingue de celle du chef.
  identite(): Promise<string | null>;
  // Le propriétaire du dépôt : son login, et s'il est une organisation (#2928).
  proprietaire?(): Promise<{ login: string; organisation: boolean }>;
  // L'auteur de la PR mergée qui a posé `.claude/brigade/gates.sh` sur la
  // branche par défaut — celle de `/brigade:init` ; null si aucune PR ne l'a
  // posé (#2928).
  auteurDeLInit?(): Promise<string | null>;
  // Le compte sous lequel ce GitHub agit, et s'il a l'écriture sur le dépôt :
  // sans elle, la station est contributrice (#2935). Facultatif, comme le
  // suivant : seul le client réel le porte.
  droits?(): Promise<{ login: string; ecriture: boolean }>;
  // Crée la fourche du dépôt sous ce compte, ou rend celle qu'il a déjà :
  // son propriétaire, et l'adresse où pousser (#2935).
  fourcher?(): Promise<{ proprietaire: string; url: string }>;
  // Notes de version (#3262) : le tag existe-t-il sur le dépôt ? Facultatif : seul le client réel le porte.
  tagExiste?(tag: string): Promise<boolean>;
  // La release publiée sur ce tag : son adresse, ou null s'il n'y en a pas.
  releaseDuTag?(tag: string): Promise<{ url: string } | null>;
  // Crée la release de ce tag, nommée d'après lui ; rend son adresse.
  creerRelease?(tag: string, corps: string): Promise<{ url: string }>;
  // Abandonne les requêtes en cours.
  fermer(): void;
};

export type OptionsGitHub = {
  // `<owner>/<repo>`
  depot: string;
  // Le binaire `gh`. Surchargé par les tests, jamais sur la box.
  bin?: string;
  delaiMs?: number;
  // Le jeton du rôle qui agit, demandé à chaque appel : il ne passe à `gh` que
  // par son environnement. Absent, `gh` s'authentifie seul — l'identité de la
  // machine.
  jeton?: () => Promise<string>;
  // Le compte que ce jeton fait agir.
  identite?: () => Promise<string>;
  // Le compteur que prend chaque `gh api`, et où chaque réponse laisse le
  // quota que GitHub a dit. Par défaut, celui du process (`limite-github.ts`).
  limite?: Limite;
  // Où se dit la limite que GitHub impose au compte, pour `status` et `faits`.
  // Par défaut, celle du process (`github-limite.ts`).
  limitesDuCompte?: LimitesDuCompte;
  // `geste` : ce GitHub sert un geste du chef — la box ne retient aucun de ses
  // appels, seul un refus de GitHub les arrête. Par défaut, `cuisine` : ses
  // appels se règlent sur le quota réel du compte.
  usage?: Usage;
  // Le compte dont ce GitHub dépense le quota : le rôle dont il porte le jeton,
  // ou, par défaut, celui de la machine.
  compte?: string;
  // Le projet à qui l'on compte ses appels (`status`) ; à défaut, son dépôt.
  projet?: string;
  // En millisecondes ; par défaut, l'horloge du système. Les tests y mettent la leur.
  maintenant?: () => number;
  // Ce qui porte chaque appel jusqu'à GitHub. Par défaut, `gh api -i` ; un
  // test y met son faux GitHub, qui répond sans process ni réseau.
  transport?: Transport;
  // Les humains que le projet déclare (`humans`) : leur réponse vaut sur une
  // carte qui leur est assignée, même sans l'écriture (#2762).
  humains?: readonly HumainDeclare[];
};

// Un appel tel qu'il part : les arguments de `gh api -i`, et ce que `gh` en
// imprime. `erreur` : `gh` est sorti en erreur — ce qu'il fait aussi sur un
// 304 ou un 404, que la sortie dit quand même.
export type Transport = (
  args: string[],
  options: { bin: string; env: NodeJS.ProcessEnv | undefined; signal: AbortSignal; delaiMs: number },
) => Promise<{ erreur: Error | null; stdout: string; stderr: string }>;

const parGh: Transport = (args, { bin, env, signal, delaiMs }) =>
  new Promise((resoudre) => {
    execFile(bin, ["api", "-i", ...args], { maxBuffer: 64 * 1024 * 1024, timeout: delaiMs, signal, env }, (erreur, stdout, stderr) =>
      resoudre({ erreur, stdout: String(stdout), stderr: String(stderr) }),
    );
  });

// Combien de commits de la base la pass relit pour savoir si un job y a été vert.
const COMMITS_DE_LA_BASE = 10;

type Reponse = { statut: number; entetes: Map<string, string>; corps: string };

// Les lectures déjà faites, sous l'ETag que GitHub leur a donné : la même
// lecture se redemande sous condition (`If-None-Match`), et tant que rien n'a
// changé GitHub répond 304 — un appel qu'il ne compte pas dans son quota, ni la
// box dans le sien. La réponse gardée ne sert que sur ce 304 : rien n'est lu
// sans que GitHub ait dit, à cet appel, qu'elle est à jour. Cache, pas état :
// propre au process et borné — les plus anciennement servies sortent d'abord —,
// le perdre coûte une lecture pleine.
const OCTETS_GARDES = 32 * 1024 * 1024;
// Au-delà, une réponse ne se garde pas (un gros diff).
const TAILLE_GARDEE = 1024 * 1024;
// La comparaison de deux commits ne liste pas plus de fichiers que ceux-là.
const FICHIERS_D_UNE_COMPARAISON = 300;
// `pleine` : la dernière page d'une liste, remplie jusqu'à `per_page`. Une
// entrée de plus irait sur une page suivante, que l'ETag de celle-ci ne dit
// pas : elle se relit sans condition.
export type Gardee = { etag: string; reponse: Reponse; pleine: boolean };
const gardees = new Map<string, Gardee>();
let octetsGardes = 0;

// Garde `gardee` sous `cle`, en dernière servie ; null l'oublie.
function garder(cle: string, gardee: Gardee | null): void {
  const avant = gardees.get(cle);
  if (avant !== undefined) {
    gardees.delete(cle);
    octetsGardes -= avant.reponse.corps.length;
  }
  if (gardee === null) return;
  gardees.set(cle, gardee);
  octetsGardes += gardee.reponse.corps.length;
  for (const [ancienne, lue] of gardees) {
    if (octetsGardes <= OCTETS_GARDES) break;
    gardees.delete(ancienne);
    octetsGardes -= lue.reponse.corps.length;
  }
}

// Le crochet de `cache-etag/` : ce cache se vide et se recharge d'un process à
// l'autre. Rien d'autre ne le touche.
export const gardeesDuProcess = {
  lire: (): Array<[string, Gardee]> => [...gardees],
  vider: (): void => [...gardees.keys()].forEach((cle) => garder(cle, null)),
  remplir: (entrees: Array<[string, Gardee]>): void => entrees.forEach(([cle, gardee]) => garder(cle, gardee)),
};

// Vrai si `reponse` est la dernière page d'une liste remplie jusqu'à son `per_page`.
function dernierePagePleine(chemin: string, reponse: Reponse): boolean {
  if (pageSuivante(reponse) !== null) return false;
  const parPage = Number(/[?&]per_page=(\d+)/.exec(chemin)?.[1] ?? 30);
  try {
    const corps = JSON.parse(reponse.corps) as unknown;
    return Array.isArray(corps) && corps.length >= parPage;
  } catch {
    return false;
  }
}

type IssueBrute = {
  number: number;
  title: string;
  labels: Array<string | { name: string }>;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  html_url: string;
  pull_request?: unknown;
  closed_at?: string | null;
  body?: string | null;
  author_association?: string;
  user?: { login?: string } | null;
  assignees?: Array<{ login?: string } | null> | null;
};

type CommentaireBrut = { id?: number; body?: string | null; author_association?: string; user?: { login?: string } | null; created_at?: string };

type EvenementBrut = { event?: string; created_at?: string; commit_id?: string | null; label?: { name?: string } | null; actor?: { login?: string } | null };

type PRBrute = {
  number: number;
  html_url: string;
  state: "open" | "closed";
  merged?: boolean;
  merged_at?: string | null;
  mergeable_state?: string;
  base: { ref: string };
  head: { sha: string };
  merged_by?: { login?: string } | null;
  merge_commit_sha?: string | null;
};

// Ce que `/brigade:init` pose toujours dans le dépôt (commands/init.md) : la PR qui l'a posé est la sienne.
const GATES_DE_L_INIT = ".claude/brigade/gates.sh";

type CheckRun = { name: string; status: string; conclusion: string | null; html_url: string | null };
// Une annotation d'échec d'un check : où — `chemin` et `ligne`, nuls quand la
// CI n'en nomme pas —, son titre et son message.
export type AnnotationDeCheck = { chemin: string | null; ligne: number | null; titre: string; message: string };
type AnnotationBrute = { path?: string; start_line?: number; annotation_level?: string; title?: string | null; message?: string };
type Statut = { context: string; state: string; target_url: string | null };

// Les conclusions d'un job qui ne sont pas un échec.
export const CONCLUSIONS_VERTES = ["success", "neutral", "skipped"];

function lire(brute: IssueBrute): Issue {
  return {
    number: brute.number,
    title: brute.title,
    labels: brute.labels.map((label) => (typeof label === "string" ? label : label.name)),
    state: brute.state,
    createdAt: brute.created_at,
    updatedAt: brute.updated_at,
    url: brute.html_url,
    ...(brute.pull_request === undefined ? {} : { pr: true as const }),
  };
}

// `gh api -i` imprime la ligne de statut, les en-têtes, une ligne vide, puis
// le corps. Rend null si la sortie ne commence pas par une réponse HTTP.
export function decouper(sortie: string): Reponse | null {
  const [tete = "", ...reste] = sortie.split(/\r?\n\r?\n/);
  const [statut = "", ...lignes] = tete.split(/\r?\n/);
  const code = /^HTTP\/\S+ (\d{3})/.exec(statut)?.[1];
  if (!code) return null;
  const entetes = new Map<string, string>();
  for (const ligne of lignes) {
    const separateur = ligne.indexOf(":");
    if (separateur > 0) entetes.set(ligne.slice(0, separateur).toLowerCase(), ligne.slice(separateur + 1).trim());
  }
  return { statut: Number(code), entetes, corps: reste.join("\n\n") };
}

export function ouvrirGitHub(options: OptionsGitHub): GitHub & Required<Pick<GitHub, "commentairesDepuis" | "compteExiste" | "aAccesAuDepot" | "fichier" | "ecrireSurBranche" | "droits" | "fourcher" | "tagExiste" | "releaseDuTag" | "creerRelease" | "teteDeLaBase" | "rouvrirIssue" | "commitGit" | "creerCommit" | "creerBranche" | "fusionnerDansLaBranche" | "supprimerBranche">> {
  const { depot } = options;
  const bin = options.bin ?? "gh";
  const abandon = new AbortController();
  // Cache, pas état : le perdre coûte une requête pleine, rien de plus.
  // L'empreinte confirmée de chaque liste sondée.
  const etags = new Map<string, string>();

  // Une réponse HTTP, quel que soit son statut. `gh` sort en erreur sur un 304
  // ou un 404 : c'est la réponse qui fait foi, pas le code de sortie.
  // Ce qui part vers GitHub — corps, titres, commentaires — s'écrit masqué :
  // ni la forme des identifiants de Claude, ni la valeur d'un jeton retenu
  // (`identifiants.ts`).
  // Chaque page, chaque requête conditionnelle est un appel : un appel de la
  // cuisine que le quota réel retient ne part pas. Chaque réponse dit le quota
  // qui reste ; un 304, que GitHub ne compte pas, sort du compte de la box.
  const compte = options.compte ?? COMPTE_DE_LA_MACHINE;
  const appeler = async (brut: string[]): Promise<Reponse> => {
    const args = brut.map((arg) => masquerIdentifiants(arg).texte);
    const limite = options.limite ?? limiteDuProcess();
    // `GH_TOKEN` l'emporte sur la connexion du compte, et ne se lit pas dans
    // la liste des process.
    let env: NodeJS.ProcessEnv | undefined;
    const environnement = async () => (env ??= options.jeton ? { ...process.env, GH_TOKEN: await options.jeton() } : undefined);
    return appelerGitHub(limite, { usage: options.usage, compte, etiquette: etiquetteDe(args, { projet: options.projet ?? (process.env.BRIGADE_PROJECT || depot), usage: options.usage }), gh: bin, env: environnement, maintenant: options.maintenant }, async (appel) => {
      await environnement();
      // Une écriture qui part est comptée à la minute, une fois la pause passée.
      if (estUneEcriture(args)) mesuresGitHubDuProcess().noterEcriture();
      const { erreur, stdout, stderr } = await (options.transport ?? parGh)(args, { bin, env, signal: abandon.signal, delaiMs: options.delaiMs ?? 30_000 });
      const reponse = decouper(stdout);
      if (reponse) noterLesEntetes(limite, compte, reponse.entetes);
      if (reponse?.statut === 304) limite.rendre(appel);
      if (!reponse) throw new Error(`gh api ${args.at(-1)} : ${stderr.trim() || erreur?.message || "réponse illisible"}`);
      // La limite de GitHub atteinte n'est pas une réponse comme les autres :
      // elle suspend les appels, et ne passe jamais pour un refus (de merge).
      // Et elle se nomme au compte : laquelle, depuis quand, jusqu'à quand. Un appel
      // qui aboutit la lève, une fois sa reprise passée.
      const limites = options.limitesDuCompte ?? limitesDuProcess();
      if (refusPourLimite(reponse)) {
        // La pause ne retient que la sorte de l'appel refusé (#3481).
        const atteinte = await constaterLimite(limite, reponse, { gh: bin, env, maintenant: options.maintenant, lecture: lectureDe(args, options.usage) });
        const lue = lireLaLimite(reponse, { ecriture: estUneEcriture(args), maintenant: (options.maintenant ?? Date.now)(), repli: atteinte.jusqua });
        limites.constater(compte, lue);
        mesuresGitHubDuProcess().noterLimite(lue.depuis, lue.reprise);
        throw atteinte;
      }
      if (reponse.statut < 400) limites.aboutir(compte);
      return reponse;
    });
  };

  // Une lecture, sous condition si elle a déjà été faite : sur un 304, la
  // réponse gardée. Deux lectures identiques en même temps n'en font qu'une.
  // `liste` : une page d'une liste que l'on feuillette.
  const enVol = new Map<string, Promise<Reponse>>();
  // Ce qui ne peut plus changer, gardé en mémoire (#2298) : les fichiers d'une PR
  // par sa tête, et la CI finie d'un commit. Bornés : au-delà, le plus ancien part.
  const fichiersParTete = new Map<string, string[]>();
  const ciFinie = new Map<string, Check[]>();
  const memoriser = <V>(carte: Map<string, V>, cle: string, valeur: V) => {
    carte.set(cle, valeur);
    if (carte.size > 500) carte.delete(carte.keys().next().value as string);
  };
  const lireSousCondition = (args: string[], liste = false): Promise<Reponse> => {
    const cle = [bin, compte, ...args].join("\0");
    const deja = enVol.get(cle);
    if (deja) return deja;
    const lecture = (async () => {
      const gardee = gardees.get(cle);
      const condition = gardee === undefined || gardee.pleine ? [] : ["-H", `If-None-Match: ${gardee.etag}`];
      const reponse = await appeler([...condition, ...args]);
      if (reponse.statut === 304 && gardee !== undefined) {
        garder(cle, gardee);
        return gardee.reponse;
      }
      const etag = reponse.entetes.get("etag");
      const gardable = reponse.statut === 200 && etag !== undefined && etag !== "" && reponse.corps.length <= TAILLE_GARDEE;
      garder(cle, gardable ? { etag, reponse, pleine: liste && dernierePagePleine(args.at(-1) ?? "", reponse) } : null);
      return reponse;
    })().finally(() => enVol.delete(cle));
    enVol.set(cle, lecture);
    return lecture;
  };

  const exiger = (reponse: Reponse, chemin: string, attendu = 200): Reponse => {
    if (reponse.statut !== attendu) throw new Error(`gh api ${chemin} : HTTP ${reponse.statut}`);
    return reponse;
  };

  // Une création. `-f` passe chaque champ tel quel : rien n'y est interprété.
  const creer = async (chemin: string, champs: Record<string, string>): Promise<Reponse> => {
    const args = Object.entries(champs).flatMap(([nom, valeur]) => ["-f", `${nom}=${valeur}`]);
    return exiger(await appeler(["-X", "POST", ...args, chemin]), chemin, 201);
  };

  // Le sha du dernier commit d'une branche.
  const teteDe = async (branche: string): Promise<string> => {
    const chemin = `repos/${depot}/commits/${encodeURIComponent(branche)}`;
    const { sha } = JSON.parse(exiger(await lireSousCondition([chemin]), chemin).corps) as { sha?: unknown };
    if (typeof sha !== "string" || sha === "") throw new Error(`gh api ${chemin} : commit sans sha`);
    return sha;
  };

  // Une liste, page après page, à partir de sa première réponse — chaque page
  // suivante sous condition, comme toute lecture.
  const feuilleter = async (premiere: Reponse, chemin: string): Promise<Reponse[]> => {
    const pages = [exiger(premiere, chemin)];
    for (let suivante = pageSuivante(premiere); suivante; suivante = pageSuivante(pages.at(-1))) {
      pages.push(exiger(await lireSousCondition([suivante], true), suivante));
    }
    return pages;
  };
  // Une liste lue de sa première page à sa dernière, sous condition.
  const lireLaListe = async (chemin: string): Promise<Reponse[]> => feuilleter(await lireSousCondition([chemin], true), chemin);

  // Une liste d'issues, chacune de ses pages sous l'ETag de sa dernière
  // lecture : tant que rien n'a changé, chaque page coûte un 304, que GitHub
  // ne compte pas — sur une page comme sur plusieurs (#2198). L'empreinte de
  // la liste est celle de ses pages. Confirmée, une empreinte qui revient dit
  // « inchangé ». Non confirmée — le consommateur a encore à faire sur elle —,
  // la liste gardée est rendue : le travail reste à refaire, sans relecture
  // pleine. Une page sans ETag laisse l'empreinte inconnue : jamais « inchangé ».
  // Sa dernière page pleine se relit sans condition, comme celle de toute
  // liste : une issue ancienne rouverte, ou qui prend le label, s'y range à sa
  // date de création, et peut tomber sur une page que son ETag ne dit pas.
  const sonder = async <I extends Issue>(chemin: string, lireIssue: (brute: IssueBrute) => I): Promise<Sondage<I>> => {
    const pages = await lireLaListe(chemin);
    const etagsDesPages = pages.map((page) => page.entetes.get("etag") ?? "");
    const empreinte = etagsDesPages.includes("") ? null : etagsDesPages.join("\n");
    if (empreinte !== null && etags.get(chemin) === empreinte) return { inchange: true };
    const issues = pages
      .flatMap((page) => JSON.parse(page.corps) as IssueBrute[])
      .filter((brute) => brute.pull_request === undefined)
      .map(lireIssue);
    return { inchange: false, issues, confirmer: () => void (empreinte === null ? etags.delete(chemin) : etags.set(chemin, empreinte)) };
  };

  const lireOuverte = (brute: IssueBrute): IssueOuverte => ({ ...lire(brute), body: brute.body ?? "", association: brute.author_association ?? "NONE", author: brute.user?.login ?? "" });

  return {
    tickets: () => sonder(`repos/${depot}/issues?labels=${LABEL}&state=open&per_page=100`, (brute) => ({ ...lire(brute), ...(porteListe(brute.body ?? "") ? { epique: true as const } : {}), ...lienDuCorps(brute.number, brute.body ?? "") })),
    ouvertes: () => sonder(`repos/${depot}/issues?state=open&per_page=100`, lireOuverte),
    async issue(numero) {
      const chemin = `repos/${depot}/issues/${numero}`;
      const reponse = await lireSousCondition([chemin]);
      if (reponse.statut === 404 || reponse.statut === 410) return null;
      const brute = JSON.parse(exiger(reponse, chemin).corps) as IssueBrute;
      return { ...lire(brute), body: brute.body ?? "", author: brute.user?.login ?? "", ...(typeof brute.closed_at === "string" ? { closedAt: brute.closed_at } : {}) };
    },
    async ecrireCorps(numero, corps) {
      const chemin = `repos/${depot}/issues/${numero}`;
      exiger(await appeler(["-X", "PATCH", "-f", `body=${corps}`, chemin]), chemin);
    },
    async creerIssue({ titre, corps, labels }) {
      // Jamais un ticket dont le travail est de changer la branche d'un autre :
      // un conflit avec la base revient au cook du ticket lui-même (#3476).
      const refus = refusDeLaCreation({ titre, corps });
      if (refus !== null) throw new Error(refus);
      const chemin = `repos/${depot}/issues`;
      const champs = ["-f", `title=${titre}`, "-f", `body=${corps}`, ...labels.flatMap((label) => ["-f", `labels[]=${label}`])];
      const reponse = exiger(await appeler(["-X", "POST", ...champs, chemin]), chemin, 201);
      const numero = (JSON.parse(reponse.corps) as { number?: unknown }).number;
      if (!Number.isSafeInteger(numero)) throw new Error(`gh api ${chemin} : issue créée sans numéro`);
      return numero as number;
    },
    async issuesDepuis(instant) {
      // Sous condition, comme toute lecture : le même `instant` se redemande à
      // chaque tick tant que le disjoncteur est ouvert (`breaker-resume-github.ts`),
      // et ne coûte rien tant que rien n'a bougé depuis (#2198).
      const chemin = `repos/${depot}/issues?state=all&since=${instant}&per_page=100`;
      const pages = await lireLaListe(chemin);
      return pages
        .flatMap((page) => JSON.parse(page.corps) as IssueBrute[])
        .filter((lue) => lue.pull_request === undefined)
        .map((brute) => ({ ...lireOuverte(brute), ...(typeof brute.closed_at === "string" ? { closedAt: brute.closed_at } : {}) }));
    },
    async commentaires(numero) {
      const pages = await lireLaListe(`repos/${depot}/issues/${numero}/comments?per_page=100`);
      return pages
        .flatMap((page) => JSON.parse(page.corps) as CommentaireBrut[])
        .map((brut) => ({ body: brut.body ?? "", author: brut.user?.login ?? "", association: brut.author_association ?? "NONE", createdAt: brut.created_at ?? "" }));
    },
    async commentairesDepuis(instant) {
      const pages = await lireLaListe(`repos/${depot}/issues/comments?since=${instant}&sort=created&direction=asc&per_page=100`);
      return pages
        .flatMap((page) => JSON.parse(page.corps) as CommentaireBrut[])
        .map((brut) => ({ body: brut.body ?? "", author: brut.user?.login ?? "", association: brut.author_association ?? "NONE", createdAt: brut.created_at ?? "" }));
    },
    async retraitsDeFire(numero) {
      const pages = await lireLaListe(`repos/${depot}/issues/${numero}/events?per_page=100`);
      return pages
        .flatMap((page) => JSON.parse(page.corps) as EvenementBrut[])
        .filter((brut) => brut.event === "unlabeled" && brut.label?.name === LABEL && typeof brut.created_at === "string")
        .map((brut) => brut.created_at as string);
    },
    async posesDeFire(numero) {
      const pages = await lireLaListe(`repos/${depot}/issues/${numero}/events?per_page=100`);
      return pages
        .flatMap((page) => JSON.parse(page.corps) as EvenementBrut[])
        .filter((brut) => brut.event === "labeled" && brut.label?.name === LABEL && typeof brut.created_at === "string")
        .map((brut) => brut.created_at as string);
    },
    async retraitsDeLabels(numero) {
      const pages = await lireLaListe(`repos/${depot}/issues/${numero}/events?per_page=100`);
      return pages
        .flatMap((page) => JSON.parse(page.corps) as EvenementBrut[])
        .filter((brut) => brut.event === "unlabeled" && typeof brut.label?.name === "string" && typeof brut.created_at === "string")
        .map((brut) => ({ label: brut.label?.name as string, createdAt: brut.created_at as string }));
    },
    async evenements(numero) {
      const pages = await lireLaListe(`repos/${depot}/issues/${numero}/events?per_page=100`);
      return pages.flatMap((page) => JSON.parse(page.corps) as unknown[]);
    },
    async labelsPosesParDeConfiance(numero) {
      const pages = await lireLaListe(`repos/${depot}/issues/${numero}/events?per_page=100`);
      const posees = pages
        .flatMap((page) => JSON.parse(page.corps) as EvenementBrut[])
        .filter((brut) => brut.event === "labeled" && typeof brut.label?.name === "string" && typeof brut.actor?.login === "string");
      const ecrivains = new Map<string, boolean>();
      const labels = new Set<string>();
      let assignes: Promise<string[]> | undefined;
      const fiche = `repos/${depot}/issues/${numero}`;
      const lireAssignes = () =>
        (assignes ??= lireSousCondition([fiche]).then((reponse) =>
          ((JSON.parse(exiger(reponse, fiche).corps) as IssueBrute).assignees ?? []).flatMap((assigne) => (assigne?.login ? [assigne.login] : [])),
        ));
      for (const brut of posees) {
        const login = brut.actor?.login as string;
        if (!ecrivains.has(login)) {
          const chemin = `repos/${depot}/collaborators/${encodeURIComponent(login)}/permission`;
          const reponse = await lireSousCondition([chemin]);
          const permission = reponse.statut === 200 ? (JSON.parse(reponse.corps) as { permission?: string }).permission : undefined;
          const ecrit = permission === "admin" || permission === "maintain" || permission === "write";
          ecrivains.set(login, ecrit || (await reponseDUnHumainDeclare(login, options.humains ?? [], lireAssignes)));
        }
        if (ecrivains.get(login)) labels.add(brut.label?.name as string);
      }
      return [...labels];
    },
    async prQuiFerme(numero) {
      // La fermeture par un merge porte le commit du merge ; la dernière
      // fermeture est celle qui tient si l'issue a été rouverte.
      const pages = await lireLaListe(`repos/${depot}/issues/${numero}/events?per_page=100`);
      const fermeture = pages
        .flatMap((page) => JSON.parse(page.corps) as EvenementBrut[])
        .findLast((brut) => brut.event === "closed" && typeof brut.commit_id === "string" && brut.commit_id !== "");
      if (fermeture?.commit_id == null) return null;
      const chemin = `repos/${depot}/commits/${fermeture.commit_id}/pulls`;
      const mergee = (JSON.parse(exiger(await lireSousCondition([chemin]), chemin).corps) as PRBrute[]).find((brute) => (brute.merged_at ?? null) !== null || brute.merged === true);
      if (!mergee) return null;
      const fiche = `repos/${depot}/pulls/${mergee.number}`;
      const brute = JSON.parse(exiger(await lireSousCondition([fiche]), fiche).corps) as PRBrute;
      return { number: brute.number, url: brute.html_url, base: brute.base.ref, sha: brute.head.sha, state: brute.state, merged: true, enRetard: false, mergeePar: brute.merged_by?.login || null, ...(brute.merge_commit_sha ? { commitDeMerge: brute.merge_commit_sha } : {}) };
    },
    async commenter(numero, corps) {
      await creer(`repos/${depot}/issues/${numero}/comments`, { body: corps });
    },
    async labelliser(numero, labels) {
      const chemin = `repos/${depot}/issues/${numero}/labels`;
      exiger(await appeler(["-X", "POST", ...labels.flatMap((label) => ["-f", `labels[]=${label}`]), chemin]), chemin);
    },
    async assigner(numero, logins) {
      const chemin = `repos/${depot}/issues/${numero}/assignees`;
      exiger(await appeler(["-X", "POST", ...logins.flatMap((login) => ["-f", `assignees[]=${login}`]), chemin]), chemin, 201);
    },
    async delabelliser(numero, label) {
      const chemin = `repos/${depot}/issues/${numero}/labels/${encodeURIComponent(label)}`;
      const reponse = await appeler(["-X", "DELETE", chemin]);
      if (reponse.statut !== 404) exiger(reponse, chemin);
    },
    async ouvrirPR({ branche, base, titre, corps }) {
      const reponse = await creer(`repos/${depot}/pulls`, { title: titre, head: branche, base, body: corps });
      const url = (JSON.parse(reponse.corps) as { html_url?: unknown }).html_url;
      if (typeof url !== "string" || url === "") throw new Error(`gh api repos/${depot}/pulls : PR créée sans adresse`);
      return url;
    },
    async prDeBranche(branche) {
      const liste = `repos/${depot}/pulls?head=${depot.split("/")[0]}:${branche}&state=all&per_page=1`;
      const [trouvee] = JSON.parse(exiger(await lireSousCondition([liste]), liste).corps) as PRBrute[];
      if (!trouvee) return null;
      // La liste ne dit ni si la branche est en retard, ni qui a mergé : sa fiche, si.
      const chemin = `repos/${depot}/pulls/${trouvee.number}`;
      const fiche = exiger(await lireSousCondition([chemin]), chemin);
      const brute = JSON.parse(fiche.corps) as PRBrute;
      const version = fiche.entetes.get("etag");
      return {
        number: brute.number,
        url: brute.html_url,
        base: brute.base.ref,
        sha: brute.head.sha,
        state: brute.state,
        merged: brute.merged === true || (brute.merged_at ?? null) !== null,
        enRetard: brute.mergeable_state === "behind",
        ...(brute.mergeable_state === "dirty" ? { enConflit: true } : {}),
        mergeePar: brute.merged_by?.login || null,
        ...(version ? { version } : {}),
      };
    },
    async prsOuvertes() {
      const liste = await lireLaListe(`repos/${depot}/pulls?state=open&per_page=100`);
      const ouvertes = liste.flatMap((page) => JSON.parse(page.corps) as Array<{ number: number; head: { ref: string; sha?: string; repo?: { full_name?: string } | null }; base?: { repo?: { full_name?: string } | null } }>);
      return Promise.all(
        ouvertes.map(async ({ number, head, base: cible }) => {
          // Un fork supprimé n'a plus de dépôt de tête : elle reste externe (#2933).
          const externe = (head.repo?.full_name ?? "").toLowerCase() !== (cible?.repo?.full_name ?? depot).toLowerCase();
          const tete = { ...(head.sha === undefined ? {} : { sha: head.sha }), externe };
          // Les fichiers d'une PR ne changent qu'avec sa tête (#2298).
          const cle = head.sha === undefined ? null : `${number}@${head.sha}`;
          const gardes = cle === null ? undefined : fichiersParTete.get(cle);
          if (gardes !== undefined) return { number, branche: head.ref, fichiers: gardes, ...tete };
          const pages = await lireLaListe(`repos/${depot}/pulls/${number}/files?per_page=100`);
          const fichiers = pages.flatMap((page) => JSON.parse(page.corps) as Array<{ filename: string; previous_filename?: string }>).flatMap((brut) => (brut.previous_filename === undefined ? [brut.filename] : [brut.filename, brut.previous_filename]));
          if (cle !== null) memoriser(fichiersParTete, cle, fichiers);
          return { number, branche: head.ref, fichiers, ...tete };
        }),
      );
    },
    async lireGraphql(requete, variables) {
      const args = ["graphql", "-f", `query=${requete}`, ...Object.entries(variables).flatMap(([nom, valeur]) => (typeof valeur === "number" ? ["-F", `${nom}=${valeur}`] : ["-f", `${nom}=${valeur}`]))];
      const reponse = await appeler(args);
      if (reponse.statut >= 400) throw new Error(`gh api graphql : HTTP ${reponse.statut}`);
      const lu = JSON.parse(reponse.corps) as { data?: unknown; errors?: Array<{ message?: string }> };
      if (lu.errors !== undefined && lu.errors.length > 0) throw new Error(`gh api graphql : ${lu.errors.map((e) => e.message ?? "?").join("; ")}`);
      return lu.data;
    },
    async ci(sha) {
      // Une CI finie ne change plus : elle n'est relue que tant qu'un check tourne (#2298).
      const finie = ciFinie.get(sha);
      if (finie !== undefined) return finie;
      const jobs = `repos/${depot}/commits/${sha}/check-runs?per_page=100`;
      const statuts = `repos/${depot}/commits/${sha}/status?per_page=100`;
      const [runs, combine] = await Promise.all([lireSousCondition([jobs]), lireSousCondition([statuts])]);
      const { check_runs = [] } = JSON.parse(exiger(runs, jobs).corps) as { check_runs?: CheckRun[] };
      const { statuses = [] } = JSON.parse(exiger(combine, statuts).corps) as { statuses?: Statut[] };
      const checks = [
        ...check_runs.map((run): Check => {
          const conclusion = run.status === "completed" ? (run.conclusion ?? "inconnue") : run.status;
          const outcome = run.status !== "completed" ? "pending" : CONCLUSIONS_VERTES.includes(conclusion) ? "green" : "red";
          return { name: run.name, outcome, conclusion, url: run.html_url ?? null };
        }),
        ...statuses.map((statut): Check => {
          const outcome = statut.state === "success" ? "green" : statut.state === "pending" ? "pending" : "red";
          return { name: statut.context, outcome, conclusion: statut.state, url: statut.target_url ?? null };
        }),
      ];
      // Gardée seulement pour un commit (40 hexadécimaux), jamais pour une branche
      // qui avance, et seulement finie : rien qui tourne encore.
      if (/^[0-9a-f]{40}$/.test(sha) && checks.length > 0 && checks.every((check) => check.outcome !== "pending")) memoriser(ciFinie, sha, checks);
      return checks;
    },
    async statuts(sha, contexte) {
      const chemin = `repos/${depot}/commits/${sha}/statuses?per_page=100`;
      const lus = (await lireLaListe(chemin)).flatMap((page) => JSON.parse(page.corps) as Array<{ id?: number; state?: string; context?: string; description?: string | null; created_at?: string }>);
      return lus
        .filter((lu) => lu.context === contexte && typeof lu.id === "number" && ["pending", "success", "failure", "error"].includes(lu.state ?? ""))
        .map((lu) => ({ id: lu.id as number, state: lu.state as StatutDeCommit["state"], context: contexte, description: lu.description ?? "", createdAt: lu.created_at ?? "" }))
        .sort((a, b) => a.id - b.id);
    },
    async poserStatut(sha, { state, context, description }) {
      const reponse = await creer(`repos/${depot}/statuses/${sha}`, { state, context, description: description.slice(0, 140) });
      const id = (JSON.parse(reponse.corps) as { id?: unknown }).id;
      if (typeof id !== "number") throw new Error(`gh api repos/${depot}/statuses/${sha} : statut posé sans id`);
      return id;
    },
    async ciDeLaBase(branche) {
      const chemin = `repos/${depot}/commits?sha=${encodeURIComponent(branche)}&per_page=${COMMITS_DE_LA_BASE}`;
      const commits = JSON.parse(exiger(await lireSousCondition([chemin]), chemin).corps) as Array<{ sha: string }>;
      return (await Promise.all(commits.map(({ sha }) => this.ci(sha)))).flat();
    },
    teteDeLaBase: teteDe,
    async compteExiste(login) {
      const chemin = `users/${encodeURIComponent(login)}`;
      const reponse = await lireSousCondition([chemin]);
      if (reponse.statut === 404) return false;
      exiger(reponse, chemin);
      return true;
    },
    async aAccesAuDepot(login) {
      const chemin = `repos/${depot}/collaborators/${encodeURIComponent(login)}/permission`;
      const reponse = await lireSousCondition([chemin]);
      if (reponse.statut === 404) return false;
      const { permission } = JSON.parse(exiger(reponse, chemin).corps) as { permission?: unknown };
      if (typeof permission !== "string") throw new Error(`gh api ${chemin} : réponse sans droit`);
      return permission !== "none";
    },
    async fichier(chemin, ref) {
      const lu = `repos/${depot}/contents/${chemin.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`;
      const reponse = await lireSousCondition([lu]);
      if (reponse.statut === 404) return null;
      const { content, encoding, sha } = JSON.parse(exiger(reponse, lu).corps) as { content?: unknown; encoding?: unknown; sha?: unknown };
      if (typeof content !== "string" || encoding !== "base64" || typeof sha !== "string" || sha === "") throw new Error(`gh api ${lu} : fichier illisible`);
      return { texte: Buffer.from(content, "base64").toString("utf8"), sha };
    },
    async ecrireSurBranche({ base, branche, chemin, texte, sha, message }) {
      const tete = await teteDe(base);
      await creer(`repos/${depot}/git/refs`, { ref: `refs/heads/${branche}`, sha: tete });
      const ecrit = `repos/${depot}/contents/${chemin.split("/").map(encodeURIComponent).join("/")}`;
      const champs = { message, content: Buffer.from(texte, "utf8").toString("base64"), branch: branche, ...(sha === null ? {} : { sha }) };
      const reponse = await appeler(["-X", "PUT", ...Object.entries(champs).flatMap(([nom, valeur]) => ["-f", `${nom}=${valeur}`]), ecrit]);
      exiger(reponse, ecrit, sha === null ? 201 : 200);
    },
    async diff(numero) {
      const chemin = `repos/${depot}/pulls/${numero}`;
      return exiger(await lireSousCondition(["-H", "Accept: application/vnd.github.diff", chemin]), chemin).corps;
    },
    async journalDuCheck(check) {
      const job = jobDuCheck(check)?.job;
      if (job === undefined) return null;
      const reponse = await appeler([`repos/${depot}/actions/jobs/${job}/logs`]);
      return reponse.statut === 200 ? reponse.corps : null;
    },
    async annotationsDuCheck(check) {
      const job = jobDuCheck(check)?.job;
      if (job === undefined) return [];
      const reponse = await appeler([`repos/${depot}/check-runs/${job}/annotations?per_page=100`]);
      if (reponse.statut !== 200) return [];
      const lues = JSON.parse(reponse.corps) as AnnotationBrute[];
      // Une annotation sans fichier est posée par GitHub sur `.github` : elle n'en nomme aucun.
      return lues
        .filter((lue) => lue.annotation_level === "failure")
        .map((lue) => ({ chemin: lue.path === undefined || lue.path === ".github" ? null : lue.path, ligne: lue.path === ".github" ? null : (lue.start_line ?? null), titre: lue.title ?? "", message: lue.message ?? "" }));
    },
    async etapesEnEchec({ name, url }) {
      const job = jobDuCheck({ name, outcome: "red", conclusion: "failure", url: url ?? null })?.job;
      if (job === undefined) return [];
      const reponse = await appeler([`repos/${depot}/actions/jobs/${job}`]);
      if (reponse.statut !== 200) return [];
      const { steps = [] } = JSON.parse(reponse.corps) as { steps?: Array<{ name?: string; conclusion?: string | null }> };
      return steps.filter((etape) => etape.conclusion === "failure" && typeof etape.name === "string").map((etape) => etape.name as string);
    },
    async relancerLesEchecs(run) {
      const chemin = `repos/${depot}/actions/runs/${run}/rerun-failed-jobs`;
      exiger(await appeler(["-X", "POST", chemin]), chemin, 201);
    },
    async etatDuRun(run) {
      const chemin = `repos/${depot}/actions/runs/${run}`;
      const lu = JSON.parse(exiger(await appeler([chemin]), chemin).corps) as { run_attempt?: number; status?: string };
      return { tentative: lu.run_attempt ?? 1, termine: lu.status === "completed" };
    },
    async remplacerCommentaire(numero, ancien, nouveau) {
      const pages = await lireLaListe(`repos/${depot}/issues/${numero}/comments?per_page=100`);
      const trouve = pages.flatMap((page) => JSON.parse(page.corps) as CommentaireBrut[]).find((brut) => (brut.body ?? "") === ancien);
      if (trouve?.id === undefined) return false;
      const edition = `repos/${depot}/issues/comments/${trouve.id}`;
      exiger(await appeler(["-X", "PATCH", "-f", `body=${nouveau}`, edition]), edition);
      return true;
    },
    async mettreAJour(numero, sha) {
      const chemin = `repos/${depot}/pulls/${numero}/update-branch`;
      exiger(await appeler(["-X", "PUT", "-f", `expected_head_sha=${sha}`, chemin]), chemin, 202);
    },
    async fichiersEntre(de, a) {
      const chemin = `repos/${depot}/compare/${de}...${a}`;
      const reponse = await lireSousCondition([chemin]);
      if (reponse.statut === 404) return null;
      const { files } = JSON.parse(exiger(reponse, chemin).corps) as { files?: unknown };
      if (!Array.isArray(files)) throw new Error(`gh api ${chemin} : the comparison does not list its files`);
      const fichiers = (files as Array<{ filename?: unknown; previous_filename?: unknown }>).flatMap(({ filename, previous_filename }) => [filename, previous_filename].filter((chemin): chemin is string => typeof chemin === "string" && chemin !== ""));
      return { fichiers, complet: files.length < FICHIERS_D_UNE_COMPARAISON };
    },
    async merger(numero, sha) {
      const chemin = `repos/${depot}/pulls/${numero}/merge`;
      const reponse = await appeler(["-X", "PUT", "-f", `sha=${sha}`, "-f", "merge_method=merge", chemin]);
      if (reponse.statut === 200) return { fait: true };
      // Un refus (4xx) est une réponse : rien n'a été mergé — 405, non mergeable
      // (conflit, protection, branche en retard là où le dépôt l'exige à
      // jour) ; 409, la tête a bougé ; 403, pas le droit. Tout autre statut ne
      // dit rien du merge.
      if (reponse.statut < 400 || reponse.statut >= 500) throw new Error(`gh api ${chemin} : HTTP ${reponse.statut}`);
      let motif: unknown;
      try {
        motif = (JSON.parse(reponse.corps) as { message?: unknown }).message;
      } catch {}
      return { fait: false, motif: `HTTP ${reponse.statut}${typeof motif === "string" && motif !== "" ? ` — ${motif}` : ""}` };
    },
    async fermerIssue(numero) {
      const chemin = `repos/${depot}/issues/${numero}`;
      exiger(await appeler(["-X", "PATCH", "-f", "state=closed", "-f", "state_reason=completed", chemin]), chemin);
    },
    async fermerPR(numero) {
      const chemin = `repos/${depot}/pulls/${numero}`;
      exiger(await appeler(["-X", "PATCH", "-f", "state=closed", chemin]), chemin);
    },
    async rouvrirIssue(numero) {
      const chemin = `repos/${depot}/issues/${numero}`;
      exiger(await appeler(["-X", "PATCH", "-f", "state=open", chemin]), chemin);
    },
    async commitGit(sha) {
      const chemin = `repos/${depot}/git/commits/${encodeURIComponent(sha)}`;
      const reponse = await lireSousCondition([chemin]);
      if (reponse.statut === 404 || reponse.statut === 422) return null;
      const { tree, parents } = JSON.parse(exiger(reponse, chemin).corps) as { tree?: { sha?: unknown }; parents?: Array<{ sha?: unknown }> };
      if (typeof tree?.sha !== "string" || !Array.isArray(parents) || parents.some((parent) => typeof parent.sha !== "string")) throw new Error(`gh api ${chemin} : commit illisible`);
      return { arbre: tree.sha, parents: parents.map((parent) => parent.sha as string) };
    },
    async creerCommit({ message, arbre, parents }) {
      const chemin = `repos/${depot}/git/commits`;
      const reponse = exiger(await appeler(["-X", "POST", "-f", `message=${message}`, "-f", `tree=${arbre}`, ...parents.flatMap((parent) => ["-f", `parents[]=${parent}`]), chemin]), chemin, 201);
      const { sha } = JSON.parse(reponse.corps) as { sha?: unknown };
      if (typeof sha !== "string" || sha === "") throw new Error(`gh api ${chemin} : commit créé sans sha`);
      return sha;
    },
    async creerBranche(branche, sha) {
      await creer(`repos/${depot}/git/refs`, { ref: `refs/heads/${branche}`, sha });
    },
    async fusionnerDansLaBranche(branche, sha, message) {
      // 201 : fusionnés ; 409 : en conflit, rien n'est écrit. 204 — rien à
      // fusionner — ne dit pas de commit : c'est une erreur pour qui fusionne.
      const chemin = `repos/${depot}/merges`;
      const reponse = await appeler(["-X", "POST", "-f", `base=${branche}`, "-f", `head=${sha}`, "-f", `commit_message=${message}`, chemin]);
      if (reponse.statut === 409) return { conflit: true };
      const { sha: fusion } = JSON.parse(exiger(reponse, chemin, 201).corps) as { sha?: unknown };
      if (typeof fusion !== "string" || fusion === "") throw new Error(`gh api ${chemin} : fusion sans sha`);
      return { sha: fusion };
    },
    async supprimerBranche(branche) {
      const chemin = `repos/${depot}/git/refs/heads/${branche.split("/").map(encodeURIComponent).join("/")}`;
      const reponse = await appeler(["-X", "DELETE", chemin]);
      if (reponse.statut !== 404 && reponse.statut !== 422) exiger(reponse, chemin, 204);
    },
    identite: async () => (options.identite ? options.identite() : null),
    async droits() {
      // Une identité par rôle est une App installée sur le dépôt, qui y écrit ;
      // son jeton n'a pas de compte à lire sous `user`.
      if (options.identite) return { login: await options.identite(), ecriture: true };
      const moi = "user";
      const { login } = JSON.parse(exiger(await lireSousCondition([moi]), moi).corps) as { login?: unknown };
      if (typeof login !== "string" || login === "") throw new Error(`gh api ${moi} : no login in the answer`);
      const chemin = `repos/${depot}`;
      const { permissions } = JSON.parse(exiger(await lireSousCondition([chemin]), chemin).corps) as { permissions?: { push?: unknown } | null };
      if (typeof permissions?.push !== "boolean") throw new Error(`gh api ${chemin} : no permissions in the answer`);
      return { login, ecriture: permissions.push };
    },
    async fourcher() {
      // GitHub répond 202 : la fourche se crée en arrière-plan, et une fourche
      // qui existe déjà est rendue telle quelle.
      const chemin = `repos/${depot}/forks`;
      const { owner, clone_url } = JSON.parse(exiger(await appeler(["-X", "POST", chemin]), chemin, 202).corps) as { owner?: { login?: unknown } | null; clone_url?: unknown };
      if (typeof owner?.login !== "string" || owner.login === "" || typeof clone_url !== "string" || clone_url === "") throw new Error(`gh api ${chemin} : fork without owner or clone address`);
      return { proprietaire: owner.login, url: clone_url };
    },
    async tagExiste(tag) {
      const chemin = `repos/${depot}/git/ref/tags/${encodeURIComponent(tag)}`;
      const reponse = await lireSousCondition([chemin]);
      if (reponse.statut === 404) return false;
      exiger(reponse, chemin);
      return true;
    },
    async releaseDuTag(tag) {
      const chemin = `repos/${depot}/releases/tags/${encodeURIComponent(tag)}`;
      const reponse = await lireSousCondition([chemin]);
      if (reponse.statut === 404) return null;
      const { html_url } = JSON.parse(exiger(reponse, chemin).corps) as { html_url?: unknown };
      if (typeof html_url !== "string" || html_url === "") throw new Error(`gh api ${chemin} : release without address`);
      return { url: html_url };
    },
    async creerRelease(tag, corps) {
      const chemin = `repos/${depot}/releases`;
      const { html_url } = JSON.parse((await creer(chemin, { tag_name: tag, name: tag, body: corps })).corps) as { html_url?: unknown };
      if (typeof html_url !== "string" || html_url === "") throw new Error(`gh api ${chemin} : release created without address`);
      return { url: html_url };
    },
    async proprietaire() {
      const chemin = `repos/${depot}`;
      const { owner } = JSON.parse(exiger(await lireSousCondition([chemin]), chemin).corps) as { owner?: { login?: string; type?: string } | null };
      if (typeof owner?.login !== "string" || owner.login === "") throw new Error(`gh api ${chemin} : no owner in the answer`);
      return { login: owner.login, organisation: owner.type === "Organization" };
    },
    async auteurDeLInit() {
      // Le plus ancien commit qui touche aux gates — GitHub les liste du plus récent au plus ancien.
      const pages = await lireLaListe(`repos/${depot}/commits?path=${encodeURIComponent(GATES_DE_L_INIT)}&per_page=100`);
      const premier = pages.flatMap((page) => JSON.parse(page.corps) as Array<{ sha?: string }>).at(-1);
      if (typeof premier?.sha !== "string") return null;
      const chemin = `repos/${depot}/commits/${premier.sha}/pulls`;
      const mergee = (JSON.parse(exiger(await lireSousCondition([chemin]), chemin).corps) as Array<PRBrute & { user?: { login?: string } | null }>).find((brute) => (brute.merged_at ?? null) !== null || brute.merged === true);
      return mergee?.user?.login || null;
    },
    fermer: () => abandon.abort(),
  };
}

// Le run de GitHub Actions d'un check, et son job, que dit son adresse — null
// si le check n'est pas un job de GitHub Actions.
export function jobDuCheck(check: Check): { run: number; job: number } | null {
  const [, run, job] = /\/actions\/runs\/(\d+)\/job\/(\d+)/.exec(check.url ?? "") ?? [];
  return run === undefined || job === undefined ? null : { run: Number(run), job: Number(job) };
}

function pageSuivante(page: Reponse | undefined): string | null {
  return /<([^>]+)>;\s*rel="next"/.exec(page?.entetes.get("link") ?? "")?.[1] ?? null;
}
