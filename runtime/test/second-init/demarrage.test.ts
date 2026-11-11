// La mise en place qui démarre seule dans le second (#3167) : par son point
// d'entrée, `planDuSecond`, un second lancé avec son rôle sur un dépôt pas
// encore préparé part avec un premier message qui ouvre la mise en place et
// propose ce qu'il a lu du dépôt, chaque chose avec ce à quoi elle sert.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ligneDeCmd } from "../../src/sans-invite.ts";
import { argumentsDeMiseEnPlace, messageDeMiseEnPlace, SERT } from "../../src/second-init/demarrage.ts";
import { lireLeDepot } from "../../src/second-init/lecture-depot.ts";
import { planDuSecond, type PlanDuSecond } from "../../src/second/lancement.ts";
import { repertoireTemporaire } from "../outils.ts";

function fixture(t: TestContext, fichiers: Record<string, string>): string {
  const dossier = repertoireTemporaire(t);
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(join(dossier, chemin, ".."), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  return dossier;
}

const fichiers = (...chemins: string[]) => {
  const tous = new Set(chemins);
  return (chemin: string) => tous.has(chemin);
};
const SOUS_LINUX = { plateforme: "linux" as const, env: { PATH: "/usr/bin" }, maison: "/home/chef", existe: fichiers("/usr/bin/claude", "/usr/bin/gh", "/usr/bin/git") };
const ROLE = ["--append-system-prompt-file", "/app/src/second/role.md", "--settings", "{}"];

const args = (plan: PlanDuSecond) => {
  assert.equal(plan.state, "ready", JSON.stringify(plan));
  return plan.state === "ready" ? plan.launch.args : [];
};

// Deux dépôts de fixture, pas préparés : l'un se lit en entier, l'autre presque pas.
const NODE = { ".git/refs/remotes/origin/HEAD": "ref: refs/remotes/origin/main\n", "CLAUDE.md": "# Parade\n", "package.json": JSON.stringify({ scripts: { test: "vitest run" } }), "src/index.ts": "", "docs/a.md": "" };
const ILLISIBLE = { ".git/HEAD": "ref: refs/heads/main\n", "package.json": "{ not json" };

test("un second ouvert sur un dépôt pas préparé part sur la mise en place : la proposition lue du dépôt, sans commande à taper", (t) => {
  const dossier = fixture(t, NODE);
  const lances = args(planDuSecond({ ...SOUS_LINUX, folder: dossier, args: ROLE }));
  assert.deepEqual(lances.slice(0, ROLE.length), ROLE);
  assert.equal(lances.length, ROLE.length + 1);
  const message = lances.at(-1) ?? "";
  // Une ligne : sous Windows, un `claude.cmd` n'en recevrait pas d'autre.
  assert.doesNotMatch(message, /[\r\n]/);
  assert.match(message, /not set up for Brigade yet/);
  assert.match(message, /Integration branch: found `main` \(read from the default branch of `origin`\)/);
  assert.match(message, /Checks: found `npm test` \(read from the scripts `test` of `package\.json`\)/);
  assert.match(message, /File zones: found `docs\/`, `src\/` \(read from the first-level folders of the repository\)/);
  for (const sert of Object.values(SERT)) assert.ok(message.includes(`What it is for: ${sert}`), sert);
  // L'ancien message n'est plus : le chef n'a rien à taper.
  assert.doesNotMatch(message, /type `\/brigade:init` in this tab/);
  assert.match(message, /never ask them to type `\/brigade:init`/);
  // Chaque « à quoi ça sert » tient en une ou deux phrases.
  for (const sert of Object.values(SERT)) assert.ok(sert.split(/(?<=\.)\s+/).length <= 2, sert);
});

test("ce qui ne se lit pas est dit dans la proposition, et laissé aux questions", (t) => {
  const message = argumentsDeMiseEnPlace(fixture(t, ILLISIBLE), ROLE)[0] ?? "";
  assert.match(message, /Integration branch: not read — the clone does not record the repository's default branch \(no `refs\/remotes\/origin\/HEAD`\); leave it for the questions, do not guess it\./);
  assert.match(message, /Checks: not read — `package\.json` is not valid JSON \(.*?\); leave it for the questions, do not guess it\./);
  assert.match(message, /File zones: not read — .*leave it for the questions, do not guess it\./);
  assert.doesNotMatch(message, /found `/);
  // Le message est celui de la lecture du dépôt, rien d'autre.
  const dossier = fixture(t, ILLISIBLE);
  assert.deepEqual(argumentsDeMiseEnPlace(dossier, ROLE), [messageDeMiseEnPlace(lireLeDepot(dossier))]);
});

test("rien n'est ajouté à un dépôt préparé, à un dossier hors dépôt, à un `CLAUDE.md` illisible, ni à une session ouverte sur une commande", (t) => {
  const prepare = fixture(t, { ...NODE, "CLAUDE.md": "# Parade\n\n## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n" });
  assert.deepEqual(args(planDuSecond({ ...SOUS_LINUX, folder: prepare, args: ROLE })), ROLE);
  assert.deepEqual(args(planDuSecond({ ...SOUS_LINUX, folder: fixture(t, { "CLAUDE.md": "# x\n" }), args: ROLE })), ROLE);
  const illisible = fixture(t, { ".git/HEAD": "", "CLAUDE.md/x": "" });
  assert.deepEqual(args(planDuSecond({ ...SOUS_LINUX, folder: illisible, args: ROLE })), ROLE);
  assert.deepEqual(args(planDuSecond({ ...SOUS_LINUX, folder: fixture(t, NODE), args: ["/brigade:init", "--settings", "{}"] })), ["/brigade:init", "--settings", "{}"]);
});

test("sous Windows, par un `claude.cmd`, le second part aussi sur la mise en place : le message passe sur sa ligne", (t) => {
  const NPM = "C:\\Users\\chef\\AppData\\Roaming\\npm";
  const BASH = "C:\\Program Files\\Git\\bin\\bash.exe";
  const dossier = fixture(t, NODE);
  const plan = planDuSecond({
    plateforme: "win32",
    env: { Path: `${NPM};C:\\Program Files\\Git\\cmd;C:\\Program Files\\GitHub CLI`, PATHEXT: ".COM;.EXE;.BAT;.CMD", ComSpec: "C:\\Windows\\system32\\cmd.exe" },
    maison: "C:\\Users\\chef",
    existe: fichiers(`${NPM}\\claude.cmd`, "C:\\Program Files\\Git\\cmd\\git.exe", BASH, "C:\\Program Files\\GitHub CLI\\gh.exe"),
    folder: dossier,
    args: ROLE,
  });
  const message = argumentsDeMiseEnPlace(dossier, ROLE)[0] ?? "";
  assert.deepEqual(args(plan), ["/d", "/s", "/c", `"${ligneDeCmd(`${NPM}\\claude.cmd`, [...ROLE, message])}"`]);
});
