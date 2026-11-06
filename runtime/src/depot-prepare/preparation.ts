// Un dépôt est-il prêt pour brigade, et le geste unique qui l'y prépare (#2626).
// Prêt veut dire deux choses : le `CLAUDE.md` du dépôt porte la section
// `## Équipe multi-agents`, d'où les rôles lisent leurs bindings, et le dépôt
// a les labels dont les rôles se servent — `product`, `triage` et les `prio:`.
//
//   checkRepoSetup(repo)   → { ready, missingBindings, missingLabels }
//   runRepoSetup(repo)     fait ce que `/brigade:init` fait de ces deux choses —
//                          crée les labels qui manquent, puis la section —, et
//                          rend un nouveau constat ; ou rejette, en une phrase.
//
// Rejouer `runRepoSetup` sur un dépôt prêt ne change rien : un label présent
// n'est ni recréé ni retouché, une section présente n'est pas réécrite.
//
// L'app y arrive par la commande `installation` (`installation-cli.ts`) :
//   npm --prefix runtime run installation -- repo [--json]          le constat
//   npm --prefix runtime run installation -- repo setup [--json]    le geste, puis le constat
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configRail } from "../alimenter.ts";
import { Sortie, type Appel } from "../appel.ts";
import { clientGh, type ClientGitHub, type ReponseGitHub } from "../proteger-branche.ts";
import { ConfigInvalide } from "../runtime.ts";

// `dir` : le clone dont on lit et écrit le `CLAUDE.md`. `github` : `<owner>/<repo>`.
// `branch` : la branche d'intégration que la section déclare, quand elle la crée.
export type Repo = { dir: string; github: string; branch?: string };
export type RepoSetup = { ready: boolean; missingBindings: boolean; missingLabels: string[] };

// Les labels des rôles, tels que `/brigade:init` les crée (commands/init.md).
export const LABELS_DES_ROLES = [
  { name: "product", color: "0E8A16", description: "Issue née du PO" },
  { name: "triage", color: "FBCA04", description: "À qualifier" },
  { name: "prio:1", color: "000000", description: "À faire en premier" },
  { name: "prio:2", color: "555555", description: "Important, pas bloquant" },
  { name: "prio:3", color: "AAAAAA", description: "Souhaitable, plus tard" },
] as const;

const SECTION = /^## Équipe multi-agents/m;
const TITRE = "## Équipe multi-agents (plugin brigade)";
const USAGE = "usage: <service environment> npm --prefix runtime run installation -- repo [setup] [--json]";

// Ce que GitHub dit, pour une phrase : son statut, et son message s'il en a un.
function dit(reponse: ReponseGitHub): string {
  const corps = reponse.corps;
  const message = corps !== null && typeof corps === "object" && "message" in corps && typeof corps.message === "string" ? corps.message : undefined;
  return `HTTP ${reponse.statut}${message ? `: ${message}` : ""}`;
}

// Le GitHub de `gh`, celui que le runtime appelle (`BRIGADE_GH_BIN`, comme `configRail`).
const ghDe = (env: Record<string, string | undefined>): ClientGitHub => clientGh(env.BRIGADE_GH_BIN || "gh", env as NodeJS.ProcessEnv);

const cheminDuClaudeMd = (repo: Repo) => join(repo.dir, "CLAUDE.md");

function lireClaudeMd(repo: Repo): string | null {
  const chemin = cheminDuClaudeMd(repo);
  if (!existsSync(repo.dir)) throw new Error(`The repository folder ${repo.dir} does not exist.`);
  try {
    return existsSync(chemin) ? readFileSync(chemin, "utf8") : null;
  } catch (erreur) {
    throw new Error(`The file ${chemin} cannot be read (${erreur instanceof Error ? erreur.message : String(erreur)}).`);
  }
}

// GitHub ne distingue pas la casse d'un label : `Product` y est `product`. Un
// label se lit à son nom ; 404 dit qu'il n'y est pas.
async function labelPresent(client: ClientGitHub, depot: string, nom: string): Promise<boolean> {
  let reponse: ReponseGitHub;
  try {
    reponse = await client({ methode: "GET", chemin: `repos/${depot}/labels/${encodeURIComponent(nom)}` });
  } catch (erreur) {
    throw new Error(`GitHub could not be reached to read the label \`${nom}\` on ${depot} (${erreur instanceof Error ? erreur.message : String(erreur)}).`);
  }
  if (reponse.statut === 200) return true;
  if (reponse.statut === 404) return false;
  throw new Error(`GitHub did not let the label \`${nom}\` be read on ${depot} (${dit(reponse)}).`);
}

export async function checkRepoSetup(repo: Repo, client: ClientGitHub = ghDe(process.env)): Promise<RepoSetup> {
  const claudeMd = lireClaudeMd(repo);
  const missingBindings = claudeMd === null || !SECTION.test(claudeMd);
  const missingLabels: string[] = [];
  for (const { name } of LABELS_DES_ROLES) if (!(await labelPresent(client, repo.github, name))) missingLabels.push(name);
  return { ready: !missingBindings && missingLabels.length === 0, missingBindings, missingLabels };
}

// La section que le runtime sait écrire seul : celle que `/brigade:init`
// complète sur une relance, sans en ajouter une seconde — il garde les lignes
// qu'il trouve.
export function sectionDeBindings(branche: string): string {
  return [
    TITRE,
    "",
    `- **Branche d'intégration** : \`${branche}\``,
    "- **Rôles actifs** : to be stated — run `/brigade:init` in this repository to fill in the rest of this section",
    "",
  ].join("\n");
}

async function creerLabel(client: ClientGitHub, depot: string, label: (typeof LABELS_DES_ROLES)[number]): Promise<void> {
  let reponse: ReponseGitHub;
  try {
    reponse = await client({ methode: "POST", chemin: `repos/${depot}/labels`, corps: { ...label } });
  } catch (erreur) {
    throw new Error(`GitHub could not be reached to create the label \`${label.name}\` on ${depot} (${erreur instanceof Error ? erreur.message : String(erreur)}).`);
  }
  // 422 : il existe déjà — créé entre la lecture et ce geste.
  if (reponse.statut !== 201 && reponse.statut !== 422) throw new Error(`GitHub refused to create the label \`${label.name}\` on ${depot} (${dit(reponse)}).`);
}

// Les labels d'abord : un refus de GitHub laisse le `CLAUDE.md` tel quel.
export async function runRepoSetup(repo: Repo, client: ClientGitHub = ghDe(process.env)): Promise<RepoSetup> {
  const avant = await checkRepoSetup(repo, client);
  for (const label of LABELS_DES_ROLES) if (avant.missingLabels.includes(label.name)) await creerLabel(client, repo.github, label);
  if (avant.missingBindings) {
    const existant = lireClaudeMd(repo);
    const section = sectionDeBindings(repo.branch ?? "main");
    const contenu = existant === null || existant.trim() === "" ? section : `${existant.replace(/\n*$/, "")}\n\n${section}`;
    try {
      writeFileSync(cheminDuClaudeMd(repo), contenu);
    } catch (erreur) {
      throw new Error(`The bindings section could not be written to ${cheminDuClaudeMd(repo)} (${erreur instanceof Error ? erreur.message : String(erreur)}).`);
    }
  }
  return checkRepoSetup(repo, client);
}

// La commande, sur un GitHub donné. `principal` la joue sur celui de `gh`.
// `--json` : le constat sur une ligne, `{ ready, missingBindings, missingLabels }`,
// ou `{ error }` quand le geste a été refusé — le contrat avec l'app.
export async function commande({ args, env, dire, redire }: Appel, client: ClientGitHub): Promise<void> {
  const json = args.includes("--json");
  const reste = args.filter((arg) => arg !== "--json");
  const geste = reste.length === 1 && reste[0] === "setup";
  if (reste.length > (geste ? 1 : 0)) {
    redire(`brigade : ${USAGE}`);
    throw new Sortie(2);
  }
  let repo: Repo;
  try {
    const github = configRail(env).depot;
    const dir = env.BRIGADE_REPO_DIR;
    if (!dir) throw new ConfigInvalide("BRIGADE_REPO_DIR is not set");
    repo = { dir, github, ...(env.BRIGADE_BASE_BRANCH ? { branch: env.BRIGADE_BASE_BRANCH } : {}) };
  } catch (erreur) {
    if (!(erreur instanceof ConfigInvalide)) throw erreur;
    redire(`brigade : ${erreur.message}\n${USAGE}`);
    throw new Sortie(2);
  }
  let constat: RepoSetup;
  try {
    constat = geste ? await runRepoSetup(repo, client) : await checkRepoSetup(repo, client);
  } catch (erreur) {
    const raison = erreur instanceof Error ? erreur.message : String(erreur);
    if (json) dire(JSON.stringify({ error: raison }));
    else redire(`brigade : ${raison}`);
    throw new Sortie(1);
  }
  if (json) dire(JSON.stringify(constat));
  else if (constat.ready) dire(`brigade : ${repo.github} is set up for brigade — the bindings section and the roles' labels are there`);
  else {
    const manques = [...(constat.missingBindings ? ["the `## Équipe multi-agents` section of CLAUDE.md"] : []), ...(constat.missingLabels.length > 0 ? [`the label${constat.missingLabels.length > 1 ? "s" : ""} ${constat.missingLabels.join(", ")}`] : [])];
    dire(`brigade : ${repo.github} is not set up for brigade — missing: ${manques.join("; ")} — to set it up: \`installation repo setup\``);
  }
  if (!constat.ready) throw new Sortie(1);
}

export function principal(appel: Appel): Promise<void> {
  return commande(appel, ghDe(appel.env));
}
