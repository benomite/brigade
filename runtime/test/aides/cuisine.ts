// La cuisine des tests : un runtime complet — rail, garde-fous, station, et la
// pass si le test la demande — sur un dépôt (vrai ou faux), un faux `claude`,
// de fausses gates et un GitHub de test. Ni réseau, ni quota.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { TestContext } from "node:test";
import { avecRail } from "../../src/alimenter.ts";
import type { Session } from "../../src/claude.ts";
import { ouvrirDepot, type Depot } from "../../src/depot.ts";
import type { Plafonds } from "../../src/evenements/garde-fous.ts";
import type { Check } from "../../src/evenements/pass.ts";
import { brancherGardeFous, type Reglages } from "../../src/garde-fous.ts";
import { brancherManager } from "../../src/manager.ts";
import type { Commentaire, GitHub, Issue, PR } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { brancherPass, type ConfigPass } from "../../src/pass.ts";
import { demarrer } from "../../src/runtime.ts";
import { brancherStation } from "../../src/station.ts";
import { BASE, DEPOT, depotGit, ENV_GIT, FAUX_CLAUDE, repertoireTemporaire } from "../outils.ts";

const FAUSSES_GATES = join(import.meta.dirname, "fausses-gates.sh");
const FAUX_SETUP = join(import.meta.dirname, "faux-setup.sh");

export type ScenarioSetup = "exporte" | "jeton" | "attend" | "echec" | "lent";

export const PLAFONDS: Plafonds = { turns: 1000, durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 };
export const REGLAGES: Reglages = { plafonds: PLAFONDS, seuilDisjoncteur: 3, graceMs: 2000 };
export const BAIL_MS = 600_000;
export const CALIBRE = ["fire", "model:sonnet", "effort:low"];

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
  const pannes = { commentaire: false, pr: false, lecture: false, label: false };
  // Ce que le manager lit d'une issue en plus de ce que le rail en lit, et ce
  // qu'il y pose.
  const corps = new Map<number, { body?: string; association?: string }>();
  const labellisations: Array<[number, string[]]> = [];
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
  const mergerPR = (numero: number) => {
    for (const pr of ouvertes.values()) if (pr.number === numero) Object.assign(pr, { merged: true, state: "closed" });
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
    issue: async (numero) => etat.get(numero) ?? null,
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
    async ouvrirPR(pr) {
      if (pannes.pr) throw new Error("gh api : HTTP 422");
      prs.push(pr);
      const number = 100 + prs.length;
      const url = `https://github.com/${DEPOT}/pull/${number}`;
      ouvertes.set(pr.branche, { number, url, base: pr.base, sha: `tete-de-${pr.branche}`, state: "open", merged: false, mergeable: true });
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
      mergerPR(numero);
      if (merge.mode === "panne-apres-merge") throw new Error("gh api : délai dépassé");
      return { fait: true };
    },
    async fermerIssue(numero) {
      fermetures.push(numero);
      const connue = etat.get(numero);
      if (connue) etat.set(numero, { ...connue, state: "closed" });
    },
    fermer: () => {},
  };
  return { github, commentaires, prs, pannes, ouvertes, ci, merge, merges, fermetures, mergerPR, labellisations, sondages,
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
// répertoire, un commit est le fichier que le faux cook y laisse.
// `gates`, `setup` : le worktree porte les gates du projet, son setup — leurs
// doublures, par un lien.
// Sa tête change à chaque fois que le faux cook y réécrit son travail.
export function fauxDepot(racine: string, gates: boolean, setup = false): Depot {
  return {
    async preparer(run) {
      const worktree = join(racine, run);
      mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
      if (gates) symlinkSync(FAUSSES_GATES, join(worktree, ".claude/brigade/gates.sh"));
      if (setup) symlinkSync(FAUX_SETUP, join(worktree, ".claude/brigade/worktree-setup.sh"));
      return { worktree, branche: `cook/${run}` };
    },
    retirer: (worktree) => rmSync(worktree, { recursive: true, force: true }),
    commits: (worktree) => (existsSync(join(worktree, "travail.txt")) ? 1 : 0),
    pousser: () => {},
    tete: (worktree) => `${basename(worktree)}@${existsSync(join(worktree, "travail.txt")) ? statSync(join(worktree, "travail.txt")).mtimeMs : 0}`,
    propre: () => true,
    changes: () => ["travail.txt"],
    // Tout fichier posé à la racine du worktree, avec son poids et sa date.
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
  // Un projet sans gates.
  sansGates?: boolean;
  // Un projet qui a un setup de worktree — la doublure, sur ce scénario.
  setup?: ScenarioSetup;
  // Brancher le manager : le scénario de ses jugements, ou leur suite, et la
  // roadmap du projet s'il en a une.
  manager?: { jugement?: string; suite?: string[]; roadmap?: number };
};

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
  const temoin = join(repertoire, "temoin.jsonl");
  const suite = join(repertoire, "suite.txt");
  if (options.suite) writeFileSync(suite, options.suite.join("\n"));
  const bailMs = options.bailMs ?? BAIL_MS;
  const worktrees = join(repertoire, "worktrees");
  const depot = options.git ? ouvrirDepot({ clone, base: BASE, worktrees, env: ENV_GIT }) : fauxDepot(worktrees, !options.sansGates, options.setup !== undefined);
  const depotDuTest = options.depot?.(depot) ?? depot;
  // Le scénario des fausses gates, que le test change à la main.
  const fichierGates = join(repertoire, "gates.txt");
  const fichierSetup = join(repertoire, "setup.txt");
  if (options.setup) writeFileSync(fichierSetup, options.setup);
  const env = {
    ...ENV_GIT,
    BRIGADE_STATE_DIR: repertoire,
    FAUX_CLAUDE: options.scenario ?? "livre",
    FAUX_CLAUDE_SUITE: suite,
    FAUX_CLAUDE_TEMOIN: temoin,
    FAUSSES_GATES: fichierGates,
    FAUX_SETUP: fichierSetup,
  };

  const socle = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: heure.maintenant });
  const garde = brancherGardeFous(
    { ...REGLAGES, plafonds: { ...PLAFONDS, ...options.plafonds }, seuilDisjoncteur: options.seuilDisjoncteur ?? 3 },
    avecRail(socle, { depot: DEPOT, dureeBailMs: bailMs, gh: "", github: gh.github, maintenant: heure.maintenant }),
  );
  const jugee = options.pass
    ? brancherPass(garde, {
        repertoireEtat: repertoire,
        depot: depotDuTest,
        github: gh.github,
        base: BASE,
        env,
        delaiGatesMs: 10_000,
        attenteCiMs: 1_800_000,
        ...(options.pass === true ? {} : options.pass),
        maintenant: heure.maintenant,
        avertir: (message) => void avertissements.push(message),
      })
    : null;
  const suiteDuJuge = join(repertoire, "suite-juge.txt");
  if (options.manager?.suite) writeFileSync(suiteDuJuge, options.manager.suite.join("\n"));
  const servie = brancherStation(jugee ?? garde, {
    repertoireEtat: repertoire,
    depot: depotDuTest,
    github: gh.github,
    depotGitHub: DEPOT,
    base: BASE,
    bin: FAUX_CLAUDE,
    env,
    session: async () => options.session ?? "connectee",
    dureeBailMs: bailMs,
    maintenant: heure.maintenant,
    avertir: (message) => void avertissements.push(message),
    apresCook: jugee?.reveillerPass,
  });
  const runtime = options.manager
    ? brancherManager(servie, {
        calibrage: { model: "sonnet", effort: "medium" },
        roadmap: options.manager.roadmap ?? null,
        github: gh.github,
        depotGitHub: DEPOT,
        repertoireEtat: repertoire,
        bin: FAUX_CLAUDE,
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
  // Les lancements du faux `claude`. Une ligne en cours d'écriture n'en est pas
  // encore un.
  const lancements = () => {
    if (!existsSync(temoin)) return [];
    const lignes = readFileSync(temoin, "utf8").split("\n").slice(0, -1);
    return lignes.map((ligne) => JSON.parse(ligne)) as Array<{ args: string[]; cwd: string; env: Record<string, string> }>;
  };
  const gates = {
    regler: (scenario: "vert" | "rouge" | "lent") => writeFileSync(fichierGates, scenario),
    // Les worktrees sur lesquels les gates ont été jouées, dans l'ordre.
    appels: () => (existsSync(`${fichierGates}.appels`) ? readFileSync(`${fichierGates}.appels`, "utf8").trimEnd().split("\n") : []),
  };
  const setup = {
    regler: (scenario: ScenarioSetup) => writeFileSync(fichierSetup, scenario),
    // Laisse finir un setup « attend ».
    liberer: () => writeFileSync(`${fichierSetup}.go`, ""),
    // Les appels du setup — « <ticket> <worktree> » —, dans l'ordre.
    appels: () => (existsSync(`${fichierSetup}.appels`) ? readFileSync(`${fichierSetup}.appels`, "utf8").trimEnd().split("\n") : []),
  };
  return { runtime, journal, lieux, repertoire, origine, clone, gh, heure, types, dernier, etat, lancements, avertissements, gates, setup };
}

// Ce que ferait la CLI depuis son propre process : une autre connexion.
export function chef(
  repertoire: string,
  type: "kitchen.stopped" | "kitchen.resumed" | "grant.activated" | "grant.revoked" | "manager.enabled" | "manager.disabled",
) {
  const journal = ouvrirJournal(repertoire);
  if (type !== "grant.activated" && type !== "grant.revoked") journal.ajouter({ project: "brigade", ticket: null, author: "chef", type, payload: {} });
  else journal.ajouter({ project: "brigade", ticket: null, author: "chef", type, payload: { action: "merge" } });
  journal.fermer();
}
