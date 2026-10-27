// GitHub vu du runtime : le sondage des issues qui portent le label `fire`,
// celui des issues ouvertes que le manager qualifie, et ce que le manager, la
// station et la pass y lisent et y écrivent — labels, commentaires, issues
// nées d'un découpage, corps d'une épique, PR, CI, merge. Seul module qui lance `gh`. Sous l'identité unique de la
// machine, c'est `gh` qui porte l'authentification ; sous une identité de rôle,
// le jeton lui est remis à chaque appel (voir `identites.ts`).
import { execFile } from "./sans-invite.ts";
import type { Check } from "./events/pass.ts";
import { masquerIdentifiants } from "./identifiants.ts";
import { COMPTE_DE_LA_MACHINE, constaterLimite, limiteDuProcess, noterLesEntetes, lectureDe, prendreUnAppel, refusPourLimite, type Limite, type Usage } from "./limite-github.ts";

// Le label par lequel une issue entre sur le rail.
export const LABEL = "fire";
// Le label par lequel un ticket dit qu'il ne se sert pas sur cette box — sa base
// n'est pas celle du projet, par exemple. Il l'emporte sur `fire`.
export const HORS_CUISINE = "hors-cuisine";

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
};

// Une issue telle que le manager la juge : avec son corps, et le lien de son
// auteur avec le dépôt, tel que GitHub le nomme (`OWNER`, `MEMBER`, `NONE`…).
export type IssueOuverte = Issue & { body: string; association: string };

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
  mergeePar: string | null;
};

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
  issue(numero: number): Promise<(Issue & { body?: string; author?: string }) | null>;
  // Les commentaires d'une issue, du plus ancien au plus récent.
  commentaires(numero: number): Promise<Commentaire[]>;
  // Les instants où le label `fire` a été retiré de l'issue, du plus ancien au
  // plus récent : l'historique des labels, que l'état courant ne garde pas.
  retraitsDeFire(numero: number): Promise<string[]>;
  // Poste un commentaire sur une issue.
  commenter(numero: number, corps: string): Promise<void>;
  // Ajoute des labels à une issue, sans toucher à ceux qu'elle porte.
  labelliser(numero: number, labels: string[]): Promise<void>;
  // Retire un label d'une issue. Déjà absent, il n'y a rien à faire.
  delabelliser(numero: number, label: string): Promise<void>;
  // Crée une issue ; rend son numéro.
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  // Les issues modifiées depuis `instant`, ouvertes ou fermées, PR écartées,
  // avec leur corps.
  issuesDepuis(instant: string): Promise<IssueOuverte[]>;
  // Remplace le corps d'une issue.
  ecrireCorps(numero: number, corps: string): Promise<void>;
  // Ouvre une PR de `branche` vers `base` ; rend son adresse.
  ouvrirPR(pr: { branche: string; base: string; titre: string; corps: string }): Promise<string>;
  // La PR la plus récente dont `branche` est la tête, ou null.
  prDeBranche(branche: string): Promise<PR | null>;
  // Les checks du commit : ses *check runs* et ses statuts.
  ci(sha: string): Promise<Check[]>;
  // Le diff d'une PR, tel que GitHub le rend.
  diff(numero: number): Promise<string>;
  // Le journal du job d'un check de GitHub Actions, ou null si le check n'en
  // est pas un, ou que GitHub ne le rend plus.
  journalDuCheck(check: Check): Promise<string | null>;
  // Relance les jobs en échec d'un run de GitHub Actions, et eux seuls.
  relancerLesEchecs(run: number): Promise<void>;
  // Remplace, sur l'issue, le commentaire dont le corps est `ancien` par
  // `nouveau` : rend faux si aucun ne l'est plus.
  remplacerCommentaire(numero: number, ancien: string, nouveau: string): Promise<boolean>;
  // Merge la PR, à condition que sa tête soit encore `sha`.
  merger(numero: number, sha: string): Promise<Merge>;
  fermerIssue(numero: number): Promise<void>;
  // La PR mergée qui a fermé cette issue (`Closes #n`), ou null si rien ne dit
  // qu'une PR l'ait fermée.
  prQuiFerme(numero: number): Promise<PR | null>;
  // Le compte sous lequel ce GitHub agit, s'il a une identité à lui (une App
  // de rôle) ; null sous l'identité unique du `gh` de la machine, que rien ne
  // distingue de celle du chef.
  identite(): Promise<string | null>;
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
};

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
// `pleine` : la dernière page d'une liste, remplie jusqu'à `per_page`. Une
// entrée de plus irait sur une page suivante, que l'ETag de celle-ci ne dit
// pas : elle se relit sans condition.
type Gardee = { etag: string; reponse: Reponse; pleine: boolean };
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
  body?: string | null;
  author_association?: string;
  user?: { login?: string } | null;
};

type CommentaireBrut = { id?: number; body?: string | null; author_association?: string; user?: { login?: string } | null; created_at?: string };

type EvenementBrut = { event?: string; created_at?: string; commit_id?: string | null; label?: { name?: string } | null };

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
};

type CheckRun = { name: string; status: string; conclusion: string | null; html_url: string | null };
type Statut = { context: string; state: string; target_url: string | null };

// Les conclusions d'un job qui ne sont pas un échec.
const CONCLUSIONS_VERTES = ["success", "neutral", "skipped"];

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

export function ouvrirGitHub(options: OptionsGitHub): GitHub {
  const { depot } = options;
  const bin = options.bin ?? "gh";
  const abandon = new AbortController();
  // Cache, pas état : le perdre coûte une requête pleine, rien de plus. Un
  // ETag par liste sondée.
  const etags = new Map<string, string>();
  // La dernière liste lue par chemin, sous son ETag : rendue sur un 304 tant
  // qu'elle n'est pas confirmée.
  const lues = new Map<string, { etag: string; issues: Issue[] }>();

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
    const appel = await prendreUnAppel(limite, { usage: options.usage, compte, etiquette: { projet: options.projet ?? (process.env.BRIGADE_PROJECT || depot), lecture: lectureDe(args, options.usage) }, gh: bin, env: environnement, maintenant: options.maintenant });
    await environnement();
    return new Promise((resoudre, rejeter) => {
      execFile(
        bin,
        ["api", "-i", ...args],
        { maxBuffer: 64 * 1024 * 1024, timeout: options.delaiMs ?? 30_000, signal: abandon.signal, env },
        (erreur, stdout, stderr) => {
          const reponse = decouper(stdout);
          if (reponse) noterLesEntetes(limite, compte, reponse.entetes);
          if (reponse?.statut === 304) limite.rendre(appel);
          // La limite de GitHub atteinte n'est pas une réponse comme les autres :
          // elle suspend les appels, et ne passe jamais pour un refus (de merge).
          if (reponse && refusPourLimite(reponse)) constaterLimite(limite, reponse, { gh: bin, env, maintenant: options.maintenant }).then(rejeter, rejeter);
          else if (reponse) resoudre(reponse);
          else rejeter(new Error(`gh api ${args.at(-1)} : ${stderr.trim() || erreur?.message || "réponse illisible"}`));
        },
      );
    });
  };

  // Une lecture, sous condition si elle a déjà été faite : sur un 304, la
  // réponse gardée. Deux lectures identiques en même temps n'en font qu'une.
  // `liste` : une page d'une liste que l'on feuillette.
  const enVol = new Map<string, Promise<Reponse>>();
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

  // Une liste d'issues, toujours sous l'ETag de sa dernière lecture. Confirmée,
  // un 304 dit « inchangé ». Non confirmée — le consommateur a encore à faire
  // sur elle —, un 304 rend la liste gardée : le travail reste à refaire, mais
  // GitHub ne compte pas l'appel, et la liste n'est pas relue en entier.
  const sonder = async <I extends Issue>(chemin: string, lireIssue: (brute: IssueBrute) => I): Promise<Sondage<I>> => {
    const lue = lues.get(chemin) as { etag: string; issues: I[] } | undefined;
    const premiere = await appeler([...(lue ? ["-H", `If-None-Match: ${lue.etag}`] : []), chemin]);
    if (lue && premiere.statut === 304) {
      if (etags.get(chemin) === lue.etag) return { inchange: true };
      return { inchange: false, issues: lue.issues, confirmer: () => void etags.set(chemin, lue.etag) };
    }
    etags.delete(chemin);
    lues.delete(chemin);
    const pages = await feuilleter(premiere, chemin);
    const issues = pages
      .flatMap((page) => JSON.parse(page.corps) as IssueBrute[])
      .filter((brute) => brute.pull_request === undefined)
      .map(lireIssue);
    // Au-delà d'une page, un changement en page 2 ne se verrait pas dans
    // l'ETag de la première : le sondage reste alors inconditionnel.
    const empreinte = pages.length === 1 ? (premiere.entetes.get("etag") ?? null) : null;
    if (empreinte !== null && empreinte !== "") lues.set(chemin, { etag: empreinte, issues });
    return { inchange: false, issues, confirmer: () => void (empreinte === null || empreinte === "" ? etags.delete(chemin) : etags.set(chemin, empreinte)) };
  };

  const lireOuverte = (brute: IssueBrute): IssueOuverte => ({ ...lire(brute), body: brute.body ?? "", association: brute.author_association ?? "NONE" });

  return {
    tickets: () => sonder(`repos/${depot}/issues?labels=${LABEL}&state=open&per_page=100`, lire),
    ouvertes: () => sonder(`repos/${depot}/issues?state=open&per_page=100`, lireOuverte),
    async issue(numero) {
      const chemin = `repos/${depot}/issues/${numero}`;
      const reponse = await lireSousCondition([chemin]);
      if (reponse.statut === 404 || reponse.statut === 410) return null;
      const brute = JSON.parse(exiger(reponse, chemin).corps) as IssueBrute;
      return { ...lire(brute), body: brute.body ?? "", author: brute.user?.login ?? "" };
    },
    async ecrireCorps(numero, corps) {
      const chemin = `repos/${depot}/issues/${numero}`;
      exiger(await appeler(["-X", "PATCH", "-f", `body=${corps}`, chemin]), chemin);
    },
    async creerIssue({ titre, corps, labels }) {
      const chemin = `repos/${depot}/issues`;
      const champs = ["-f", `title=${titre}`, "-f", `body=${corps}`, ...labels.flatMap((label) => ["-f", `labels[]=${label}`])];
      const reponse = exiger(await appeler(["-X", "POST", ...champs, chemin]), chemin, 201);
      const numero = (JSON.parse(reponse.corps) as { number?: unknown }).number;
      if (!Number.isSafeInteger(numero)) throw new Error(`gh api ${chemin} : issue créée sans numéro`);
      return numero as number;
    },
    async issuesDepuis(instant) {
      // Sans condition : son chemin change avec `instant`, aucune lecture ne s'y redemande.
      const chemin = `repos/${depot}/issues?state=all&since=${instant}&per_page=100`;
      const pages = await feuilleter(await appeler([chemin]), chemin);
      return pages
        .flatMap((page) => JSON.parse(page.corps) as IssueBrute[])
        .filter((lue) => lue.pull_request === undefined)
        .map(lireOuverte);
    },
    async commentaires(numero) {
      const pages = await lireLaListe(`repos/${depot}/issues/${numero}/comments?per_page=100`);
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
      return { number: brute.number, url: brute.html_url, base: brute.base.ref, sha: brute.head.sha, state: brute.state, merged: true, enRetard: false, mergeePar: brute.merged_by?.login || null };
    },
    async commenter(numero, corps) {
      await creer(`repos/${depot}/issues/${numero}/comments`, { body: corps });
    },
    async labelliser(numero, labels) {
      const chemin = `repos/${depot}/issues/${numero}/labels`;
      exiger(await appeler(["-X", "POST", ...labels.flatMap((label) => ["-f", `labels[]=${label}`]), chemin]), chemin);
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
      const brute = JSON.parse(exiger(await lireSousCondition([chemin]), chemin).corps) as PRBrute;
      return {
        number: brute.number,
        url: brute.html_url,
        base: brute.base.ref,
        sha: brute.head.sha,
        state: brute.state,
        merged: brute.merged === true || (brute.merged_at ?? null) !== null,
        enRetard: brute.mergeable_state === "behind",
        mergeePar: brute.merged_by?.login || null,
      };
    },
    async ci(sha) {
      const jobs = `repos/${depot}/commits/${sha}/check-runs?per_page=100`;
      const statuts = `repos/${depot}/commits/${sha}/status?per_page=100`;
      const [runs, combine] = await Promise.all([lireSousCondition([jobs]), lireSousCondition([statuts])]);
      const { check_runs = [] } = JSON.parse(exiger(runs, jobs).corps) as { check_runs?: CheckRun[] };
      const { statuses = [] } = JSON.parse(exiger(combine, statuts).corps) as { statuses?: Statut[] };
      return [
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
    async relancerLesEchecs(run) {
      const chemin = `repos/${depot}/actions/runs/${run}/rerun-failed-jobs`;
      exiger(await appeler(["-X", "POST", chemin]), chemin, 201);
    },
    async remplacerCommentaire(numero, ancien, nouveau) {
      const pages = await lireLaListe(`repos/${depot}/issues/${numero}/comments?per_page=100`);
      const trouve = pages.flatMap((page) => JSON.parse(page.corps) as CommentaireBrut[]).find((brut) => (brut.body ?? "") === ancien);
      if (trouve?.id === undefined) return false;
      const edition = `repos/${depot}/issues/comments/${trouve.id}`;
      exiger(await appeler(["-X", "PATCH", "-f", `body=${nouveau}`, edition]), edition);
      return true;
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
    identite: async () => (options.identite ? options.identite() : null),
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
