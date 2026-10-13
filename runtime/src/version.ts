// La version en attente. Le runtime compare la version qu'il sert à la branche
// que le clone de brigade suit, lue **sur son origine** : le clone n'avance que
// lorsqu'on le met à jour, et une version comparée à lui se dit à jour pendant
// que la branche prend une journée d'avance. « À jour » veut dire à jour avec
// l'origine — ce que le geste de mise en service (`brigade-mise-en-service`)
// poserait à cet instant.
//
// Ce qui se compare est ce que `installation` compare déjà : `runtime/src`, le
// seul code que `node` exécute. Ici c'est git qui en tient l'empreinte — l'arbre
// de ce répertoire au commit servi, et à la tête de la branche. Une livraison
// qui n'y touche pas n'en fait attendre aucune.
//
// Le clone est à root : rien n'y est écrit. La branche de l'origine est
// rapatriée dans un dépôt nu à ce runtime, sous son répertoire d'état. Quand la
// comparaison ne peut pas se faire — origine muette, clone illisible, version
// hors de l'histoire de la branche —, c'est ce qui est écrit : jamais « à
// jour » par défaut.
import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { SOURCES } from "./code.ts";
import { CADENCE_DE_COMPARAISON_MS, type Comparaison } from "./evenements/version.ts";
import type { Runtime } from "./runtime.ts";

const AUTEUR = "runtime";
// Passé ce délai, un `git` qui n'a pas répondu est lâché : une origine muette
// se dit, elle ne retient pas la comparaison suivante.
const DELAI_MS = 120_000;
// Le dépôt nu du runtime, sous son répertoire d'état, et la branche où il
// tient ce que l'origine porte.
const DEPOT = "version.git";
const ORIGINE = "refs/heads/origine";
// Ce que `node` exécute, dans le dépôt de brigade.
const CODE = "runtime/src";
const SUFFIXE_DES_VERSIONS = "-versions";
// Ce que la bascule laisse à côté des versions d'un projet.
export const COMPTE_RENDU = "bascule";
const MOTIF_MAX = 300;

// La version posée par la bascule sur laquelle ces sources tournent : son
// commit, le clone d'où elle vient, et là où sont rangées les versions de son
// projet — `<clone>-versions/<projet>/<commit>/runtime/src`
// (`deploy/brigade-bascule`). Nulle ailleurs : sur le poste de
// dev, ou sur une box pas encore basculée, aucune version n'est en service à
// part du clone, et rien n'est comparé.
export function versionPosee(sources = SOURCES): { clone: string; commit: string; versions: string } | null {
  let reelles: string;
  try {
    reelles = realpathSync(sources);
  } catch {
    return null;
  }
  const version = dirname(dirname(reelles));
  // Là où la bascule range les versions de tous les projets : `<clone>-versions`.
  const rangees = dirname(dirname(version));
  const commit = basename(version);
  if (join(version, CODE) !== reelles || !/^[0-9a-f]{40,64}$/.test(commit) || !rangees.endsWith(SUFFIXE_DES_VERSIONS)) return null;
  return { clone: rangees.slice(0, -SUFFIXE_DES_VERSIONS.length), commit, versions: dirname(version) };
}

// Le compte rendu que la dernière bascule a laissé à côté des versions d'un
// projet (`<versions>/bascule`) : des lignes `clé=valeur`. Vide s'il ne se lit
// pas.
export function lireCompteRendu(versions: string): Record<string, string> {
  try {
    return Object.fromEntries(readFileSync(join(versions, COMPTE_RENDU), "utf8").split("\n").filter(Boolean).map((ligne) => [ligne.split("=", 1)[0] ?? "", ligne.slice(ligne.indexOf("=") + 1)]));
  } catch {
    return {};
  }
}

const court = (commit: string) => commit.slice(0, 12);

type Rendu = { ok: boolean; sortie: string; motif: string };

// Ce que `git` a dit de son échec, sur une ligne, sans ce qu'une adresse
// porterait pour s'authentifier.
const motifDe = (erreur: { killed?: boolean; message?: string }, stderr: string): string => {
  if (erreur.killed) return `\`git\` n'a pas répondu en ${DELAI_MS / 1000} s`;
  const lignes = stderr.split("\n").map((ligne) => ligne.trim()).filter(Boolean);
  // Ce que `git` conseille après avoir dit ce qui manque n'est pas un motif.
  const conseil = lignes.findIndex((ligne) => ligne.startsWith("Please make sure"));
  const dit = lignes.slice(0, conseil === -1 ? undefined : conseil).join(" ; ") || erreur.message || "échec";
  return dit.replace(/\/\/[^/@\s]+@/g, "//").slice(0, MOTIF_MAX);
};

// Compare la version posée à la branche que son clone suit, sur l'origine. Ne
// lève pas : ce qui empêche de comparer est une réponse. `signal` : l'arrêt du
// runtime, qui lâche le `git` en cours.
export async function comparerVersion(posee: { clone: string; commit: string }, repertoireEtat: string, options: { env?: NodeJS.ProcessEnv; signal?: AbortSignal } = {}): Promise<Comparaison> {
  const { clone, commit: served } = posee;
  // Jamais de question, et des mots qui ne dépendent pas de la langue du compte.
  const env = { ...(options.env ?? process.env), GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" };
  const git = (...args: string[]) =>
    new Promise<Rendu>((resoudre) => {
      execFile("git", args, { env, timeout: DELAI_MS, signal: options.signal, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (erreur, stdout, stderr) =>
        resoudre(erreur === null ? { ok: true, sortie: stdout.trim(), motif: "" } : { ok: false, sortie: stdout.trim(), motif: motifDe(erreur, stderr) }),
      );
    });
  // Le clone est à root, ce runtime ne l'est pas : `git` ne le lit que si on le
  // lui désigne. Rien n'y est écrit.
  const duClone = (...args: string[]) => git("-c", `safe.directory=${clone}`, "-C", clone, ...args);
  const illisible = (reason: string, branch: string | null = null): Comparaison => ({ outcome: "unreadable", served, branch, reason });

  // Ce que `git pull` rapatrierait dans le clone : la branche qu'il suit.
  const tete = await duClone("symbolic-ref", "--quiet", "HEAD");
  if (!tete.ok) return illisible(`le clone de brigade (${clone}) ne dit pas sur quelle branche il est — ${tete.motif || "il n'est sur aucune"}`);
  const suivie = await duClone("for-each-ref", "--format=%(upstream:remotename)%09%(upstream:remoteref)%09%(upstream:short)", tete.sortie);
  const [distant = "", reference = "", branch = ""] = suivie.sortie.split("\t");
  if (!suivie.ok || distant === "" || reference === "" || branch === "") {
    return illisible(`le clone de brigade (${clone}) ne suit aucune branche d'une origine${suivie.ok ? "" : ` — ${suivie.motif}`}`);
  }
  const adresse = await duClone("remote", "get-url", distant);
  if (!adresse.ok || adresse.sortie === "") return illisible(`le clone de brigade (${clone}) ne donne pas l'adresse de \`${distant}\` — ${adresse.motif || "elle est vide"}`, branch);

  const depot = join(repertoireEtat, DEPOT);
  const duDepot = (...args: string[]) => git(`--git-dir=${depot}`, ...args);
  if (!existsSync(join(depot, "HEAD"))) {
    const cree = await git("init", "--quiet", "--bare", depot);
    if (!cree.ok) return illisible(`le dépôt où lire l'origine (${depot}) n'a pas pu être créé — ${cree.motif}`, branch);
  }
  const rapatriee = await duDepot("-c", "http.lowSpeedLimit=1", "-c", "http.lowSpeedTime=60", "fetch", "--quiet", "--no-tags", "--", adresse.sortie, `+${reference}:${ORIGINE}`);
  if (!rapatriee.ok) return illisible(`l'origine n'a pas rendu ${branch} — ${rapatriee.motif}`, branch);

  const head = await duDepot("rev-parse", "--verify", "--quiet", `${ORIGINE}^{commit}`);
  if (!head.ok) return illisible(`${branch} ne se lit pas une fois rapatriée — ${head.motif || "aucun commit"}`, branch);
  // Une version hors de l'histoire de la branche ne se met pas à jour par elle :
  // posée d'un commit que l'origine n'a pas, ou d'une branche récrite depuis.
  if (!(await duDepot("merge-base", "--is-ancestor", served, head.sortie)).ok) {
    return illisible(`la version en service (${court(served)}) n'est pas dans l'histoire de ${branch} (${court(head.sortie)}) : ce qui les sépare ne se compte pas`, branch);
  }
  const [servi, attendu] = [await duDepot("rev-parse", "--verify", "--quiet", `${served}:${CODE}`), await duDepot("rev-parse", "--verify", "--quiet", `${head.sortie}:${CODE}`)];
  if (!servi.ok || !attendu.ok) return illisible(`\`${CODE}\` ne se lit pas ${servi.ok ? `à la tête de ${branch} (${court(head.sortie)})` : `dans la version en service (${court(served)})`}`, branch);
  if (servi.sortie === attendu.sortie) return { outcome: "current", served, branch };

  // Les livraisons : la ligne principale de la branche — un commit par merge —,
  // réduite à ce qui change le code. La plus ancienne est la dernière rendue.
  const livraisons = await duDepot("rev-list", "--first-parent", "--timestamp", `${served}..${head.sortie}`, "--", CODE);
  if (!livraisons.ok) return illisible(`les livraisons de ${branch} qui ne sont pas en service ne se comptent pas — ${livraisons.motif}`, branch);
  const instants = livraisons.sortie.split("\n").flatMap((ligne) => (ligne === "" ? [] : [Number(ligne.split(" ", 1)[0]) * 1000]));
  const [plusAncienne = Number.NaN] = instants.slice(-1);
  if (!Number.isFinite(plusAncienne)) return illisible(`${branch} (${court(head.sortie)}) porte un \`${CODE}\` qui n'est pas en service, mais aucune livraison de sa ligne principale ne le change depuis ${court(served)}`, branch);
  return { outcome: "waiting", served, branch, head: head.sortie, since: new Date(plusAncienne).toISOString(), deliveries: instants.length };
}

export type OptionsVersion = {
  repertoireEtat: string;
  // Par défaut, l'environnement du runtime.
  env?: NodeJS.ProcessEnv;
  // Par défaut, les sources de ce process.
  sources?: string;
  cadenceMs?: number;
};

// Le suivi d'une version posée : chaque comparaison est écrite au journal si
// sa réponse n'est pas celle que ce runtime a écrite en dernier. `lacher` :
// plus rien ne s'écrit, et le `git` en cours est arrêté.
export function suivreVersion(runtime: Pick<Runtime, "journal" | "projet">, posee: { clone: string; commit: string }, options: Pick<OptionsVersion, "repertoireEtat" | "env">): { comparer(): Promise<void>; lacher(): void } {
  const { journal, projet } = runtime;
  const arret = new AbortController();
  // La projection part vide : le démarrage de ce runtime l'a effacée.
  let ecrite: string | null = null;
  return {
    async comparer() {
      try {
        const payload = await comparerVersion(posee, options.repertoireEtat, { env: options.env, signal: arret.signal });
        if (arret.signal.aborted || JSON.stringify(payload) === ecrite) return;
        journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "version.compared", payload });
        ecrite = JSON.stringify(payload);
      } catch (erreur) {
        // Une comparaison qui ne s'écrit pas n'arrête pas la cuisine : la suivante la reprend.
        if (!arret.signal.aborted) console.error(`brigade : version non comparée — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
    },
    lacher: () => arret.abort(),
  };
}

// Compare d'emblée, puis à la cadence, une à la fois. Sans version posée, ne
// fait rien. Rend le runtime, dont l'arrêt lâche la comparaison en cours.
export function brancherVersion<R extends Runtime>(runtime: R, options: OptionsVersion): R {
  const posee = versionPosee(options.sources);
  if (posee === null) return runtime;
  const cadenceMs = options.cadenceMs ?? CADENCE_DE_COMPARAISON_MS;
  const suivi = suivreVersion(runtime, posee, options);
  let enCours = false;
  let derniere = 0;
  const comparer = () => {
    enCours = true;
    derniere = Date.now();
    void suivi.comparer().finally(() => void (enCours = false));
  };
  comparer();
  runtime.surReveil((cause) => {
    if (cause === "tick" && !enCours && Date.now() - derniere >= cadenceMs) comparer();
  });
  return {
    ...runtime,
    arreter(signal) {
      suivi.lacher();
      runtime.arreter(signal);
    },
  };
}
