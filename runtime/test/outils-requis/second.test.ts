// Le second sous Windows, un `git` sans son Git Bash (#4059) : la phrase dit comment avoir Git for Windows par le chemin
// des outils requis — winget seulement s'il est sur ce PC, son installeur sinon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planDuSecond } from "../../src/second/lancement.ts";
import { repertoireTemporaire } from "../outils.ts";

const fichiers = (...chemins: string[]) => {
  const tous = new Set(chemins);
  return (chemin: string) => tous.has(chemin);
};
const NPM = "C:\\Users\\chef\\AppData\\Roaming\\npm";
const AILLEURS = "D:\\outils\\git\\cmd";
const APPS = "C:\\Users\\chef\\AppData\\Local\\Microsoft\\WindowsApps";
const GH = "C:\\Program Files\\GitHub CLI\\gh.exe";
const raison = (avecWinget: boolean, dossier: string) => {
  const plan = planDuSecond({
    plateforme: "win32",
    env: { Path: `${NPM};${AILLEURS};C:\\Program Files\\GitHub CLI;${APPS}`, PATHEXT: ".EXE;.CMD" },
    maison: "C:\\Users\\chef",
    existe: fichiers(`${NPM}\\claude.cmd`, `${AILLEURS}\\git.exe`, GH, ...(avecWinget ? [`${APPS}\\winget.exe`] : [])),
    folder: dossier,
  });
  assert.ok(plan.state === "cannot-start" && plan.cause === "git-bash-missing", JSON.stringify(plan));
  return plan.reason;
};

test("un git sans Git Bash : sans winget, l'installeur de Git for Windows ; avec lui, sa commande — jamais un outil absent", (t) => {
  const dossier = repertoireTemporaire(t);
  const sans = raison(false, dossier);
  assert.match(sans, /comes without it — install Git for Windows, which brings Git Bash: download its installer from git-scm\.com and open it\.$/);
  assert.doesNotMatch(sans, /winget/);
  assert.match(raison(true, dossier), /comes without it — install Git for Windows, which brings Git Bash: run `winget install --id Git\.Git -e --source winget` in a terminal\.$/);
});
