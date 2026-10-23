// Les rôles de la cuisine d'un projet (#1274) : chacun avec sa ligne et sa dernière action sur le projet,
// relue du journal, pour l'onglet Cooks de l'app.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Ajout } from "../../src/evenements.ts";
import { REDECOUPE } from "../../src/events/pass.ts";
import { principal as faits } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ROLES, rolesDeLaCuisine, type RoleDeCuisine } from "../../src/roles-cuisine/roles.ts";
import { aArreter, appeler, repertoireTemporaire } from "../outils.ts";

const PROJET = "shop";
const DEBUT = new Date("2026-10-21T12:00:00.000Z");
const MINUTE_MS = 60_000;

type Fait = Pick<Ajout, "type" | "payload">;

// Un journal où chaque fait s'écrit une minute après le précédent. Sans projection : seul le journal est lu.
function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  let horloge = DEBUT;
  const journal = ouvrirJournal(repertoire, { maintenant: () => horloge, projections: [] });
  aArreter(t, () => journal.fermer());
  let minutes = 0;
  const noter = (ticket: number | null, { type, payload }: Fait, { author = "runtime", project = PROJET } = {}) => {
    horloge = new Date(DEBUT.getTime() + minutes++ * MINUTE_MS);
    journal.ajouter({ project, ticket, author, type, payload } as Ajout);
    return horloge.toISOString();
  };
  const lire = () => rolesDeLaCuisine(journal.base, PROJET);
  const de = (role: string) => lire().find((un) => un.role === role)?.latest;
  return { journal, noter, lire, de };
}

test("la liste porte toujours le closer et chaque autre rôle, dans l'ordre, chacun avec une ligne et rien fait : `latest` nul", (t) => {
  const { lire } = cuisine(t);
  const roles = lire();
  assert.deepEqual(
    roles.map(({ role }) => role),
    ["manager", "pass", "reviewer", "second judge", "triage", "closer"],
  );
  for (const { does, latest } of roles) {
    assert.equal(latest, null);
    // Une seule ligne, une phrase.
    assert.ok(does.length > 20 && !does.includes("\n") && does.endsWith("."), does);
  }
});

test("le dernier geste d'un rôle est le plus récent des faits qu'il écrit, avec son ticket et son heure", (t) => {
  const { noter, de } = cuisine(t);
  noter(12, { type: "merge.done", payload: { pr: "https://github.com/chef/shop/pull/1", sha: "c0ffee", by: "pass", reconciled: false } });
  const juge = noter(14, { type: "pass.judged", payload: { verdict: "red" } }, { author: "pass" });
  assert.deepEqual(de("pass"), { what: "judged #14 red", ticket: 14, at: juge });

  const renvoi = noter(14, { type: "pass.returned", payload: { n: 1, findings: ["the test is missing"] } }, { author: "pass" });
  assert.deepEqual(de("pass"), { what: "sent #14 back to its cook", ticket: 14, at: renvoi });
  // Le manager n'a rien fait : rien d'un autre rôle ne lui est prêté.
  assert.equal(de("manager"), null);
});

test("un fait qu'un autre que le rôle écrit n'est pas son geste : un merge fait hors de la pass, un renvoi du manager ou du chef", (t) => {
  const { noter, de } = cuisine(t);
  const merge = noter(11, { type: "merge.done", payload: { pr: "https://github.com/chef/shop/pull/1", sha: "c0ffee", by: "pass", reconciled: false } }, { author: "pass" });
  noter(12, { type: "merge.done", payload: { pr: "https://github.com/chef/shop/pull/2", sha: "beef", by: "outside", reconciled: true } }, { author: "pass" });
  noter(13, { type: "pass.returned", payload: { n: 2, findings: ["x"] } }, { author: "manager" });
  noter(13, { type: "pass.returned", payload: { n: 3, findings: ["y"] } }, { author: "chef" });
  noter(14, { type: "pass.escalated", payload: { reason: REDECOUPE } }, { author: "manager" });

  assert.deepEqual(de("pass"), { what: "merged #11", ticket: 11, at: merge });
});

test("chaque rôle dit son geste en une phrase composée de ses champs", (t) => {
  const { noter, de } = cuisine(t);
  noter(21, { type: "manager.split", payload: { run: "r1", fingerprint: "f", reason: "two screens", order: "first the model", tickets: [{}, {}, {}] } }, { author: "manager" });
  assert.equal(de("manager")?.what, "split epic #21 into 3 tickets");
  noter(22, { type: "manager.reacted", payload: { choice: "raise" } }, { author: "manager" });
  assert.equal(de("manager")?.what, "raised the calibration of #22");
  noter(23, { type: "manager.judged", payload: { verdict: "fire" } }, { author: "manager" });
  assert.equal(de("manager")?.what, "put #23 on the rail");

  noter(31, { type: "pass.reviewed", payload: { outcome: "red", findings: [{}, {}] } }, { author: "pass" });
  assert.equal(de("reviewer")?.what, "reviewed #31: red, 2 findings");
  noter(32, { type: "pass.reviewed", payload: { outcome: "green", findings: [] } }, { author: "pass" });
  assert.equal(de("reviewer")?.what, "reviewed #32: green");

  noter(33, { type: "pass.second-judged", payload: { verdict: "not-weakened" } }, { author: "pass" });
  assert.equal(de("second judge")?.what, "found the checks of #33 not weakened");

  noter(41, { type: "todo.triaged", payload: { action: "relaunch", sentence: "relaunched", reason: "flaky", run: "r2" } }, { author: "manager" });
  assert.equal(de("triage")?.what, "relaunched #41");
  // La carte que la porte rend au triage n'est pas un geste : son dernier reste la relance.
  noter(42, { type: "todo.triaged", payload: { action: "back", sentence: null, reason: "refused", run: null } }, { author: "manager" });
  assert.equal(de("triage")?.what, "relaunched #41");

  const partie = noter(null, { type: "closing.started", payload: { run: "c1" } }, { author: "closer" });
  assert.deepEqual(de("closer"), { what: "started a cleanup", ticket: null, at: partie });
  noter(null, { type: "closing.ended", payload: { run: "c1", outcome: "delivered", removedLines: 120 } }, { author: "closer" });
  assert.equal(de("closer")?.what, "delivered a cleanup PR removing 120 lines");
  noter(null, { type: "closing.ended", payload: { run: "c2", outcome: "tokens" } }, { author: "closer" });
  assert.equal(de("closer")?.what, "stopped a cleanup at its token cap");
});

test("aucune phrase n'est la sortie d'une commande : ni le texte libre du fait, ni une charge illisible", (t) => {
  const { noter, de, lire } = cuisine(t);
  noter(51, { type: "manager.judged", payload: { verdict: "refused", reason: "$ gh issue view 51\nerror: exit 1" } }, { author: "manager" });
  noter(52, { type: "todo.triaged", payload: { action: "constructor", sentence: "brigade : usage", reason: "x", run: null } }, { author: "manager" });
  noter(null, { type: "closing.ended", payload: { run: "c", outcome: "failed", detail: "fatal: not a git repository" } }, { author: "closer" });

  assert.equal(de("manager")?.what, "judged #51 not ready to serve");
  assert.equal(de("triage")?.what, "triaged #52");
  assert.equal(de("closer")?.what, "ended a cleanup that failed");
  for (const { latest } of lire()) assert.ok(latest === null || !/gh issue|error|fatal|usage|\n/.test(latest.what), latest?.what ?? "");
});

test("seuls comptent les faits du projet : un geste sur un autre projet n'est pas le dernier de celui-ci", (t) => {
  const { noter, journal } = cuisine(t);
  const ici = noter(11, { type: "pass.judged", payload: { verdict: "green" } }, { author: "pass" });
  noter(12, { type: "pass.judged", payload: { verdict: "red" } }, { author: "pass", project: "cantine" });

  const pass = (projet: string) => rolesDeLaCuisine(journal.base, projet).find(({ role }) => role === "pass")?.latest;
  assert.deepEqual(pass(PROJET), { what: "judged #11 green", ticket: 11, at: ici });
  assert.equal(pass("cantine")?.what, "judged #12 red");
  assert.ok(rolesDeLaCuisine(journal.base, "cantine").filter(({ role }) => role !== "pass").every(({ latest }) => latest === null));
});

test("chaque type de fait d'un rôle se lit sans lever, charge vide comprise", (t) => {
  const { noter, lire } = cuisine(t);
  for (const { lectures } of ROLES) for (const { type } of lectures) noter(9, { type, payload: {} } as Fait, { author: "pass" });
  for (const { latest } of lire() as RoleDeCuisine[]) assert.ok(latest !== null && latest.what.length > 0);
});

test("`facts` donne les rôles du projet dans `rolesCuisine` — chacun nul sans geste, puis avec le sien", async (t) => {
  const repertoire = repertoireTemporaire(t);
  // Un journal tenu comme le runtime le tient, projections comprises : `facts` les lit.
  const ecrire = (project: string, ticket: number | null, author: string, fait: Fait) => {
    const journal = ouvrirJournal(repertoire);
    journal.ajouter({ project, ticket, author, ...fait } as Ajout);
    journal.fermer();
  };
  const lire = async (env: Record<string, string> = {}) => {
    const lancee = appeler(faits, [], { BRIGADE_STATE_DIR: repertoire, ...env });
    assert.equal(await lancee.fin, 0, lancee.sortie());
    return JSON.parse(lancee.sortie().split("\n")[0] ?? "").rolesCuisine as RoleDeCuisine[];
  };
  ecrire(PROJET, null, "runtime", { type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } });
  const vide = await lire({ BRIGADE_PROJECT: PROJET });
  assert.equal(vide.length, ROLES.length);
  assert.ok(vide.every(({ latest }) => latest === null));

  ecrire(PROJET, 12, "pass", { type: "merge.done", payload: { pr: "https://github.com/chef/shop/pull/1", sha: "c0ffee", by: "pass", reconciled: false } });
  ecrire("cantine", 13, "pass", { type: "merge.done", payload: { pr: "https://github.com/chef/cantine/pull/1", sha: "beef", by: "pass", reconciled: false } });
  const pass = (await lire({ BRIGADE_PROJECT: PROJET })).find(({ role }) => role === "pass")?.latest;
  assert.equal(pass?.what, "merged #12");
  assert.equal(pass?.ticket, 12);
  assert.ok(!Number.isNaN(Date.parse(pass?.at ?? "")));
});
