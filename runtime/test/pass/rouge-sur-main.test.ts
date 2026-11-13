// Rouge sur main, vert sur la branche (#3466) : les tests qu'une livraison
// ajoute sont rejoués seuls, par le vrai lanceur de Node, sur un checkout de la
// base et sur la branche — ici deux dossiers temporaires. Puis par la station :
// sa relecture, son verdict sur la PR et son renvoi.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { jouerOutil } from "../../src/gates.ts";
import { consigneDeRelecture, lireRelecture } from "../../src/reviewer.ts";
import { etatDuCritere, journalDeLaPreuve, lignesDesCriteres, ligneDeLaPreuve, motifDuRenvoi, nomsDesCas, prouver, RESULTAT_TAP, resultatsTap, testsAjoutes, vertsSurLaBase, type Preuve } from "../../src/pass/rouge-sur-main.ts";
import { priseDeLaStation } from "../../src/brigade-github.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";

const BOGUE = "export const somme = (a: number, b: number) => a - b;\n";
const CORRIGE = "export const somme = (a: number, b: number) => a + b;\n";
const entete = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { somme } from "./somme.ts";\n';
const ROUGE_SUR_MAIN = 'test("adds two numbers", () => assert.equal(somme(2, 3), 5));\n';
const VERT_SUR_MAIN = 'test("somme is a function", () => assert.equal(typeof somme, "function"));\n';

// Lancé d'un lanceur de tests, `node` lui parlerait au lieu d'écrire son TAP.
const { NODE_TEST_CONTEXT: _contexte, ...sansContexte } = process.env;

// Un projet : `fichiers` écrits sous `dossier`.
function projet(dossier: string, fichiers: Record<string, string>) {
  for (const [chemin, contenu] of Object.entries({ "package.json": '{"type":"module"}\n', ...fichiers })) {
    mkdirSync(join(dossier, chemin, ".."), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
}

// La base porte `somme` boguée ; la branche la corrige et ajoute `tests`.
function livraison(t: TestContext, tests: string, base: Record<string, string> = {}) {
  const racine = mkdtempSync(join(tmpdir(), "rouge-sur-main-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const branche = join(racine, "branche");
  projet(branche, { "lib/somme.ts": CORRIGE, "lib/somme.test.ts": entete + tests });
  const jetes: string[] = [];
  const joues: string[][] = [];
  const outils = {
    fichiers: ["lib/somme.ts", "lib/somme.test.ts"],
    branche,
    base: async () => {
      const worktree = join(racine, "base");
      projet(worktree, { "lib/somme.ts": BOGUE, ...base });
      return { worktree, jeter: () => void jetes.push(worktree) };
    },
    jouer: async (worktree: string, dossier: string, args: string[]) => {
      joues.push(args);
      const { code, retenues } = await jouerOutil("bash", ["-c", 'cd -- "$1" && shift && exec "$@"', "rejeu", dossier, process.execPath, ...args], { worktree, ticket: 1, env: sansContexte, delaiMs: 2_000 }, RESULTAT_TAP);
      return { code, lignes: retenues };
    },
  };
  return { outils, jetes, joues };
}

test("the names of a test file's cases are read as written, a built name is not", () => {
  assert.deepEqual(nomsDesCas('test("a", () => {});\nit(\'b \\\'q\\\'\', f);\ntest.skip(`c`, f);\ntest(`d ${x}`, f);\ndescribe("s", f);'), ["a", "b 'q'", "c"]);
});

test("the added tests: every case of a new file, only the new cases of a file that existed, and the helpers under the tests copied with them", () => {
  const base: Record<string, string> = { "test/vieux.test.ts": 'test("old", f);' };
  const branche: Record<string, string> = { "test/vieux.test.ts": 'test("old", f);\ntest("new", f);', "test/neuf.test.ts": 'test("x", f);', "test/aides/doublure.ts": "export {}", "src/a.ts": "" };
  const ajoutes = testsAjoutes(["test/vieux.test.ts", "test/neuf.test.ts", "test/aides/doublure.ts", "src/a.ts", "test/retire.test.ts"], { base: (f) => base[f] ?? null, branche: (f) => branche[f] ?? null });
  assert.deepEqual(ajoutes.fichiers, [
    { fichier: "test/vieux.test.ts", neuf: false, unites: [{ fichier: "test/vieux.test.ts", nom: "new" }] },
    { fichier: "test/neuf.test.ts", neuf: true, unites: [{ fichier: "test/neuf.test.ts", nom: "x" }] },
  ]);
  assert.deepEqual(ajoutes.aCopier, ["test/vieux.test.ts", "test/neuf.test.ts", "test/aides/doublure.ts"]);
});

test("the TAP results: a case passes only if it passes everywhere, a skipped case says nothing", () => {
  const lus = resultatsTap(["ok 1 - a \\# b", "    not ok 2 - c", "ok 3 - c", "ok 4 - d # SKIP", "# pass 2"]);
  assert.deepEqual([...lus], [["a # b", true], ["c", false]]);
});

test("all the added tests red on main and green on the branch: accepted, and the log lists only them as replayed", async (t) => {
  const { outils, jetes, joues } = livraison(t, ROUGE_SUR_MAIN);
  const preuve = await prouver(["fire"], outils);
  assert.deepEqual(preuve, { rejeux: [{ fichier: "lib/somme.test.ts", nom: "adds two numbers", main: false, branche: true }] });
  assert.deepEqual(vertsSurLaBase(preuve), []);
  // Un fichier neuf se joue seul, sans motif de nom ; rien d'autre n'est joué.
  assert.deepEqual(joues, [
    ["--test", "--test-reporter=tap", "--test-force-exit", "lib/somme.test.ts"],
    ["--test", "--test-reporter=tap", "--test-force-exit", "lib/somme.test.ts"],
  ]);
  assert.equal(jetes.length, 1, "the throwaway checkout of the base is thrown away");
  assert.equal(journalDeLaPreuve(preuve, "main"), "Red on main, green on the branch: only the tests this delivery adds were replayed on `main`, not the suite — `adds two numbers` (`lib/somme.test.ts`) red on `main`, green on the branch");
  assert.equal(ligneDeLaPreuve(preuve, "main"), "Red on main, green on the branch: 1 added test replayed alone on `main` — 1 red on `main` and green on the branch.");
});

test("one added test already green on main: sent back, and the reason names it", async (t) => {
  const { outils } = livraison(t, ROUGE_SUR_MAIN + VERT_SUR_MAIN);
  const preuve = await prouver([], outils);
  const verts = vertsSurLaBase(preuve);
  assert.deepEqual(verts.map(({ nom }) => nom), ["somme is a function"]);
  const [motif] = motifDuRenvoi(verts, "main");
  assert.match(motif ?? "", /^- \*\*Blocking\*\*: Red on main, green on the branch — the added test `somme is a function` \(`lib\/somme\.test\.ts`\) already passes on `main`/);
});

test("a case added to a test file that existed is replayed alone on main, by its name", async (t) => {
  const { outils, joues } = livraison(t, ROUGE_SUR_MAIN + VERT_SUR_MAIN, { "lib/somme.test.ts": entete + VERT_SUR_MAIN });
  const preuve = await prouver([], outils);
  assert.deepEqual(preuve, { rejeux: [{ fichier: "lib/somme.test.ts", nom: "adds two numbers", main: false, branche: true }] });
  assert.ok(joues.every((args) => args.includes("--test-name-pattern=^adds two numbers$")));
});

test("a `tech` ticket: nothing is replayed, and the pass says so in a single line", async (t) => {
  const { outils, joues } = livraison(t, VERT_SUR_MAIN);
  const preuve = await prouver(["fire", "tech"], outils);
  assert.deepEqual(preuve, { exempte: true });
  assert.deepEqual(joues, []);
  const ligne = ligneDeLaPreuve(preuve, "main");
  assert.equal(ligne, "Red on main, green on the branch: not replayed — a `tech` ticket is exempt.");
  assert.equal(journalDeLaPreuve(preuve, "main"), ligne);
});

test("a checkout of the base that cannot be made: nothing proved, nothing sent back, and the line says why", async (t) => {
  const { outils } = livraison(t, VERT_SUR_MAIN);
  const preuve = await prouver([], { ...outils, base: async () => Promise.reject(new Error("git is down")) });
  assert.deepEqual(preuve, { injouable: "no throwaway checkout of the base: git is down" });
  assert.deepEqual(vertsSurLaBase(preuve), []);
});

test("each acceptance criterion is covered by a test red on main and green on the branch, judged by the review alone, or covered by nothing", () => {
  const preuve: Preuve = { rejeux: [{ fichier: "a.test.ts", nom: "adds", main: false, branche: true }, { fichier: "a.test.ts", nom: "green", main: true, branche: true }] };
  assert.deepEqual(etatDuCritere({ tests: ["adds"], relecture: false }, preuve), { etat: "test", tests: [{ fichier: "a.test.ts", nom: "adds", main: false, branche: true }] });
  // Un test qui n'a rien prouvé ne couvre pas son critère.
  assert.deepEqual(etatDuCritere({ tests: ["green"], relecture: true }, preuve), { etat: "relecture" });
  assert.deepEqual(etatDuCritere({ tests: ["green"], relecture: false }, preuve), { etat: "rien" });
  assert.deepEqual(etatDuCritere(undefined, preuve), { etat: "rien" });
  assert.deepEqual(lignesDesCriteres(["It adds", "The button is blue", "It is fast"], [{ tests: ["adds"], relecture: false }, { tests: [], relecture: true }, { tests: [], relecture: false }], preuve, "main"), [
    "- It adds — **covered by a test red on `main` and green on the branch: `adds` (`a.test.ts`)**",
    "- The button is blue — **judged by the review alone**",
    "- It is fast — **covered by nothing**",
  ]);
});

test("the review is given the criteria, and its answer must map each of them", () => {
  const consigne = consigneDeRelecture({ depot: "o/r", base: "main", ticket: { number: 1, title: "t", body: "b" }, commentaires: [], compteRendu: null, diff: { fichiers: ["a.ts"], texte: "+a" }, criteres: ["It adds", "It is blue"] });
  assert.match(consigne, /## Les critères d'acceptation[\s\S]*1\. It adds\n2\. It is blue/);
  const reponse = (criteres: unknown) => JSON.stringify({ verdict: "vert", resume: "ok", constats: [], criteres });
  assert.deepEqual(lireRelecture(reponse([{ critere: 2, tests: [], relecture: true }, { critere: 1, tests: ["adds"], relecture: false }]), null, 2), {
    relecture: { verdict: "green", summary: "ok", findings: [], criteria: [{ tests: ["adds"], relecture: false }, { tests: [], relecture: true }] },
  });
  assert.deepEqual(lireRelecture(reponse([{ critere: 1, tests: [], relecture: true }]), null, 2), { illisible: "criteres : le critère 2 n'a pas d'entrée" });
  assert.ok("illisible" in lireRelecture(reponse(undefined), null, 2));
  // Sans critère donné, rien n'est exigé.
  assert.deepEqual(lireRelecture(reponse(undefined)), { relecture: { verdict: "green", summary: "ok", findings: [] } });
});

// La station : un cook qui livre, puis la pass qui rejoue, relit et juge.
async function parLaStation(t: TestContext, tests: string, labels = ["fire", "model:opus", "effort:high"]) {
  const repertoire = mkdtempSync(join(tmpdir(), "rouge-sur-main-station-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  projet(join(repertoire, "review-11-github"), { "lib/somme.ts": CORRIGE, "lib/somme.test.ts": entete + tests });
  const faux = new FauxGitHub();
  faux.feu(11, labels, "## Acceptance criteria\n\n- It adds two numbers\n- The doc says so\n- It is fast");
  const journal: string[] = [];
  const jetes: string[] = [];
  const lancer: Lancer = ({ args, flux }) => {
    const reviewer = args.includes("--tools");
    const relecture = { verdict: "vert", resume: "Looks right.", constats: [], criteres: [{ critere: 1, tests: ["adds two numbers"], relecture: false }, { critere: 2, tests: [], relecture: true }, { critere: 3, tests: [], relecture: false }] };
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: reviewer ? JSON.stringify(relecture) : "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => ["lib/somme.ts", "lib/somme.test.ts"],
      diff: () => "diff --git a/lib/somme.ts b/lib/somme.ts\n+x\n",
      essayer: async (nom) => {
        projet(join(repertoire, nom), { "lib/somme.ts": BOGUE });
        return join(repertoire, nom);
      },
      jeter: (nom) => void jetes.push(nom ?? ""),
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: { PATH: process.env.PATH },
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: (texte) => void journal.push(texte),
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 4 && faux.mergee(11) === undefined && !(faux.commentaires.get(11) ?? []).some((c) => c.body.startsWith("<!-- brigade:renvoi")); tour += 1) {
    await station.tour();
    await station.calme();
  }
  const verdict = [...faux.commentaires.values()].flat().find((c) => c.body.startsWith("<!-- brigade:verdict"))?.body ?? "";
  return { faux, journal, jetes, verdict, ticket: (faux.commentaires.get(11) ?? []).map((c) => c.body).join("\n") };
}

test("through the station: added tests red on main and green on the branch, the delivery is merged, its log lists the replayed tests, and its verdict on the PR gives one line per criterion", async (t) => {
  const { faux, journal, jetes, verdict } = await parLaStation(t, ROUGE_SUR_MAIN);
  assert.equal(faux.mergee(11)?.mergeePar, "box");
  assert.deepEqual(jetes, ["rouge-sur-main-11", "rouge-sur-main-11"], "a leftover checkout is thrown away first, the new one after the replay");
  assert.ok(journal.includes("brigade : #11 sur box — Red on main, green on the branch: only the tests this delivery adds were replayed on `main`, not the suite — `adds two numbers` (`lib/somme.test.ts`) red on `main`, green on the branch"), journal.join("\n"));
  assert.match(verdict, /verdict=approve[\s\S]*Looks right\.\n\nRed on main, green on the branch: 1 added test replayed alone on `main` — 1 red on `main` and green on the branch\.\n\nAcceptance criteria:\n- It adds two numbers — \*\*covered by a test red on `main` and green on the branch: `adds two numbers` \(`lib\/somme\.test\.ts`\)\*\*\n- The doc says so — \*\*judged by the review alone\*\*\n- It is fast — \*\*covered by nothing\*\*$/);
});

test("through the station: an added test already green on main sends the delivery back to its cook, the reason naming it", async (t) => {
  const { faux, verdict, ticket } = await parLaStation(t, ROUGE_SUR_MAIN + VERT_SUR_MAIN);
  assert.equal(faux.mergee(11), undefined);
  assert.match(verdict, /verdict=request-changes[\s\S]*the added test `somme is a function` \(`lib\/somme\.test\.ts`\) already passes on `main`/);
  assert.match(ticket, /brigade:renvoi n=1[\s\S]*sent back to a cook \(1\/2\) — the review requested changes: [\s\S]*`somme is a function`/);
});

test("through the station: a `tech` ticket is merged without any replay, and the pass says so in a single line", async (t) => {
  const { faux, journal, jetes, verdict } = await parLaStation(t, VERT_SUR_MAIN, ["fire", "model:opus", "effort:high", "tech"]);
  assert.equal(faux.mergee(11)?.mergeePar, "box");
  assert.deepEqual(jetes, [], "no checkout of the base is made");
  assert.deepEqual(journal.filter((ligne) => ligne.includes("Red on main")), ["brigade : #11 sur box — Red on main, green on the branch: not replayed — a `tech` ticket is exempt."]);
  assert.match(verdict, /\nRed on main, green on the branch: not replayed — a `tech` ticket is exempt\.\n/);
});
