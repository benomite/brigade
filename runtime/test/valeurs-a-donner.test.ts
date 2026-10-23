// Ce que l'utilisateur doit donner, et que rien ne devine à sa place : sans
// configuration, le runtime refuse de démarrer en disant, en anglais simple,
// chaque valeur qui manque — et n'en emprunte aucune à personne.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { direValeursManquantes, valeursManquantes } from "../src/valeurs-a-donner.ts";

const MAIN = join(import.meta.dirname, "../src/main.ts");

test("sans rien, les quatre valeurs à donner sont dites ensemble, compte GitHub et dépôt du projet compris", () => {
  const manquantes = valeursManquantes({});
  assert.equal(manquantes.length, 4);
  const dit = direValeursManquantes(manquantes);
  assert.match(dit, /^4 values to give before it can start/);
  assert.match(dit, /BRIGADE_GITHUB_REPO is not set: give the GitHub repository of your project, as <owner>\/<repo> — the GitHub account or organisation that owns it/);
  assert.match(dit, /BRIGADE_PROJECT is not set: give the name of your project/);
  assert.match(dit, /BRIGADE_STATE_DIR is not set/);
  assert.match(dit, /BRIGADE_REPO_DIR is not set/);
});

test("une valeur donnée n'est plus dite, et rien manquant ne dit rien", () => {
  const tout = { BRIGADE_STATE_DIR: "/x", BRIGADE_PROJECT: "app", BRIGADE_GITHUB_REPO: "acme/app", BRIGADE_REPO_DIR: "/y" };
  assert.deepEqual(valeursManquantes(tout), []);
  assert.deepEqual(valeursManquantes({ ...tout, BRIGADE_GITHUB_REPO: "" }).map((l) => l.split(" ")[0]), ["BRIGADE_GITHUB_REPO"]);
});

test("le runtime lancé sur une machine sans configuration refuse de démarrer en les disant toutes, et sort en 2", () => {
  const rendu = spawnSync(process.execPath, [MAIN], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: "/nonexistent" } });
  assert.equal(rendu.status, 2, rendu.stderr);
  assert.match(rendu.stderr, /refus de démarrer — 4 values to give before it can start/);
  for (const variable of ["BRIGADE_STATE_DIR", "BRIGADE_PROJECT", "BRIGADE_GITHUB_REPO", "BRIGADE_REPO_DIR"]) assert.match(rendu.stderr, new RegExp(`${variable} is not set`));
});
