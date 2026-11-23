// Each agent's next run (#4038): its text from a clock and a schedule handed in, the schedules the runtime already
// keeps — the supervisor's wake if nothing is merged, the closer's next pass —, noted where `facts` reads them back, and
// the records of `equipe` that show them. No real timer, no process.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { equipeDuProjet } from "../../../src/autonomie/agents/agents.ts";
import { horaireDe, HoraireIllisible, noterHoraire, prochainPassage } from "../../../src/autonomie/agents/prochain-passage.ts";
import { brancherCloserGithub, MERGES_PER_PASS, ONE_PASS_A_DAY_MS, type GitHubDuCloser } from "../../../src/closer-github-passe/closer-github-passe.ts";
import type { Ajout } from "../../../src/evenements.ts";
import { lireLesFaits } from "../../../src/faits.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import type { Runtime } from "../../../src/runtime.ts";
import { brancherSuperviseur } from "../../../src/superviseur/brancher.ts";
import { echeanceSansMerge, reveil, type FaitsDuProjet } from "../../../src/superviseur/declencheur.ts";
import type { SuiviDuTour } from "../../../src/superviseur/tour.ts";
import { jusqua, repertoireTemporaire } from "../../outils.ts";

const MAINTENANT = new Date("2026-11-23T12:00:00.000Z");
const A = (hhmm: string) => new Date(`2026-11-23T${hhmm}:00.000Z`);
const MINUTE = 60_000;
const NIVEAUX = { manager: "act", "manager split-epic": "propose", supervisor: "act", closer: "propose", pass: "act", cook: "act" } as const;
const SANS_GESTE = () => ({ counters: { fixedBySelf: 0, handedToChef: 0 }, gestures: [] });
const faits = (cuisinables: FaitsDuProjet["cuisinables"], dernierMerge: string | null = null): FaitsDuProjet => ({ dernierMerge, cuisinables, prises: [], mainRougeDepuis: null });

describe("the text of a next run", () => {
  test("the closer counts minutes under an hour, and once its day is over it waits for its merges", () => {
    assert.equal(prochainPassage("closer", MAINTENANT, { at: new Date(MAINTENANT.getTime() + 20 * MINUTE) }).text, "closer: next pass in 20 min");
    assert.equal(prochainPassage("closer", MAINTENANT, { at: new Date(MAINTENANT.getTime() + 30 * 1000) }).text, "closer: next pass in 1 min");
    assert.deepEqual(prochainPassage("closer", MAINTENANT, { at: MAINTENANT }), { text: `closer: next pass once ${MERGES_PER_PASS} merges are in`, at: MAINTENANT.toISOString() });
  });

  test("an agent with a schedule other than the closer's and the supervisor's runs in a time, or now", () => {
    assert.equal(prochainPassage("manager", MAINTENANT, { at: new Date(MAINTENANT.getTime() + 2 * 3_600_000) }).text, "manager: next run in 2 h");
    assert.equal(prochainPassage("manager", MAINTENANT, { at: new Date(MAINTENANT.getTime() - MINUTE) }).text, "manager: next run due now");
  });

  test("with no schedule, each kind of agent says what it does instead, and no time", () => {
    const sans = (agent: string) => prochainPassage(agent, MAINTENANT, null);
    assert.deepEqual(sans("manager"), { text: "manager: runs when a ticket or the supervisor calls it", at: null });
    assert.equal(sans("supervisor").text, "supervisor: no wake scheduled");
    assert.equal(sans("closer").text, "closer: no pass scheduled");
    assert.equal(sans("pass").text, "pass: reviews each delivery as it comes");
    assert.equal(sans("cook #12").text, "cook #12: works until it delivers");
  });
});

describe("the schedules the runtime keeps", () => {
  test("the supervisor wakes 30 min after the oldest cookable ticket began to wait, or after a later merge; with nothing cookable, never", () => {
    assert.equal(echeanceSansMerge(faits([])), null);
    assert.deepEqual(echeanceSansMerge(faits([{ ticket: 4, depuis: A("18:10").toISOString() }, { ticket: 5, depuis: A("18:20").toISOString() }])), A("18:40"));
    assert.deepEqual(echeanceSansMerge(faits([{ ticket: 4, depuis: A("17:00").toISOString() }], A("18:10").toISOString())), A("18:40"));
    assert.equal(echeanceSansMerge(faits([{ ticket: 4, depuis: "not a date" }])), null);
  });

  test("its wake still comes at that time: not a minute before", () => {
    const vus = faits([{ ticket: 4, depuis: A("18:10").toISOString() }]);
    assert.equal(reveil(vus, A("18:39")), null);
    assert.deepEqual(reveil(vus, A("18:40")), { cause: "no-merge", since: A("18:10").toISOString(), ticket: 4 });
  });

});

describe("the schedules noted in the state directory", () => {
  test("a noted schedule is read back, an instant or none; never noted, it is not known; the manager keeps none", (t) => {
    const repertoire = repertoireTemporaire(t);
    assert.equal(horaireDe(repertoire, "supervisor"), undefined);
    noterHoraire(repertoire, "supervisor", A("18:40"));
    assert.deepEqual(horaireDe(repertoire, "supervisor"), { at: A("18:40") });
    noterHoraire(repertoire, "closer", null);
    assert.equal(horaireDe(repertoire, "closer"), null);
    assert.equal(horaireDe(repertoire, "manager"), null);
  });

  test("a file that cannot be read is refused, never read as no schedule", (t) => {
    const repertoire = repertoireTemporaire(t);
    writeFileSync(join(repertoire, "autonomy-next-run-closer.json"), "{not json");
    assert.throws(() => horaireDe(repertoire, "closer"), HoraireIllisible);
    writeFileSync(join(repertoire, "autonomy-next-run-closer.json"), JSON.stringify({ at: "soon" }));
    assert.throws(() => horaireDe(repertoire, "closer"), /holds no \{at\}/);
    writeFileSync(join(repertoire, "autonomy-next-run-closer.json"), "[]");
    assert.throws(() => horaireDe(repertoire, "closer"), /holds no \{at\}/);
  });
});

describe("the next run of each record of `equipe`", () => {
  function etat(t: TestContext) {
    const repertoire = repertoireTemporaire(t);
    const journal = ouvrirJournal(repertoire);
    journal.ajouter({ project: "shop", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } } as Ajout);
    journal.fermer();
    return { repertoire, env: { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: "shop" } };
  }
  const prochains = (env: Record<string, string>) => Object.fromEntries((lireLesFaits(env, MAINTENANT).equipe as ReturnType<typeof equipeDuProjet>).map(({ agent, nextRun }) => [agent, nextRun]));

  test("`facts` gives each agent's next run from the schedules the runtime noted", (t) => {
    const { repertoire, env } = etat(t);
    noterHoraire(repertoire, "closer", new Date(MAINTENANT.getTime() + 3 * 3_600_000));
    noterHoraire(repertoire, "supervisor", null);
    assert.deepEqual(prochains(env), {
      manager: { text: "manager: runs when a ticket or the supervisor calls it", at: null },
      supervisor: { text: "supervisor: no wake scheduled", at: null },
      closer: { text: "closer: next pass in 3 h", at: "2026-11-23T15:00:00.000Z" },
      pass: { text: "pass: reviews each delivery as it comes", at: null },
    });
  });

  test("a schedule never noted is not known yet; one that cannot be read says so, and the other records are still given", (t) => {
    const { repertoire, env } = etat(t);
    writeFileSync(join(repertoire, "autonomy-next-run-closer.json"), "{not json");
    const lus = prochains(env);
    assert.deepEqual(lus.supervisor, { text: "supervisor: next run not known yet", at: null });
    assert.match(lus.closer?.text ?? "", /^closer: next run cannot be read — .*autonomy-next-run-closer\.json cannot be read/);
    assert.equal(lus.closer?.at, null);
    assert.equal(lus.pass?.text, "pass: reviews each delivery as it comes");
  });

  test("a reader with no schedules gives no next run; an error other than an unreadable file is not swallowed", () => {
    const sources = { agents: [], cooks: [{ ticket: 12 }], roles: [], niveaux: NIVEAUX, gestes: SANS_GESTE };
    assert.deepEqual(equipeDuProjet(sources).map(({ nextRun }) => nextRun), [null, null, null, null, null]);
    assert.equal(equipeDuProjet({ ...sources, horaires: { maintenant: MAINTENANT, de: () => null } }).at(-1)?.nextRun?.text, "cook #12: works until it delivers");
    const de = () => {
      throw new Error("disk gone");
    };
    assert.throws(() => equipeDuProjet({ ...sources, horaires: { maintenant: MAINTENANT, de } }), /disk gone/);
  });
});

describe("the runtime notes the schedules as it reads them", () => {
  test("the supervisor notes when it wakes if nothing is merged, at each of its runtime's wakes", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    let vus = faits([{ ticket: 4, depuis: A("18:10").toISOString() }]);
    const tour = { faits: () => vus, checks: () => null, sauts: () => [] } as unknown as SuiviDuTour;
    let ecouter: (() => void) | null = null;
    const runtime = { projet: "shop", journal, repertoireEtat: repertoire, surReveil: (ecoute: () => void) => ((ecouter = ecoute), () => {}) } as unknown as Runtime;
    const dits: string[] = [];
    brancherSuperviseur(runtime, { tour, github: {} as never, depot: "acme/shop", branche: "main", consulter: () => async () => ({ message: "{}" }), maintenant: () => A("18:20"), dire: (ligne) => void dits.push(ligne) });
    (ecouter as unknown as () => void)();
    assert.deepEqual(horaireDe(repertoire, "supervisor"), { at: A("18:40") });
    vus = faits([]);
    (ecouter as unknown as () => void)();
    assert.equal(horaireDe(repertoire, "supervisor"), null);
    assert.deepEqual(dits, []);
  });

  test("a note the supervisor cannot write is said, and stops nothing else", async (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    const tour = { faits: () => faits([{ ticket: 4, depuis: A("18:10").toISOString() }]), checks: () => null, sauts: () => [] } as unknown as SuiviDuTour;
    let ecouter: (() => void) | null = null;
    const runtime = { projet: "shop", journal, surReveil: (ecoute: () => void) => ((ecouter = ecoute), () => {}) } as unknown as Runtime;
    const dits: string[] = [];
    brancherSuperviseur(runtime, { tour, github: {} as never, depot: "acme/shop", branche: "main", consulter: () => async () => ({ message: "{}" }), repertoireEtat: join(repertoireTemporaire(t), "missing", "dir"), maintenant: () => A("18:20"), dire: (ligne) => void dits.push(ligne) });
    (ecouter as unknown as () => void)();
    assert.equal(dits.length, 1);
    assert.match(dits[0] ?? "", /^supervisor on shop: its next wake was not noted — /);
  });

  // A closer branched on a runtime of its wakes only, whose GitHub knows `passes`.
  function closer(t: TestContext, options: { calibre: boolean; passes: Array<{ number: number; createdAt: string; state: "open" | "closed" }>; noter: (at: Date | null) => void }) {
    const ecouteurs = new Set<(cause: "tick" | "log") => void>();
    const runtime = { projet: "shop", surReveil: (ecouter: (cause: "tick" | "log") => void) => (ecouteurs.add(ecouter), () => void ecouteurs.delete(ecouter)), arreter: () => {} } as unknown as Runtime;
    const body = "<!-- brigade:fermeture sha=abc -->";
    const github = { issuesDepuis: async () => options.passes.map((passe) => ({ ...passe, title: "Closing pass", labels: [], association: "MEMBER", body })) } as unknown as GitHubDuCloser;
    const lectures = { merges: 0 };
    const avertissements: string[] = [];
    const branche = brancherCloserGithub(runtime, {
      reglages: () => ({ calibration: options.calibre ? { model: "sonnet", effort: "low" } : null, removedLines: 20 }),
      github,
      clone: { merges: async () => (lectures.merges++, []), observer: async () => ({ sha: "0", merges: [], textes: [] }) },
      base: "main",
      ecartMs: 0,
      maintenant: () => MAINTENANT,
      avertir: (m) => void avertissements.push(m),
      derive: { seuils: () => ({}) as never, couts: {} as never, noter: () => {} },
      noterProchainePasse: options.noter,
    });
    t.after(() => branche.arreter("test"));
    return { reveiller: () => ecouteurs.forEach((ecouter) => ecouter("tick")), lectures, avertissements };
  }

  test("the closer notes its next pass at each pass, and none while it is not set", async (t) => {
    const notes: Array<Date | null> = [];
    const hier = new Date(MAINTENANT.getTime() - 21 * 3_600_000).toISOString();
    const calibre = closer(t, { calibre: true, passes: [{ number: 3, createdAt: hier, state: "closed" }], noter: (at) => void notes.push(at) });
    calibre.reveiller();
    await jusqua(() => calibre.lectures.merges > 0);
    assert.deepEqual(notes, [new Date(MAINTENANT.getTime() + 3 * 3_600_000)]);
    assert.equal(prochainPassage("closer", MAINTENANT, { at: notes[0] as Date }).text, "closer: next pass in 3 h");

    const sansLui: Array<Date | null> = [];
    const sansReglage = closer(t, { calibre: false, passes: [], noter: (at) => void sansLui.push(at) });
    sansReglage.reveiller();
    await jusqua(() => sansReglage.lectures.merges > 0);
    assert.deepEqual(sansLui, [null]);
  });

  test("the closer's next pass is a day after the last one, now with none known, and none while one is open", async (t) => {
    const noteDe = async (passes: Array<{ number: number; createdAt: string; state: "open" | "closed" }>) => {
      const notes: Array<Date | null> = [];
      const branche = closer(t, { calibre: true, passes, noter: (at) => void notes.push(at) });
      branche.reveiller();
      await jusqua(() => branche.lectures.merges > 0);
      return notes;
    };
    assert.deepEqual(await noteDe([]), [MAINTENANT]);
    assert.deepEqual(await noteDe([{ number: 3, createdAt: A("09:00").toISOString(), state: "closed" }]), [new Date(A("09:00").getTime() + ONE_PASS_A_DAY_MS)]);
    assert.deepEqual(await noteDe([{ number: 3, createdAt: A("09:00").toISOString(), state: "open" }]), [null]);
  });

  test("a note the closer cannot write is said, and its pass goes on", async (t) => {
    const ferme = closer(t, {
      calibre: true,
      passes: [],
      noter: () => {
        throw new Error("disk full");
      },
    });
    ferme.reveiller();
    await jusqua(() => ferme.lectures.merges > 0);
    assert.deepEqual(ferme.avertissements, ["brigade : the closer's next pass not noted — disk full"]);
  });
});
