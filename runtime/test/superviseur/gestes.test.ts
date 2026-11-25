// Les gestes du superviseur (#3944) : six, pas un de plus, joués par le vrai
// client GitHub du runtime sur un faux dépôt (`faux-depot.ts`) — et chaque run
// écrit UN commentaire, compté sur ce que GitHub reçoit.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Reveil } from "../../src/superviseur/declencheur.ts";
import { jouerLeRun, type Decision } from "../../src/superviseur/gestes.ts";
import { FauxDepot } from "./faux-depot.ts";

const MAINTENANT = new Date("2026-11-20T10:00:00.000Z");
const PRISES: Reveil = { cause: "takes", takes: 3, ticket: 40 };
const MAIN_ROUGE: Reveil = { cause: "main-red", since: "2026-11-20T09:45:00.000Z", ticket: null };

const jouer = (depot: FauxDepot, reveil: Reveil, gesture: unknown, saw = "the dossier") => jouerLeRun({ github: depot.client(), depot: "acme/shop", branche: "main", maintenant: MAINTENANT }, reveil, { saw, gesture } satisfies Decision);

test("chaque geste fait, un seul commentaire sur le ticket où le run a agi, qui dit ce qu'il a vu et ce qu'il a fait — le parking et la carte TODO compris", async () => {
  const cas: Array<{ nom: string; gesture: unknown; ticket: number; tete?: RegExp; prepare?: (depot: FauxDepot) => void }> = [
    { nom: "rerun", gesture: { gesture: "rerun", ticket: 40 }, ticket: 40, prepare: (depot) => depot.checkRouge("tests (linux)", 7) },
    { nom: "back-on-rail", gesture: { gesture: "back-on-rail", ticket: 40, note: "its zone is free again" }, ticket: 40, prepare: (depot) => depot.issue(40, ["fire", "set-aside:failures"]) },
    { nom: "waiting", gesture: { gesture: "waiting", ticket: 40, what: "the API key", who: "the client" }, ticket: 40, tete: /^<!-- brigade:parked \{/ },
    { nom: "close-duplicate", gesture: { gesture: "close-duplicate", ticket: 40, of: 12 }, ticket: 40 },
    { nom: "fix", gesture: { gesture: "fix", cause: "the journal is read twice", title: "Read the journal once per tick", body: "The tick reads the journal twice." }, ticket: 500 },
    { nom: "todo", gesture: { gesture: "todo", ticket: 40, kind: "product", question: "Should the phone show the served tickets?" }, ticket: 40, tete: /^<!-- brigade:todo kind=product-question -->/ },
  ];
  for (const { nom, gesture, ticket, tete, prepare } of cas) {
    const depot = new FauxDepot();
    depot.issue(40, ["fire"]);
    depot.issue(12, ["fire"]);
    prepare?.(depot);
    const trace = await jouer(depot, PRISES, gesture, `seen for ${nom}`);
    assert.equal(trace.outcome, "done", `${nom} : ${trace.comment}`);
    assert.equal(depot.ecrits().length, 1, `${nom} : un seul commentaire`);
    assert.deepEqual(depot.commentaires.get(ticket)?.length, 1, nom);
    const corps = depot.commentaires.get(ticket)?.[0] ?? "";
    assert.equal(corps, trace.comment);
    assert.match(corps, /<!-- brigade:supervisor -->\n\*\*Supervisor\*\* — woke because #40 was taken 3 times without delivering\./, nom);
    assert.match(corps, new RegExp(`- \\*\\*saw\\*\\*: seen for ${nom}\\n- \\*\\*did\\*\\*: `), nom);
    if (tete !== undefined) assert.match(corps, tete, nom);
  }
});

test("un geste refusé : rien n'est fait, et le run le dit en un seul commentaire sur le ticket visé", async () => {
  const depot = new FauxDepot();
  depot.issue(40, ["fire", "taken"]);
  const trace = await jouer(depot, PRISES, { gesture: "back-on-rail", ticket: 40, note: "again" });
  assert.equal(trace.outcome, "refused");
  assert.deepEqual(depot.labelsDe(40), ["fire", "taken"]);
  assert.equal(depot.ecrits().length, 1);
  assert.match(depot.commentaires.get(40)?.[0] ?? "", /- \*\*refused\*\*: back-on-rail: #40 carries `taken`: the kitchen holds it/);
});

test("toute autre action est refusée : rien n'est écrit sur GitHub que le commentaire du run", async () => {
  for (const gesture of [{ gesture: "merge", ticket: 40 }, { gesture: "comment", ticket: 40 }, "rebase", null, { gesture: "waiting", ticket: 40, what: "the key" }]) {
    const depot = new FauxDepot();
    depot.issue(40, ["fire"]);
    const trace = await jouer(depot, PRISES, gesture);
    assert.equal(trace.outcome, "refused", JSON.stringify(gesture));
    assert.deepEqual(
      depot.appels.filter(({ methode }) => methode !== "GET").map(({ methode, chemin }) => `${methode} ${chemin}`),
      ["POST repos/acme/shop/issues/40/comments"],
      JSON.stringify(gesture),
    );
    assert.match(trace.comment ?? "", /- \*\*refused\*\*: /);
  }
  const depot = new FauxDepot();
  depot.issue(40, ["fire"]);
  assert.match((await jouer(depot, PRISES, { gesture: "merge" })).comment ?? "", /“merge” is not one of the supervisor's six gestures \(rerun, back-on-rail, waiting, close-duplicate, fix, todo\)/);
});

test("main rouge : le fix d'un check jamais relancé relance ses jobs en échec d'abord, et n'ouvre aucun ticket", async () => {
  const depot = new FauxDepot();
  depot.checkRouge("tests (linux)", 7, 1);
  const trace = await jouer(depot, MAIN_ROUGE, { gesture: "fix", cause: "tests fail on linux", title: "Fix the linux tests", body: "Red.", check: "tests (linux)" });
  assert.equal(trace.outcome, "done");
  assert.deepEqual(depot.relances(), [7]);
  assert.deepEqual(depot.creees(), []);
  // Main rouge ne nomme aucun ticket : la relance n'agit sur aucun, et aucun commentaire ne part.
  assert.deepEqual([trace.ticket, trace.comment, depot.ecrits().length], [null, null, 0]);
});

test("main rouge : la relance finie et toujours rouge, un seul ticket fix par check rouge", async () => {
  const depot = new FauxDepot();
  depot.checkRouge("tests (linux)", 7, 2);
  const fix = { gesture: "fix", cause: "tests fail on linux", title: "Fix the linux tests", body: "Red after its rerun.", check: "tests (linux)" };
  const premier = await jouer(depot, MAIN_ROUGE, fix);
  assert.equal(premier.outcome, "done", premier.comment ?? "");
  assert.deepEqual(depot.relances(), []);
  assert.equal(depot.creees().length, 1);
  const cree = depot.issues.get(500);
  assert.deepEqual(cree?.labels, ["fire", "prio:0", "model:opus", "effort:medium", "fix"]);
  assert.match(cree?.body ?? "", /<!-- brigade:supervisor-cause check:tests \(linux\) -->/);
  assert.equal(depot.commentaires.get(500)?.length, 1);
  // Le même check rouge, même dit d'une autre cause : aucun second ticket ; le run le dit sur celui qui est ouvert.
  const second = await jouer(depot, MAIN_ROUGE, { ...fix, cause: "the linux runner is flaky" });
  assert.equal(second.outcome, "refused");
  assert.equal(depot.creees().length, 1);
  assert.equal(second.ticket, 500);
  assert.match(second.comment ?? "", /#500 is already open for this cause: no second fix ticket/);
});

test("main rouge : une relance qui tourne encore n'ouvre rien ; un fix sans son check rouge, ou sur un check vert, non plus", async () => {
  const depot = new FauxDepot();
  depot.checkRouge("tests (linux)", 7, 2, "in_progress");
  const fix = { gesture: "fix", cause: "tests fail on linux", title: "Fix the linux tests", body: "Red." };
  // Main rouge ne nomme aucun ticket : un refus n'a aucun ticket où se dire.
  const tourne = await jouer(depot, MAIN_ROUGE, { ...fix, check: "tests (linux)" });
  assert.deepEqual([tourne.outcome, tourne.comment], ["refused", null]);
  // Sur un réveil qui nomme un ticket, le refus s'y dit.
  depot.issue(40, ["fire"]);
  assert.match((await jouer(depot, PRISES, { ...fix, check: "tests (linux)" })).comment ?? "", /the rerun of tests \(linux\) \(run 7\) is still running/);
  const sansCheck = await jouer(depot, MAIN_ROUGE, fix);
  assert.equal(sansCheck.outcome, "refused");
  assert.match((await jouer(depot, PRISES, { ...fix, check: "types (runtime)" })).comment ?? "", /types \(runtime\) is not red on the head of main/);
  assert.deepEqual([depot.creees(), depot.relances()], [[], []]);
});

test("un fix pour une cause neuve s'ouvre ; une cause qu'un ticket ouvert porte déjà n'en ouvre pas un second", async () => {
  const depot = new FauxDepot();
  depot.issue(40, ["fire"]);
  const fix = { gesture: "fix", cause: "journal-read-twice", title: "Read the journal once per tick", body: "The tick reads the journal twice." };
  assert.equal((await jouer(depot, PRISES, fix)).ticket, 500);
  assert.deepEqual(depot.issues.get(500)?.labels, ["fire", "fix", "prio:1", "model:sonnet", "effort:medium"]);
  const encore = await jouer(depot, PRISES, fix);
  assert.deepEqual([encore.outcome, encore.ticket, depot.creees().length], ["refused", 500, 1]);
  // La même marque posée par un inconnu ne fait pas doublon.
  const autre = new FauxDepot();
  autre.issue(40, ["fire"]);
  autre.issue(41, [], `x\n\n<!-- brigade:supervisor-cause journal-read-twice -->`, "NONE");
  assert.equal((await jouer(autre, PRISES, fix)).outcome, "done");
  assert.equal(autre.creees().length, 1);
});

test("aucun ticket créé hors du geste fix, et jamais un ticket sur un ticket", async () => {
  for (const gesture of [
    { gesture: "rerun", ticket: 40 },
    { gesture: "back-on-rail", ticket: 40, note: "go" },
    { gesture: "waiting", ticket: 40, what: "the key", who: "the client" },
    { gesture: "close-duplicate", ticket: 40, of: 12 },
    { gesture: "todo", ticket: 40, kind: "design", question: "Which of the two home layouts do we keep?" },
  ]) {
    const depot = new FauxDepot();
    depot.issue(40, ["blocked-on-human"]);
    depot.issue(12, ["fire"]);
    depot.checkRouge("tests (linux)", 7);
    assert.equal((await jouer(depot, PRISES, gesture)).outcome, "done", gesture.gesture);
    assert.deepEqual(depot.creees(), [], gesture.gesture);
  }
  for (const surUnTicket of [{ title: "Unblock #40", cause: "stuck" }, { title: "Unblock the ticket", cause: "#40 is stuck" }]) {
    const depot = new FauxDepot();
    depot.issue(40, ["fire"]);
    const trace = await jouer(depot, PRISES, { gesture: "fix", body: "It is stuck.", ...surUnTicket });
    assert.equal(trace.outcome, "refused");
    assert.deepEqual(depot.creees(), []);
    assert.match(trace.comment ?? "", /never a ticket about a ticket/);
  }
});

test("le chef n'est jamais prié d'une relance, d'un merge, d'un rebase ni d'une lecture de log : aucune carte TODO", async () => {
  for (const question of ["Can you rerun the CI checks?", "Should we merge PR #12?", "Please rebase cook/40-github onto main?", "Could you read the logs of the failing job?"]) {
    const depot = new FauxDepot();
    depot.issue(40, ["fire"]);
    const trace = await jouer(depot, PRISES, { gesture: "todo", ticket: 40, kind: "product", question });
    assert.equal(trace.outcome, "refused", question);
    assert.deepEqual(depot.labelsDe(40), ["fire"], question);
    assert.equal(depot.ecrits().length, 1, question);
    assert.doesNotMatch(trace.comment ?? "", /brigade:todo/, question);
  }
  const depot = new FauxDepot();
  depot.issue(40, ["fire"]);
  const geste = await jouer(depot, PRISES, { gesture: "todo", ticket: 40, kind: "gesture", question: "Which plan do we pick?" });
  assert.equal(geste.outcome, "refused");
  assert.deepEqual(depot.labelsDe(40), ["fire"]);
});

test("la carte TODO de design pose la question de design ; une carte qui attend déjà n'est pas doublée", async () => {
  const depot = new FauxDepot();
  depot.issue(40, ["fire"]);
  const trace = await jouer(depot, PRISES, { gesture: "todo", ticket: 40, kind: "design", question: "Which of the two home layouts do we keep?" });
  assert.match(trace.comment ?? "", /The kitchen has a design question on #40:\n\n> Which of the two home layouts do we keep\?/);
  // La carte parque le ticket pour le chef (#4129) : `chef-todo` seul — `parked` dit qu'il attend quelqu'un d'autre.
  assert.deepEqual(depot.labelsDe(40), ["fire", "chef-todo"]);
  const encore = await jouer(depot, PRISES, { gesture: "todo", ticket: 40, kind: "design", question: "Which of the two home layouts do we keep?" });
  assert.equal(encore.outcome, "refused");
  assert.doesNotMatch(encore.comment ?? "", /brigade:todo/);
});

test("remettre sur le rail : `fire` posé, ce qui le retenait retiré ; déjà sur le rail, refusé", async () => {
  const depot = new FauxDepot();
  depot.issue(40, ["blocked-on-human", "served-elsewhere", "set-aside:failures", "prio:1"]);
  const trace = await jouer(depot, PRISES, { gesture: "back-on-rail", ticket: 40, note: "the client answered" });
  assert.deepEqual(depot.labelsDe(40), ["prio:1", "fire"]);
  assert.match(trace.comment ?? "", /put #40 back on the rail \(`fire` added, `blocked-on-human` removed, `served-elsewhere` removed, `set-aside:failures` removed\)\. Note: the client answered/);
  const deja = await jouer(depot, PRISES, { gesture: "back-on-rail", ticket: 40, note: "again" });
  assert.equal(deja.outcome, "refused");
  const fermee = new FauxDepot();
  fermee.issue(40, []);
  (fermee.issues.get(40) as { state: string }).state = "closed";
  assert.equal((await jouer(fermee, PRISES, { gesture: "back-on-rail", ticket: 40, note: "x" })).outcome, "refused");
  assert.deepEqual(fermee.labelsDe(40), []);
});

test("remettre sur le rail un ticket parqué (`parked` ou `chef-todo`) : refusé, rien n'est retiré (#4129)", async () => {
  for (const labels of [["parked", "set-aside:failures", "prio:1"], ["chef-todo", "blocked-on-human", "prio:1"], ["fire", "parked", "chef-todo"]]) {
    const depot = new FauxDepot();
    depot.issue(40, labels);
    const trace = await jouer(depot, PRISES, { gesture: "back-on-rail", ticket: 40, note: "the client answered" });
    assert.equal(trace.outcome, "refused", labels.join(","));
    assert.deepEqual(depot.labelsDe(40), labels);
    assert.match(trace.comment ?? "", /- \*\*refused\*\*: back-on-rail: #40 is parked \(`parked`\): it waits for someone, and nothing takes it before its date, its fact or the answer — unpark it first/);
    assert.equal(depot.ecrits().length, 1);
  }
});

test("parked : le label et la marque du tiers dans le seul commentaire ; un commentaire qui ne part pas retire le label", async () => {
  const depot = new FauxDepot();
  depot.issue(40, ["fire"]);
  const trace = await jouer(depot, PRISES, { gesture: "waiting", ticket: 40, what: "the API key", who: "the client" });
  assert.deepEqual(depot.labelsDe(40), ["fire", "parked"]);
  assert.match(trace.comment ?? "", /^<!-- brigade:parked \{"what":"the API key","who":"the client","followUp":"2026-11-27T10:00:00.000Z"\} -->/);
  assert.match(trace.comment ?? "", /- \*\*did\*\*: parked #40, waiting for the client: the API key/);
  const casse = new FauxDepot();
  casse.issue(40, ["fire"]);
  casse.commentaireEnEchec = true;
  await assert.rejects(jouer(casse, PRISES, { gesture: "waiting", ticket: 40, what: "the API key", who: "the client" }), /HTTP 502/);
  assert.deepEqual(casse.labelsDe(40), ["fire"]);
});

test("fermer un doublon : l'issue se ferme ; un doublon de lui-même, ou d'une issue qui n'existe pas, est refusé", async () => {
  const depot = new FauxDepot();
  depot.issue(40, ["fire"]);
  depot.issue(12, ["fire"]);
  const trace = await jouer(depot, PRISES, { gesture: "close-duplicate", ticket: 40, of: 12 });
  assert.equal(depot.issues.get(40)?.state, "closed");
  assert.match(trace.comment ?? "", /- \*\*did\*\*: closed #40 as a duplicate of #12/);
  for (const original of [40, 99]) {
    const autre = new FauxDepot();
    autre.issue(40, ["fire"]);
    assert.equal((await jouer(autre, PRISES, { gesture: "close-duplicate", ticket: 40, of: original })).outcome, "refused");
    assert.equal(autre.issues.get(40)?.state, "open");
  }
});

test("relancer : les jobs en échec de chaque run rouge de la base, une fois par run ; sans check rouge relançable, refusé", async () => {
  const depot = new FauxDepot();
  depot.issue(40, ["fire"]);
  depot.checkRouge("tests (1/2)", 7);
  depot.checkRouge("tests (2/2)", 7);
  depot.checkRouge("types", 8);
  depot.checks.push({ name: "lint", status: "completed", conclusion: "success", html_url: "https://github.com/acme/shop/actions/runs/9/job/90" });
  assert.equal((await jouer(depot, PRISES, { gesture: "rerun" })).outcome, "done");
  assert.deepEqual(depot.relances(), [7, 8]);
  const vert = new FauxDepot();
  vert.issue(40, ["fire"]);
  assert.equal((await jouer(vert, PRISES, { gesture: "rerun" })).outcome, "refused");
  const statut = new FauxDepot();
  statut.issue(40, ["fire"]);
  statut.checks.push({ name: "deploy", status: "completed", conclusion: "failure", html_url: null });
  assert.equal((await jouer(statut, PRISES, { gesture: "rerun" })).outcome, "refused");
  assert.deepEqual(statut.relances(), []);
});

test("parked sur un ticket déjà parqué : refusé, rien n'est posé de plus", async () => {
  for (const labels of [["fire", "parked"], ["fire", "chef-todo"]]) {
    const depot = new FauxDepot();
    depot.issue(40, labels);
    const trace = await jouer(depot, PRISES, { gesture: "waiting", ticket: 40, what: "the API key", who: "the client" });
    assert.equal(trace.outcome, "refused", labels.join(","));
    assert.match(trace.comment ?? "", /#40 is parked \(`parked`\): it waits for someone, and nothing takes it before/);
    assert.doesNotMatch(trace.comment ?? "", /brigade:parked/);
    assert.deepEqual(depot.labelsDe(40), labels);
    assert.equal(depot.ecrits().length, 1);
  }
});

test("les tickets ouverts illisibles : aucun fix ne s'ouvre sans avoir cherché son doublon, et le run dit pourquoi", async () => {
  for (const [ouvertes, attendu] of [
    [async () => ({ inchange: true as const }), ["refused", /the open tickets could not be read/]],
    [async () => Promise.reject(new Error("gh api issues : HTTP 502")), ["failed", /- \*\*failed\*\*: fix: gh api issues : HTTP 502/]],
  ] as const) {
    const depot = new FauxDepot();
    depot.issue(40, ["fire"]);
    const github = Object.assign(Object.create(depot.client()), { ouvertes });
    const trace = await jouerLeRun({ github, depot: "acme/shop", branche: "main", maintenant: MAINTENANT }, PRISES, { saw: "x", gesture: { gesture: "fix", cause: "c", title: "Fix c", body: "b" } });
    assert.equal(trace.outcome, attendu[0]);
    assert.match(trace.comment ?? "", attendu[1]);
    assert.deepEqual(depot.creees(), []);
  }
});

test("main rouge : un ancien ticket de réparation automatique de main sur le même check n'est pas la même cause (#3945) — le fix s'ouvre", async () => {
  const depot = new FauxDepot();
  depot.checkRouge("tests (linux)", 7, 2);
  // Ouvert par la station avant #3945, de confiance, `prio:0`, sa marque de commit rouge et le check qu'il nommait.
  depot.issue(41, ["fire", "prio:0"], `<!-- brigade:base-rouge sha=${"b".repeat(40)} -->\n\n## What fails\n\n- \`tests (linux)\``);
  const fait = await jouer(depot, MAIN_ROUGE, { gesture: "fix", cause: "tests fail on linux", title: "Fix the linux tests", body: "Red after its rerun.", check: "tests (linux)" });
  assert.deepEqual([fait.outcome, fait.ticket, depot.creees().length], ["done", 500, 1]);
});
