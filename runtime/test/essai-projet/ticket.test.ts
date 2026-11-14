// Le ticket de la déclaration d'essai (#3559) : un projet déjà installé dont la
// base n'a pas de `.brigade/try.json` reçoit de la cuisine un seul ticket qui
// l'ajoute — ni un second au tick suivant, ni aucun une fois le fichier là, ni
// aucun pour un dépôt qui ne dit pas comment il s'essaie. Joué par les ticks
// d'un runtime, sur une base et un GitHub doublés en mémoire.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { IssueDepuis } from "../../src/github.ts";
import type { CauseReveil, Runtime } from "../../src/runtime.ts";
import { brancherTicketDEssai } from "../../src/essai-projet/ticket.ts";
import { repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

type BaseDuProjet = Parameters<typeof brancherTicketDEssai>[1]["depot"];

const rienNeReste = temporaireDuFichier();

const NPM = { "package.json": JSON.stringify({ scripts: { dev: "vite --port 5173" } }) };
const NOTE = "declaration-essai.json";

// Une base : ses fichiers, ou une panne quand `panne` est vrai.
function base(fichiers: Record<string, string>) {
  const etat = { fichiers: { ...fichiers }, panne: false };
  const lire = (chemin: string) => {
    if (etat.panne) throw new Error("git ls-tree : origin/v2 inconnue");
    return etat.fichiers[chemin] ?? null;
  };
  const depot: BaseDuProjet = { base: "v2", lire, fichiers: () => (lire(""), Object.keys(etat.fichiers)) };
  return { etat, depot };
}

function github() {
  const creees: Array<{ titre: string; corps: string; labels: string[] }> = [];
  const etat = { panne: false, recentes: [] as IssueDepuis[] };
  return {
    creees,
    etat,
    github: {
      async creerIssue(issue: { titre: string; corps: string; labels: string[] }) {
        if (etat.panne) throw new Error("gh: HTTP 502");
        creees.push(issue);
        return 40 + creees.length;
      },
      async issuesDepuis() {
        return etat.recentes;
      },
    },
  };
}

// Un runtime dont le test tire les ticks un à un. Base et GitHub sont en
// mémoire : un passage ne tient qu'en microtâches, toutes vidées avant le
// `setImmediate` qui suit le tick — le passage est fini, sans horloge.
function cuisine(t: TestContext, depot: BaseDuProjet, gh: ReturnType<typeof github>["github"]) {
  const repertoireEtat = repertoireTemporaire(t);
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const avertissements: string[] = [];
  const runtime = { surReveil: (ecouter: (cause: CauseReveil) => void) => (ecouteurs.push(ecouter), () => {}) } as unknown as Runtime;
  brancherTicketDEssai(runtime, { projet: "demo", repertoireEtat, depot, github: gh, avertir: (ligne) => void avertissements.push(ligne) });
  const tick = async () => {
    for (const ecouter of ecouteurs) ecouter("tick");
    await new Promise((resoudre) => setImmediate(resoudre));
  };
  return { repertoireEtat, avertissements, tick };
}

const note = (repertoireEtat: string) => (existsSync(join(repertoireEtat, NOTE)) ? JSON.parse(readFileSync(join(repertoireEtat, NOTE), "utf8")) : null);

test("a set-up project without `.brigade/try.json` gets exactly one ticket, with `fire`, and a second pass files no other", async (t) => {
  const { depot } = base(NPM);
  const gh = github();
  const c = cuisine(t, depot, gh.github);
  await c.tick();
  assert.equal(gh.creees.length, 1);
  const [cree] = gh.creees;
  assert.ok(cree);
  assert.match(cree.titre, /\.brigade\/try\.json/);
  assert.deepEqual(cree.labels, ["fire", "model:sonnet", "effort:medium"]);
  assert.match(cree.corps, /<!-- brigade:try-json demo -->/);
  assert.match(cree.corps, /"command": "npm install && npm run dev"/);
  assert.match(cree.corps, /"url": "http:\/\/localhost:5173"/);
  assert.match(cree.corps, /## Acceptance criteria/);
  assert.equal(note(c.repertoireEtat).ticket, 41);
  assert.ok(c.avertissements.some((ligne) => /#41 opened/.test(ligne)), c.avertissements.join("\n"));
  // Le ticket ouvert : le tick suivant n'en ouvre pas d'autre.
  await c.tick();
  await c.tick();
  assert.equal(gh.creees.length, 1);
});

test("once the file is on the base, no ticket is filed", async (t) => {
  const { depot } = base({ ...NPM, ".brigade/try.json": '{"command":"npm run dev"}\n' });
  const gh = github();
  const c = cuisine(t, depot, gh.github);
  await c.tick();
  await c.tick();
  assert.equal(gh.creees.length, 0);
  assert.equal(note(c.repertoireEtat), null);
});

test("a project with no readable way to run it: no ticket, no note", async (t) => {
  const { depot } = base({ "README.md": "# notes\n" });
  const gh = github();
  const c = cuisine(t, depot, gh.github);
  await c.tick();
  assert.equal(gh.creees.length, 0);
  assert.equal(note(c.repertoireEtat), null);
});

test("a project that cannot be tried gets a ticket proposing `tryable: false` with its reason", async (t) => {
  const { depot } = base({ "app/src/main/AndroidManifest.xml": "<manifest/>", "app/build.gradle": "apply plugin: 'com.android.application'\n" });
  const gh = github();
  const c = cuisine(t, depot, gh.github);
  await c.tick();
  assert.equal(gh.creees.length, 1);
  assert.match(gh.creees[0]?.corps ?? "", /"tryable": false,\s*"reason": "An Android app/);
});

test("a base that cannot be read files nothing, says it once, and the next tick retries", async (t) => {
  const { etat, depot } = base(NPM);
  etat.panne = true;
  const gh = github();
  const c = cuisine(t, depot, gh.github);
  await c.tick();
  await c.tick();
  assert.equal(gh.creees.length, 0);
  assert.equal(note(c.repertoireEtat), null);
  assert.deepEqual(c.avertissements, ["try declaration — not read, no ticket opened: git ls-tree : origin/v2 inconnue"]);
  etat.panne = false;
  await c.tick();
  assert.equal(gh.creees.length, 1);
});

test("an unreadable note is not read empty and overwritten: no ticket", async (t) => {
  const { depot } = base(NPM);
  const gh = github();
  const c = cuisine(t, depot, gh.github);
  writeFileSync(join(c.repertoireEtat, NOTE), "{ pas une note");
  await c.tick();
  assert.equal(gh.creees.length, 0);
  assert.equal(readFileSync(join(c.repertoireEtat, NOTE), "utf8"), "{ pas une note");
  assert.match(c.avertissements.join("\n"), /not read, no ticket opened/);
});

test("GitHub failing on creation: the announcement is kept, and the issue created meanwhile is found by its mark instead of a second one", async (t) => {
  const { depot } = base(NPM);
  const gh = github();
  gh.etat.panne = true;
  const c = cuisine(t, depot, gh.github);
  await c.tick();
  assert.equal(gh.creees.length, 0);
  assert.equal(typeof note(c.repertoireEtat).annonceLe, "string");
  assert.match(c.avertissements.join("\n"), /ticket not opened, retried on the next tick: gh: HTTP 502/);
  // La réponse s'était perdue : l'issue existe, de confiance, avec sa marque.
  gh.etat.panne = false;
  gh.etat.recentes = [{ number: 77, body: "<!-- brigade:try-json demo -->\n\n## Context", association: "OWNER" } as IssueDepuis];
  await c.tick();
  assert.equal(gh.creees.length, 0);
  assert.equal(note(c.repertoireEtat).ticket, 77);
});

test("an issue carrying the mark from an untrusted author is not taken for the kitchen's", async (t) => {
  const { depot } = base(NPM);
  const gh = github();
  gh.etat.panne = true;
  const c = cuisine(t, depot, gh.github);
  await c.tick();
  gh.etat.panne = false;
  gh.etat.recentes = [{ number: 78, body: "<!-- brigade:try-json demo -->", association: "NONE" } as IssueDepuis];
  await c.tick();
  assert.equal(gh.creees.length, 1);
  assert.equal(note(c.repertoireEtat).ticket, 41);
});

test("ticket.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
