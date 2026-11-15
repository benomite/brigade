// Un ticket tué deux fois par le même garde-fou (#3650) : l'historique de ses arrêts, relu du journal, sa carte, et la
// relance qui le dit au journal.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { demarrer } from "../src/runtime.ts";
import { brancherGardeFous } from "../src/garde-fous.ts";
import { ENV_ENFANT, FAUX_CLAUDE, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const TICKET = 53;

function cuisine(t: TestContext) {
  let instant = new Date(`${JOUR_HORLOGE}T09:00:00.000Z`);
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => instant });
  t.after(() => journal.fermer());
  const noter = (heure: string, fait: Fait) => {
    instant = new Date(`${JOUR_HORLOGE}T${heure}.000Z`);
    journal.ajouter({ project: "brigade", ticket: TICKET, author: "runtime", ...fait });
  };
  noter("09:00:00", { type: "ticket.arrived", payload: { title: "Ticket 53", priority: 1, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/53" } });
  const tuer = (heure: string, run: string, reason: "idle" | "duration" | "stop", doing: "finishing" | "reading" | null) => {
    noter(heure, { type: "cook.launched", payload: { run, limits: { durationMs: 1, tokens: 1, idleMs: 1 }, stream: `runs/${run}.jsonl` } });
    if (doing !== null) noter(heure, { type: "cook.progressed", payload: { run, turns: 3, tokens: 9, activity: { doing, target: null, since: `${JOUR_HORLOGE}T${heure}.000Z` } } });
    noter(heure, { type: "guard.tripped", payload: { run, reason, limit: 1, observed: 2 } });
    noter(heure, { type: "cook.exited", payload: { run, outcome: "guard", code: null, signal: "SIGTERM", turns: 3, tokens: 9, durationMs: 1 } });
  };
  const prendre = (heure: string) => noter(heure, { type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T23:00:00.000Z` } });
  const carte = () => {
    const maintenant = new Date(`${JOUR_HORLOGE}T18:00:00.000Z`);
    return faits(lireEtat(journal, maintenant), maintenant).rail.find((ticket) => ticket.ticket === TICKET) as { gardeRepetee?: unknown } | undefined;
  };
  return { noter, tuer, prendre, carte };
}

test("deux arrêts du garde-fou d'inactivité : la carte du ticket dit le garde-fou et, à chaque arrêt, le run, l'heure et l'activité", (t) => {
  const { tuer, prendre, carte } = cuisine(t);
  prendre("09:05:00");
  tuer("10:00:00", "53-aaaa", "idle", "finishing");
  prendre("10:01:00");
  tuer("11:00:00", "53-bbbb", "idle", "reading");
  prendre("11:01:00");

  assert.deepEqual(carte()?.gardeRepetee, {
    guard: "idle",
    kills: [
      { guard: "idle", run: "53-aaaa", at: `${JOUR_HORLOGE}T10:00:00.000Z`, activity: "finishing" },
      { guard: "idle", run: "53-bbbb", at: `${JOUR_HORLOGE}T11:00:00.000Z`, activity: "reading" },
    ],
  });
});

test("un arrêt seul, deux garde-fous différents et le « stop » du chef ne font rien ; le second arrêt du même garde-fou fait la carte", (t) => {
  const { tuer, prendre, carte } = cuisine(t);
  prendre("09:05:00");
  tuer("10:00:00", "53-aaaa", "idle", "finishing");
  prendre("10:01:00");
  assert.equal(carte()?.gardeRepetee, undefined);
  tuer("11:00:00", "53-bbbb", "duration", "finishing");
  prendre("11:01:00");
  assert.equal(carte()?.gardeRepetee, undefined);
  tuer("12:00:00", "53-cccc", "stop", null);
  prendre("12:01:00");
  assert.equal(carte()?.gardeRepetee, undefined);
  tuer("13:00:00", "53-dddd", "idle", "finishing");
  prendre("13:01:00");

  const garde = carte()?.gardeRepetee as { guard: string; kills: { run: string }[] };
  assert.equal(garde.guard, "idle");
  assert.deepEqual(garde.kills.map((arret) => arret.run), ["53-aaaa", "53-dddd"]);
});

test("un cook qui finit bien efface la série : la carte qui disait deux arrêts ne les dit plus", (t) => {
  const { noter, tuer, prendre, carte } = cuisine(t);
  prendre("09:05:00");
  tuer("10:00:00", "53-aaaa", "idle", "finishing");
  tuer("11:00:00", "53-bbbb", "idle", "finishing");
  prendre("11:01:00");
  assert.notEqual(carte()?.gardeRepetee, undefined);
  noter("12:00:00", { type: "cook.exited", payload: { run: "53-cccc", outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
  prendre("12:01:00");

  assert.equal(carte()?.gardeRepetee, undefined);
});

test("la relance après le second arrêt est au journal avec la raison ; la première relance, après un seul arrêt, n'en dit rien", async (t) => {
  const runtime = brancherGardeFous(
    { plafonds: { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 100 }, seuilDisjoncteur: 50, graceMs: 50, relancesSurCalage: 0 },
    demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", intervalleVeilleMs: 5 }),
  );
  t.after(() => runtime.arreter("test"));
  // Le silence se compte à l'horloge du test.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const cook = async (run: string) => {
    const lance = runtime.lancer({ ticket: 7, run, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "muet" } });
    t.mock.timers.tick(100);
    await lance.fin;
  };
  const relances = () => runtime.journal.duTicket(7).filter((e) => e.type === "guard.relaunched");

  await cook("7-un");
  await cook("7-deux");
  assert.equal(relances().length, 0, "deux lancements, un seul arrêt avant le second");
  await cook("7-trois");

  assert.equal(relances().length, 1);
  const [relance] = relances();
  assert.equal(relance?.payload.run, "7-trois");
  assert.equal(relance?.payload.guard, "idle");
  assert.deepEqual((relance?.payload.kills as { run: string }[]).map((arret) => arret.run), ["7-un", "7-deux"]);
});
