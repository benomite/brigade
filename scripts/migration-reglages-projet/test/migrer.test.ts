// La migration jouée pour de bon : de vrais dépôts git (une origine nue, un clone), un vrai
// journal de décisions, et un `gh` de doublure en mémoire — rien ne sort de la machine.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { poserDecision } from "../../../runtime/src/decisions.ts";
import { ouvrirJournal } from "../../../runtime/src/journal.ts";
import { BRANCHE_DE_MIGRATION, passer, reglagesDeLaBox, type Outils, type ProjetDeLaBox } from "../migrer.ts";

const racines: string[] = [];
after(() => racines.forEach((r) => rmSync(r, { recursive: true, force: true })));

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// Un projet : origine nue avec `v2`, clone, et un journal où le chef a posé ses décisions —
// y compris des choses qui ne doivent jamais partir.
function projet(nom: string, decisions: Record<string, string>): ProjetDeLaBox & { origine: string } {
  const racine = mkdtempSync(join(tmpdir(), "migration-test-"));
  racines.push(racine);
  const origine = join(racine, "origine.git");
  const clone = join(racine, "clone");
  const stateDir = join(racine, "etat");
  git(racine, "init", "--bare", "-b", "v2", origine);
  git(racine, "clone", origine, clone);
  git(clone, "checkout", "-b", "v2");
  writeFileSync(join(clone, "README.md"), "x\n");
  git(clone, "add", ".");
  git(clone, "commit", "-m", "init");
  git(clone, "push", "origin", "v2");
  mkdirSync(stateDir);
  const journal = ouvrirJournal(stateDir);
  try {
    for (const [nomDecision, valeur] of Object.entries(decisions)) poserDecision(journal, { projet: nom, nom: nomDecision, valeur, auteur: "chef" });
  } finally {
    journal.fermer();
  }
  return { name: nom, stateDir, clone, branch: "v2", repo: `benomite/${nom}`, origine };
}

function fauxGh() {
  const prs: string[][] = [];
  const outils: Outils = {
    git: (cwd, ...args) => git(cwd, ...args),
    gh: (...args) => {
      if (args[0] === "pr" && args[1] === "list") return prs.length === 0 ? "" : `https://github.com/pr/${prs.length}\n`;
      if (args[0] === "pr" && args[1] === "create") {
        prs.push(args);
        return `https://github.com/pr/${prs.length}\n`;
      }
      throw new Error(`gh ${args.join(" ")}`);
    },
  };
  return { prs, outils };
}

const DECISIONS = {
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "opus",
  BRIGADE_REVIEWER_EFFORT: "high",
  BRIGADE_CEILING_MODEL: "opus",
  BRIGADE_CEILING_EFFORT: "xhigh",
  BRIGADE_GATES_BUDGET_SECONDS: "900",
  BRIGADE_CLOSING_COOKS: "3",
  BRIGADE_STATIONS: "toulouse/claude:7:code+raisonnement",
};

describe("migration des réglages de projet", () => {
  test("à blanc, elle dit le fichier et le dépôt visés et ne change rien", () => {
    const p = projet("brigade", DECISIONS);
    const { prs, outils } = fauxGh();
    const { sortie, code } = passer([p], { appliquer: false }, outils);
    const texte = sortie.join("\n");
    assert.equal(code, 0);
    assert.match(texte, /== brigade → benomite\/brigade \(base v2\)/);
    assert.match(texte, /"integrationBranch": "v2"/);
    assert.match(texte, /"model": "sonnet"/);
    assert.match(texte, /dry run/);
    assert.equal(prs.length, 0);
    assert.equal(existsSync(join(p.clone, ".claude")), false);
    assert.equal(git(p.origine, "branch", "--list", BRANCHE_DE_MIGRATION).trim(), "");
  });

  test("le fichier proposé ne porte ni secret, ni chemin de la machine, ni limite de la machine", () => {
    const p = projet("espace", DECISIONS);
    const texte = passer([p], { appliquer: false }, fauxGh().outils).sortie.join("\n");
    for (const interdit of ["ghp_", "toulouse", "raisonnement", "900", "BUDGET", "CLOSING", "STATIONS", "stateDir"]) assert.equal(texte.includes(interdit), false, interdit);
    const reglages = reglagesDeLaBox("v2", { ...DECISIONS } as never);
    assert.deepEqual(Object.keys(reglages).sort(), ["calibrationCeiling", "defaultCalibrations", "integrationBranch"]);
  });

  test("avec --apply, une PR par projet, et un second passage ne fait rien", () => {
    const a = projet("calculus", DECISIONS);
    const { prs, outils } = fauxGh();
    const premier = passer([a], { appliquer: true }, outils);
    assert.equal(premier.code, 0);
    assert.equal(prs.length, 1);
    assert.deepEqual(prs[0]?.slice(0, 2), ["pr", "create"]);
    assert.ok(prs[0]?.includes("benomite/calculus"));
    const poussee = git(a.origine, "show", `${BRANCHE_DE_MIGRATION}:.claude/brigade/projet.json`);
    assert.match(poussee, /"calibrationCeiling": \{\s+"model": "opus",\s+"effort": "xhigh"/);
    assert.equal(git(a.clone, "worktree", "list").trim().split("\n").length, 1);
    // Une PR est ouverte : rien de plus.
    passer([a], { appliquer: true }, outils);
    assert.equal(prs.length, 1);
    // La PR mergée : le dépôt porte le fichier, le projet est sauté.
    git(a.clone, "fetch", "origin");
    git(a.clone, "push", "origin", `origin/${BRANCHE_DE_MIGRATION}:v2`);
    git(a.clone, "fetch", "origin");
    const apres = passer([a], { appliquer: true }, fauxGh().outils);
    assert.match(apres.sortie.join("\n"), /skipped — origin\/v2 already carries/);
  });

  test("un calibrage à moitié posé n'est pas repris, un plafond d'une dimension prend le défaut de l'autre", () => {
    const r = reglagesDeLaBox("v2", { BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_CEILING_MODEL: "sonnet" });
    assert.deepEqual(r, { integrationBranch: "v2", calibrationCeiling: { model: "sonnet", effort: "high" } });
  });

  test("un projet sans clone est refusé, dit, et le code de sortie le dit", () => {
    const { sortie, code } = passer([{ name: "mirrorlab", stateDir: "/nope", clone: "/nope/clone" }], { appliquer: false }, fauxGh().outils);
    assert.equal(code, 1);
    assert.match(sortie.join("\n"), /REFUSED — the clone/);
  });
});
