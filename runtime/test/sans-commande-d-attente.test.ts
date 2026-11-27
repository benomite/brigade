// #4262 — aucune commande de la box ne met un ticket en attente ni ne l'en sort : le second et l'app le parquent et le
// déparquent sur son issue (app/src/second/parking.ts, app/src/vue/wait/wait-github.ts). Ni script du runtime, ni
// commande de sa table, ni rôle, ni code qui en compose une.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { COMMANDES } from "../src/commandes.ts";

const RACINE = join(import.meta.dirname, "../..");
const sources = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) =>
    entree.isDirectory() ? (entree.name === "node_modules" ? [] : sources(join(dossier, entree.name))) : /\.(ts|js|md|sh)$/.test(entree.name) ? [join(dossier, entree.name)] : [],
  );

// Ce qui nomme un geste d'attente de la box : `waiting set|resume|arrived`, `brigade <nom> waiting`, `run waiting`.
const GESTE_D_ATTENTE = /\bwaiting (?:set|resume|arrived)\b|<(?:name|nom)> waiting\b|run waiting\b|attente-cli/;

test("le runtime n'a plus de commande `waiting`, ni son ancien nom `attente`", () => {
  const { scripts } = JSON.parse(readFileSync(join(RACINE, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };
  assert.deepEqual(Object.keys(scripts).filter((nom) => ["waiting", "attente", "parked"].includes(nom)), []);
  assert.deepEqual(Object.values(scripts).filter((script) => script.includes("attente-cli")), []);
  assert.deepEqual(COMMANDES.filter(({ nom }) => nom === "waiting" || nom === "attente").map(({ nom }) => nom), []);
});

test("ni le code, ni les rôles, ni la doc ne composent ou ne citent un geste d'attente de la box", () => {
  const fichiers = ["runtime/src", "app/src", "commands", "docs/runtime", "docs/app.md"].flatMap((chemin) => (chemin.endsWith(".md") ? [join(RACINE, chemin)] : sources(join(RACINE, chemin))));
  assert.ok(fichiers.length > 100);
  assert.deepEqual(
    fichiers.filter((fichier) => GESTE_D_ATTENTE.test(readFileSync(fichier, "utf8"))).map((fichier) => fichier.slice(RACINE.length + 1)),
    [],
  );
});
