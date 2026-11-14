// `/brigade:init` écrit `.claude/brigade/bac-a-sable.json` depuis ce que le
// dépôt montre de sa chaîne d'outils (`bac-a-sable/detection-projet.ts`),
// joué ici comme l'init le lance : un process sur le dossier du projet.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { LECTURES_INTERDITES } from "../../src/bac-a-sable/configuration.ts";
import { ENV_ENFANT, repertoireTemporaire } from "../outils.ts";

const CLI = join(import.meta.dirname, "../../src/bac-a-sable/detection-projet.ts");
const DECLARATION = ".claude/brigade/bac-a-sable.json";

function projet(t: TestContext, fichiers: Record<string, string>): string {
  const dossier = repertoireTemporaire(t);
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  return dossier;
}

function lancer(...args: string[]): Promise<{ code: number; sortie: string; erreur: string }> {
  return new Promise((resoudre) => {
    execFile(process.execPath, [CLI, ...args], { env: ENV_ENFANT, encoding: "utf8" }, (erreur, sortie, erreurs) => {
      resoudre({ code: erreur === null ? 0 : Number(erreur.code), sortie, erreur: erreurs });
    });
  });
}

async function declaration(dossier: string): Promise<{ ports: number[]; ecriture: string[] }> {
  const { code, erreur } = await lancer(dossier);
  assert.equal(code, 0, erreur);
  return JSON.parse(readFileSync(join(dossier, DECLARATION), "utf8"));
}

// Les limites d'une déclaration : des ports de la boucle locale, de 1 à
// 65535 ; des dossiers sous `~`, sans `..`, ni sous un secret du chef ni au-dessus.
function dansLesLimites({ ports, ecriture }: { ports: number[]; ecriture: string[] }) {
  for (const port of ports) assert.ok(Number.isInteger(port) && port >= 1 && port <= 65535, `port ${port}`);
  for (const dossier of ecriture) {
    assert.match(dossier, /^~\/[^]+$/);
    const relatif = dossier.slice(2);
    assert.ok(!relatif.split("/").includes(".."), dossier);
    for (const secret of LECTURES_INTERDITES) assert.ok(relatif !== secret && !relatif.startsWith(`${secret}/`) && !secret.startsWith(`${relatif}/`), `${dossier} touche ${secret}`);
  }
}

test("un dépôt Gradle : `~/.gradle` ouvert à l'écriture, et aucun port inventé pour son démon", async (t) => {
  const lue = await declaration(projet(t, { gradlew: "#!/bin/sh\n", "build.gradle.kts": "plugins { java }\n", "app/build.gradle.kts": "" }));
  assert.deepEqual(lue, { ports: [], ecriture: ["~/.gradle"] });
  dansLesLimites(lue);
});

test("un dépôt npm : le cache de npm", async (t) => {
  const lue = await declaration(projet(t, { "package.json": '{"name":"x"}\n' }));
  assert.deepEqual(lue, { ports: [], ecriture: ["~/.npm"] });
  dansLesLimites(lue);
});

const PIP = { ports: [], ecriture: ["~/Library/Caches/pip", "~/.cache/pip"] };

test("un dépôt Python par pyproject.toml : le cache de pip, sur le Mac et sous Linux", async (t) => {
  const lue = await declaration(projet(t, { "pyproject.toml": "[project]\nname='x'\n" }));
  assert.deepEqual(lue, PIP);
  dansLesLimites(lue);
});

test("un dépôt Python par requirements.txt : le même cache de pip", async (t) => {
  assert.deepEqual(await declaration(projet(t, { "requirements.txt": "requests\n" })), PIP);
});

test("un dépôt Docker Compose : les ports qu'il publie sur la boucle locale, pas ceux d'une autre adresse ; `~/.docker` n'est jamais ouvert", async (t) => {
  const compose = [
    "services:",
    "  db:",
    "    image: postgres",
    "    ports:",
    '      - "5432:5432"',
    "      - 127.0.0.1:6379:6379",
    "      - '0.0.0.0:8080:80/tcp'",
    "      - 10.0.0.5:9000:9000",
    "      - 99999:1",
    "",
  ].join("\n");
  const lue = await declaration(projet(t, { "docker-compose.yml": compose, Dockerfile: "FROM node\nEXPOSE 3000\n" }));
  assert.deepEqual(lue, { ports: [5432, 6379, 8080], ecriture: [] });
  dansLesLimites(lue);
});

test("un dépôt qu'elle ne reconnaît pas : une déclaration vide, écrite quand même", async (t) => {
  const dossier = projet(t, { "README.md": "# x\n", "main.c": "int main(){}\n" });
  const { code, sortie } = await lancer(dossier);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(dossier, DECLARATION), "utf8")), { ports: [], ecriture: [] });
  assert.match(sortie, /rien de reconnu/);
});

test("une déclaration déjà là n'est jamais réécrite : elle dit ce qui lui manque", async (t) => {
  const posee = '{"ports": [], "ecriture": ["~/.cargo"]}\n';
  const dossier = projet(t, { "package.json": "{}", [DECLARATION]: posee });
  const { code, sortie } = await lancer(dossier);
  assert.equal(code, 0);
  assert.equal(readFileSync(join(dossier, DECLARATION), "utf8"), posee);
  assert.match(sortie, /déjà là, laissé tel quel/);
  assert.match(sortie, /MANQUE ecriture ~\/\.npm/);
});

test("une déclaration posée illisible : laissée telle quelle, et dite illisible", async (t) => {
  const dossier = projet(t, { "package.json": "{}", [DECLARATION]: "{ports: 1" });
  const { code, sortie } = await lancer(dossier);
  assert.equal(code, 0);
  assert.equal(readFileSync(join(dossier, DECLARATION), "utf8"), "{ports: 1");
  assert.match(sortie, /ILLISIBLE/);
  assert.doesNotMatch(sortie, /MANQUE/);
});

test("mal appelée, sans dossier : elle sort en 64", async () => {
  assert.equal((await lancer()).code, 64);
});

test("mal appelée, sur un dossier qui n'existe pas : elle sort en 64 sans le créer", async (t) => {
  const absent = join(repertoireTemporaire(t), "absent");
  assert.equal((await lancer(absent)).code, 64);
  assert.equal(existsSync(absent), false);
});
