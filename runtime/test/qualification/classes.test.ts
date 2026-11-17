// La classe de chaque critère (#3740) : avant l'étape « tests written »
// (#3725), le manager classe chaque critère `testable` ou `not-testable`, avec
// la preuve due ; seuls les testables reçoivent un test gelé, la fiche montre
// chaque critère avec sa classe et sa preuve, un ticket sans critère testable
// ne lance pas l'étape, et la pass ne mute que contre des tests gelés (#3727).
// Tout passe par la station (`stationDuDepot`) : seuls GitHub et `claude` sont faux.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { LIGNE_SANS_MUTATION } from "../../src/qualification/classes.ts";
import { LABEL_TESTS_ECRITS } from "../../src/tests-acceptation/etape.ts";
import { lireLesFiches } from "../../src/tests-acceptation/fiche.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 7;
const BRANCHE = `cook/${TICKET}-github`;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const COMPORTEMENT = "Each line shown by `npm run rail` shows the age of its card";
const DOC = "`docs/rail.md` describes that display";
const VISUEL = "The age is shown in grey";
const corps = (criteres: string[]) => ["## Context", "", "The rail.", "", "## Acceptance criteria", "", ...criteres.map((critere) => `- ${critere}`)].join("\n");
// Les premières lignes des consignes du manager, et le marqueur de la fiche.
const MARQUE_DU_CLASSEMENT = "<!-- brigade:classes-consigne -->";
const MARQUE_DES_TESTS = "<!-- brigade:tests-acceptation-consigne -->";
const MARQUE_DES_FICHES = "<!-- brigade:tests-acceptation -->";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;
const classes = (...liste: Array<[string, string]>) => JSON.stringify({ criteria: liste.map(([classe, proof], rang) => ({ id: rang + 1, class: classe, proof })) });

// La station d'un projet sur un vrai dépôt : #TICKET porte `criteres`, le
// manager les classe par `classement`, puis écrit un test par chemin demandé.
function station(t: TestContext, criteres: string[], classement: string) {
  const lieux = depotGit(t);
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, CALIBRE, corps(criteres));
  const consignes = { classes: [] as string[], tests: [] as string[], cooks: [] as string[] };
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    let message = "{}";
    if (entree?.startsWith(MARQUE_DU_CLASSEMENT)) {
      consignes.classes.push(entree);
      message = `Classed.\n${classement}`;
    } else if (entree?.startsWith(MARQUE_DES_TESTS)) {
      consignes.tests.push(entree);
      const chemin = "test/acceptation/critere-1.test.ts";
      mkdirSync(dirname(join(cwd, chemin)), { recursive: true });
      writeFileSync(join(cwd, chemin), `// ${chemin}\n`);
      message = JSON.stringify({ tests: [chemin] });
    } else if (!args.includes("--tools")) {
      consignes.cooks.push(entree ?? "");
      writeFileSync(join(cwd, "rail.md"), "The rail.\n");
      git(cwd, "add", "rail.md");
      git(cwd, "commit", "-q", "-m", "docs: the rail");
      message = "Done.\n<livrable>\nThe rail.\n</livrable>";
    }
    writeFileSync(flux, RENDU(message));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertissements: string[] = [];
  const ouvrir = () => {
    const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, base: BASE, github: fauxClient(faux), depot, testsAcceptation: () => ({ model: "opus", effort: "medium" }), classesDesCriteres: () => ({ model: "opus", effort: "medium" }), flux: repertoireTemporaire(t), lancer, avertir: (texte) => void avertissements.push(texte) });
    if ("refus" in ouverte) throw new Error(ouverte.refus);
    return async () => {
      await ouverte.tour();
      await ouverte.calme();
    };
  };
  const fiche = () => (faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.startsWith(MARQUE_DES_FICHES)).map((c) => c.body);
  const commits = () => git(lieux.origine, "rev-list", "--reverse", `${BASE}..${BRANCHE}`).split("\n").filter(Boolean);
  return { ...lieux, faux, tour: ouvrir(), ouvrir, consignes, avertissements, fiche, commits };
}

test("a ticket with mixed criteria: only the testable one gets a frozen test, and its sheet lists every criterion with its class and, when not testable, its proof", async (t) => {
  const { faux, origine, tour, consignes, fiche, commits } = station(t, [COMPORTEMENT, DOC, VISUEL], classes(["testable", ""], ["not-testable", "the diff of docs/rail.md"], ["not-testable", "a before/after capture of the rail"]));
  await tour();
  assert.equal(consignes.classes.length, 1, "the manager classes the criteria once");
  assert.equal(consignes.tests.length, 1);
  assert.match(consignes.tests[0] ?? "", /## Les critères\n\n1\. Each line shown by `npm run rail` shows the age of its card\n\n## Ta réponse/, "the tests are asked for the testable criterion alone");
  const [premier] = commits();
  assert.deepEqual(git(origine, "show", "--name-only", "--format=", premier ?? "").split("\n").filter(Boolean), ["test/acceptation/critere-1.test.ts"]);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_TESTS_ECRITS), true);
  const [sheet] = fiche();
  assert.match(sheet ?? "", /\| Criterion \| Class \| Test or proof \|/);
  assert.match(sheet ?? "", /\| Each line shown by `npm run rail` shows the age of its card \| testable \| `test\/acceptation\/critere-1\.test\.ts` \|/);
  assert.match(sheet ?? "", /\| `docs\/rail\.md` describes that display \| not-testable \| proof: the diff of docs\/rail\.md \|/);
  assert.match(sheet ?? "", /\| The age is shown in grey \| not-testable \| proof: a before\/after capture of the rail \|/);
  assert.doesNotMatch(sheet ?? "", /no testable criterion/);
  const lues = lireLesFiches(faux.commentaires.get(TICKET) ?? []);
  assert.ok(lues !== null && "fiches" in lues, JSON.stringify(lues));
  assert.deepEqual(
    lues.fiches.map(({ criterion, class: classe, proof, testPath }) => ({ criterion, class: classe, proof, testPath })),
    [
      { criterion: COMPORTEMENT, class: "testable", proof: undefined, testPath: "test/acceptation/critere-1.test.ts" },
      { criterion: DOC, class: "not-testable", proof: "the diff of docs/rail.md", testPath: "" },
      { criterion: VISUEL, class: "not-testable", proof: "a before/after capture of the rail", testPath: "" },
    ],
  );
  await tour();
  assert.match(consignes.cooks[0] ?? "", /## Proofs your delivery owes[\s\S]*- `docs\/rail\.md` describes that display — proof: the diff of docs\/rail\.md/, "the cook is told the proof each not-testable criterion owes");
});

test("a ticket whose criteria are all not testable: the tests step is not started, its sheet says 'no testable criterion: proof by <kind>', and a cook takes it", async (t) => {
  const { faux, tour, ouvrir, consignes, fiche, avertissements, clone } = station(t, [DOC], classes(["not-testable", "diff"]));
  await tour();
  assert.equal(consignes.classes.length, 1);
  assert.equal(consignes.tests.length, 0, "the manager is not asked to write tests");
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_TESTS_ECRITS), false);
  assert.equal(git(clone, "branch", "--list", "--all", `*${BRANCHE}`), "", "no branch is prepared for frozen tests");
  const [sheet] = fiche();
  assert.match(sheet ?? "", /no testable criterion: proof by diff\b/);
  assert.match(sheet ?? "", /\| `docs\/rail\.md` describes that display \| not-testable \| proof: diff \|/);
  // La station redémarre avant qu'un cook ne le prenne : elle relit la fiche, ne reclasse pas, et le prend.
  const reprise = ouvrir();
  await reprise();
  await reprise();
  assert.equal(consignes.classes.length, 1, "the sheet already says no criterion is testable: the criteria are not classed again");
  assert.equal(fiche().length, 1);
  assert.equal(consignes.tests.length, 0);
  assert.equal(consignes.cooks.length, 1, avertissements.join("\n"));
  assert.doesNotMatch(consignes.cooks[0] ?? "", /## Frozen acceptance tests/);
  assert.match(consignes.cooks[0] ?? "", /## Proofs your delivery owes[\s\S]*proof: diff/);
});

test("classes that cannot be read — a not-testable criterion with no proof — write nothing and take nothing, and the station says why", async (t) => {
  const { faux, tour, consignes, fiche, avertissements } = station(t, [COMPORTEMENT, DOC], classes(["testable", ""], ["not-testable", " "]));
  await tour();
  await tour();
  assert.equal(consignes.tests.length, 0);
  assert.equal(consignes.cooks.length, 0);
  assert.deepEqual(fiche(), []);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_TESTS_ECRITS), false);
  assert.match(avertissements.join("\n"), /criterion 2 is not testable and names no proof/);
});

// La pass : le worktree de la livraison est un vrai dépôt dont la base est
// `origin/main` ; la livraison corrige `somme`, ajoute `positif` et leurs tests.
const BOGUE = "export const somme = (a: number, b: number) => a - b;\n";
const CORRIGE = "export const somme = (a: number, b: number) => a + b;\nexport const positif = (n: number) => n > 0;\n";
const TESTS = [
  'import assert from "node:assert/strict";',
  'import { test } from "node:test";',
  'import { positif, somme } from "./calcul.ts";',
  'test("adds two numbers", () => assert.equal(somme(2, 3), 5));',
  'test("tells a positive number", () => { assert.equal(positif(2), true); assert.equal(positif(-1), false); });',
  "",
].join("\n");
const DIFF = ["diff --git a/lib/calcul.ts b/lib/calcul.ts", "--- a/lib/calcul.ts", "+++ b/lib/calcul.ts", "@@ -1 +1,2 @@", "-export const somme = (a: number, b: number) => a - b;", "+export const somme = (a: number, b: number) => a + b;", "+export const positif = (n: number) => n > 0;", ""].join("\n");

function projet(dossier: string, fichiers: Record<string, string>) {
  for (const [chemin, contenu] of Object.entries({ "package.json": '{"type":"module"}\n', ...fichiers })) {
    mkdirSync(join(dossier, chemin, ".."), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
}

// `gele` : les tests de la livraison sont le premier commit de sa branche,
// avec le trailer `Acceptance-Tests: frozen` ; sinon le cook les a commités avec son code.
async function parLaPass(t: TestContext, gele: boolean) {
  const repertoire = mkdtempSync(join(tmpdir(), "classes-pass-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const worktree = join(repertoire, "review-11-github");
  projet(worktree, { "lib/calcul.ts": BOGUE });
  git(worktree, "init", "-q");
  git(worktree, "add", ".");
  git(worktree, "commit", "-q", "-m", "base");
  git(worktree, "update-ref", "refs/remotes/origin/main", "HEAD");
  projet(worktree, { "lib/calcul.test.ts": TESTS });
  if (gele) {
    git(worktree, "add", "lib/calcul.test.ts");
    git(worktree, "commit", "-q", "-m", "test(#11): frozen acceptance tests", "-m", "Acceptance-Tests: frozen");
  }
  projet(worktree, { "lib/calcul.ts": CORRIGE });
  git(worktree, "add", ".");
  git(worktree, "commit", "-q", "-m", "feat: somme and positif");
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high"], "## Acceptance criteria\n\n- It adds two numbers\n- It tells a positive number");
  const journal: string[] = [];
  const checkouts: string[] = [];
  const lancer: Lancer = ({ args, flux }) => {
    const relecture = { verdict: "vert", resume: "Looks right.", constats: [], criteres: [{ critere: 1, tests: ["adds two numbers"], relecture: false }, { critere: 2, tests: ["tells a positive number"], relecture: false }] };
    writeFileSync(flux, RENDU(args.includes("--tools") ? JSON.stringify(relecture) : "done"));
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
      changes: () => ["lib/calcul.ts", "lib/calcul.test.ts"],
      diff: () => DIFF,
      essayer: async (nom) => {
        checkouts.push(nom);
        projet(join(repertoire, nom), { "lib/calcul.ts": BOGUE });
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
  return { verdict, journal, mutants: checkouts.filter((nom) => nom.startsWith("mutations-")) };
}

test("a delivery with no frozen test: no mutation run is launched, and the verdict says why", async (t) => {
  const { verdict, journal, mutants } = await parLaPass(t, false);
  assert.match(verdict, /verdict=approve/);
  assert.deepEqual(mutants, [], "no throwaway checkout is made for a mutant");
  assert.ok(verdict.includes(LIGNE_SANS_MUTATION), verdict);
  assert.doesNotMatch(verdict, /mutations caught/);
  assert.ok(journal.some((ligne) => ligne.endsWith(LIGNE_SANS_MUTATION)), journal.join("\n"));
});

test("a delivery with frozen tests: the mutations still run against them", async (t) => {
  const { verdict, mutants } = await parLaPass(t, true);
  assert.match(verdict, /verdict=approve[\s\S]*\nMutation check: 2 of 2 mutations caught/);
  assert.ok(mutants.length > 0);
  assert.ok(!verdict.includes(LIGNE_SANS_MUTATION));
});
