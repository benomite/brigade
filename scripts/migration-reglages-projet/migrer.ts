// Migre les réglages de projet que la box tient vers le dépôt de chaque projet
// (épique 1301) : la branche d'intégration, les calibrages par défaut du
// manager et du reviewer, le plafond de calibrage deviennent
// `.claude/brigade/projet.json`, proposé par une PR.
//
// À blanc par défaut : il dit, projet par projet, le fichier et le dépôt visés,
// et ne change rien. Avec `--appliquer`, il ouvre une PR par projet qui a un
// écart, et saute celui dont le dépôt porte déjà le fichier sur sa branche
// d'intégration ou dont une PR de migration est déjà ouverte : un second passage
// ne fait rien.
//
// Il ne lit de la box que trois choses — la branche, les calibrages, le plafond
// — et passe tout par l'écrivain de `reglages.ts`, qui refuse ce qui est secret,
// chemin ou limite de la machine : rien de privé ne part dans le dépôt.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Calibrage } from "../../runtime/src/calibrage.ts";
import { lireLesDecisions, type Posees } from "../../runtime/src/decisions.ts";
import { PLAFOND_PAR_DEFAUT } from "../../runtime/src/reagir.ts";
import { brancheDuProjet } from "../../runtime/src/reglages-projet/en-vigueur.ts";
import { depotDeLOrigine, ecrireReglagesProjet, FICHIER, ReglageRefuse, texteDuFichier, type ReglagesProjet } from "../../runtime/src/reglages-projet/reglages.ts";

export const BRANCHE_DE_MIGRATION = "brigade/migration-reglages-projet";

// Un projet de la box : son répertoire d'état (le journal où le chef a posé ses
// décisions) et le clone de son dépôt. `branch` et `repo` ne servent que si le
// clone ne les dit pas (`CLAUDE.md`, `origin`).
export type ProjetDeLaBox = { name: string; stateDir: string; clone: string; branch?: string; repo?: string };

export type Migration =
  | { projet: string; etat: "a-migrer"; depot: string; base: string; reglages: ReglagesProjet; texte: string }
  | { projet: string; etat: "deja-migre" | "pr-ouverte" | "refuse"; depot?: string; raison: string };

// Les réglages que la box tient pour ce projet. Un calibrage dont une moitié
// manque n'est pas repris : le dépôt ne devine rien. Le plafond d'une seule
// dimension posée prend le défaut pour l'autre, ce que le runtime lit déjà.
export function reglagesDeLaBox(branche: string, posees: Posees): ReglagesProjet {
  const calibrage = (model: string | undefined, effort: string | undefined): Calibrage | undefined => (model === undefined || effort === undefined ? undefined : ({ model, effort } as Calibrage));
  const manager = calibrage(posees.BRIGADE_MANAGER_MODEL, posees.BRIGADE_MANAGER_EFFORT);
  const reviewer = calibrage(posees.BRIGADE_REVIEWER_MODEL, posees.BRIGADE_REVIEWER_EFFORT);
  const { BRIGADE_CEILING_MODEL: model, BRIGADE_CEILING_EFFORT: effort } = posees;
  const plafond = model === undefined && effort === undefined ? undefined : ({ model: model ?? PLAFOND_PAR_DEFAUT.model, effort: effort ?? PLAFOND_PAR_DEFAUT.effort } as Calibrage);
  return {
    integrationBranch: branche,
    ...(manager === undefined && reviewer === undefined ? {} : { defaultCalibrations: { ...(manager === undefined ? {} : { manager }), ...(reviewer === undefined ? {} : { reviewer }) } }),
    ...(plafond === undefined ? {} : { calibrationCeiling: plafond }),
  };
}

// Ce que `git` et `gh` font ici, remplaçable pour les essais.
export type Outils = {
  git: (cwd: string, ...args: string[]) => string;
  gh: (...args: string[]) => string;
};

export const outilsReels = (env: NodeJS.ProcessEnv = process.env): Outils => ({
  git: (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] }),
  gh: (...args) => execFileSync(env.BRIGADE_GH_BIN || "gh", args, { env, encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] }),
});

const dit = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce que la migration du projet ferait. Ne change rien.
export function preparer(projet: ProjetDeLaBox, outils: Outils): Migration {
  const refuse = (raison: string, depot?: string): Migration => ({ projet: projet.name, etat: "refuse", raison, ...(depot === undefined ? {} : { depot }) });
  if (!existsSync(projet.clone)) return refuse(`the clone ${projet.clone} does not exist`);
  let depot = projet.repo ?? null;
  if (depot === null) {
    try {
      depot = depotDeLOrigine(outils.git(projet.clone, "remote", "get-url", "origin"));
    } catch (erreur) {
      return refuse(`origin of the clone is not readable — ${dit(erreur)}`);
    }
  }
  if (depot === null) return refuse("origin of the clone is not a github.com repository: say it with `repo`");
  const { branche, problemes } = brancheDuProjet(projet.clone, projet.branch ?? null);
  if (branche === null) return refuse(`no integration branch: ${problemes.join("; ") || "say it with `branch`"}`, depot);
  let present: string | null;
  try {
    present = outils.git(projet.clone, "ls-tree", "--name-only", `origin/${branche}`, "--", FICHIER).trim() === "" ? null : "oui";
  } catch (erreur) {
    return refuse(`origin/${branche} is not readable in the clone — ${dit(erreur)}`, depot);
  }
  if (present !== null) return { projet: projet.name, etat: "deja-migre", depot, raison: `origin/${branche} already carries ${FICHIER}` };
  let reglages: ReglagesProjet;
  try {
    reglages = reglagesDeLaBox(branche, lireLesDecisions(projet.stateDir).posees);
    // Même crible que l'écriture, sans rien écrire.
    const trial = mkdtempSync(join(tmpdir(), "migration-reglages-"));
    try {
      ecrireReglagesProjet(trial, reglages);
    } finally {
      rmSync(trial, { recursive: true, force: true });
    }
  } catch (erreur) {
    return refuse(erreur instanceof ReglageRefuse ? `refused, nothing is proposed — ${erreur.message}` : dit(erreur), depot);
  }
  return { projet: projet.name, etat: "a-migrer", depot, base: branche, reglages, texte: texteDuFichier(reglages) };
}

// Ouvre la PR du projet : un worktree jetable de `origin/<base>`, le fichier
// écrit par l'écrivain du runtime, une branche poussée, une PR. Rend son adresse.
export function appliquer(projet: ProjetDeLaBox, migration: Extract<Migration, { etat: "a-migrer" }>, outils: Outils): string {
  const { depot, base, reglages } = migration;
  const ouvertes = outils.gh("pr", "list", "--repo", depot, "--head", BRANCHE_DE_MIGRATION, "--state", "open", "--json", "url", "--jq", ".[].url").trim();
  if (ouvertes !== "") return `already open: ${ouvertes.split("\n")[0]}`;
  outils.git(projet.clone, "fetch", "origin", base);
  const dossier = mkdtempSync(join(tmpdir(), "migration-reglages-wt-"));
  const arbre = join(dossier, "arbre");
  try {
    outils.git(projet.clone, "worktree", "add", "--detach", arbre, `origin/${base}`);
    try {
      ecrireReglagesProjet(arbre, reglages);
      outils.git(arbre, "add", FICHIER);
      outils.git(arbre, "-c", "user.name=brigade", "-c", "user.email=brigade@localhost", "commit", "-m", `Project settings move into the repository (${FICHIER})`);
      outils.git(arbre, "push", "--force", "origin", `HEAD:refs/heads/${BRANCHE_DE_MIGRATION}`);
    } finally {
      outils.git(projet.clone, "worktree", "remove", "--force", arbre);
    }
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
  const corps = [
    `Moves the project settings the box holds into \`${FICHIER}\`, so they change by a PR like the code (epic #1301).`,
    "",
    "```json",
    migration.texte.trimEnd(),
    "```",
    "",
    "Nothing private is carried: no secret, no machine path, no machine limit. What the box holds stays as the fallback until this is merged.",
  ].join("\n");
  return outils.gh("pr", "create", "--repo", depot, "--base", base, "--head", BRANCHE_DE_MIGRATION, "--title", `Project settings move into the repository`, "--body", corps).trim();
}

export function lireProjets(fichier: string): ProjetDeLaBox[] {
  const lu = JSON.parse(readFileSync(fichier, "utf8")) as { projects?: unknown };
  if (!Array.isArray(lu.projects)) throw new Error(`${fichier}: expected {"projects": [{"name", "stateDir", "clone"}, …]}`);
  return lu.projects.map((p, i) => {
    const { name, stateDir, clone } = p as Record<string, unknown>;
    if (typeof name !== "string" || typeof stateDir !== "string" || typeof clone !== "string") throw new Error(`${fichier}: project ${i} needs \`name\`, \`stateDir\` and \`clone\``);
    return p as ProjetDeLaBox;
  });
}

// Le passage entier. Rend le compte-rendu et le code de sortie (1 si un projet est refusé).
export function passer(projets: ProjetDeLaBox[], options: { appliquer: boolean }, outils: Outils): { sortie: string[]; code: number } {
  const sortie: string[] = [];
  let code = 0;
  for (const projet of projets) {
    const m = preparer(projet, outils);
    if (m.etat === "a-migrer") {
      sortie.push(`== ${m.projet} → ${m.depot} (base ${m.base}) : ${FICHIER}`, m.texte.trimEnd());
      if (!options.appliquer) {
        sortie.push("dry run: nothing is written (--apply opens the PR)");
        continue;
      }
      try {
        sortie.push(`PR: ${appliquer(projet, m, outils)}`);
      } catch (erreur) {
        code = 1;
        sortie.push(`FAILED: ${dit(erreur)}`);
      }
    } else {
      if (m.etat === "refuse") code = 1;
      sortie.push(`== ${m.projet}${m.depot === undefined ? "" : ` → ${m.depot}`} : ${m.etat === "refuse" ? "REFUSED" : "skipped"} — ${m.raison}`);
    }
  }
  return { sortie, code };
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  const { values } = parseArgs({ options: { config: { type: "string" }, apply: { type: "boolean", default: false } }, strict: true });
  if (values.config === undefined) {
    console.error("usage: node scripts/migration-reglages-projet/migrer.ts --config <projects.json> [--apply]");
    process.exit(2);
  }
  const { sortie, code } = passer(lireProjets(values.config), { appliquer: values.apply }, outilsReels());
  console.log(sortie.join("\n"));
  process.exit(code);
}
