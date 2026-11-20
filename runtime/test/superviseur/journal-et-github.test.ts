// Ce que le superviseur lit et fait sur GitHub (#3914) : la fin utile du journal d'un job rouge, l'étape en échec et
// l'historique du ticket fautif pour le dossier, et ses six gestes sur le client du tour — la relance attendue jusqu'à
// son verdict, sans un minuteur réel.
import assert from "node:assert/strict";
import { test } from "node:test";
import { estUnCorrectifDeLaCi } from "../../src/superviseur/correctif.ts";
import { etapeEnEchec, githubDuSuperviseur, historique, type ClientDuSuperviseur } from "../../src/superviseur/github.ts";
import { sortieDErreur } from "../../src/superviseur/journal-du-job.ts";

// Les mesures du superviseur, telles que ces tests les attendent : 80 lignes de log au plus, un sondage de la CI
// relancée toutes les 30 s, pendant 40 min au plus ; et la marque de la cause que porte un correctif.
const LIGNES_MAX = 80;
const SONDAGE_DE_LA_RELANCE_MS = 30_000;
const RELANCE_MAX_MS = 40 * 60_000;
const marqueDeCause = (cause: string) => `<!-- brigade:cause ${cause} -->`;

test("the useful end of a job log: no colours nor timestamps nor groups, cut after its last error, its blank edges trimmed", () => {
  const journal = ["2026-11-20T10:00:00.1234567Z ##[group]Run npm test", "", "\x1b[31mnot ok 3 - parser\x1b[0m", "##[endgroup]", "##[error]Process completed with exit code 1.", "Post job cleanup.", ""].join("\n");
  assert.equal(sortieDErreur(journal), "not ok 3 - parser\n##[error]Process completed with exit code 1.");
  assert.equal(sortieDErreur("\n\nonly line\n\n"), "only line", "without an error line, the whole log, its blank edges trimmed");
  const long = Array.from({ length: LIGNES_MAX + 20 }, (_, rang) => `line ${rang}`).join("\n");
  assert.equal(sortieDErreur(long).split("\n").length, LIGNES_MAX);
  assert.ok(sortieDErreur(long).endsWith(`line ${LIGNES_MAX + 19}`));
});

test("a log longer than its cap keeps its end, cut on a whole line", () => {
  assert.equal(sortieDErreur("aaaa\nbbbb\ncccc", 9), "…\ncccc");
  assert.equal(sortieDErreur("aaaa\nbbbb", 9), "aaaa\nbbbb", "at its cap, the log is kept whole");
  assert.equal(sortieDErreur("abcdefghij", 4), "…\nghij", "a single long line keeps its end");
});

const RUN = (run: number, job = 1) => `https://github.com/acme/shop/actions/runs/${run}/job/${job}`;

// Un client du tour en mémoire : la base, ses runs, ses issues, ce qu'on y écrit. `relances` : à chaque sondage, ce que
// GitHub dit du run relancé, dans l'ordre ; la base est verte après la relance si `vertApres`.
function client(options: { checks?: { name?: string; outcome: "red" | "green" | "pending"; url?: string }[]; etats?: { tentative: number; termine: boolean }[]; vertApres?: boolean; issue?: { labels: string[] } | null; issues?: { number: number; state?: string; body?: string | null }[] } = {}) {
  const ecrits: string[] = [];
  const instants: string[] = [];
  let horloge = Date.parse("2026-11-20T12:00:00Z");
  let relance = false;
  let sondages = 0;
  const etats = [...(options.etats ?? [])];
  let premierEtat = true;
  const c: ClientDuSuperviseur = {
    checksDeLaBase: async () => (relance && options.vertApres === true && etats.length === 0 ? (options.checks ?? []).map((check) => ({ ...check, outcome: "green" as const })) : (options.checks ?? [])),
    etatDuRun: async () => {
      if (premierEtat) {
        premierEtat = false;
        return { tentative: 1, termine: true };
      }
      sondages += 1;
      return etats.shift() ?? { tentative: 2, termine: true };
    },
    relancerLesEchecs: async (run) => {
      relance = true;
      ecrits.push(`rerun ${run}`);
    },
    issue: async (numero) => (options.issue === null ? null : { number: numero, title: "t", labels: options.issue?.labels ?? [], state: "open", createdAt: "", updatedAt: "", url: "" }),
    commentaires: async () => [{ body: "<!-- brigade:prise station=box -->\nTaken by station `box`.", association: "OWNER", createdAt: "2026-11-20T10:00:00Z" }, { body: "\n\nThe cook stopped: lint is red.\nmore", association: "OWNER", createdAt: "2026-11-20T11:00:00Z" }],
    commenter: async (numero, corps) => void ecrits.push(`comment #${numero}: ${corps}`),
    labelliser: async (numero, labels) => void ecrits.push(`+${labels.join(",")} #${numero}`),
    delabelliser: async (numero, label) => void ecrits.push(`-${label} #${numero}`),
    creerIssue: async ({ titre, corps, labels }) => (ecrits.push(`issue ${titre} [${labels.join(",")}] ${corps}`), 501),
    issuesDepuis: async (instant) => (instants.push(instant), options.issues ?? []),
    fermerIssue: async (numero) => void ecrits.push(`close #${numero}`),
    etapesEnEchec: async () => ["Typecheck"],
    journalDuCheck: async () => "##[group]x\nsrc/a.ts(3,1): error TS2322\n##[error]Process completed with exit code 2.\nCleanup",
  };
  const attendre = async (ms: number) => void (horloge += ms);
  return { c, ecrits, instants, attendre, maintenant: () => new Date(horloge), sondages: () => sondages };
}

test("the rerun relaunches each red run once, waits for its new attempt to finish, and reads the base again", async () => {
  const f = client({ checks: [{ name: "unit", outcome: "red", url: RUN(41) }, { name: "lint", outcome: "red", url: RUN(41, 2) }, { name: "windows tests (1/8)", outcome: "red", url: RUN(42) }, { name: "types", outcome: "green", url: RUN(43) }], etats: [{ tentative: 1, termine: true }, { tentative: 2, termine: false }, { tentative: 2, termine: true }], vertApres: true });
  const github = githubDuSuperviseur({ client: f.c, depot: "acme/shop", maintenant: f.maintenant, attendre: f.attendre });
  const avant = f.maintenant().getTime();
  assert.equal(await github.relancerLesJobs(), "vert");
  assert.deepEqual(f.ecrits, ["rerun 41"], "one rerun per red run, none for the informative Windows job");
  assert.equal(f.sondages(), 3, "it waits for the new attempt to be done");
  assert.equal(f.maintenant().getTime() - avant, 3 * SONDAGE_DE_LA_RELANCE_MS, "and no longer");
});

test("a rerun still red says so; a red check that is no GitHub Actions job is not rerun and stays red", async () => {
  const rouge = client({ checks: [{ name: "unit", outcome: "red", url: RUN(41) }] });
  assert.equal(await githubDuSuperviseur({ client: rouge.c, depot: "acme/shop", maintenant: rouge.maintenant, attendre: rouge.attendre }).relancerLesJobs(), "rouge");
  assert.deepEqual(rouge.ecrits, ["rerun 41"]);
  const sansRun = client({ checks: [{ name: "buildkite", outcome: "red" }] });
  assert.equal(await githubDuSuperviseur({ client: sansRun.c, depot: "acme/shop", maintenant: sansRun.maintenant, attendre: sansRun.attendre }).relancerLesJobs(), "rouge");
  assert.deepEqual(sansRun.ecrits, []);
});

test("a run still going when the rerun is asked is not rerun: its end is the verdict", async () => {
  const f = client({ checks: [{ name: "unit", outcome: "red", url: RUN(41) }], vertApres: true });
  let lectures = 0;
  const c: ClientDuSuperviseur = { ...f.c, etatDuRun: async () => (lectures++ === 0 ? { tentative: 1, termine: false } : { tentative: 1, termine: true }) };
  const github = githubDuSuperviseur({ client: c, depot: "acme/shop", maintenant: f.maintenant, attendre: f.attendre });
  await github.relancerLesJobs();
  assert.deepEqual(f.ecrits, [], "GitHub would refuse it");
  assert.equal(lectures, 2, "the end of its first attempt is enough");
});

test("the rerun waits at most its cap, then reads the base as it is", async () => {
  const f = client({ checks: [{ name: "unit", outcome: "red", url: RUN(41) }], etats: Array.from({ length: 200 }, () => ({ tentative: 2, termine: false })) });
  const avant = f.maintenant().getTime();
  assert.equal(await githubDuSuperviseur({ client: f.c, depot: "acme/shop", maintenant: f.maintenant, attendre: f.attendre }).relancerLesJobs(), "rouge");
  assert.equal(f.maintenant().getTime() - avant, RELANCE_MAX_MS);
  assert.equal(f.sondages(), RELANCE_MAX_MS / SONDAGE_DE_LA_RELANCE_MS);
});

test("putting a ticket back on the rail leaves its note, puts `fire` back and lifts what held it aside", async () => {
  const f = client({ issue: { labels: ["served-elsewhere", "waiting", "model:opus"] } });
  await githubDuSuperviseur({ client: f.c, depot: "acme/shop" }).remettreSurLeRail(12, "lint is fixed upstream");
  assert.deepEqual(f.ecrits, ["comment #12: <!-- brigade:superviseur-remis -->\nPut back on the rail by the supervisor.\n\n**Note for the next cook:** lint is fixed upstream", "+fire #12", "-served-elsewhere #12", "-waiting #12"]);
  const deja = client({ issue: { labels: ["fire"] } });
  await githubDuSuperviseur({ client: deja.c, depot: "acme/shop" }).remettreSurLeRail(12, "again");
  assert.equal(deja.ecrits.length, 1, "`fire` is not posed twice");
  await assert.rejects(githubDuSuperviseur({ client: client({ issue: null }).c, depot: "acme/shop" }).remettreSurLeRail(12, "n"), /#12 does not exist/);
});

test("setting a ticket aside names its third party, and its follow-up a week later", async () => {
  const f = client();
  await githubDuSuperviseur({ client: f.c, depot: "acme/shop", maintenant: () => new Date("2026-11-20T12:00:00.000Z") }).mettreEnAttente(12, "the bank");
  assert.equal(f.ecrits[0], "+waiting #12");
  assert.match(f.ecrits[1] ?? "", /"who":"the bank"/);
  assert.match(f.ecrits[1] ?? "", /"followUp":"2026-11-27T12:00:00.000Z"/);
});

test("closing a duplicate says which ticket it duplicates", async () => {
  const f = client();
  await githubDuSuperviseur({ client: f.c, depot: "acme/shop" }).fermer(3, 4);
  assert.deepEqual(f.ecrits, ["comment #3: Closed by the supervisor as a duplicate of #4.", "close #3"]);
});

test("a fix ticket carries its cause; the open tickets of the last month are read for theirs", async () => {
  const f = client({ issues: [{ number: 1, state: "open", body: `${marqueDeCause("ci:unit")}\nwhy` }, { number: 2, state: "closed", body: marqueDeCause("ci:lint") }, { number: 3, state: "open", body: "no cause" }, { number: 4, state: "open", body: null }] });
  const github = githubDuSuperviseur({ client: f.c, depot: "acme/shop", maintenant: () => new Date("2026-11-20T12:00:00.000Z") });
  assert.deepEqual(await github.ticketsOuverts(), [{ numero: 1, cause: "ci:unit" }]);
  assert.deepEqual(f.instants, ["2026-10-21T12:00:00.000Z"]);
  assert.equal(await github.ouvrirCorrectif({ titre: "Repair main: unit", corps: "the stack", cause: "ci:unit" }), 501);
  assert.deepEqual(f.ecrits, ["issue Repair main: unit [fix] <!-- brigade:cause ci:unit -->\nthe stack"]);
  assert.equal(estUnCorrectifDeLaCi(`${marqueDeCause("ci:unit")}\nwhy`), true);
  assert.equal(estUnCorrectifDeLaCi(`${marqueDeCause("code:parser")}\nwhy`), false);
  assert.equal(estUnCorrectifDeLaCi("no cause"), false);
});

test("a CI check whose name has spaces is read back whole: its open fix ticket is the duplicate of the next one", async () => {
  const cause = "ci:tests runtime (14/16)";
  const f = client({ issues: [{ number: 7, state: "open", body: `${marqueDeCause(cause)}\nthe stack` }] });
  const github = githubDuSuperviseur({ client: f.c, depot: "acme/shop", maintenant: () => new Date("2026-11-20T12:00:00.000Z") });
  assert.deepEqual(await github.ticketsOuverts(), [{ numero: 7, cause }]);
  assert.equal(estUnCorrectifDeLaCi(`${marqueDeCause(cause)}\nthe stack`), true);
});

test("a TODO card is a product or a design question on the ticket it names; with none, it is not posted", async () => {
  const f = client({ issue: { labels: ["fire"] } });
  const github = githubDuSuperviseur({ client: f.c, depot: "acme/shop" });
  await github.poserCarte({ nature: "produit", question: "Which price?", ticket: 8 });
  await github.poserCarte({ nature: "design", question: "Which layout?\nA or B", ticket: 9 });
  assert.deepEqual(f.ecrits.slice(0, 2), ["+chef-todo #8", "comment #8: <!-- brigade:todo kind=product-question -->\nThe kitchen has a product question on #8:\n\n> Which price?\n\nAnswer on this issue, and the kitchen goes on with your answer."]);
  assert.match(f.ecrits[3] ?? "", /The kitchen has a design question on #9:\n\n> Which layout\?\n> A or B/);
  await assert.rejects(github.poserCarte({ nature: "produit", question: "Which?" }), /a TODO card goes on a ticket/);
});

test("the dossier's CI step: the failing step of the first red check and its log lines; none when main is green", async () => {
  const f = client({ checks: [{ name: "lint", outcome: "green" }, { name: "types", outcome: "red", url: RUN(41) }] });
  assert.deepEqual(await etapeEnEchec(f.c), { etape: "types › Typecheck", lignes: ["src/a.ts(3,1): error TS2322", "##[error]Process completed with exit code 2."] });
  assert.equal(await etapeEnEchec(client({ checks: [{ name: "types", outcome: "green" }] }).c), null);
  const sansDetail = { ...f.c, etapesEnEchec: async () => [], journalDuCheck: async () => null };
  assert.deepEqual(await etapeEnEchec(sansDetail), { etape: "types", lignes: ["(the log of this job could not be read)"] });
});

test("the history of a ticket: each comment by its date and its first readable line", async () => {
  assert.deepEqual(await historique(client().c, 12), ["2026-11-20T10:00:00Z Taken by station `box`.", "2026-11-20T11:00:00Z The cook stopped: lint is red."]);
});
