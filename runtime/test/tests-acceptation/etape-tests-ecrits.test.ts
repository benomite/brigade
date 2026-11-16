// L'étape « tests written » du rail (#3725) : entre `queued` et `taken`, le
// manager écrit un test d'acceptation par critère, que la station commite,
// seuls, en premier commit de la branche du ticket. Les tests passent par la
// station (`stationDuDepot`) sur le vrai dépôt d'un projet (`ouvrirDepot`, une
// origine nue et le clone de la station) : seuls GitHub et `claude` sont faux.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { etapeDuRail, LABEL_TESTS_ECRITS } from "../../src/tests-acceptation/etape.ts";
import { lireLesFiches } from "../../src/tests-acceptation/fiche.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const TICKET = 7;
const BRANCHE = `cook/${TICKET}-github`;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
const CRITERES = ["The dashboard shows the second screen", "A click on the arrow goes back to the first screen", "The second screen keeps its scroll position"];
const CORPS = ["## Context", "", "The dashboard's second screen.", "", "## Acceptance criteria", "", ...CRITERES.map((critere) => `- ${critere}`)].join("\n");
const CHEMINS = CRITERES.map((_, rang) => `test/acceptation/critere-${rang + 1}.test.ts`);
// La première ligne de la consigne du manager qui écrit les tests.
const MARQUE_DE_LA_CONSIGNE = "<!-- brigade:tests-acceptation-consigne -->";
const RENDU = (message: string) => `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`;

// Le manager : écrit `ecrits` dans son worktree et répond `CHEMINS`.
type Manager = (worktree: string) => string;
const MANAGER: Manager = (worktree) => {
  for (const chemin of CHEMINS) {
    mkdirSync(dirname(join(worktree, chemin)), { recursive: true });
    writeFileSync(join(worktree, chemin), `// ${chemin}\n`);
  }
  return `Written.\n${JSON.stringify({ tests: CHEMINS })}`;
};

// La station d'un projet sur un vrai dépôt, où #TICKET est qualifié et sans
// tests. Le cook commite `src/ecran.ts` et livre ; l'étape où il voit son
// ticket, et ce que son worktree porte, sont notés.
// `retenue` : la fin du lancement du manager attend qu'elle se résolve ;
// `lance` est appelé quand il part.
function station(t: TestContext, manager: Manager = MANAGER, retenue: Promise<void> = Promise.resolve(), lance: () => void = () => {}) {
  const lieux = depotGit(t);
  const worktrees = join(repertoireTemporaire(t), "worktrees");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees, env: ENV_GIT });
  const faux = new FauxGitHub();
  faux.feu(TICKET, CALIBRE, CORPS);
  const cooks: { etape: string; consigne: string; premier: string }[] = [];
  let ecritures = 0;
  const lancer: Lancer = ({ args, cwd, flux, entree }) => {
    let message = "{}";
    if (entree?.startsWith(MARQUE_DE_LA_CONSIGNE)) {
      ecritures += 1;
      message = manager(cwd);
      lance();
    } else if (!args.includes("--tools")) {
      cooks.push({ etape: etapeDuRail([...faux.ticket(TICKET).labels]), consigne: entree ?? "", premier: git(cwd, "rev-list", "--reverse", `origin/${BASE}..HEAD`).split("\n")[0] ?? "" });
      writeFileSync(join(cwd, "ecran.ts"), "export const ecran = 2;\n");
      git(cwd, "add", "ecran.ts");
      git(cwd, "commit", "-q", "-m", "feat: the second screen");
      message = "Done.\n<livrable>\nThe second screen.\n</livrable>";
    }
    writeFileSync(flux, RENDU(message));
    const fini = { code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null };
    return { fin: entree?.startsWith(MARQUE_DE_LA_CONSIGNE) ? retenue.then(() => fini) : Promise.resolve(fini) };
  };
  const avertissements: string[] = [];
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    base: BASE,
    github: fauxClient(faux),
    depot,
    testsAcceptation: () => ({ model: "opus", effort: "medium" }),
    flux: repertoireTemporaire(t),
    lancer,
    avertir: (texte) => void avertissements.push(texte),
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    await ouverte.tour();
    await ouverte.calme();
  };
  // Les commits de la branche sur l'origine, du premier au dernier.
  const commits = () => git(lieux.origine, "rev-list", "--reverse", `${BASE}..${BRANCHE}`).split("\n").filter(Boolean);
  const surLOrigine = () => git(lieux.origine, "branch", "--list", BRANCHE) !== "";
  return { ...lieux, faux, ouverte, tour, cooks, ecritures: () => ecritures, avertissements, commits, surLOrigine };
}

test("the rail's steps: 'tests written' comes between 'queued' and 'taken'", () => {
  assert.equal(etapeDuRail(CALIBRE), "queued");
  assert.equal(etapeDuRail([...CALIBRE, LABEL_TESTS_ECRITS]), "tests written");
  assert.equal(etapeDuRail([...CALIBRE, LABEL_TESTS_ECRITS, LABEL_TAKEN]), "taken");
});

test("a ticket in 'queued' is not taken by a cook: the manager writes its tests first, then the same ticket is taken once the step is done", async (t) => {
  const { faux, tour, cooks, ecritures } = station(t);
  await tour();
  assert.equal(cooks.length, 0, "no cook takes a ticket whose tests are not written");
  assert.equal(ecritures(), 1);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_TAKEN), false);
  assert.equal(etapeDuRail([...faux.ticket(TICKET).labels]), "tests written");
  await tour();
  assert.equal(cooks.length, 1, "the same ticket is taken once its tests are written");
  assert.equal(cooks[0]?.etape, "taken");
  assert.equal(ecritures(), 1, "the tests are written once");
});

test("the first commit of the ticket's branch holds its N acceptance tests, one per criterion, no other file, with the trailer 'Acceptance-Tests: frozen'", async (t) => {
  const { origine, tour, commits } = station(t);
  await tour();
  const [premier, ...autres] = commits();
  assert.deepEqual(autres, [], "the tests are the branch's only commit before the cook");
  const fichiers = git(origine, "show", "--name-only", "--format=", premier ?? "").split("\n").filter(Boolean).sort();
  assert.deepEqual(fichiers, [...CHEMINS].sort());
  assert.equal(git(origine, "log", "-1", "--format=%(trailers:key=Acceptance-Tests,valueonly)", premier ?? ""), "frozen");
});

test("the cook's working branch is built on top of that commit: it comes first in the pull request's commits", async (t) => {
  const { faux, origine, tour, cooks, commits } = station(t);
  await tour();
  const [tests] = commits();
  await tour();
  assert.equal(cooks[0]?.premier, tests, "the cook's worktree starts from the tests' commit");
  assert.match(cooks[0]?.consigne ?? "", /## Frozen acceptance tests[\s\S]*test\/acceptation\/critere-1\.test\.ts/);
  const livres = commits();
  assert.equal(livres.length, 2);
  assert.equal(livres[0], tests, "the tests' commit is the first of the delivery");
  assert.equal(git(origine, "rev-parse", `${livres[1]}^`), tests);
  assert.equal(faux.prs.at(-1)?.branche, BRANCHE, "the delivery's pull request is opened on that branch");
});

test("each criterion has its record, its testPath filled in, readable from the ticket's comments", async (t) => {
  const { faux, tour } = station(t);
  await tour();
  const lues = lireLesFiches(faux.commentaires.get(TICKET) ?? []);
  assert.ok(lues !== null && "fiches" in lues, JSON.stringify(lues));
  assert.deepEqual(
    lues.fiches,
    CRITERES.map((criterion, rang) => ({ criterion, testPath: CHEMINS[rang], redOnMain: null, greenOnBranch: null, mutationsCaught: null, mutationsTotal: null, survivingLines: [] })),
  );
});

test("a manager that writes another file than its tests: nothing is committed, pushed or labelled, and no cook takes the ticket", async (t) => {
  const { faux, tour, cooks, avertissements, surLOrigine } = station(t, (worktree) => {
    writeFileSync(join(worktree, "LISEZMOI"), "rewritten\n");
    return MANAGER(worktree);
  });
  await tour();
  await tour();
  assert.equal(cooks.length, 0);
  assert.equal(surLOrigine(), false);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_TESTS_ECRITS), false);
  assert.match(avertissements.join("\n"), /changed files that are not its tests: `LISEZMOI`/);
});

test("records that cannot be read say so, never invented ones", () => {
  assert.equal(lireLesFiches([{ body: "hello", association: "OWNER" }]), null);
  const lues = lireLesFiches([{ body: "<!-- brigade:tests-acceptation -->\n<!-- brigade:fiches [not json -->", association: "OWNER" }]);
  assert.ok(lues !== null && "illisible" in lues);
});

test("a ticket without acceptance criteria has no test to freeze: no branch is pushed, and a cook takes it as before", async (t) => {
  const { faux, tour, cooks, ecritures, surLOrigine } = station(t);
  faux.ticket(TICKET).corps = "## Context\n\nThe dashboard's second screen.";
  await tour();
  await tour();
  assert.equal(ecritures(), 0, "the manager is not run");
  assert.equal(surLOrigine(), true, "the cook's delivery is pushed");
  assert.equal(cooks.length, 1);
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_TESTS_ECRITS), false);
});

test("while the manager writes the tests, the ticket's new branch is in the clone, and still no cook takes it", async (t) => {
  let liberer = () => {};
  let lance = () => {};
  const parti = new Promise<void>((resoudre) => (lance = resoudre));
  const { faux, ouverte, cooks, ecritures } = station(t, MANAGER, new Promise((resoudre) => (liberer = resoudre)), () => lance());
  await ouverte.tour();
  await parti;
  assert.equal(ecritures(), 1, "the manager is writing");
  await ouverte.tour();
  assert.equal(cooks.length, 0, "a turn during the writing does not take the ticket");
  liberer();
  await ouverte.calme();
  assert.equal(faux.ticket(TICKET).labels.has(LABEL_TESTS_ECRITS), true);
  await ouverte.tour();
  await ouverte.calme();
  assert.equal(cooks.length, 1);
});
