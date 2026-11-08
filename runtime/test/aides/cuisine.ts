// La cuisine des tests : le runtime d'un projet — garde-fous, et le manager si
// le test le demande — sur un dépôt (vrai ou faux), un faux `claude` et un
// GitHub de test. Ni réseau, ni quota.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { ouvrirDepot, type Depot } from "../../src/depot.ts";
import { ecrireSecret } from "../../src/droits.ts";
import type { Plafonds } from "../../src/events/guardrails.ts";
import type { Check } from "../../src/events/pass.ts";
import type { BacASableLocal } from "../../src/bac-a-sable/local.ts";
import { configCloison } from "../../src/cloison.ts";
import { poserDecision, suivreDecisions, type ReglagesSuivis } from "../../src/decisions.ts";
import { brancherGardeFous, type Reglages } from "../../src/garde-fous.ts";
import { brancherManager } from "../../src/manager.ts";
import type { Humain } from "../../src/aiguillage-humains/aiguillage.ts";
import type { Commentaire, GitHub, Issue, PR } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { PLAFOND_PAR_DEFAUT, type Plafond } from "../../src/reagir.ts";
import { demarrer } from "../../src/runtime.ts";
import { ecrireStation, type StationDeclaree } from "../../src/stations-declarees.ts";
import { aArreter as finDuTest, BASE, DEPOT, depotGit, ecrireSuite, ENV_GIT, FAUX_BWRAP, FAUX_CLAUDE, jusqua, lancementsDuFauxBwrap, lancementsDuFauxClaude, poserJournalVide, repertoireTemporaire, tuerLesRelais } from "../outils.ts";

const FAUSSES_GATES = join(import.meta.dirname, "fausses-gates.sh");
const FAUX_SETUP = join(import.meta.dirname, "faux-setup.sh");

export type ScenarioSetup = "exporte" | "jeton" | "attend" | "echec" | "autre" | "refuse" | "lent" | "derive" | "manque" | "postgres";

// Le cook « bavard » rend un tour toutes les deux millisecondes, de vraie
// horloge : un plafond de jetons qu'il atteindrait pendant un test ferait
// course avec ce que le test attend. Les jetons (dix par tour) ne sont
// donc atteints qu'après 200 s — plus que les deux minutes laissées à un
// test. Celui qui éprouve un plafond règle le sien.
export const PLAFONDS: Plafonds = { durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 };
export const REGLAGES: Reglages = { plafonds: PLAFONDS, seuilDisjoncteur: 3, graceMs: 2000 };
export const BAIL_MS = 600_000;
export const CALIBRE = ["fire", "model:sonnet", "effort:low"];
// La station que le projet des tests déclare, quand un test n'en dit rien.
export const STATION = "box/claude";
export const CALIBRAGE_DU_REVIEWER = { model: "haiku", effort: "medium" };
export const CALIBRAGE_DU_MANAGER = { model: "sonnet", effort: "medium" };

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
  const pannes = { commentaire: false, pr: false, lecture: false, label: false, creation: false, creationsMax: Infinity, apresCreation: false, corps: false, apresRetrait: false, relance: false };
  // Les issues nées par l'API, et les corps réécrits.
  const creations: number[] = [];
  const ecritures: Array<[number, string]> = [];
  // Ce que le manager lit d'une issue en plus de ce que le rail en lit, et ce
  // qu'il y pose.
  const corps = new Map<number, { body?: string; association?: string }>();
  // Les labels qu'un membre avec l'écriture a posés, par issue.
  const garants = new Map<number, string[]>();
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
  // `base` : ce que la CI a dit des derniers commits de la base. Sans rien dit,
  // la base est verte sur chaque job de la livraison.
  const ci: { checks: Check[]; base: Check[] | null } = { checks: [], base: null };
  // Le diff de chaque PR, et le journal de chaque check, tels que GitHub les rend.
  const diffs = new Map<number, string>();
  const journauxDeCI = new Map<string, string>();
  // Les runs de GitHub Actions dont la pass a relancé les jobs en échec.
  const relances: number[] = [];
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
  const fermeesParUnMerge = new Map<number, PR>();
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
      if (connue) return { ...connue, body: corps.get(numero)?.body ?? "" };
      // Une PR, que l'API des issues rend comme une issue.
      const pr = prs[numero - 101];
      return pr ? { ...issue(numero, [], { title: pr.titre, pr: true }), body: pr.corps } : null;
    },
    commentaires: async (numero) => poses.get(numero) ?? [],
    async commenter(numero, corps) {
      if (pannes.commentaire) throw new Error("gh api : HTTP 502");
      commentaires.push([numero, corps]);
      // Sur GitHub, un commentaire s'ajoute à l'issue : il se relit, et la modifie.
      toucher(numero);
      poses.set(numero, [...(poses.get(numero) ?? []), { body: corps, author: "brigade", association: "OWNER", createdAt: etat.get(numero)?.updatedAt ?? "2026-10-08T09:30:00Z" }]);
    },
    async labelliser(numero, labels) {
      if (pannes.label) throw new Error("gh api : HTTP 502");
      labellisations.push([numero, labels]);
      const connue = etat.get(numero);
      if (connue) etat.set(numero, { ...connue, labels: [...new Set([...connue.labels, ...labels])] });
      toucher(numero);
    },
    retraitsDeFire: async () => [],
    labelsPosesParDeConfiance: async (numero) => garants.get(numero) ?? [],
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
      ouvertes.set(pr.branche, { number, url, base: pr.base, sha: `tete-de-${pr.branche}`, state: "open", merged: false, enRetard: false, mergeePar: null });
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
    async ciDeLaBase() {
      return ci.base ?? ci.checks.map((check): Check => ({ ...check, outcome: "green", conclusion: "success" }));
    },
    diff: async (numero) => diffs.get(numero) ?? "",
    journalDuCheck: async (check) => journauxDeCI.get(check.name) ?? null,
    etatDuRun: async () => ({ tentative: 1, termine: true }),
    async relancerLesEchecs(run) {
      if (pannes.relance) throw new Error(`gh api repos/${DEPOT}/actions/runs/${run}/rerun-failed-jobs : HTTP 403`);
      relances.push(run);
    },
    async remplacerCommentaire(numero, ancien, nouveau) {
      const lus = poses.get(numero) ?? [];
      const rang = lus.findIndex((commentaire) => commentaire.body === ancien);
      if (rang === -1) return false;
      poses.set(numero, lus.map((commentaire, i) => (i === rang ? { ...commentaire, body: nouveau } : commentaire)));
      toucher(numero);
      return true;
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
    // Les issues qu'un merge a fermées (`Closes`), et la PR qui l'a fait.
    async prQuiFerme(numero) {
      return fermeesParUnMerge.get(numero) ?? null;
    },
    identite: async () => comptes.pass,
    fermer: () => {},
  };
  return { github, comptes, commentaires, prs, pannes, ouvertes, ci, diffs, journauxDeCI, relances, merge, merges, fermetures, mergerPR, fermeesParUnMerge, labellisations, delabellisations, sondages, creations, ecritures,
    // Le corps d'une issue, tel que GitHub le rend.
    corpsDe: (numero: number) => corps.get(numero)?.body ?? "",
    poser: (i: Issue) => void etat.set(i.number, i),
    lire: (numero: number) => etat.get(numero),
    // Le corps d'une issue, et le lien de son auteur avec le dépôt.
    garantir: (numero: number, labels: string[]) => void garants.set(numero, labels),
    decrire: (numero: number, description: { body?: string; association?: string }) => void corps.set(numero, description),
    // Ce que le chef écrit sous une issue.
    // `author` : un autre compte que le chef — un humain déclaré du projet.
    repondre: (numero: number, body: string, association = "OWNER", author = "chef") =>
      void poses.set(numero, [...(poses.get(numero) ?? []), { body, author, association, createdAt: "2026-10-08T09:30:00Z" }]),
    // Remplace les commentaires d'une issue par ceux-ci — ce qui, sur GitHub, la modifie.
    ficher(numero: number, updatedAt: string, ...corps: string[]) {
      poses.set(numero, corps.map((body) => ({ body, author: "chef", association: "OWNER", createdAt: updatedAt })));
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
    // Sans git, pas d'origine : rien ne la refuse.
    acces: async () => ({ etat: "libre" }),
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
    // Ce qu'une station distante a poussé sur l'origine : un fichier que le
    // test y pose (`pousserSurLOrigine`). La branche devient ce qu'il porte.
    async recevoir(nom) {
      const poussee = fichierDeLOrigine(racine, nom);
      if (!existsSync(poussee)) {
        if (!vivants.has(nom) && !rangees.has(nom)) rangees.set(nom, { commits: 0, date: 0, recoltes: [] });
        return false;
      }
      rangees.set(nom, { commits: 1, date: statSync(poussee).mtimeMs, recoltes: [], poussee: true });
      return true;
    },
    // Sans git, pas de fork à rapatrier (#2933).
    async recevoirPR(_run, numero) {
      throw new Error(`no outside PR #${numero} in a clone without git`);
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
    // Le faux dépôt ne détourne aucun worktree : rien ne s'y abandonne.
    async abandonner(worktree) {
      throw new Error(`« ${worktree} » : le faux dépôt n'abandonne rien`);
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
    comptes: () => [{ fichier: "travail.txt", ajoutees: 1, retirees: 0 }],
    diff: () => "+le travail du cook",
    ajouts: () => "le travail du cook\n+le travail du cook",
    revenir: () => {},
    recoltes: (nom) => branche(nom).recoltes,
    liste: (_nom, repertoire) => (repertoire === ".claude/brigade" ? [...(gates ? ["gates.sh"] : []), ...(setup ? ["worktree-setup.sh"] : [])] : []),
    lire: () => null,
    // Tout fichier posé à la racine du worktree, avec son poids et sa date.
    fichiers: () => ["README.md", "runtime/src/rail.ts", "runtime/src/pass.ts", "runtime/test/rail.test.ts", "docs/runtime.md"],
    // Une base qui ne bouge pas, tant que le test n'en décide pas autrement.
    rapatrier: async () => "base-0",
    vue: () => "base-0",
    avance: () => 0,
    // Un worktree jetable porte ce que porte tout worktree du projet.
    essayer: async (nom) => equiper(join(racine, ".essais", nom)),
    // La fusion d'un commit livré avec une tête de la base : son arbre ne
    // change que si l'un des deux change.
    fusionner: async (nom, tete, sha) => ({ worktree: equiper(join(racine, ".essais", nom)), arbre: `arbre(${tete}+${sha})` }),
    jeter: (nom) => rmSync(join(racine, ".essais", nom ?? ""), { recursive: true, force: true }),
    // Sans git, aucune livraison ne naît avant un renommage : il n'y a rien à
    // porter sur son arbre.
    transposer: async () => ({ issue: "deja" }),
    empreinte: (worktree) =>
      readdirSync(worktree)
        .filter((nom) => nom !== ".claude")
        .map((nom) => [nom, statSync(join(worktree, nom)).size, statSync(join(worktree, nom)).mtimeMs].join(":"))
        .join("|"),
  };
}

// Où le faux dépôt lit ce que l'origine porte d'une branche qu'il n'a pas faite.
const fichierDeLOrigine = (racine: string, branche: string) => join(`${racine}.origine`, branche.replaceAll("/", "__"));

// Ce que fait une station distante quand son cook a fini : elle pousse sa
// branche sur l'origine. `repertoire` : l'état du runtime des tests.
export function pousserSurLOrigine(repertoire: string, branche: string): void {
  const fichier = fichierDeLOrigine(join(repertoire, "worktrees"), branche);
  mkdirSync(join(fichier, ".."), { recursive: true });
  writeFileSync(fichier, "le travail du cook\n");
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
  // Les lieux d'une vie précédente, pour redémarrer dessus.
  lieux?: Lieux;
  // Ce que l'environnement des lancements porte en plus.
  env?: Record<string, string>;
  // Un vrai dépôt git local plutôt que le faux.
  git?: boolean;
  issues?: Issue[];
  seuilDisjoncteur?: number;
  plafonds?: Partial<Plafonds>;
  depot?: (depot: Depot) => Depot;
  // Brancher le manager : le scénario de ses jugements, ou leur suite, et la
  // roadmap du projet s'il en a une.
  // `plafond` : jusqu'où une montée de calibrage peut aller — celui d'un projet
  // où le chef ne l'a pas posé, par défaut.
  // `station` : le nom sous lequel il prend son travail sur GitHub (#2568) ;
  // sans lui, il se croit seul.
  // `surLeRail` : appelé quand le manager rend un ticket prenable (#2796).
  manager?: { jugement?: string; suite?: string[]; roadmap?: number; plafond?: Partial<Plafond>; station?: string; surLeRail?: () => void; humains?: () => Humain[] };
  // Les stations que le projet déclare. Par défaut, une seule : `box/claude`.
  stations?: StationDeclaree[];
  // Chaque lancement part dans une cloison — la doublure de `bwrap`.
  cloison?: boolean;
  // Le bac à sable d'une cuisine locale, sur le Mac du chef : chaque `claude`
  // du manager y part.
  bacASable?: BacASableLocal;
  // Le nom du projet (« brigade » par défaut).
  projet?: string;
  // Les décisions du chef sont relues au journal : stations, calibrage du
  // reviewer et du manager — celles du test, tant qu'il n'en pose pas d'autres.
  decisions?: boolean;
  // Les réglages que le dépôt du projet porte, relus par-dessus ces décisions
  // (`reglages-projet/en-vigueur.ts`).
  reglagesDuDepot?: ReglagesSuivis;
};

// Le runtime d'un projet sans station : les garde-fous, et le manager si le
// test le demande. Les tickets se prennent, se cuisinent et se mergent sur
// GitHub (`brigade-github.ts`), que d'autres tests éprouvent (#2061).
export function cuisine(t: TestContext, options: Options = {}) {
  // Arrêté avant que ses répertoires ne soient retirés, même ceux que le test a
  // créés avant la cuisine : sous Windows, un journal encore ouvert empêche de
  // retirer le sien.
  let aArreter: { arreter(signal: string): void } | undefined;
  finDuTest(t, () => aArreter?.arreter("test"));
  const lieux: Lieux = options.lieux ?? {
    repertoire: repertoireTemporaire(t),
    ...(options.git ? depotGit(t) : { origine: "", clone: "" }),
    gh: fauxGitHub(...(options.issues ?? [])),
    heure: montre(),
  };
  const { repertoire, origine, clone, gh, heure } = lieux;
  // Les jugements survivent au runtime : la fin du test les tue, après lui.
  finDuTest(t, () => tuerLesRelais(repertoire));
  // Ce que le runtime aurait imprimé pour journald.
  const avertissements: string[] = [];
  const temoin = join(repertoire, "temoin");
  mkdirSync(temoin, { recursive: true });
  const worktrees = join(repertoire, "worktrees");
  const depot = options.git ? ouvrirDepot({ clone, base: BASE, worktrees, env: { ...ENV_GIT, ...options.env } }) : fauxDepot(worktrees, true);
  const depotDuTest = options.depot?.(depot) ?? depot;
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
    FAUX_CLAUDE_TEMOIN: temoin,
    ...options.env,
  };

  // Un répertoire neuf reçoit le journal vide que le fichier a fabriqué une
  // fois : poser tout le schéma coûte plus que l'ouvrir, à chaque cuisine.
  if (options.lieux === undefined) poserJournalVide(repertoire);
  const socle = demarrer({ repertoireEtat: repertoire, projet: options.projet ?? "brigade", intervalleVeilleMs: 20, intervalleTickMs: 100, maintenant: heure.maintenant });
  const stations = options.stations ?? [{ nom: STATION, moteur: "claude", fournit: ["code"], cooks: 1 }];
  // Les décisions du chef, posées au journal : leur seul support.
  const decisions = options.decisions
    ? (() => {
        const posees: Record<string, string> = {
          BRIGADE_STATIONS: stations.map(ecrireStation).join(","),
          BRIGADE_MANAGER_MODEL: CALIBRAGE_DU_MANAGER.model,
          BRIGADE_MANAGER_EFFORT: CALIBRAGE_DU_MANAGER.effort,
          BRIGADE_REVIEWER_MODEL: CALIBRAGE_DU_REVIEWER.model,
          BRIGADE_REVIEWER_EFFORT: CALIBRAGE_DU_REVIEWER.effort,
        };
        for (const [nom, valeur] of Object.entries(posees)) if (valeur !== "") poserDecision(socle.journal, { projet: options.projet ?? "brigade", nom, valeur, auteur: "chef" });
        return suivreDecisions(socle.journal.base, {}, (message) => void avertissements.push(message), options.reglagesDuDepot);
      })()
    : undefined;
  const garde = brancherGardeFous({ ...REGLAGES, plafonds: { ...PLAFONDS, ...options.plafonds }, seuilDisjoncteur: options.seuilDisjoncteur ?? 3 }, socle);
  const suiteDuJuge = join(repertoire, "suite-juge.txt");
  if (options.manager?.suite) ecrireSuite(suiteDuJuge, options.manager.suite);
  const runtime = options.manager
    ? brancherManager(garde, {
        calibrage: CALIBRAGE_DU_MANAGER,
        decisions,
        roadmap: options.manager.roadmap ?? null,
        plafond: { ...PLAFOND_PAR_DEFAUT, ...options.manager.plafond },
        github: gh.github,
        depotGitHub: DEPOT,
        repertoireEtat: repertoire,
        bin: FAUX_CLAUDE,
        fichiers: depotDuTest.fichiers,
        cloison,
        bacASable: options.bacASable,
        // Les jugements ont leur scénario.
        env: { ...env, FAUX_CLAUDE: options.manager.jugement ?? "juge-ticket", FAUX_CLAUDE_SUITE: suiteDuJuge },
        maintenant: heure.maintenant,
        avertir: (message) => void avertissements.push(message),
        station: options.manager.station ?? null,
        ...(options.manager.surLeRail === undefined ? {} : { surLeRail: options.manager.surLeRail }),
        ...(options.manager.humains === undefined ? {} : { humains: options.manager.humains }),
      })
    : garde;
  aArreter = runtime;

  const { journal } = runtime;
  const types = (ticket?: number) => (ticket === undefined ? journal.tout() : journal.duTicket(ticket)).map((e) => e.type);
  const dernier = (type: string, ticket?: number) =>
    (ticket === undefined ? journal.tout() : journal.duTicket(ticket)).findLast((e) => e.type === type)?.payload as Record<string, unknown> | undefined;
  // Les lancements du faux `claude` : les jugements et les triages du manager.
  const lancements = () => lancementsDuFauxClaude(temoin);
  // Ce que chaque lancement cloisonné a demandé à `bwrap`.
  const cloisonnes = () => lancementsDuFauxBwrap(temoinDeCloison);
  // Les réveils du runtime, comptés après ceux du manager et de la garde, branchés avant : quand `reveils` passe,
  // chacun a déjà fait la part synchrone de son tour. Attendre `n` réveils de plus, c'est attendre un fait — que
  // la cuisine ait eu ses tours —, pas une durée (#2464).
  let reveils = 0;
  runtime.surReveil(() => void reveils++);
  const laisserReveiller = async (n = 2) => {
    const depart = reveils;
    await jusqua(() => reveils >= depart + n);
  };
  return { cloisonnes, compte, runtime, journal, lieux, repertoire, origine, clone, gh, heure, types, dernier, lancements, avertissements, laisserReveiller };
}

// Ce que ferait la CLI depuis son propre process : une autre connexion.
export function chef(
  repertoire: string,
  type: "kitchen.stopped" | "kitchen.resumed" | "manager.enabled" | "manager.disabled" | "base.recheck-requested",
) {
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: "brigade", ticket: null, author: "chef", type, payload: {} });
  journal.fermer();
}

// Le chef règle le plafond de cooks, depuis son propre process.
export function plafonner(repertoire: string, maxCooks: number, station = STATION) {
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "station.capped", payload: { station, maxCooks } });
  journal.fermer();
}

// Le chef pose une décision, depuis son propre process.
export function decider(repertoire: string, nom: string, valeur: string) {
  const journal = ouvrirJournal(repertoire);
  try {
    return poserDecision(journal, { projet: "brigade", nom, valeur, auteur: "chef" });
  } finally {
    journal.fermer();
  }
}

// La pass vient de jouer les gates sur la base : ce qu'un autre process en lirait.
export function controlerBase(repertoire: string, outcome: "green" | "red" | "skipped", sha = "ba5e0001ffff") {
  const journal = ouvrirJournal(repertoire);
  const gates = { outcome, code: outcome === "red" ? 1 : outcome === "green" ? 0 : null, failures: [], tail: "" };
  journal.ajouter({ project: "brigade", ticket: null, author: "pass", type: "base.checked", payload: { sha, outcome, gates, tickets: [] } });
  journal.fermer();
}
