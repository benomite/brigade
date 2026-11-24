// Les mutations attrapées (#3727) : la pass mute les seules lignes de code que
// la livraison change, joue ses tests gelés contre chaque mutant, et renvoie
// la livraison dont un mutant survit, en nommant son fichier et sa ligne.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { jouerOutil } from "../../src/gates.ts";
import { RESULTAT_TAP, type Preuve } from "../../src/pass/rouge-sur-main.ts";
import { ligneDesMutations, motifDesMutations, muter, resumeDesMutations } from "../../src/passe-mutations/mutations.ts";

type OutilsDesMutations = Parameters<typeof muter>[1];
import { FauxGitHub, fauxClient, STATION_DU_DEPOT } from "../faux-github.ts";

const BOGUE = "export const somme = (a: number, b: number) => a - b;\n";
const CORRIGE = "export const somme = (a: number, b: number) => a + b;\nexport const positif = (n: number) => n > 0;\n";
const entete = 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { positif, somme } from "./calcul.ts";\n';
const ADDITION = 'test("adds two numbers", () => assert.equal(somme(2, 3), 5));\n';
const POSITIF = 'test("tells a positive number", () => { assert.equal(positif(2), true); assert.equal(positif(-1), false); });\n';
// Le diff de la livraison : `somme` corrigée, `positif` ajoutée, et ses tests.
const DIFF = [
  "diff --git a/lib/calcul.ts b/lib/calcul.ts",
  "index 1111111..2222222 100644",
  "--- a/lib/calcul.ts",
  "+++ b/lib/calcul.ts",
  "@@ -1 +1,2 @@",
  "-export const somme = (a: number, b: number) => a - b;",
  "+export const somme = (a: number, b: number) => a + b;",
  "+export const positif = (n: number) => n > 0;",
  "diff --git a/lib/calcul.test.ts b/lib/calcul.test.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/lib/calcul.test.ts",
  "@@ -0,0 +1,5 @@",
  '+import assert from "node:assert/strict";',
  '+test("adds two numbers", () => assert.equal(somme(2, 3), 5 + 0));',
  "",
].join("\n");
const DOC = ["diff --git a/README.md b/README.md", "--- a/README.md", "+++ b/README.md", "@@ -1 +1,2 @@", " # Calcul", "+It adds && compares numbers, true.", ""].join("\n");

// Lancé d'un lanceur de tests, `node` lui parlerait au lieu d'écrire son TAP.
const { NODE_TEST_CONTEXT: _contexte, ...sansContexte } = process.env;

function projet(dossier: string, fichiers: Record<string, string>) {
  for (const [chemin, contenu] of Object.entries({ "package.json": '{"type":"module"}\n', ...fichiers })) {
    mkdirSync(join(dossier, chemin, ".."), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
}

const gele = (nom: string) => ({ fichier: "lib/calcul.test.ts", nom, main: false, branche: true });

// La branche corrige `somme`, ajoute `positif` et `tests` ; chaque checkout jetable porte la base.
function livraison(t: TestContext, tests: string): { outils: OutilsDesMutations; checkouts: string[]; jetes: string[] } {
  const racine = mkdtempSync(join(tmpdir(), "mutations-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const branche = join(racine, "branche");
  projet(branche, { "lib/calcul.ts": CORRIGE, "lib/calcul.test.ts": entete + tests });
  const checkouts: string[] = [];
  const jetes: string[] = [];
  return {
    checkouts,
    jetes,
    outils: {
      fichiers: ["lib/calcul.ts", "lib/calcul.test.ts"],
      diff: DIFF,
      branche,
      checkout: async (rang) => {
        const worktree = join(racine, `base-${rang}`);
        checkouts.push(worktree);
        projet(worktree, { "lib/calcul.ts": BOGUE });
        return { worktree, jeter: () => void jetes.push(worktree) };
      },
      jouer: async (worktree, dossier, args, signal) => {
        const { code, retenues } = await jouerOutil("bash", ["-c", 'cd -- "$1" && shift && exec "$@"', "mutant", dossier, process.execPath, ...args], { worktree, ticket: 1, env: sansContexte, delaiMs: 2_000, signal }, RESULTAT_TAP);
        return { code, lignes: retenues };
      },
      budgetMs: 60_000,
      enParallele: 4,
    },
  };
}

test("only the code lines the diff adds are mutated, by their number on the branch, outside their strings and comments", async (t) => {
  const { outils } = livraison(t, ADDITION);
  const diff = [
    ...DIFF.split("\n").slice(0, 8),
    "diff --git a/lib/autre.ts b/lib/autre.ts",
    "--- a/lib/autre.ts",
    "+++ b/lib/autre.ts",
    "@@ -1,2 +1,5 @@",
    " export const a = 1;",
    '+  log("a && b"); return n > 0;',
    "+  run(); // a && b",
    '+import { b } from "./b.ts";',
    " export const c = a === 1;",
    ...DIFF.split("\n").slice(8),
  ].join("\n");
  writeFileSync(join(outils.branche, "lib/autre.ts"), 'export const a = 1;\n  log("a && b"); return n > 0;\n  run(); // a && b\nimport { b } from "./b.ts";\nexport const c = a === 1;\n');
  // Chaque mutant est tué : seuls comptent ici ceux que la pass fabrique.
  const mutations = await muter({ rejeux: [gele("adds two numbers")] }, { ...outils, fichiers: [...outils.fichiers, "lib/autre.ts"], diff, jouer: async () => ({ code: 1, lignes: ["not ok 1 - adds two numbers"] }) });
  assert.ok("mutants" in mutations);
  assert.deepEqual(
    mutations.mutants.map(({ fichier, ligne, avant, apres, texte }) => ({ fichier, ligne, avant, apres, texte })),
    [
      { fichier: "lib/calcul.ts", ligne: 1, avant: "+", apres: "-", texte: "export const somme = (a: number, b: number) => a - b;" },
      { fichier: "lib/calcul.ts", ligne: 2, avant: ">", apres: "<=", texte: "export const positif = (n: number) => n <= 0;" },
      { fichier: "lib/autre.ts", ligne: 2, avant: ">", apres: "<=", texte: '  log("a && b"); return n <= 0;' },
    ],
  );
  assert.equal(ligneDesMutations(mutations), "Mutation check: 3 of 3 mutations caught — only the lines this delivery changes are mutated, each mutant run against the tests it adds.");
});

test("tests that let a mutation through: the line says how many were caught, and the reason names the file and line of the surviving one", async (t) => {
  const { outils, jetes, checkouts } = livraison(t, ADDITION);
  const preuve: Preuve = { rejeux: [gele("adds two numbers")] };
  const mutations = await muter(preuve, outils);
  assert.equal(ligneDesMutations(mutations), "Mutation check: 1 of 2 mutations caught — only the lines this delivery changes are mutated, each mutant run against the tests it adds.");
  assert.deepEqual(motifDesMutations(mutations), [
    "- **Blocking**: Mutation check — the mutation of `lib/calcul.ts:2` (`>` → `<=`) survived: every test this delivery adds still passes with that line changed. Add or sharpen a test that fails when it changes.",
  ]);
  // L'enregistrement du critère que couvre le test gelé : ses mutants tués, et les lignes des autres.
  assert.equal(resumeDesMutations(mutations, 2, [{ tests: ["adds two numbers"], relecture: false }, { tests: [], relecture: true }], preuve).split("\n")[1], "- Criterion 1, `lib/calcul.test.ts`: 1 of 2 mutations caught (surviving: `lib/calcul.ts:2`)");
  assert.deepEqual(jetes.sort(), checkouts.sort(), "every throwaway checkout is thrown away");
});

test("tests that kill every mutation: Y of Y mutations caught, nothing sent back", async (t) => {
  const { outils } = livraison(t, ADDITION + POSITIF);
  const mutations = await muter({ rejeux: [gele("adds two numbers"), gele("tells a positive number")] }, outils);
  assert.match(ligneDesMutations(mutations), /^Mutation check: 2 of 2 mutations caught/);
  assert.deepEqual(motifDesMutations(mutations), []);
});

test("a doc-only delivery: 0 of 0 mutations caught, no checkout made, nothing sent back", async (t) => {
  const { outils, checkouts } = livraison(t, ADDITION);
  const mutations = await muter({ rejeux: [gele("adds two numbers")] }, { ...outils, fichiers: ["README.md"], diff: DOC });
  assert.equal(ligneDesMutations(mutations), "Mutation check: 0 of 0 mutations caught — the delivery changes no line of code to mutate.");
  assert.deepEqual(motifDesMutations(mutations), []);
  assert.deepEqual(checkouts, []);
});

test("a delivery that changes only tooling (scripts/, app/packaging/, .claude/): 0 of 0 mutations caught, nothing sent back", async (t) => {
  const { outils, checkouts } = livraison(t, ADDITION);
  const outillage = ["diff --git a/scripts/outil.ts b/scripts/outil.ts", "--- a/scripts/outil.ts", "+++ b/scripts/outil.ts", "@@ -1 +1,2 @@", " export const a = 1;", "+export const actif = (n: number) => n > 0;", ""].join("\n");
  const mutations = await muter({ rejeux: [gele("adds two numbers")] }, { ...outils, fichiers: ["scripts/outil.ts"], diff: outillage });
  assert.equal(ligneDesMutations(mutations), "Mutation check: 0 of 0 mutations caught — the delivery changes no line of code to mutate.");
  assert.deepEqual(motifDesMutations(mutations), []);
  assert.deepEqual(checkouts, []);
});

test("the time budget runs out: the running mutants are stopped and the line says so, instead of hanging", async (t) => {
  const { outils, jetes } = livraison(t, ADDITION);
  const pendu: OutilsDesMutations["jouer"] = (_worktree, _dossier, _args, signal) => new Promise((resolve) => signal.addEventListener("abort", () => resolve({ code: null, lignes: [] })));
  const mutations = await muter({ rejeux: [gele("adds two numbers")] }, { ...outils, jouer: pendu, budgetMs: 50 });
  assert.equal(ligneDesMutations(mutations), "Mutation check: 0 of 0 mutations caught — the time budget of 0.05 s ran out, 2 of the 2 mutants of the changed lines not run.");
  assert.deepEqual(motifDesMutations(mutations), [], "a mutant not run does not send the delivery back");
  assert.equal(jetes.length, 2);
});

test("no throwaway checkout can be made, or no added test to run: said in the line, nothing sent back", async (t) => {
  const { outils } = livraison(t, ADDITION);
  const panne = await muter({ rejeux: [gele("adds two numbers")] }, { ...outils, checkout: () => Promise.reject(new Error("git is down")) });
  assert.equal(ligneDesMutations(panne), "Mutation check: the mutants could not be run — git is down.");
  assert.deepEqual(motifDesMutations(panne), []);
  const sansTest = await muter({ sansTest: true }, outils);
  assert.equal(ligneDesMutations(sansTest), "Mutation check: 2 mutants on the changed lines, not run — the delivery adds no test green on the branch to run them against.");
});

// La station : la pass prouve, mute, relit et juge la livraison du ticket 11.
async function parLaStation(t: TestContext, tests: string, diff = DIFF) {
  const repertoire = mkdtempSync(join(tmpdir(), "mutations-station-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const fichiers = diff === DIFF ? ["lib/calcul.ts", "lib/calcul.test.ts"] : ["README.md"];
  projet(join(repertoire, "review-11-github"), { "lib/calcul.ts": CORRIGE, "lib/calcul.test.ts": entete + tests, "README.md": "# Calcul\nIt adds && compares numbers, true.\n" });
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high"], "## Acceptance criteria\n\n- It adds two numbers\n- It tells a positive number");
  const journal: string[] = [];
  const lancer: Lancer = ({ args, flux }) => {
    const reviewer = args.includes("--tools");
    const relecture = { verdict: "vert", resume: "Looks right.", constats: [], criteres: [{ critere: 1, tests: ["adds two numbers"], relecture: false }, { critere: 2, tests: ["tells a positive number"], relecture: false }] };
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: reviewer ? JSON.stringify(relecture) : "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => fichiers,
      diff: () => diff,
      essayer: async (nom) => {
        projet(join(repertoire, nom), { "lib/calcul.ts": BOGUE, "README.md": "# Calcul\n" });
        return join(repertoire, nom);
      },
      jeter: (nom) => void (nom === undefined || rmSync(join(repertoire, nom), { recursive: true, force: true })),
    },
    env: { PATH: process.env.PATH },
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
  return { faux, journal, verdict, ticket: (faux.commentaires.get(11) ?? []).map((c) => c.body).join("\n") };
}

test("through the station: a mutation the added tests let through sends the delivery back, the reason naming its file and line", async (t) => {
  const { faux, verdict, ticket, journal } = await parLaStation(t, ADDITION);
  assert.equal(faux.mergee(11), undefined);
  assert.match(verdict, /verdict=request-changes[\s\S]*Mutation check — the mutation of `lib\/calcul\.ts:2` \(`>` → `<=`\) survived/);
  assert.match(verdict, /\nMutation check: 1 of 2 mutations caught/);
  assert.match(verdict, /\n- Criterion 1, `lib\/calcul\.test\.ts`: 1 of 2 mutations caught \(surviving: `lib\/calcul\.ts:2`\)/);
  assert.match(ticket, /brigade:renvoi n=1[\s\S]*`lib\/calcul\.ts:2`/);
  assert.ok(journal.some((ligne) => ligne === "brigade : #11 sur box — Mutation check: 1 of 2 mutations caught — only the lines this delivery changes are mutated, each mutant run against the tests it adds."), journal.join("\n"));
});

test("through the station: added tests that kill every mutation, the delivery is merged and its verdict says Y of Y mutations caught", async (t) => {
  const { faux, verdict } = await parLaStation(t, ADDITION + POSITIF);
  assert.equal(faux.mergee(11)?.mergeePar, "box");
  assert.match(verdict, /verdict=approve[\s\S]*\nMutation check: 2 of 2 mutations caught/);
});

test("through the station: a doc-only delivery reports 0 of 0 mutations caught and is not sent back", async (t) => {
  const { faux, verdict } = await parLaStation(t, ADDITION, DOC);
  assert.equal(faux.mergee(11)?.mergeePar, "box");
  assert.match(verdict, /verdict=approve[\s\S]*\nMutation check: 0 of 0 mutations caught — the delivery changes no line of code to mutate\.$/);
});
