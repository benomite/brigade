// The logbook of the day as the runtime runs it (#4280): the morning digest built from the agents' threads and the
// post-mortems on the runtime's tick, kept for the project view and pushed nowhere; and the gate of the agents'
// gestures, which notifies the chef of a gesture handed to them, and of no other.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { consignerGeste, gestesDe, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { porteDuRuntime } from "../../src/autonomie/agents/porte.ts";
import { faits, lireEtat } from "../../src/etat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { digestDeLaVeille } from "../../src/journal-du-jour/digest.ts";
import { brancherLeDigest } from "../../src/journal-du-jour/matin.ts";
import { publierLeDigest } from "../../src/journal-du-jour/publication.ts";
import { terminerLaPanne } from "../../src/post-mortems/post-mortems.ts";
import type { CauseReveil } from "../../src/runtime.ts";
import { aArreter, horloge, repertoireTemporaire } from "../outils.ts";

const PROJET = "shop";
const a = (iso: string) => () => new Date(iso);
const MATIN = new Date("2026-11-25T07:00:00.000Z");
const geste = (at: string, line: string, outcome: string) => ({ at, line, reason: "r", outcome });

function ouvrir(t: Parameters<typeof repertoireTemporaire>[0]) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  aArreter(t, () => journal.fermer());
  return { repertoire, journal };
}

const vue = (journal: ReturnType<typeof ouvrir>["journal"]) => faits(lireEtat(journal, MATIN), MATIN);

test("a gesture with no kind is read from its outcome, a gesture not done is left out, and a long list is counted", () => {
  const texte = digestDeLaVeille(
    {
      postMortems: [{ vuEnPremier: "system", fin: "2026-11-24T10:00:00.000Z" }, { vuEnPremier: "chef", fin: "2026-11-24T23:59:59.999Z" }, { vuEnPremier: "chef", fin: "2026-11-25T00:00:00.000Z" }],
      fils: {
        supervisor: [geste("2026-11-24T09:00:00.000Z", "reran main", OUTCOME.FIXED_BY_SELF), geste("2026-11-24T10:00:00.000Z", "zone cycle stuck", OUTCOME.HANDED_TO_CHEF), geste("2026-11-24T11:00:00.000Z", "would rerun", OUTCOME.NOT_DONE)],
        cook: ["#1", "#2", "#3", "#4", "#5"].map((n, i) => ({ ...geste(`2026-11-24T0${i}:00:00.000Z`, `merged ${n}`, OUTCOME.FIXED_BY_SELF), kind: "delivered" })),
      },
    },
    MATIN,
  );
  assert.deepEqual(texte.split("\n"), [
    "1 outage seen first by the chef yesterday, 1 first by the system.",
    "Delivered: merged #1; merged #2; merged #3 and 2 more.",
    "Fixed by itself: reran main.",
    "Could not fix: zone cycle stuck.",
  ]);
});

test("each line names its gestures in the order of the day, whichever thread they come from", () => {
  const texte = digestDeLaVeille(
    {
      postMortems: [],
      fils: {
        closer: [{ ...geste("2026-11-24T15:00:00.000Z", "merged #3", OUTCOME.FIXED_BY_SELF), kind: "delivered" }],
        cook: [{ ...geste("2026-11-24T08:00:00.000Z", "merged #1", OUTCOME.FIXED_BY_SELF), kind: "delivered" }, { ...geste("2026-11-24T20:00:00.000Z", "merged #4", OUTCOME.FIXED_BY_SELF), kind: "delivered" }],
        supervisor: [{ ...geste("2026-11-24T12:00:00.000Z", "merged #2", OUTCOME.FIXED_BY_SELF), kind: "delivered" }],
      },
    },
    MATIN,
  );
  assert.equal(texte.split("\n")[1], "Delivered: merged #1; merged #2; merged #3 and 1 more.");
});

test("a gesture its agent calls unfixed is on the could-not-fix line, handed to the chef or not", () => {
  const texte = digestDeLaVeille({ postMortems: [], fils: { supervisor: [{ ...geste("2026-11-24T09:00:00.000Z", "would restart the station", OUTCOME.NOT_DONE), kind: "unfixed" }, geste("2026-11-24T10:00:00.000Z", "zone cycle stuck", OUTCOME.HANDED_TO_CHEF)] } }, MATIN);
  assert.equal(texte.split("\n")[1], "Could not fix: would restart the station; zone cycle stuck.");
});

test("a quiet day with outages seen first by the system says how many, on its one line", () => {
  assert.equal(digestDeLaVeille({ postMortems: [{ vuEnPremier: "system", fin: "2026-11-24T00:00:00.000Z" }, { vuEnPremier: "system", fin: "2026-11-24T05:00:00.000Z" }], fils: {} }, MATIN), "0 outages seen first by the chef yesterday, 2 first by the system — nothing else to report.");
});

// The digest's morning, driven by the runtime's ticks on a clock the test moves.
function matin(t: Parameters<typeof repertoireTemporaire>[0], depart: string) {
  const { repertoire, journal } = ouvrir(t);
  const avertis: string[] = [];
  const ecouteurs: ((cause: CauseReveil) => void)[] = [];
  const horloge = { maintenant: new Date(depart) };
  brancherLeDigest({ journal, projet: PROJET, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}) }, { repertoireEtat: repertoire, avertir: (ligne) => void avertis.push(ligne), maintenant: () => horloge.maintenant });
  const tick = (cause: CauseReveil = "tick") => ecouteurs.forEach((ecouter) => ecouter(cause));
  return { repertoire, journal, avertis, horloge, tick };
}

test("each morning, once, the digest of yesterday is read from the threads and the post-mortems and kept for the project view", (t) => {
  const { repertoire, journal, avertis, horloge, tick } = matin(t, "2026-11-25T05:59:59.000Z");
  consignerGeste(repertoire, "supervisor", { line: "reran main", reason: "red", outcome: OUTCOME.FIXED_BY_SELF }, a("2026-11-24T09:00:00.000Z"));
  consignerGeste(repertoire, "closer", { line: "closed #12, a duplicate", reason: "same as #11", outcome: OUTCOME.HANDED_TO_CHEF }, a("2026-11-24T10:00:00.000Z"));
  terminerLaPanne(repertoire, PROJET, { id: "o1", debut: "2026-11-24T08:00:00.000Z", fin: "2026-11-24T09:00:00.000Z", cause: "main was red", detecteeParLeSysteme: "2026-11-24T08:30:00.000Z", signaleeParLeChef: "2026-11-24T08:10:00.000Z", corrigePar: null, ticketDuCorrectif: null });

  tick();
  assert.equal(vue(journal).digest, null, "not before the morning hour");

  horloge.maintenant = new Date("2026-11-25T06:00:00.000Z");
  tick();
  const digest = vue(journal).digest;
  assert.deepEqual(digest && { day: digest.day, text: digest.text }, {
    day: "2026-11-24",
    text: "1 outage seen first by the chef yesterday.\nFixed by itself: reran main.\nCould not fix: closed #12, a duplicate.",
  });
  horloge.maintenant = new Date("2026-11-25T09:00:00.000Z");
  tick();
  assert.equal(journal.duType("digest.published", 10).length, 1, "once a day");
  assert.equal(journal.duType("chef.notified", 10).length, 0, "building the digest notifies nobody");
  assert.deepEqual(avertis, []);

  horloge.maintenant = new Date("2026-11-26T06:00:00.000Z");
  tick();
  assert.equal(vue(journal).digest?.day, "2026-11-25");
  assert.equal(journal.duType("digest.published", 10).length, 2);
});

test("threads that cannot be read publish nothing, say why, and the tick tries again ten minutes later", (t) => {
  const { repertoire, journal, avertis, horloge, tick } = matin(t, "2026-11-25T07:00:00.000Z");
  writeFileSync(join(repertoire, "autonomy-gestures.json"), "{not json");

  tick();
  assert.equal(avertis.length, 1);
  assert.match(avertis[0]!, /digest of 2026-11-24 — not published, the agents' threads do not read/);
  horloge.maintenant = new Date("2026-11-25T07:09:59.000Z");
  tick();
  assert.equal(avertis.length, 1, "not before ten minutes");

  writeFileSync(join(repertoire, "autonomy-gestures.json"), "{}");
  horloge.maintenant = new Date("2026-11-25T07:10:00.000Z");
  tick("log");
  assert.equal(vue(journal).digest, null, "only the tick builds it");
  tick();
  assert.equal(vue(journal).digest?.text, "0 outages seen first by the chef yesterday — nothing else to report.");
});

test("post-mortems that cannot be read publish nothing and say so", (t) => {
  const { repertoire, journal, avertis, tick } = matin(t, "2026-11-25T07:00:00.000Z");
  terminerLaPanne(repertoire, PROJET, { id: "o1", debut: "2026-11-24T08:00:00.000Z", fin: "2026-11-24T09:00:00.000Z", cause: "c", detecteeParLeSysteme: "2026-11-24T08:30:00.000Z", signaleeParLeChef: null, corrigePar: null, ticketDuCorrectif: null });
  writeFileSync(join(repertoire, "post-mortems", `${PROJET}.json`), "{not json");
  tick();
  assert.match(avertis[0]!, /the post-mortems do not read/);
  assert.equal(vue(journal).digest, null);
});

test("the gate of the runtime notifies the chef of a gesture handed to them, and of no other", async (t) => {
  const { repertoire, journal } = ouvrir(t);
  const porte = porteDuRuntime({ projet: PROJET, repertoireEtat: repertoire, journal, surReveil: () => () => {} }, a("2026-11-25T10:00:00.000Z"));
  assert.ok(porte !== null);
  const qui = { agent: "supervisor", reglable: "supervisor" } as const;
  await porte.passer(qui, { line: "reran main", reason: "red", outcome: OUTCOME.FIXED_BY_SELF }, () => 1);
  assert.equal(vue(journal).notification, null);

  await porte.passer(qui, { line: "zone cycle stuck, gave up", reason: "stuck for 30 min", outcome: OUTCOME.HANDED_TO_CHEF }, () => 1);
  assert.equal(journal.duType("chef.notified", 10).length, 1);
  const { notifiedAt: _quand, ...notification } = vue(journal).notification ?? { notifiedAt: "" };
  assert.deepEqual(notification, { title: "The kitchen gave up and needs you", at: "2026-11-25T10:00:00.000Z", line: "zone cycle stuck, gave up", reason: "stuck for 30 min" });
});

test("a notification that cannot be sent is said, and the gesture stays done and logged", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  const porte = porteDuRuntime({ projet: PROJET, repertoireEtat: repertoire, journal, surReveil: () => () => {} }, a("2026-11-25T10:00:00.000Z"));
  assert.ok(porte !== null);
  journal.fermer();
  const avertis: string[] = [];
  const avant = console.error;
  console.error = (ligne: string) => void avertis.push(ligne);
  try {
    const passage = await porte.passer({ agent: "supervisor", reglable: "supervisor" }, { line: "gave up", reason: "r", outcome: OUTCOME.HANDED_TO_CHEF }, () => 1);
    assert.deepEqual(passage, { etat: "done", valeur: 1 });
  } finally {
    console.error = avant;
  }
  assert.match(avertis.join("\n"), /the supervisor handed a gesture to the chef, the chef not notified \(gave up\)/);
  assert.equal(gestesDe(repertoire, "supervisor").at(-1)?.line, "gave up");
});

test("a second digest of the same day is not written; one with no day always is", (t) => {
  const { journal } = ouvrir(t);
  assert.equal(publierLeDigest(journal, PROJET, "first", { jour: "2026-11-24" }), true);
  assert.equal(publierLeDigest(journal, PROJET, "again", { jour: "2026-11-24" }), false);
  assert.equal(vue(journal).digest?.text, "first");
  assert.equal(publierLeDigest(journal, PROJET, "no day"), true);
  assert.equal(publierLeDigest(journal, PROJET, "no day"), true);
  assert.equal(journal.duType("digest.published", 10).length, 3);
});
