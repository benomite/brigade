// La fermeture qui observe, sur un vrai dépôt git dont l'historique de merges
// est fixe : le ratio ajouté / retiré de ses fenêtres, les doublons et le code
// mort qu'elle repère — et rien, dans le dépôt cible, qui ait bougé.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "../support/posix.ts";
import type { Fait } from "../../src/evenements.ts";
import { lireDepot } from "../../src/closing/reading.ts";
import { principal } from "../../src/closing/observer.ts";
import { mesurerRatio } from "../../src/closing/ratio.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { SANS_SEUIL } from "../../src/mesures.ts";
import { appeler, BASE, depotGit, ENV_GIT, git, horloge, lancer, repertoireTemporaire } from "../outils.ts";
import { ecrireHistoire, lignes, type Etape } from "./history.ts";

const STOCK = 700;
// Cent vingt merges, du plus ancien au plus récent : chacun ajoute un fichier
// de dix lignes et retire des lignes du stock — rien pour les vingt premiers,
// dix pour les cinquante suivants, quatre pour les trente d'après, une pour les
// vingt derniers.
function histoireFixe(): Etape[] {
  let reste = STOCK;
  const etapes: Etape[] = [{ commit: { "stock.txt": lignes(STOCK) } }];
  for (let rang = 1; rang <= 120; rang++) {
    reste -= rang <= 20 ? 0 : rang <= 70 ? 10 : rang <= 100 ? 4 : 1;
    etapes.push({ merge: { [`plats/${rang}.txt`]: lignes(10), "stock.txt": lignes(reste) } });
  }
  return etapes;
}

function env(clone: string, autres: Record<string, string> = {}): Record<string, string> {
  return { ...ENV_GIT, BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: BASE, ...autres };
}

async function observer(clone: string, autres: Record<string, string> = {}, args: string[] = []): Promise<{ code: number; sortie: string }> {
  const appel = appeler(principal, args, env(clone, autres));
  return { code: await appel.fin, sortie: appel.sortie() };
}

// Tout ce que le répertoire du clone contient, `.git` compris : chaque fichier,
// son contenu et l'instant de sa dernière écriture.
function photographier(repertoire: string): Record<string, string> {
  const photo: Record<string, string> = {};
  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) {
        photo[`${chemin}/`] = String(statSync(chemin).mtimeMs);
        parcourir(chemin);
      } else photo[chemin] = `${createHash("sha1").update(readFileSync(chemin)).digest("hex")} ${statSync(chemin).mtimeMs}`;
    }
  };
  parcourir(repertoire);
  return photo;
}

const depot = (t: TestContext, etapes: Etape[]): string => {
  const { clone } = depotGit(t);
  ecrireHistoire(clone, etapes);
  return clone;
};

test("sur un historique de merges fixe, le ratio ajouté / retiré de chaque fenêtre est le bon, avec ses valeurs absolues", async (t) => {
  const clone = depot(t, histoireFixe());
  const tete = git(clone, "rev-parse", `origin/${BASE}`);

  const { merges } = lireDepot(clone, BASE, ENV_GIT);
  assert.deepEqual(mesurerRatio(merges), [
    { fenetre: 20, merges: 20, ajoute: 200, retire: 20 },
    { fenetre: 50, merges: 50, ajoute: 500, retire: 140 },
    { fenetre: 100, merges: 100, ajoute: 1000, retire: 640 },
  ]);

  const { code, sortie } = await observer(clone);
  assert.equal(code, 0, sortie);
  assert.match(sortie, new RegExp(`^closing    observation of origin/${BASE} \\(${tete.slice(0, 7)}, last merge on 2025-10-09\\) — nothing is modified: no file, no branch, no PR\n`));
  assert.match(sortie, /\nratio      added \/ removed over the latest merges, each counted against its first parent\n/);
  assert.match(sortie, /\n {11}20 merges {3}\+200 \/ −20 {5}10:1\n/);
  assert.match(sortie, /\n {11}50 merges {3}\+500 \/ −140 {4}3\.6:1\n/);
  assert.match(sortie, /\n {11}100 merges {2}\+1,000 \/ −640 {2}1.6:1\n/);
});

test("un merge compte pour ce qu'il apporte à la branche d'intégration : ni un commit posé droit dessus, ni ce que sa branche a écrit puis retiré, ni ce que la base a reçu pendant qu'elle était ouverte", (t) => {
  const clone = depot(t, [
    { commit: { "socle.txt": lignes(40) } },
    { merge: { "a.txt": lignes(7), "socle.txt": lignes(38) }, brouillon: { "essai.txt": lignes(500) } },
    { commit: { "direct.txt": lignes(900) } },
    { merge: { "b.txt": lignes(3), "direct.txt": null } },
    { merge: { "c.txt": lignes(11) }, enRetard: true },
  ]);

  const { merges } = lireDepot(clone, BASE, ENV_GIT);

  // Le plus récent d'abord.
  assert.deepEqual(merges.map(({ ajoute, retire }) => ({ ajoute, retire })), [{ ajoute: 11, retire: 0 }, { ajoute: 3, retire: 900 }, { ajoute: 7, retire: 2 }]);
});

test("une fenêtre plus large que l'historique dit combien de merges elle a trouvés ; sans rien de retiré, elle ne donne pas de ratio ; sans merge, elle le dit", async (t) => {
  assert.deepEqual(mesurerRatio([{ ajoute: 5, retire: 0 }, { ajoute: 7, retire: 0 }]), [
    { fenetre: 20, merges: 2, ajoute: 12, retire: 0 },
    { fenetre: 50, merges: 2, ajoute: 12, retire: 0 },
    { fenetre: 100, merges: 2, ajoute: 12, retire: 0 },
  ]);

  const peu = depot(t, [{ merge: { "a.txt": lignes(5) } }, { merge: { "b.txt": lignes(7) } }]);
  const { sortie } = await observer(peu);
  assert.match(sortie, /\n {11}20 merges {3}\+12 \/ −0 {2}nothing removed — only 2 merges on the branch\n/);
  assert.match(sortie, /\n {11}100 merges {2}\+12 \/ −0 {2}nothing removed — only 2 merges on the branch\n/);

  const aucun = depot(t, [{ commit: { "a.txt": lignes(5) } }]);
  const vide = await observer(aucun);
  assert.equal(vide.code, 0);
  assert.match(vide.sortie, /\nratio      no merge on origin\/v2: nothing to measure\n/);
  assert.match(vide.sortie, /^closing    observation of origin\/v2 \([0-9a-f]{7}, no merge\) — /);
});

const BLOC = ["const lus = [];", "for (const nom of noms) {", "  const brut = lire(nom);", "  if (brut === null) continue;", "  const net = brut.trim();", "  if (net === '') continue;", "  lus.push(net.toLowerCase());", "}", "return lus.sort();"].join("\n");

test("la même sortie liste les doublons et le code mort repérés, chacun avec son chemin", async (t) => {
  const clone = depot(t, [
    {
      merge: {
        "src/a.ts": `import { vivant } from "./b.ts";\nexport function lireA(noms: string[]) {\n${BLOC}\n}\nexport const OUBLIE = vivant();\n`,
        "src/b.ts": `export function vivant() {\n  return 1;\n}\nexport function lireB(noms: string[]) {\n${BLOC}\n}\nexport function eprouve() {\n  return 2;\n}\n`,
        "src/c.ts": `import { lireA } from "./a.ts";\nimport { lireB } from "./b.ts";\nconsole.log(lireA([]), lireB([]));\n`,
        "test/b.test.ts": `import { eprouve } from "../src/b.ts";\neprouve();\n`,
      },
    },
  ]);

  const { code, sortie } = await observer(clone);

  assert.equal(code, 0, sortie);
  assert.match(sortie, /\nduplicates 1 spotted, 8 lines — at least 8 identical lines of code in a row, among 4 code files\n {11}8 lines {2}src\/a\.ts:3-11 = src\/b\.ts:5-13\n/);
  assert.match(
    sortie,
    /\ndead code  2 exports spotted, among 4 TypeScript or JavaScript files\n {11}src\/a\.ts:13 {2}`OUBLIE` — referenced nowhere\n {11}src\/b\.ts:15 {2}`eprouve` — referenced only by tests: test\/b\.test\.ts\n/,
  );
});

test("quand il n'y a ni doublon ni code mort, la sortie le dit explicitement — et dit ce qu'elle n'a pas pu chercher", async (t) => {
  const propre = depot(t, [{ merge: { "src/a.ts": "export const un = 1;\n", "src/b.ts": 'import { un } from "./a.ts";\nconsole.log(un);\n' } }]);
  const { sortie } = await observer(propre);
  assert.match(sortie, /\nduplicates none spotted — at least 8 identical lines of code in a row, among 2 code files\n/);
  assert.match(sortie, /\ndead code  none spotted, among 2 TypeScript or JavaScript files\n/);

  // Le dépôt du gabarit ne porte qu'un LISEZMOI.
  const sansCode = depot(t, [{ merge: { "notes.txt": lignes(3) } }]);
  const rien = await observer(sansCode);
  assert.match(rien.sortie, /\nduplicates none spotted — no code file on the branch\n/);
  assert.match(rien.sortie, /\ndead code  none spotted — no TypeScript or JavaScript file on the branch\n/);
});

test("l'observation n'écrit aucun fichier du dépôt cible, n'y crée aucune branche et n'y prend aucun verrou — même quand un autre en tient", async (t) => {
  const clone = depot(t, histoireFixe().slice(0, 30));
  const refs = git(clone, "for-each-ref");
  const avant = photographier(clone);

  const { code, sortie } = await observer(clone);

  assert.equal(code, 0, sortie);
  assert.match(sortie, /\n {11}20 merges {3}\+200 \/ −90 {2}2\.2:1\n/);
  assert.deepEqual(photographier(clone), avant);

  // Ce que tiendraient un cook qui commite et un rapatriement de la base :
  // l'observation répond quand même, et les leur laisse.
  const verrous = [".git/index.lock", `.git/refs/remotes/origin/${BASE}.lock`];
  for (const verrou of verrous) writeFileSync(join(clone, verrou), "");
  const tenus = photographier(clone);
  const sousVerrous = await observer(clone);
  assert.equal(sousVerrous.sortie, sortie);
  assert.deepEqual(photographier(clone), tenus);

  for (const verrou of verrous) rmSync(join(clone, verrou));
  assert.equal(git(clone, "for-each-ref"), refs);
  // En dernier : `git status`, lui, récrit l'index.
  assert.equal(git(clone, "status", "--porcelain"), "");
});

test("le journal, s'il est là, dit les compteurs de la dérive : les merges depuis la dernière fermeture et les seuils franchis, lus par le relevé des mesures", async (t) => {
  const clone = depot(t, [{ merge: { "a.txt": lignes(5) } }]);
  const etat = repertoireTemporaire(t);
  const journal = ouvrirJournal(etat, { maintenant: horloge() });
  const noter = (fait: Fait, ticket: number | null = null) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  noter({ type: "drift.configured", payload: { limits: { ...SANS_SEUIL, merges: 2 } } });
  for (const ticket of [17, 18, 19]) noter({ type: "merge.done", payload: { pr: `https://exemple.test/pull/${ticket}`, sha: `sha-${ticket}`, by: "pass", reconciled: false } }, ticket);
  journal.fermer();

  const avec = await observer(clone, { BRIGADE_STATE_DIR: etat });
  assert.match(avec.sortie, /\nlog        3 merges since the last closing \(none in the log\) — 1 threshold crossed, details with `brigade <projet> measures`\n {11}3 merges since the last closing for a threshold of 2\n$/);

  const sans = await observer(clone);
  assert.match(sans.sortie, /\nlog        not read: BRIGADE_STATE_DIR is not set — the drift counters are read with `brigade <projet> measures`\n$/);
  const vide = await observer(clone, { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
  assert.match(vide.sortie, /\nlog        not read: no log in /);
});

test("la commande refuse ce qu'elle ne comprend pas, et dit ce qui lui manque du dépôt", async (t) => {
  const clone = depot(t, [{ merge: { "a.txt": lignes(5) } }]);

  for (const variable of ["BRIGADE_REPO_DIR", "BRIGADE_BASE_BRANCH"]) {
    const appel = appeler(principal, [], { ...env(clone), [variable]: "" });
    assert.equal(await appel.fin, 2);
    assert.match(appel.sortie(), new RegExp(`^brigade : ${variable} is not set\nusage: `));
  }
  const bavard = await observer(clone, {}, ["write"]);
  assert.equal(bavard.code, 2);
  assert.match(bavard.sortie, /^brigade : usage: BRIGADE_REPO_DIR=/);

  const ailleurs = await observer(repertoireTemporaire(t));
  assert.equal(ailleurs.code, 2);
  assert.match(ailleurs.sortie, /^brigade : BRIGADE_REPO_DIR invalid: “.*” is not a git repository\n$/);

  const sansBase = await observer(clone, { BRIGADE_BASE_BRANCH: "inconnue" });
  assert.equal(sansBase.code, 1);
  assert.match(sansBase.sortie, /^brigade : the branch `origin\/inconnue` is not in the clone /);
});

test("`run closing` joue l'observation dans son propre process", async (t) => {
  const scripts: Record<string, string> = JSON.parse(readFileSync(join(import.meta.dirname, "../../package.json"), "utf8")).scripts;
  assert.equal(scripts.closing, "node src/fermeture.ts");
  const clone = depot(t, [{ merge: { "a.txt": lignes(5) } }]);

  const enfant = lancer(t, join(import.meta.dirname, "../../src/fermeture.ts"), [], env(clone));

  assert.equal(await enfant.fin, 0, enfant.sortie());
  assert.match(enfant.sortie(), /^closing    observation of origin\/v2 /);
  assert.match(enfant.sortie(), /\n {11}20 merges {3}\+5 \/ −0 /);
});
