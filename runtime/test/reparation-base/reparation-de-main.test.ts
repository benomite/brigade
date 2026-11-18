// La réparation de main (#3815), hors des critères gelés : le test que nomme
// un journal, le rail illisible, une réparation d'avant #3815 mise de côté, et
// une réparation qu'une prise tient sur une base verte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { marqueDeBaseRouge } from "../../src/base-rouge/ouvre-reparation.ts";
import { corpsDePrise } from "../../src/github-etat/prise.ts";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { fermeReparationDeMain, reparationDeMain } from "../../src/reparation-base/reparation-de-main.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const ROUGE = [{ name: "tests", outcome: "red" as const }];
const VERTE = [{ name: "tests", outcome: "green" as const }];

// Une station sur un faux GitHub dont le journal du check rouge est `journal` :
// rend le titre et le corps de la réparation ouverte.
const ouvrirSur = async (journal: string) => {
  const faux = new FauxGitHub();
  const github = faux.pour("A");
  github.journalDuCheck = async () => journal;
  const titres: string[] = [];
  const creer = github.creerIssue;
  github.creerIssue = async (issue) => {
    titres.push(issue.titre);
    return creer(issue);
  };
  const { reparation } = await reparationDeMain({ github, base: "main" })(ROUGE);
  assert.equal(reparation, 900);
  assert.ok(faux.ticket(900).labels.has("repair-main"));
  return { titres, corps: faux.ticket(900).corps };
};

test("the failing test and its error are read from a TAP job log", async () => {
  const { titres, corps } = await ouvrirSur("2026-11-17T16:40:01.0000000Z not ok 3 - parses the clock\n  ---\n  error: 'expected 2 to equal 3'\n");
  assert.deepEqual(titres, ["Repair main: parses the clock"]);
  assert.ok(corps.includes("- Test: `parses the clock`\n- Error: `expected 2 to equal 3`"));
});

test("the failing test is read from a spec job log, past the header of its summary", async () => {
  const { titres, corps } = await ouvrirSur("✖ failing tests:\n\n✖ keeps the rail (12.5ms)\n  AssertionError [ERR_ASSERTION]: 0 !== 1\n");
  assert.deepEqual(titres, ["Repair main: keeps the rail"]);
  assert.ok(corps.includes("- Error: `AssertionError [ERR_ASSERTION]: 0 !== 1`"));
});

test("with no failing test in the job log, the repair is named after the red check", async () => {
  const { titres, corps } = await ouvrirSur("npm ERR! missing script: test\n##[error]Process completed with exit code 1.");
  assert.deepEqual(titres, ["Repair main: tests"]);
  assert.ok(!corps.includes("## Failing test"));
});

test("an unreadable rail opens nothing and says why, and the next call opens the repair", async () => {
  const faux = new FauxGitHub();
  const github = faux.pour("A");
  const lire = github.fires;
  github.fires = async () => {
    throw new Error("HTTP 502");
  };
  const ouvrir = reparationDeMain({ github, base: "main" });
  const echec = await ouvrir(ROUGE);
  assert.equal(echec.reparation, null);
  assert.match(echec.erreur ?? "", /rail is unreadable: HTTP 502/);
  assert.deepEqual(faux.creations, []);
  github.fires = lire;
  assert.equal((await ouvrir(ROUGE)).reparation, 900);
});

test("a repair opened before #3815 and set aside no longer silences its red commit: a new one names it", async () => {
  const faux = new FauxGitHub();
  const sha = "e".repeat(40);
  faux.teteDeLaBase = sha;
  faux.feu(3680, ["fire", "prio:0", "model:opus", "effort:medium", "set-aside:failures"], `${marqueDeBaseRouge(sha)}\n\nRepair of the red base.`);
  const { reparation } = await reparationDeMain({ github: faux.pour("A"), base: "main" })(ROUGE);
  assert.equal(reparation, 900);
  assert.ok(faux.ticket(900).corps.includes("#3680"));
  assert.ok(faux.ticket(900).labels.has("repair-main"));
});

test("on a green base, a repair a station's claim holds is left to finish, and one whose `taken` nobody holds is closed", async () => {
  const faux = new FauxGitHub();
  faux.feu(40, [...CALIBRE, "repair-main", LABEL_TAKEN], "Repair main: held by B");
  faux.feu(41, [...CALIBRE, "repair-main", LABEL_TAKEN], "Repair main: held by nobody");
  faux.poster(40, "B", corpsDePrise("B"));
  const tickets = [40, 41].map((number) => ({ number, labels: [...faux.ticket(number).labels], state: "open" as const }));
  assert.deepEqual(await fermeReparationDeMain({ github: faux.pour("A"), base: "main" })(VERTE, tickets), [41]);
  assert.equal(faux.ticket(40).state, "open");
  assert.equal(faux.ticket(41).state, "closed");
});
