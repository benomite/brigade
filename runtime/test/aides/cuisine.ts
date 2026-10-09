// La cuisine des tests : un runtime complet — rail, garde-fous, station, et la
// pass si le test la demande — sur un dépôt (vrai ou faux), un faux `claude`,
// de fausses gates et un GitHub de test. Ni réseau, ni quota.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { avecRail } from "../../src/alimenter.ts";
import type { Arbitrage } from "../../src/arbitrage.ts";
import type { Session } from "../../src/claude.ts";
import { ouvrirDepot, type Depot } from "../../src/depot.ts";
import type { Plafonds } from "../../src/evenements/garde-fous.ts";
import type { Check } from "../../src/evenements/pass.ts";
import { configCloison } from "../../src/cloison.ts";
import { brancherGardeFous, type Reglages } from "../../src/garde-fous.ts";
import { brancherManager } from "../../src/manager.ts";
import type { Commentaire, GitHub, Issue, PR } from "../../src/github.ts";
import type { Machine } from "../../src/machine.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { brancherPass, type ConfigPass } from "../../src/pass.ts";
import type { Plafond } from "../../src/reagir.ts";
import { demarrer } from "../../src/runtime.ts";
import { brancherStation } from "../../src/station.ts";
import { BASE, DEPOT, depotGit, ecrireSuite, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, lancementsDuFauxBwrap, lancementsDuFauxClaude, repertoireTemporaire } from "../outils.ts";

const FAUSSES_GATES = join(import.meta.dirname, "fausses-gates.sh");
const FAUX_SETUP = join(import.meta.dirname, "faux-setup.sh");

export type ScenarioSetup = "exporte" | "jeton" | "attend" | "echec" | "refuse" | "lent" | "derive";

// Le cook « bavard » rend un tour toutes les deux millisecondes, de vraie
// horloge : un plafond de tours qu'il atteindrait pendant un test ferait
// course avec ce que le test attend. Tours et jetons (dix par tour) ne sont
// donc atteints qu'après 200 s — plus que les deux minutes laissées à un
// test. Celui qui éprouve un plafond règle le sien.
export const PLAFONDS: Plafonds = { turns: 100_000, durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 };
export const REGLAGES: Reglages = { plafonds: PLAFONDS, seuilDisjoncteur: 3, graceMs: 2000 };
export const BAIL_MS = 600_000;
export const CALIBRE = ["fire", "model:sonnet", "effort:low"];
export const CALIBRAGE_DU_REVIEWER = { model: "haiku", effort: "medium" };

// Une horloge que le test avance à la main : le quota ne revient qu'à l'heure.
export function montre(depart = "2026-10-08T10:00:00.000Z") {
  let instant = Date.parse(depart);
  return { maintenant: () => new Date(instant), avancer: (ms: number) => void (instant += ms) };
}

export function issue(number: number, labels: string[] = CALIBRE, autres: Partial<Issue> = {}): Issue {
  return {
    number,
    title: `Ticket ${number}`,
    labels,
    state: "open",
    createdAt: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`,
    updatedAt: "2026-10-08T09:00:00Z",
    url: `https://github.com/${DEPOT}/issues/${number}`,
    ...autres,
  };
}

// Un GitHub de test : les issues du dépôt, et ce que la station y a écrit.
export function fauxGitHub(...issues: Issue[]) {
  const etat = new Map(issues.map((i) => [i.number, i]));
  const commentaires: Array<[number, string]> = [];
  // Les commentaires que le chef ou le manager ont posés sur une issue.
  const poses = new Map<number, Commentaire[]>();
  const prs: Array<{ branche: string; base: string; titre: string; corps: string }> = [];
  // `creation` : GitHub refuse de créer une issue ; `creationsMax` : il refuse
  // au-delà de ce nombre. `apresCreation` : il la crée, et la réponse se perd —
  // une fois. `apresRetrait` : de même pour un label retiré.
  const pannes = { commentaire: false, pr: false, lecture: false, label: false, creation: false, creationsMax: Infinity, apresCreation: false, corps: false, apresRetrait: false };
  // Les issues nées par l'API, et les corps réécrits.
  const creations: number[] = [];
  const ecritures: Array<[number, string]> = [];
  // Ce que le manager lit d'une issue en plus de ce que le rail en lit, et ce
  // qu'il y pose.
  const corps = new Map<number, { body?: string; association?: string }>();
  const labellisations: Array<[number, string[]]> = [];
  const delabellisations: Array<[number, string]> = [];
  const sondages = { ouvertes: 0, inchanges: 0 };
  // La liste des issues ouvertes telle qu'elle a été confirmée : GitHub répond
  // « inchangé » tant qu'elle n'a pas bougé.
  let confirmee: string | null = null;
  // Les PR ouvertes, par branche — telles que la pass les relit.
  const ouvertes = new Map<string, PR>();
  // Ce que la CI répond, et ce que GitHub fait d'une demande de merge : il
  // merge, refuse (avec ce motif), ou tombe en panne — avant ou après avoir mergé.
  const ci: { checks: Check[] } = { checks: [] };
  const merge: { mode: "ok" | "panne" | "panne-apres-merge" | { refus: string } } = { mode: "ok" };
  const merges: Array<[number, string]> = [];
  const fermetures: number[] = [];
  // Le compte sous lequel la pass agit, si elle en a un à elle : null, c'est
  // l'identité unique de la machine.
  const comptes: { pass: string | null } = { pass: null };
  // `par` : le compte que GitHub nomme pour ce merge, s'il le dit.
  const mergerPR = (numero: number, par: string | null = null) => {
    for (const pr of ouvertes.values()) if (pr.number === numero) Object.assign(pr, { merged: true, state: "closed", mergeePar: par });
  };
  // Sur GitHub, commenter une issue ou y poser un label la modifie.
  let touches = 0;
  const toucher = (numero: number) => {
    const connue = etat.get(numero);
    if (connue) etat.set(numero, { ...connue, updatedAt: `2026-10-08T09:30:00.${String(++touches).padStart(3, "0")}Z` });
  };
  const github: GitHub = {
    async tickets() {
      const ouvertes = [...etat.values()].filter((i) => i.state === "open" && i.labels.includes("fire"));
      return { inchange: false, issues: ouvertes, confirmer: () => {} };
    },
    async ouvertes() {
      sondages.ouvertes++;
      const issues = [...etat.values()]
        .filter((i) => i.state === "open")
        .map((i) => ({ body: "", association: "OWNER", ...i, ...corps.get(i.number) }));
      const version = JSON.stringify([issues, [...poses]]);
      if (version === confirmee) {
        sondages.inchanges++;
        return { inchange: true };
      }
      return { inchange: false, issues, confirmer: () => void (confirmee = version) };
    },
    async issue(numero) {
      const connue = etat.get(numero);
      return connue ? { ...connue, body: corps.get(numero)?.body ?? "" } : null;
    },
    commentaires: async (numero) => poses.get(numero) ?? [],
    async commenter(numero, corps) {
      if (pannes.commentaire) throw new Error("gh api : HTTP 502");
      commentaires.push([numero, corps]);
      // Sur GitHub, un commentaire s'ajoute à l'issue : il se relit, et la modifie.
      poses.set(numero, [...(poses.get(numero) ?? []), { body: corps, author: "brigade", association: "OWNER" }]);
      toucher(numero);
    },
    async labelliser(numero, labels) {
      if (pannes.label) throw new Error("gh api : HTTP 502");
      labellisations.push([numero, labels]);
      const connue = etat.get(numero);
      if (connue) etat.set(numero, { ...connue, labels: [...new Set([...connue.labels, ...labels])] });
      toucher(numero);
    },
    async delabelliser(numero, label) {
      if (pannes.label) throw new Error("gh api : HTTP 502");
      delabellisations.push([numero, label]);
      const connue = etat.get(numero);
      if (connue) etat.set(numero, { ...connue, labels: connue.labels.filter((pose) => pose !== label) });
      toucher(numero);
      if (pannes.apresRetrait) {
        pannes.apresRetrait = false;
        throw new Error("gh api : délai dépassé");
      }
    },
    async creerIssue({ titre, corps: body, labels }) {
      if (pannes.creation || creations.length >= pannes.creationsMax) throw new Error("gh api : HTTP 502");
      const number = 500 + creations.length + 1;
      creations.push(number);
      etat.set(number, issue(number, labels, { title: titre, createdAt: `2026-10-08T10:00:00.${String(creations.length).padStart(3, "0")}Z` }));
      corps.set(number, { body });
      if (pannes.apresCreation) {
        pannes.apresCreation = false;
        throw new Error("gh api : délai dépassé");
      }
      return number;
    },
    issuesDepuis: async (instant) =>
      [...etat.values()].filter((i) => i.updatedAt >= instant || i.createdAt >= instant).map((i) => ({ body: "", association: "OWNER", ...i, ...corps.get(i.number) })),
    async ecrireCorps(numero, body) {
      if (pannes.corps) throw new Error("gh api : HTTP 502");
      ecritures.push([numero, body]);
      corps.set(numero, { ...corps.get(numero), body });
      toucher(numero);
    },
    async ouvrirPR(pr) {
      if (pannes.pr) throw new Error("gh api : HTTP 422");
      prs.push(pr);
      const number = 100 + prs.length;
      const url = `https://github.com/${DEPOT}/pull/${number}`;
      ouvertes.set(pr.branche, { number, url, base: pr.base, sha: `tete-de-${pr.branche}`, state: "open", merged: false, mergeable: true, enRetard: false, mergeePar: null });
      return url;
    },
    async prDeBranche(branche) {
      if (pannes.lecture) throw new Error("gh api : HTTP 502");
      const pr = ouvertes.get(branche);
      return pr ? { ...pr } : null;
    },
    async ci() {
      return ci.checks;
    },
    async merger(numero, sha) {
      merges.push([numero, sha]);
      if (merge.mode === "panne") throw new Error("gh api : HTTP 502");
      if (typeof merge.mode === "object") return { fait: false, motif: merge.mode.refus };
      mergerPR(numero, comptes.pass);
      if (merge.mode === "panne-apres-merge") throw new Error("gh api : délai dépassé");
      return { fait: true };
    },
    async fermerIssue(numero) {
      fermetures.push(numero);
      const connue = etat.get(numero);
      if (connue) etat.set(numero, { ...connue, state: "closed" });
    },
    identite: async () => comptes.pass,
    fermer: () => {},
  };
  return { github, comptes, commentaires, prs, pannes, ouvertes, ci, merge, merges, fermetures, mergerPR, labellisations, delabellisations, sondages, creations, ecritures,
    // Le corps d'une issue, tel que GitHub le rend.
    corpsDe: (numero: number) => corps.get(numero)?.body ?? "",
    poser: (i: Issue) => void etat.set(i.number, i),
    lire: (numero: number) => etat.get(numero),
    // Le corps d'une issue, et le lien de son auteur avec le dépôt.
    decrire: (numero: number, description: { body?: string; association?: string }) => void corps.set(numero, description),
    // Ce que le chef écrit sous une issue.
    repondre: (numero: number, body: string, association = "OWNER") =>
      void poses.set(numero, [...(poses.get(numero) ?? []), { body, author: "chef", association }]),
    // Remplace les commentaires d'une issue par ceux-ci — ce qui, sur GitHub, la modifie.
    ficher(numero: number, updatedAt: string, ...corps: string[]) {
      poses.set(numero, corps.map((body) => ({ body, author: "chef", association: "OWNER" })));
      const connue = etat.get(numero);
      if (connue) etat.set(numero, { ...connue, updatedAt });
    },
  };
}

// Un dépôt sans git, pour ce qui ne tient pas à lui : un worktree est un
// répertoire, un commit est le fichier que le faux cook y laisse, et tout
// autre fichier est du travail qu'il n'a pas commité.
// `gates`, `setup` : le projet porte des gates, un setup — leurs doublures,
// par un lien, dans chaque worktree.
// La tête d'une branche change à chaque fois que le faux cook y réécrit son
// travail. Une branche survit à son worktree : ce qu'elle portait est retenu
// quand il part, et rendu au worktree qui la reprend.
// `declaration` : les secrets que le projet déclare, tels que chaque worktree
// les porte.
export function fauxDepot(racine: string, gates: boolean, setup = false, declaration?: string): Depot {
  type Branche = { commits: number; date: number; recoltes: string[]; poussee?: boolean };
  // Sur le disque, à côté des worktrees : le clone survit à un redémarrage du
  // runtime, ses branches aussi.
  const memoire = `${racine}.branches.json`;
  const connu: { vivants: Array<[string, string]>; rangees: Array<[string, Branche]> } = existsSync(memoire) ? JSON.parse(readFileSync(memoire, "utf8")) : { vivants: [], rangees: [] };
  const retenir = <K, V>(contenu: Array<[K, V]>) => {
    const carte = new Map(contenu);
    const ecrire = () => writeFileSync(memoire, JSON.stringify({ vivants: [...vivants], rangees: [...rangees] }));
    return Object.assign(carte, {
      set: (cle: K, valeur: V) => (Map.prototype.set.call(carte, cle, valeur), ecrire(), carte),
      delete: (cle: K) => (Map.prototype.delete.call(carte, cle) as boolean) && (ecrire(), true),
    });
  };
  const vivants: Map<string, string> = retenir(connu.vivants);
  const rangees: Map<string, Branche> = retenir(connu.rangees);
  const travail = (worktree: string) => join(worktree, "travail.txt");
  const equiper = (worktree: string) => {
    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    if (gates) symlinkSync(FAUSSES_GATES, join(worktree, ".claude/brigade/gates.sh"));
    if (setup) symlinkSync(FAUX_SETUP, join(worktree, ".claude/brigade/worktree-setup.sh"));
    if (declaration !== undefined) writeFileSync(join(worktree, ".claude/brigade/secrets"), declaration);
    return worktree;
  };
  // Une branche, ou ce que l'origine en a reçu : ici, c'est la même chose.
  const branche = (ref: string): Branche => {
    const nom = ref.replace(/^origin\//, "");
    const worktree = vivants.get(nom);
    const connue = rangees.get(nom) ?? { commits: 0, date: 0, recoltes: [] };
    if (worktree === undefined || !existsSync(worktree)) {
      if (!rangees.has(nom)) throw new Error(`fatal: branche inconnue : ${nom}`);
      return connue;
    }
    return existsSync(travail(worktree)) ? { ...connue, commits: 1, date: statSync(travail(worktree)).mtimeMs } : { ...connue, commits: connue.recoltes.length };
  };
  const traine = (worktree: string) => readdirSync(worktree).filter((nom) => nom !== ".claude" && nom !== "travail.txt");
  const recolter = (worktree: string, nom: string) => {
    const restes = traine(worktree);
    if (restes.length === 0) return null;
    for (const reste of restes) rmSync(join(worktree, reste), { recursive: true });
    const connue = branche(nom);
    const recolte = `recolte-${nom.slice("cook/".length)}-${connue.recoltes.length + 1}`;
    rangees.set(nom, { ...connue, recoltes: [...connue.recoltes, recolte] });
    return recolte;
  };
  const quitter = (worktree: string, nom: string) => {
    if (vivants.get(nom) === worktree && existsSync(worktree)) rangees.set(nom, branche(nom));
    if (vivants.get(nom) === worktree) vivants.delete(nom);
    rmSync(worktree, { recursive: true, force: true });
  };
  const de = (worktree: string) => [...vivants].find(([, vivant]) => vivant === worktree)?.[0];
  return {
    async preparer(run) {
      const worktree = equiper(join(racine, run));
      vivants.set(`cook/${run}`, worktree);
      return { worktree, branche: `cook/${run}` };
    },
    async reprendre(run, nom) {
      const connue = branche(nom);
      const worktree = equiper(join(racine, run));
      if (connue.commits > 0 && connue.date > 0) {
        writeFileSync(travail(worktree), "le travail du cook\n");
        utimesSync(travail(worktree), connue.date / 1000, connue.date / 1000);
      }
      rangees.set(nom, connue);
      vivants.set(nom, worktree);
      return worktree;
    },
    retirer(worktree, nom) {
      const sienne = de(worktree);
      if (sienne !== undefined) quitter(worktree, sienne);
      else rmSync(worktree, { recursive: true, force: true });
      if (nom !== undefined) rangees.delete(nom);
    },
    recolter,
    surSaBranche: () => true,
    livree: (nom) => (rangees.get(nom)?.poussee ? `origin/${nom}` : nom),
    async ranger(worktree, nom) {
      if (!existsSync(worktree)) return null;
      const recolte = recolter(worktree, nom);
      quitter(worktree, nom);
      return recolte;
    },
    async elaguer(nom) {
      rangees.delete(nom);
      return true;
    },
    connait: (nom) => vivants.has(nom) || rangees.has(nom),
    commits: (nom) => {
      const { commits, recoltes } = branche(nom);
      return Math.max(commits, recoltes.length);
    },
    pousser: (nom) => void rangees.set(nom, { ...branche(nom), poussee: true }),
    tete: (nom) => {
      const { date, recoltes } = branche(nom);
      return `${nom.replace(/^(origin\/)?cook\//, "")}@${date}${recoltes.length === 0 ? "" : `+${recoltes.length}`}`;
    },
    intact: (worktree) => readdirSync(worktree).every((nom) => nom === ".claude"),
    changes: () => ["travail.txt"],
    diff: () => "+le travail du cook",
    ajouts: () => "le travail du cook\n+le travail du cook",
    revenir: () => {},
    recoltes: (nom) => branche(nom).recoltes,
    liste: (_nom, repertoire) => (repertoire === ".claude/brigade" ? [...(gates ? ["gates.sh"] : []), ...(setup ? ["worktree-setup.sh"] : [])] : []),
    // Tout fichier posé à la racine du worktree, avec son poids et sa date.
    fichiers: () => ["README.md", "runtime/src/rail.ts", "runtime/src/pass.ts", "runtime/test/rail.test.ts", "docs/runtime.md"],
    // Une base qui ne bouge pas, tant que le test n'en décide pas autrement.
    rapatrier: async () => "base-0",
    retard: () => ({ depart: "base-0", commits: 0 }),
    arrives: () => [],
    // Un worktree jetable porte ce que porte tout worktree du projet.
    essayer: async (nom) => equiper(join(racine, ".essais", nom)),
    async poser(nom, deBranche) {
      branche(deBranche);
      return equiper(join(racine, ".essais", nom));
    },
    jeter: (nom) => rmSync(join(racine, ".essais", nom ?? ""), { recursive: true, force: true }),
    empreinte: (worktree) =>
      readdirSync(worktree)
        .filter((nom) => nom !== ".claude")
        .map((nom) => [nom, statSync(join(worktree, nom)).size, statSync(join(worktree, nom)).mtimeMs].join(":"))
        .join("|"),
  };
}

export type Lieux = {
  repertoire: string;
  // Le vrai dépôt git, quand le test en veut un.
  origine: string;
  clone: string;
  gh: ReturnType<typeof fauxGitHub>;
  heure: ReturnType<typeof montre>;
};

export type Options = {
  scenario?: string;
  suite?: string[];
  session?: Session;
  // Un vrai dépôt git local plutôt que le faux.
  git?: boolean;
  issues?: Issue[];
  bailMs?: number;
  seuilDisjoncteur?: number;
  plafonds?: Partial<Plafonds>;
  // Les lieux d'une vie précédente, pour redémarrer dessus.
  lieux?: Lieux;
  depot?: (depot: Depot) => Depot;
  // Brancher la pass. Sans elle, un ticket livré reste en pass.
  pass?: boolean | Partial<ConfigPass>;
  // Le scénario des relectures du reviewer (« relit-vert » par défaut), ou
  // leur suite.
  reviewer?: { relecture?: string; suite?: string[] };
  // Un projet sans gates.
  sansGates?: boolean;
  // Un projet qui a un setup de worktree — la doublure, sur ce scénario.
  setup?: ScenarioSetup;
  // Brancher le manager : le scénario de ses jugements, ou leur suite, et la
  // roadmap du projet s'il en a une.
  // `plafond` : jusqu'où une montée de calibrage peut aller — rien, par défaut.
  manager?: { jugement?: string; suite?: string[]; roadmap?: number; plafond?: Partial<Plafond> };
  // Les chemins communs du projet.
  communs?: string[];
  // Le plafond de cooks tant que le chef n'a rien réglé : un, par défaut — un
  // test qui veut des cooks de front le dit.
  cooks?: number;
  // Les tickets en entrée à la fois.
  entrees?: number;
  // Chaque rôle a son identité GitHub, et le cook aucune.
  sansIdentite?: boolean;
  // Les secrets du projet : ce que son dépôt déclare, et ce que la machine
  // détient — `valeurs` nul : la machine n'a pas de fichier de secrets.
  secrets?: { declares: string; valeurs: string | null };
  // Chaque lancement part dans une cloison — la doublure de `bwrap`.
  cloison?: boolean;
  // La machine que la station et la pass lisent. Par défaut, une machine qui
  // respire : aucun test ne dépend de la charge du poste.
  machine?: () => Machine;
  // Le nom du projet (« brigade » par défaut), et l'arbitre entre projets que
  // sa station consulte — aucun, par défaut.
  projet?: string;
  arbitre?: Arbitrage;
  // Ce que la station fait de ce qu'elle aurait imprimé, à la place de le retenir.
  avertir?: (message: string) => void;
};

export const MACHINE_CALME: Machine = { charge: 0, coeurs: 8, memoireDisponible: 64 * 1024 ** 3, disqueLibre: 512 * 1024 ** 3 };

export function cuisine(t: TestContext, options: Options = {}) {
  // Enregistré avant tout répertoire temporaire : les crochets de fin se jouent
  // dans l'ordre, et le runtime doit être arrêté avant qu'on retire son état.
  let aArreter: { arreter(signal: string): void } | undefined;
  t.after(() => aArreter?.arreter("test"));
  const lieux: Lieux = options.lieux ?? {
    repertoire: repertoireTemporaire(t),
    ...(options.git ? depotGit(t) : { origine: "", clone: "" }),
    gh: fauxGitHub(...(options.issues ?? [])),
    heure: montre(),
  };
  const { repertoire, origine, clone, gh, heure } = lieux;
  // Ce que la station aurait imprimé pour journald.
  const avertissements: string[] = [];
  const temoin = join(repertoire, "temoin");
  mkdirSync(temoin, { recursive: true });
  const suite = join(repertoire, "suite.txt");
  // Ce qu'attend un cook « commite-puis-attend » pour conclure.
  const feu = join(repertoire, "feu");
  if (options.suite) ecrireSuite(suite, options.suite);
  const bailMs = options.bailMs ?? BAIL_MS;
  const worktrees = join(repertoire, "worktrees");
  const depot = options.git ? ouvrirDepot({ clone, base: BASE, worktrees, env: ENV_GIT }) : fauxDepot(worktrees, !options.sansGates, options.setup !== undefined, options.secrets?.declares);
  // Le fichier de la machine vit hors de l'état, comme sur la box.
  const fichierSecrets = join(repertoireTemporaire(t), "secrets.env");
  const poserSecrets = (valeurs: string) => writeFileSync(fichierSecrets, valeurs, { mode: 0o600 });
  if (options.secrets && options.secrets.valeurs !== null) poserSecrets(options.secrets.valeurs);
  const secretsDeLaMachine = options.secrets && options.secrets.valeurs !== null ? fichierSecrets : null;
  const depotDuTest = options.depot?.(depot) ?? depot;
  // Le scénario des fausses gates, que le test change à la main.
  const fichierGates = join(repertoire, "gates.txt");
  const fichierSetup = join(repertoire, "setup.txt");
  if (options.setup) writeFileSync(fichierSetup, options.setup);
  // Ce que la doublure de `bwrap` a reçu, un fichier par lancement.
  const temoinDeCloison = join(repertoire, "temoin-cloison");
  mkdirSync(temoinDeCloison, { recursive: true });
  // Le compte du service, tel que la cloison le lit : un répertoire à lui.
  const compte = join(repertoireTemporaire(t), "compte");
  const cloison = options.cloison
    ? configCloison({ BRIGADE_SANDBOX_BIN: FAUX_BWRAP, BRIGADE_SANDBOX_HIDDEN: [repertoire, clone].filter(Boolean).join(":"), HOME: compte }, { repertoireEtat: repertoire, clone: clone || join(repertoire, "depot") })
    : null;
  const env = {
    ...ENV_GIT,
    FAUX_BWRAP_TEMOIN: temoinDeCloison,
    BRIGADE_STATE_DIR: repertoire,
    FAUX_CLAUDE: options.scenario ?? "livre",
    FAUX_CLAUDE_SUITE: suite,
    FAUX_CLAUDE_TEMOIN: temoin,
    FAUX_CLAUDE_FEU: feu,
    FAUSSES_GATES: fichierGates,
    FAUX_SETUP: fichierSetup,
  };

  const socle = demarrer({ repertoireEtat: repertoire, projet: options.projet ?? "brigade", intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: heure.maintenant });
  const garde = brancherGardeFous(
    { ...REGLAGES, plafonds: { ...PLAFONDS, ...options.plafonds }, seuilDisjoncteur: options.seuilDisjoncteur ?? 3 },
    avecRail(socle, { depot: DEPOT, dureeBailMs: bailMs, gh: "", github: gh.github, maintenant: heure.maintenant, communs: options.communs }),
  );
  const suiteDuReviewer = join(repertoire, "suite-reviewer.txt");
  if (options.reviewer?.suite) ecrireSuite(suiteDuReviewer, options.reviewer.suite);
  const jugee = options.pass
    ? brancherPass(garde, {
        repertoireEtat: repertoire,
        depot: depotDuTest,
        github: gh.github,
        base: BASE,
        reviewer: { calibrage: CALIBRAGE_DU_REVIEWER },
        depotGitHub: DEPOT,
        bin: FAUX_CLAUDE,
        // Les relectures ont leur scénario : elles ne consomment pas celui des cooks.
        env: { ...env, FAUX_CLAUDE: options.reviewer?.relecture ?? "relit-vert", FAUX_CLAUDE_SUITE: suiteDuReviewer },
        sansIdentite: options.sansIdentite,
        secrets: secretsDeLaMachine,
        cloison,
        delaiGatesMs: 60_000,
        attenteCiMs: 1_800_000,
        ...(options.pass === true ? {} : options.pass),
        machine: options.machine ?? (() => MACHINE_CALME),
        maintenant: heure.maintenant,
        avertir: (message) => void avertissements.push(message),
      })
    : null;
  const suiteDuJuge = join(repertoire, "suite-juge.txt");
  if (options.manager?.suite) ecrireSuite(suiteDuJuge, options.manager.suite);
  const servie = brancherStation(jugee ?? garde, {
    repertoireEtat: repertoire,
    depot: depotDuTest,
    github: gh.github,
    depotGitHub: DEPOT,
    base: BASE,
    bin: FAUX_CLAUDE,
    env,
    sansIdentite: options.sansIdentite,
    secrets: secretsDeLaMachine,
    cloison,
    session: async () => options.session ?? "connectee",
    dureeBailMs: bailMs,
    cooksParDefaut: options.cooks ?? 1,
    entreesMax: options.entrees,
    machine: options.machine ?? (() => MACHINE_CALME),
    maintenant: heure.maintenant,
    avertir: options.avertir ?? ((message) => void avertissements.push(message)),
    apresCook: jugee?.reveillerPass,
    arbitre: options.arbitre,
  });
  const runtime = options.manager
    ? brancherManager(servie, {
        calibrage: { model: "sonnet", effort: "medium" },
        roadmap: options.manager.roadmap ?? null,
        plafond: { model: null, effort: null, ...options.manager.plafond },
        github: gh.github,
        depotGitHub: DEPOT,
        repertoireEtat: repertoire,
        bin: FAUX_CLAUDE,
        fichiers: depot.fichiers,
        cloison,
        // Les jugements ont leur scénario : ils ne consomment pas celui des cooks.
        env: { ...env, FAUX_CLAUDE: options.manager.jugement ?? "juge-ticket", FAUX_CLAUDE_SUITE: suiteDuJuge },
        maintenant: heure.maintenant,
        avertir: (message) => void avertissements.push(message),
      })
    : servie;
  aArreter = runtime;

  const { journal } = runtime;
  const types = (ticket?: number) => (ticket === undefined ? journal.tout() : journal.duTicket(ticket)).map((e) => e.type);
  const dernier = (type: string, ticket?: number) =>
    (ticket === undefined ? journal.tout() : journal.duTicket(ticket)).findLast((e) => e.type === type)?.payload as Record<string, unknown> | undefined;
  const etat = (ticket: number) => runtime.rail.tickets().find((x) => x.ticket === ticket)?.state;
  // Les lancements du faux `claude`.
  const lancements = () => lancementsDuFauxClaude(temoin);
  // Ceux des cooks, et ceux du reviewer — le seul lancé avec `--tools`.
  const relectures = () => lancements().filter((lance) => lance.args.includes("--tools"));
  const cooks = () => lancements().filter((lance) => !lance.args.includes("--tools"));
  const gates = {
    regler: (scenario: "vert" | "rouge" | "lent" | "bavard" | "cite-un-jeton" | "plafond" | "rouge-et-plafond") => writeFileSync(fichierGates, scenario),
    // Les worktrees sur lesquels les gates ont été jouées, dans l'ordre.
    appels: () => (existsSync(`${fichierGates}.appels`) ? readFileSync(`${fichierGates}.appels`, "utf8").trimEnd().split("\n") : []),
    // Le jeton GitHub (`GH_TOKEN`) que chaque passage a vu dans son environnement — vide s'il n'en avait pas.
    jetons: () => (existsSync(`${fichierGates}.jetons`) ? readFileSync(`${fichierGates}.jetons`, "utf8").slice(0, -1).split("\n") : []),
    // Le secret du projet (`CLE_API`) que chaque passage a vu — vide s'il n'en avait pas.
    secrets: () => (existsSync(`${fichierGates}.secrets`) ? readFileSync(`${fichierGates}.secrets`, "utf8").slice(0, -1).split("\n") : []),
  };
  const setup = {
    regler: (scenario: ScenarioSetup) => writeFileSync(fichierSetup, scenario),
    // Laisse finir un setup « attend » ou « refuse ».
    liberer: () => writeFileSync(`${fichierSetup}.go`, ""),
    // Retient de nouveau les setups suivants, après un `liberer`.
    retenir: () => rmSync(`${fichierSetup}.go`, { force: true }),
    // Les appels du setup — « <ticket> <worktree> » —, dans l'ordre.
    appels: () => (existsSync(`${fichierSetup}.appels`) ? readFileSync(`${fichierSetup}.appels`, "utf8").trimEnd().split("\n") : []),
  };
  // Laisse conclure un cook « commite-puis-attend ».
  const conclure = () => writeFileSync(feu, "");
  // Le fichier de secrets de la machine, que le test réécrit comme le ferait le chef.
  const secrets = { fichier: fichierSecrets, poser: poserSecrets };
  // Ce que chaque lancement cloisonné a demandé à `bwrap`.
  const cloisonnes = () => lancementsDuFauxBwrap(temoinDeCloison);
  return { cloisonnes, compte, runtime, journal, lieux, repertoire, origine, clone, gh, heure, types, dernier, etat, lancements, relectures, cooks, avertissements, gates, setup, conclure, secrets };
}

// Ce que ferait la CLI depuis son propre process : une autre connexion.
export function chef(
  repertoire: string,
  type: "kitchen.stopped" | "kitchen.resumed" | "grant.activated" | "grant.revoked" | "manager.enabled" | "manager.disabled" | "base.recheck-requested",
) {
  const journal = ouvrirJournal(repertoire);
  if (type !== "grant.activated" && type !== "grant.revoked") journal.ajouter({ project: "brigade", ticket: null, author: "chef", type, payload: {} });
  else journal.ajouter({ project: "brigade", ticket: null, author: "chef", type, payload: { action: "merge" } });
  journal.fermer();
}

// Le chef règle le plafond de cooks, depuis son propre process.
export function plafonner(repertoire: string, maxCooks: number) {
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "station.capped", payload: { station: "box/claude", maxCooks } });
  journal.fermer();
}

// La pass vient de jouer les gates sur la base : ce qu'un autre process en lirait.
export function controlerBase(repertoire: string, outcome: "green" | "red" | "skipped", sha = "ba5e0001ffff") {
  const journal = ouvrirJournal(repertoire);
  const gates = { outcome, code: outcome === "red" ? 1 : outcome === "green" ? 0 : null, failures: [], tail: "" };
  journal.ajouter({ project: "brigade", ticket: null, author: "pass", type: "base.checked", payload: { sha, outcome, gates, tickets: [] } });
  journal.fermer();
}
