// Stalled runs (#3599): a run the inactivity guard stopped having never
// started, or hung on a command, is a stall — not a failure of the work. It does
// not count for the breaker, the kitchen relaunches it by itself, and only
// stalls that keep coming after the relaunches open the breaker, to tell the
// chef what keeps stalling. Such a breaker closes by itself as soon as a later
// run completes normally.
//
// Real runtime, real guardrails, real inactivity timer: only `claude` is fake —
// silent (`muet`), hung on `cat` (`pendu-sur-cat.sh`), or working (`fini`).
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { corpsDeLIssue, disjoncteurDuJournal } from "../../src/breaker-issue.ts";
import { RELANCES_SUR_CALAGE } from "../../src/breaker/calage.ts";
import { lireFlux, verdict } from "../../src/claude.ts";
import { brancherGardeFous, LancementRefuse, type DemandeCook, type Reglages } from "../../src/garde-fous.ts";
import { principal as gardeFous } from "../../src/garde-fous-cli.ts";
import { gardesDuTour } from "../../src/github-seul/garde-fous/garde-fous.ts";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { lireReglages } from "../../src/plafonds.ts";
import { etatDesGardeFous } from "../../src/projections/guardrails.ts";
import { demarrer } from "../../src/runtime.ts";
import { FauxGitHub } from "../faux-github.ts";
import { appeler, ecrireSuite, ENV_ENFANT, FAUX_CLAUDE, repertoireTemporaire } from "../outils.ts";

const PENDU_SUR_CAT = join(import.meta.dirname, "pendu-sur-cat.sh");

// The settings production reads, with an inactivity cap a test can wait for:
// a silent cook is stopped after 300 ms of real time. A working fake `claude`
// speaks well before that.
const IDLE_MS = 300;
const PRODUCTION: Reglages = { ...lireReglages({}), plafonds: { ...lireReglages({}).plafonds, idleMs: IDLE_MS }, graceMs: 2000 };

function cuisine(t: TestContext, reglages: Reglages = PRODUCTION) {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous(reglages, demarrer({ repertoireEtat: repertoire, projet: "secondes", intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  const faits = (type: string) => runtime.journal.tout().filter((e) => e.type === type).map((e) => e.payload as Record<string, unknown>);
  // A run outside any ticket, as the manager and the GitHub-only station launch theirs.
  // `suite`: the fake `claude`'s scenarios, one per launch; `pendu`: how many launches hang on `cat` first.
  const lancer = (run: string, options: { station?: string; suite?: string[]; scenario?: string; pendu?: number; demande?: Partial<DemandeCook> } = {}) => {
    const env: Record<string, string> = { ...ENV_ENFANT, FAUX_CLAUDE: options.scenario ?? "fini" };
    if (options.suite) {
      env.FAUX_CLAUDE_SUITE = join(repertoire, `suite-${run}`);
      ecrireSuite(env.FAUX_CLAUDE_SUITE, options.suite);
    }
    if (options.pendu !== undefined) Object.assign(env, { PENDU: join(repertoire, `pendu-${run}`), PENDU_FOIS: String(options.pendu) });
    return runtime.lancer({
      ticket: null,
      run,
      contexte: { station: options.station ?? "box/claude" },
      commande: options.pendu === undefined ? FAUX_CLAUDE : PENDU_SUR_CAT,
      args: [],
      env,
      ...options.demande,
    });
  };
  return { repertoire, runtime, faits, lancer };
}

// Without in-place relaunches: each stall is the end of its run.
const SANS_RELANCE: Reglages = { plafonds: PRODUCTION.plafonds, seuilDisjoncteur: 3, graceMs: 2000 };

test("a run stopped for inactivity with 0 turns and 0 tokens is a stall: it does not count for the breaker", async (t) => {
  const { runtime, faits, lancer } = cuisine(t, SANS_RELANCE);

  const fin = await lancer("juge-45-0000aaaa", { station: "manager", scenario: "muet" }).fin;

  assert.deepEqual([fin.outcome, fin.turns, fin.tokens], ["stalled", 0, 0]);
  assert.deepEqual(faits("guard.tripped").map((p) => p.reason), ["idle"]);
  assert.deepEqual(faits("cook.exited").map((p) => p.outcome), ["stalled"]);
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 0);
});

test("a run stopped for inactivity while a command waits for its input is a stall: it does not count for the breaker", async (t) => {
  const { runtime, lancer } = cuisine(t, SANS_RELANCE);

  const fin = await lancer("44-github-0000bbbb", { pendu: 1 }).fin;

  assert.equal(fin.outcome, "stalled");
  assert.deepEqual([fin.turns, fin.activite?.doing, fin.activite?.target], [1, "running", "cat"]);
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 0);
});

test("three stalls in a row, as on 2026-11-15, leave the breaker closed — but a run that worked then went silent is still a guard stop that counts", async (t) => {
  const { runtime, lancer } = cuisine(t, SANS_RELANCE);

  const calages = await Promise.all([
    lancer("juge-45-0000cccc", { station: "manager", scenario: "muet" }).fin,
    lancer("44-github-0000dddd", { pendu: 1 }).fin,
    lancer("juge-46-0000eeee", { station: "manager", scenario: "muet" }).fin,
  ]);
  assert.deepEqual(calages.map((fin) => fin.outcome), ["stalled", "stalled", "stalled"]);
  assert.deepEqual([etatDesGardeFous(runtime.journal.base).failures, etatDesGardeFous(runtime.journal.base).breakerOpenedAt], [0, null]);

  const silencieux = await lancer("juge-47-0000ffff", { station: "manager", scenario: "muet-apres-un-tour" }).fin;

  assert.equal(silencieux.outcome, "guard");
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 1);
});

test(`the kitchen relaunches a stalled run by itself, at most RELANCES_SUR_CALAGE (${RELANCES_SUR_CALAGE}) times, which production reads`, async (t) => {
  assert.equal(lireReglages({}).relancesSurCalage, RELANCES_SUR_CALAGE);
  const { runtime, faits, lancer } = cuisine(t);

  const lance = lancer("juge-45-1111aaaa", { station: "manager", suite: ["muet", "fini"] });
  const fin = await lance.fin;

  assert.equal(lance.run, "juge-45-1111aaaa");
  assert.deepEqual([fin.outcome, fin.run], ["ok", "juge-45-1111aaaa-r1"]);
  assert.deepEqual(
    faits("cook.launched").map((p) => [p.run, p.stallRetry]),
    [
      ["juge-45-1111aaaa", undefined],
      ["juge-45-1111aaaa-r1", { of: "juge-45-1111aaaa", attempt: 1 }],
    ],
  );
  assert.deepEqual(faits("cook.exited").map((p) => p.outcome), ["stalled", "ok"]);
  assert.deepEqual(faits("breaker.opened"), []);
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 0);
});

test("a cook that stalls on `cat` after all its relaunches opens the breaker for the chef, who reads what keeps stalling", async (t) => {
  const { runtime, faits, lancer } = cuisine(t);

  const fin = await lancer("44-github-2222aaaa", { pendu: 1 + RELANCES_SUR_CALAGE }).fin;

  assert.equal(fin.outcome, "stalled");
  assert.deepEqual(faits("cook.exited").map((p) => p.outcome), ["stalled", "stalled", "stalled"]);
  assert.deepEqual(faits("breaker.opened"), [
    {
      failures: 0,
      threshold: 3,
      stalled: { run: "44-github-2222aaaa-r2", kind: "cook", turns: 1, tokens: 10, activity: { doing: "running", target: "cat" }, retries: RELANCES_SUR_CALAGE },
    },
  ]);
  assert.throws(
    () => lancer("45-github-2222bbbb"),
    (erreur: unknown) => erreur instanceof LancementRefuse && erreur.motif === "breaker" && /a cook run \(`44-github-2222aaaa-r2`\) hung on `running cat`, a command that never returned, still after 2 relaunches/.test(erreur.message),
  );
  const disjoncteur = disjoncteurDuJournal(runtime.journal.base);
  assert.ok(disjoncteur.ouvert);
  if (!disjoncteur.ouvert) return;
  const corps = corpsDeLIssue("secondes", disjoncteur);
  assert.match(corps, /opened because a run keeps stalling/);
  assert.match(corps, /\*\*What keeps stalling\*\*: a cook run \(`44-github-2222aaaa-r2`\) hung on `running cat`/);
  assert.match(corps, /relaunched this run by itself, 2 times, and it stalled every time/);
});

test("a manager judgement that never starts, relaunches included, escalates naming the manager run", async (t) => {
  const { repertoire, faits, lancer } = cuisine(t);

  await lancer("juge-45-3333aaaa", { station: "manager", scenario: "muet" }).fin;

  const [ouverture] = faits("breaker.opened");
  assert.deepEqual(ouverture?.stalled, { run: "juge-45-3333aaaa-r2", kind: "manager", turns: 0, tokens: 0, activity: null, retries: RELANCES_SUR_CALAGE });
  assert.throws(() => lancer("juge-46-3333bbbb"), /a manager run \(`juge-45-3333aaaa-r2`\) never started \(0 turns, 0 tokens\), still after 2 relaunches/);
  // What the chef's `guardrails` says.
  const cli = appeler(gardeFous, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await cli.fin, 0);
  assert.match(cli.sortie(), /breaker\s+OPEN since \S+: a run keeps stalling — a manager run \(`juge-45-3333aaaa-r2`\) never started/);
});

test("a breaker opened by stalls closes by itself once a later run completes normally, with no gesture from the chef", async (t) => {
  const { repertoire, runtime, faits, lancer } = cuisine(t);
  const feu = join(repertoire, "feu");
  // Still in progress when the other run's stalls open the breaker: it waits for the test, and speaks once.
  const enCours = lancer("44-github-4444aaaa", { scenario: "attend", demande: { plafonds: { idleMs: 60_000 }, env: { ...ENV_ENFANT, FAUX_CLAUDE: "attend", FAUX_CLAUDE_FEU: feu } } });
  await lancer("juge-45-4444bbbb", { station: "manager", scenario: "muet" }).fin;
  assert.notEqual(etatDesGardeFous(runtime.journal.base).breakerOpenedAt, null);
  assert.throws(() => lancer("46-github-4444cccc"), LancementRefuse);

  writeFileSync(feu, "");
  assert.equal((await enCours.fin).outcome, "ok");

  assert.equal(etatDesGardeFous(runtime.journal.base).breakerOpenedAt, null);
  assert.deepEqual(faits("breaker.lifted"), [{ failures: 0, threshold: 3, after: "44-github-4444aaaa" }]);
  assert.deepEqual(faits("kitchen.resumed"), []);
  const disjoncteur = disjoncteurDuJournal(runtime.journal.base);
  assert.deepEqual(disjoncteur, { ouvert: false, reprisLe: runtime.journal.tout().find((e) => e.type === "breaker.lifted")?.at });
  assert.equal((await lancer("46-github-4444dddd").fin).outcome, "ok");
});

test("real failures still count as before: a stall between them neither counts nor resets them, and the breaker they open waits for the chef", async (t) => {
  const { repertoire, runtime, faits, lancer } = cuisine(t, SANS_RELANCE);
  const feu = join(repertoire, "feu");
  const enCours = lancer("50-github-5555aaaa", { demande: { plafonds: { idleMs: 60_000 }, env: { ...ENV_ENFANT, FAUX_CLAUDE: "attend", FAUX_CLAUDE_FEU: feu } } });

  await lancer("51-github-5555bbbb", { scenario: "echec" }).fin;
  assert.equal((await lancer("52-github-5555cccc", { scenario: "muet" }).fin).outcome, "stalled");
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 1);
  await lancer("53-github-5555dddd", { scenario: "echec" }).fin;
  await lancer("54-github-5555eeee", { scenario: "echec" }).fin;

  assert.deepEqual(faits("breaker.opened"), [{ failures: 3, threshold: 3 }]);
  writeFileSync(feu, "");
  assert.equal((await enCours.fin).outcome, "ok");
  assert.notEqual(etatDesGardeFous(runtime.journal.base).breakerOpenedAt, null);
  assert.deepEqual(faits("breaker.lifted"), []);
});

test("replay of 2026-11-15: a manager judgement stalls, the cook of #44 hangs on `cat`, then they work — the breaker stays closed and #44 is served", async (t) => {
  const { repertoire, runtime, faits, lancer } = cuisine(t);
  const gardes = gardesDuTour({ garde: runtime, station: "box/claude", repertoireEtat: repertoire, arbitre: null, avertir: () => {} });
  const faux = new FauxGitHub();
  faux.feu(44);
  const lus: string[] = [];
  const station = faux.station("box/claude", {
    // The cook of #44, launched as the GitHub-only station launches it: through its guards.
    cuisiner: async (numero) => {
      const env = { ...ENV_ENFANT, FAUX_CLAUDE: "fini", PENDU: join(repertoire, `pendu-${numero}`), PENDU_FOIS: "1" };
      const lance = gardes.lancer({ commande: PENDU_SUR_CAT, args: [], cwd: repertoire, env, flux: join(repertoire, `${numero}-github.flux.jsonl`) });
      const fin = await lance.fin;
      // The stream read after the end is the relaunch's: the one that delivered.
      const flux = lance.flux ?? "";
      lus.push(verdict(lireFlux(existsSync(flux) ? readFileSync(flux, "utf8") : ""), fin.code));
      return fin.code === 0 && fin.arret === null ? { branche: brancheDuTicket(numero) } : { echec: "no delivery" };
    },
  });

  // 1. The manager's judgement of #45 never starts (turns 0, tokens 0); relaunched, it answers.
  const jugement = await lancer("juge-45-6666aaaa", { station: "manager", suite: ["muet", "fini"] }).fin;
  assert.equal(jugement.outcome, "ok");
  // 2. The cook of #44 hangs on `running cat`; relaunched, it delivers, and the pass merges it.
  for (let tour = 0; tour < 6 && faux.mergee(44) === undefined; tour++) {
    await station.tour();
    await station.calme();
  }

  assert.deepEqual(lus, ["done"]);
  assert.notEqual(faux.mergee(44), undefined);
  assert.deepEqual(
    faits("cook.exited").map((p) => [p.run, p.outcome]),
    [
      ["juge-45-6666aaaa", "stalled"],
      ["juge-45-6666aaaa-r1", "ok"],
      [String(faits("cook.launched")[2]?.run), "stalled"],
      [`${String(faits("cook.launched")[2]?.run)}-r1`, "ok"],
    ],
  );
  assert.match(String(faits("cook.launched")[2]?.run), /^44-github-[0-9a-f]{8}$/);
  const etat = etatDesGardeFous(runtime.journal.base);
  assert.deepEqual([etat.failures, etat.breakerOpenedAt], [0, null]);
  assert.deepEqual(faits("breaker.opened"), []);
});
