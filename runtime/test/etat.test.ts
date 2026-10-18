// L'état de la cuisine, composé à partir du journal seul.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, duree, lireEtat, suivre } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirRail } from "../src/rail.ts";
import { faitInconnu, horloge, jourDecale, JOUR_HORLOGE, jusqua, repertoireTemporaire } from "./outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") =>
    journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number, priority: number | null) =>
    noter(
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}` } },
      ticket,
      "github",
    );
  return { repertoire, journal, noter, arriver };
}

const decrire = (journal: ReturnType<typeof ouvrirJournal>, maintenant: string) => decrireEtat(lireEtat(journal, new Date(maintenant)), new Date(maintenant));

test("une durée se lit à la précision qui sert à piloter", () => {
  assert.deepEqual(
    [0, 12_400, 59_600, 240_000, 3_600_000, 7_800_000, 200_000_000, -5].map(duree),
    ["0 s", "12 s", "1 min", "4 min", "1 h 00", "2 h 10", "2 j", "0 s"],
  );
});

test("le chef voit le runtime et son dernier tick, les tickets par état, les cooks avec leur budget consommé, et les derniers événements", (t) => {
  const { journal, noter, arriver } = cuisine(t);
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:30.000Z`) });
  noter({ type: "runtime.started", payload: { pid: 4211, host: "box", node: "v26" } }); // 10:00:00
  noter({ type: "guard.configured", payload: { limits: LIMITES, breakerThreshold: 3 } });
  for (const [ticket, priority] of [[14, 1], [15, 1], [16, 2], [17, 2], [18, null]] as const) arriver(ticket, priority);
  rail.prendre("box/claude-opus"); // 14, à 10:00:07
  rail.prendre("box/claude-sonnet");
  rail.envoyerEnPass(15, "box/claude-sonnet"); // 10:00:09
  rail.quatreVingtSix(17, { motif: "quota", retour: new Date(`${JOUR_HORLOGE}T15:00:00.000Z`) }); // 10:00:10
  noter({ type: "cook.launched", payload: { run: "14-3f9a01bc", limits: LIMITES, stream: "runs/14-3f9a01bc.jsonl" } }, 14); // 10:00:11
  noter({ type: "cook.launched", payload: { run: "16-aa", limits: LIMITES, stream: "runs/16-aa.jsonl" } }, 16); // 10:00:12
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } }); // 10:00:13
  noter({ type: "cook.progressed", payload: { run: "14-3f9a01bc", turns: 12, tokens: 184_000 } }, 14); // 10:00:14

  assert.deepEqual(decrire(journal, `${JOUR_HORLOGE}T10:04:11.000Z`), [
    "project    brigade",
    "runtime    running according to the log — pid 4211 on box, started 4 min ago",
    "           last tick 3 min ago (cadence: 1 min)",
    "kitchen    open · breaker closed (0 failures in a row, opens at 3)",
    "backup     NEVER DONE — is the timer `brigade-sauvegarde@brigade` running?",
    "",
    "awaiting   nothing awaits the chef",
    "end awaiting",
    "",
    "rail       1 taken · 1 in pass · 2 queued · 1 86",
    "  #14  taken  prio:1  by box/claude-opus since 4 min, no progress since 4 min, lease 6 min left  Ticket 14",
    "  #15  in pass  prio:1  since 4 min, cooked by box/claude-sonnet  Ticket 15",
    "  #16  queued  prio:2  since 4 min  Ticket 16",
    "  #17  86  prio:2  since 4 min (quota), back in 4 h 55  Ticket 17",
    "  #18  queued  -  since 4 min  Ticket 18",
    "",
    "cooks      2 running",
    "  #14  14-3f9a01bc  4 min of 1 h 00 · 12 turns of 100 · 184,000 tokens of 2,000,000 (reading 3 min ago) · no progress since 4 min",
    "  #16  16-aa  3 min of 1 h 00 · turns and tokens: no reading yet",
    "",
    "consumed   in flight: 2 launches · 12 turns · 184,000 tokens",
    "           5 h: 2 launches · 12 turns · 184,000 tokens",
    "           24 h: 2 launches · 12 turns · 184,000 tokens",
    "           what this project has launched, not the account's consumption: /usage gives it",
    "",
    "latest events",
    `  1  ${JOUR_HORLOGE}T10:00:00.000Z  brigade  -  runtime.started  runtime  {"pid":4211,"host":"box","node":"v26"}`,
    `  2  ${JOUR_HORLOGE}T10:00:01.000Z  brigade  -  guard.configured  runtime  {"limits":{"turns":100,"durationMs":3600000,"tokens":2000000,"idleMs":600000},"breakerThreshold":3}`,
    `  3  ${JOUR_HORLOGE}T10:00:02.000Z  brigade  #14  ticket.arrived  github  {"title":"Ticket 14","priority":1,"createdAt":"2026-10-01T00:00:14Z","url":"https://exemple.test/14"}`,
    `  4  ${JOUR_HORLOGE}T10:00:03.000Z  brigade  #15  ticket.arrived  github  {"title":"Ticket 15","priority":1,"createdAt":"2026-10-01T00:00:15Z","url":"https://exemple.test/15"}`,
    `  5  ${JOUR_HORLOGE}T10:00:04.000Z  brigade  #16  ticket.arrived  github  {"title":"Ticket 16","priority":2,"createdAt":"2026-10-01T00:00:16Z","url":"https://exemple.test/16"}`,
    `  6  ${JOUR_HORLOGE}T10:00:05.000Z  brigade  #17  ticket.arrived  github  {"title":"Ticket 17","priority":2,"createdAt":"2026-10-01T00:00:17Z","url":"https://exemple.test/17"}`,
    `  7  ${JOUR_HORLOGE}T10:00:06.000Z  brigade  #18  ticket.arrived  github  {"title":"Ticket 18","priority":null,"createdAt":"2026-10-01T00:00:18Z","url":"https://exemple.test/18"}`,
    `  8  ${JOUR_HORLOGE}T10:00:07.000Z  brigade  #14  ticket.taken  station:box/claude-opus  {"station":"box/claude-opus","leaseUntil":"${JOUR_HORLOGE}T10:10:30.000Z"}`,
    `  9  ${JOUR_HORLOGE}T10:00:08.000Z  brigade  #15  ticket.taken  station:box/claude-sonnet  {"station":"box/claude-sonnet","leaseUntil":"${JOUR_HORLOGE}T10:10:30.000Z"}`,
    `  10  ${JOUR_HORLOGE}T10:00:09.000Z  brigade  #15  ticket.passing  station:box/claude-sonnet  {"station":"box/claude-sonnet"}`,
    `  11  ${JOUR_HORLOGE}T10:00:10.000Z  brigade  #17  ticket.86  runtime  {"reason":"quota","until":"${JOUR_HORLOGE}T15:00:00.000Z"}`,
    `  12  ${JOUR_HORLOGE}T10:00:11.000Z  brigade  #14  cook.launched  runtime  {"run":"14-3f9a01bc","limits":{"turns":100,"durationMs":3600000,"tokens":2000000,"idleMs":600000},"stream":"runs/14-3f9a01bc.jsonl"}`,
    `  13  ${JOUR_HORLOGE}T10:00:12.000Z  brigade  #16  cook.launched  runtime  {"run":"16-aa","limits":{"turns":100,"durationMs":3600000,"tokens":2000000,"idleMs":600000},"stream":"runs/16-aa.jsonl"}`,
  ]);
});

test("seuls les quinze derniers événements sont montrés, sans les battements ni les relevés", (t) => {
  const { journal, noter } = cuisine(t);
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  for (let i = 0; i < 20; i += 1) {
    noter(faitInconnu("x.y", { i }), 7);
    noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } });
    noter({ type: "cook.progressed", payload: { run: "a", turns: i, tokens: i } }, 7);
  }

  const { evenements } = lireEtat(journal);

  assert.deepEqual(evenements.map((e) => [e.type, (e.payload as { i?: number }).i]), Array.from({ length: 15 }, (_, i) => ["x.y", i + 5]));
});

test("un runtime figé se voit à l'âge de son dernier tick ; un tick d'une vie précédente ne compte pas", (t) => {
  const { journal, noter } = cuisine(t);
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } });

  assert.equal(decrire(journal, `${JOUR_HORLOGE}T10:25:01.000Z`)[2], "           last tick 25 min ago (cadence: 1 min)");

  noter({ type: "runtime.interrupted", payload: { startedSeq: 1 } });
  noter({ type: "runtime.started", payload: { pid: 2, host: "box", node: "v26" } });

  assert.deepEqual(decrire(journal, `${JOUR_HORLOGE}T10:25:01.000Z`).slice(1, 3), [
    "runtime    running according to the log — pid 2 on box, started 24 min ago",
    "           no tick since startup",
  ]);
});

test("un runtime arrêté, une cuisine arrêtée et un disjoncteur ouvert se lisent en tête ; un cook sans fin n'y passe pas pour vivant", (t) => {
  const { journal, noter } = cuisine(t);
  assert.deepEqual(decrire(journal, `${JOUR_HORLOGE}T10:00:00.000Z`), [
    "project    unknown — empty log",
    "runtime    never started",
    "kitchen    open · breaker closed (0 failures in a row, opens at ?)",
    "backup     NEVER DONE — is the timer `brigade-sauvegarde@<projet>` running?",
    "",
    "awaiting   nothing awaits the chef",
    "end awaiting",
    "",
    "rail       empty",
    "",
    "cooks      none running",
    "",
    "consumed   in flight: nothing",
    "           5 h: nothing",
    "           24 h: nothing",
    "           what this project has launched, not the account's consumption: /usage gives it",
    "",
    "latest events",
    "  none",
  ]);

  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } }); // 10:00:00
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } });
  noter({ type: "cook.launched", payload: { run: "a", limits: LIMITES, stream: "runs/a.jsonl" } }, 7);
  noter({ type: "cook.exited", payload: { run: "a", outcome: "failed", code: 1, signal: null, turns: 2, tokens: 30, durationMs: 12 } }, 7);
  noter({ type: "breaker.opened", payload: { failures: 1, threshold: 1 } }); // 10:00:04
  noter({ type: "kitchen.stopped", payload: {} }, null, "chef"); // 10:00:05
  noter({ type: "cook.launched", payload: { run: "b", limits: LIMITES, stream: "runs/b.jsonl" } }, 8); // 10:00:06
  noter({ type: "runtime.stopped", payload: { signal: "SIGTERM" } }); // 10:00:07

  assert.deepEqual(decrire(journal, `${JOUR_HORLOGE}T10:02:07.000Z`).slice(0, 3), [
    "project    brigade",
    "runtime    stopped 2 min ago",
    "kitchen    STOPPED by the chef 2 min ago · breaker OPEN for 2 min (1 failure in a row)",
  ]);
  assert.equal(
    decrire(journal, `${JOUR_HORLOGE}T10:02:07.000Z`).find((ligne) => ligne.startsWith("cooks")),
    "cooks      1 with no end in the log — runtime stopped: its next start picks up those still running, and notes the others interrupted",
  );
});

test("la dernière sauvegarde se lit en tête, avec son âge ; trop vieille ou jamais faite, elle est marquée", (t) => {
  const { journal, noter } = cuisine(t);
  const sauvegarde = (maintenant: string, ageMaxMs?: number) => decrireEtat(lireEtat(journal), new Date(maintenant), ageMaxMs).find((ligne) => ligne.startsWith("backup"));
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } }); // 10:00:00

  assert.equal(sauvegarde(`${JOUR_HORLOGE}T10:00:00.000Z`), "backup     NEVER DONE — is the timer `brigade-sauvegarde@brigade` running?");

  noter({ type: "backup.completed", payload: { name: `${JOUR_HORLOGE}T10-00-00Z`, lastSeq: 1, events: 1, streams: 0 } }, null, "sauvegarde"); // 10:00:01
  noter({ type: "backup.completed", payload: { name: `${JOUR_HORLOGE}T10-00-02Z`, lastSeq: 2, events: 2, streams: 0 } }, null, "sauvegarde"); // 10:00:02

  assert.equal(sauvegarde(`${JOUR_HORLOGE}T17:12:02.000Z`), `backup     7 h 12 ago (${JOUR_HORLOGE}T10-00-02Z, up to event 2)`);
  // Le plafond par défaut : deux jours. Atteint, il ne marque pas encore.
  assert.equal(sauvegarde(`${jourDecale(2)}T10:00:02.000Z`), `backup     2 d ago (${JOUR_HORLOGE}T10-00-02Z, up to event 2)`);
  assert.equal(
    sauvegarde(`${jourDecale(3)}T10:00:03.000Z`),
    `backup     TOO OLD: 3 d ago (${JOUR_HORLOGE}T10-00-02Z, up to event 2) — more than 2 d: \`systemctl status brigade-sauvegarde@brigade\``,
  );
  assert.equal(
    sauvegarde(`${JOUR_HORLOGE}T17:12:02.000Z`, 3_600_000),
    `backup     TOO OLD: 7 h 12 ago (${JOUR_HORLOGE}T10-00-02Z, up to event 2) — more than 1 h 00: \`systemctl status brigade-sauvegarde@brigade\``,
  );
});

test("un bail échu se dit coincé et un 86 dont l'heure est passée se dit tel quel, en attendant le tick qui les rendra", (t) => {
  const { journal, noter, arriver } = cuisine(t);
  arriver(14, 1);
  arriver(15, 2);
  noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T10:10:00.000Z` } }, 14, "station:box/claude");
  noter({ type: "ticket.86", payload: { reason: "quota", until: `${JOUR_HORLOGE}T10:05:00.000Z` } }, 15);

  assert.deepEqual(decrire(journal, `${JOUR_HORLOGE}T10:12:00.000Z`).slice(8, 11), [
    "rail       1 taken · 1 86",
    "  #14  taken  prio:1  by box/claude since 11 min, STUCK: no progress since 11 min, lease expired since 2 min  Ticket 14",
    "  #15  86  prio:2  since 11 min (quota), back at the next tick  Ticket 15",
  ]);
});

test("un ticket qui en attend un autre le dit, et un ticket bloqué par un abandon se compte et se lit à part", (t) => {
  const { journal, noter, arriver } = cuisine(t);
  const attendre = (ticket: number, waitsFor: number[]) =>
    noter(
      {
        type: "ticket.arrived",
        payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor, zone: [], problems: [] } },
      },
      ticket,
      "github",
    );
  arriver(14, 1);
  arriver(15, 1);
  attendre(16, [14]);
  attendre(17, [14, 15]);
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 15, "github");

  const lignes = decrire(journal, `${JOUR_HORLOGE}T10:04:10.000Z`);

  // Le ticket bloqué attend le chef : le bloc `attend` passe avant le rail.
  const debut = lignes.findIndex((ligne) => ligne.startsWith("rail"));
  assert.deepEqual(lignes.slice(debut, debut + 4), [
    "rail       2 queued · 1 BLOCKED",
    "  #14  queued  prio:1  since 4 min  Ticket 14",
    "  #16  queued  -  awaiting #14 — since 4 min  Ticket 16",
    "  #17  BLOCKED  -  #15 dropped (label `fire` removed) · also awaiting #14 — since 4 min  Ticket 17",
  ]);
});

test("un ticket pris dit depuis quand il n'a pas progressé, à côté du temps depuis la prise", (t) => {
  let heure = `${JOUR_HORLOGE}T10:00:00.000Z`;
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(heure) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, author = "station:box/claude") => journal.ajouter({ project: "brigade", ticket: 14, author, ...fait });
  const ligne = () => decrireEtat(lireEtat(journal), new Date(heure))[9];
  noter({ type: "ticket.arrived", payload: { title: "Ticket 14", priority: 1, createdAt: "2026-10-01T00:00:14Z", url: "https://exemple.test/14" } }, "github");
  noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T10:30:00.000Z` } });

  heure = `${JOUR_HORLOGE}T10:12:00.000Z`;
  assert.equal(ligne(), "  #14  taken  prio:1  by box/claude since 12 min, no progress since 12 min, lease 18 min left  Ticket 14");

  // Le relevé du cook n'est pas un progrès ; le renouvellement du bail, si.
  heure = `${JOUR_HORLOGE}T10:30:00.000Z`;
  noter({ type: "ticket.renewed", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T11:00:00.000Z` } });
  heure = `${JOUR_HORLOGE}T10:42:00.000Z`;
  noter({ type: "cook.progressed", payload: { run: "14-aa", turns: 9, tokens: 4000 } }, "runtime");

  assert.equal(ligne(), "  #14  taken  prio:1  by box/claude since 42 min, no progress since 12 min, lease 18 min left  Ticket 14");
});

test("le suivi rend chaque événement écrit par un autre process, une fois, dans l'ordre, sans les battements", async (t) => {
  const { repertoire, journal, noter } = cuisine(t);
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  const lecteur = ouvrirJournal(repertoire, { lectureSeule: true });
  t.after(() => lecteur.fermer());
  const { dernierSeq } = lireEtat(lecteur);
  // Écrit entre la photo et le début du suivi : repris d'entrée.
  noter(faitInconnu("ticket.arrived"), 7, "github");
  const lignes: string[] = [];
  const arreter = suivre(lecteur, { depuis: dernierSeq, intervalleMs: 2, ecrire: (ligne) => lignes.push(ligne) });
  t.after(arreter);
  assert.equal(lignes.length, 1);

  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } });
  noter({ type: "cook.progressed", payload: { run: "a", turns: 1, tokens: 10 } }, 7);
  await jusqua(() => lignes.length === 2);
  noter(faitInconnu("pass.verdict", { vert: true }), 7, "pass");
  await jusqua(() => lignes.length === 3);

  assert.deepEqual(lignes, [
    `2  ${JOUR_HORLOGE}T10:00:01.000Z  brigade  #7  ticket.arrived  github  {}`,
    `4  ${JOUR_HORLOGE}T10:00:03.000Z  brigade  #7  cook.progressed  runtime  {"run":"a","turns":1,"tokens":10}`,
    `5  ${JOUR_HORLOGE}T10:00:04.000Z  brigade  #7  pass.verdict  pass  {"vert":true}`,
  ]);
});

test("le suivi d'un ticket ne rend que ce qui lui arrive ; arrêté, il ne rend plus rien", async (t) => {
  const { repertoire, journal, noter } = cuisine(t);
  const lecteur = ouvrirJournal(repertoire, { lectureSeule: true });
  t.after(() => lecteur.fermer());
  const lignes: string[] = [];
  const arreter = suivre(lecteur, { depuis: journal.dernierSeq(), ticket: 7, intervalleMs: 2, ecrire: (ligne) => lignes.push(ligne) });

  noter(faitInconnu("ticket.arrived"), 8, "github");
  noter(faitInconnu("ticket.arrived"), 7, "github");
  await jusqua(() => lignes.length === 1);
  arreter();
  noter(faitInconnu("ticket.taken"), 7, "station:box");
  await new Promise((resoudre) => setTimeout(resoudre, 20));

  assert.deepEqual(lignes, [`2  ${JOUR_HORLOGE}T10:00:01.000Z  brigade  #7  ticket.arrived  github  {}`]);
});

test("à plusieurs cooks, le chef lit le plafond et, par cook, son ticket, son calibrage, sa branche, son worktree, son budget et son temps sans progrès", (t) => {
  const { journal, noter, arriver } = cuisine(t);
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:30.000Z`) });
  noter({ type: "runtime.started", payload: { pid: 4211, host: "box", node: "v26" } }); // 10:00:00
  noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["code"], maxCooks: 30 } });
  arriver(14, 1);
  arriver(15, 1);
  rail.prendre("box/claude"); // 14, à 10:00:04
  rail.prendre("box/claude");
  const lancer = (run: string, ticket: number | null, station: string, model: string, autres = {}) =>
    noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station, model, effort: "high", ...autres } }, ticket);
  lancer("14-aa", 14, "box/claude", "opus", { branch: "cook/14-aa", worktree: "worktrees/14-aa" }); // 10:00:06
  lancer("15-bb", 15, "box/claude", "sonnet", { branch: "cook/15-bb", worktree: "worktrees/15-bb" });
  lancer("juge-9-cc", null, "manager", "haiku");
  noter({ type: "cook.progressed", payload: { run: "14-aa", turns: 12, tokens: 184_000 } }, 14); // 10:00:09
  rail.renouveler(15, "box/claude"); // 10:00:10

  const lignes = decrire(journal, `${JOUR_HORLOGE}T10:04:10.000Z`);

  assert.deepEqual(lignes.slice(lignes.indexOf("cooks      3 running — box/claude: 30 at most"), lignes.indexOf("consumed   in flight: 3 launches, of which 1 judgment · 12 turns · 184,000 tokens") - 1), [
    "cooks      3 running — box/claude: 30 at most",
    "  #14  14-aa  opus / high  cook/14-aa in worktrees/14-aa  4 min of 1 h 00 · 12 turns of 100 · 184,000 tokens of 2,000,000 (reading 4 min ago) · no progress since 4 min",
    "  #15  15-bb  sonnet / high  cook/15-bb in worktrees/15-bb  4 min of 1 h 00 · turns and tokens: no reading yet · no progress since 4 min",
    "  manager  juge-9-cc  haiku / high  4 min of 1 h 00 · turns and tokens: no reading yet",
  ]);
});

test("le chef lit le plafond qu'il a réglé, et une machine saturée avec ce qui lui manque", (t) => {
  const { journal, noter } = cuisine(t);
  noter({ type: "runtime.started", payload: { pid: 4211, host: "box", node: "v26" } }); // 10:00:00
  noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["code"], maxCooks: 30 } });
  noter({ type: "station.capped", payload: { station: "box/claude", maxCooks: 0 } }, null, "chef");
  noter({ type: "station.saturated", payload: { station: "box/claude", resource: "cpu", observed: 16.24, limit: 15 } }); // 10:00:03

  const lignes = decrire(journal, `${JOUR_HORLOGE}T10:03:03.000Z`);

  assert.deepEqual(lignes.slice(lignes.indexOf("cooks      none running — box/claude: no limit")).slice(0, 2), [
    "cooks      none running — box/claude: no limit",
    "           MACHINE SATURATED for 3 min — load of 16.2 for at most 15: box/claude takes no more tickets as long as it lasts",
  ]);
});

test("à trente cooks, celui qui coince se lit sans parcourir les lignes : nommé en tête dès la moitié de son bail sans progrès, et ses lignes passent devant", (t) => {
  let heure = `${JOUR_HORLOGE}T10:00:00.000Z`;
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(heure) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null, author = "station:box/claude") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const numeros = Array.from({ length: 30 }, (_, i) => 101 + i);
  noter({ type: "runtime.started", payload: { pid: 4211, host: "box", node: "v26" } }, null, "runtime");
  for (const numero of numeros) {
    noter({ type: "ticket.arrived", payload: { title: `Ticket ${numero}`, priority: 1, createdAt: "2026-10-01T00:00:00Z", url: `https://exemple.test/${numero}` } }, numero, "github");
    noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T10:30:00.000Z` } }, numero);
    noter({ type: "cook.launched", payload: { run: `${numero}-aa`, limits: LIMITES, stream: `runs/${numero}-aa.jsonl`, station: "box/claude", model: "opus", effort: "high" } }, numero, "runtime");
  }
  noter({ type: "cook.launched", payload: { run: "juge-9-cc", limits: LIMITES, stream: "runs/juge-9-cc.jsonl", station: "manager" } }, null, "runtime");
  // Tous avancent, sauf le 117 et le 104 ; le 125 a avancé le premier.
  heure = `${JOUR_HORLOGE}T10:04:00.000Z`;
  noter({ type: "ticket.renewed", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T10:34:00.000Z` } }, 125);
  heure = `${JOUR_HORLOGE}T10:10:00.000Z`;
  for (const numero of numeros.filter((numero) => ![104, 117, 125].includes(numero))) {
    noter({ type: "ticket.renewed", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T10:40:00.000Z` } }, numero);
  }

  const lire = (maintenant: string) => {
    const lignes = decrire(journal, maintenant);
    const debut = lignes.findIndex((ligne) => ligne.startsWith("cooks"));
    return { rail: lignes.find((ligne) => ligne.startsWith("  #104  taken")), cooks: lignes.slice(debut, debut + 5).map((ligne) => (ligne.startsWith("cooks") ? ligne : ligne.split("  ").slice(0, ligne.includes("STUCK") ? 4 : 3).join("  "))) };
  };

  // À 14 min 59 du dernier progrès, personne ne coince : l'ordre est celui du temps sans progrès.
  assert.deepEqual(lire(`${JOUR_HORLOGE}T10:14:59.000Z`).cooks, ["cooks      31 running", "  #104  104-aa", "  #117  117-aa", "  #125  125-aa", "  #101  101-aa"]);
  assert.match(lire(`${JOUR_HORLOGE}T10:14:59.000Z`).rail ?? "", /since 14 min, no progress since 14 min, lease 15 min left/);

  const mi = lire(`${JOUR_HORLOGE}T10:15:00.000Z`);
  assert.deepEqual(mi.cooks, ["cooks      31 running — 2 STUCK: #104, #117", "  #104  STUCK  104-aa", "  #117  STUCK  117-aa", "  #125  125-aa", "  #101  101-aa"]);
  assert.match(mi.rail ?? "", /STUCK: no progress since 15 min, lease 15 min left/);
  // Le jugement du manager, qui ne tient aucun ticket, ferme la marche.
  assert.match(decrire(journal, `${JOUR_HORLOGE}T10:15:00.000Z`).at(decrire(journal, `${JOUR_HORLOGE}T10:15:00.000Z`).indexOf("consumed   in flight: 31 launches, of which 1 judgment · 0 turns · 0 tokens") - 2) ?? "", /^  manager  juge-9-cc/);
});

test("le chef lit ce que l'ensemble des cooks a consommé : ceux qui tournent, puis sur 5 h et sur 24 h, relectures et jugements compris", (t) => {
  let heure = `${jourDecale(-1)}T12:00:00.000Z`;
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(heure) });
  t.after(() => journal.fermer());
  const cook = (run: string, ticket: number | null, station: string, fin: string | null, turns: number, tokens: number) => {
    journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station } });
    if (fin === null) return journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.progressed", payload: { run, turns, tokens } });
    heure = fin;
    return journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.exited", payload: { run, outcome: "ok", code: 0, signal: null, turns, tokens, durationMs: 5 } });
  };
  cook("hier", 7, "box/claude", `${jourDecale(-1)}T12:30:00.000Z`, 50, 900_000); // hors des 24 h
  cook("matin", 8, "box/claude", `${JOUR_HORLOGE}T08:00:00.000Z`, 40, 600_000); // dans les 24 h
  cook("relit", 8, "reviewer", `${JOUR_HORLOGE}T08:10:00.000Z`, 4, 30_000);
  cook("recent", 9, "box/claude", `${JOUR_HORLOGE}T12:00:00.000Z`, 20, 300_000); // dans les 5 h
  cook("juge", null, "manager", `${JOUR_HORLOGE}T12:05:00.000Z`, 2, 9_000);
  cook("14-aa", 14, "box/claude", null, 12, 184_000);
  cook("15-bb", 15, "box/claude", null, 3, 16_000);

  const lignes = decrire(journal, `${JOUR_HORLOGE}T13:30:00.000Z`);

  assert.deepEqual(lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("consumed")), lignes.indexOf("latest events") - 1), [
    "consumed   in flight: 2 launches · 15 turns · 200,000 tokens",
    "           5 h: 4 launches, of which 1 judgment · 37 turns · 509,000 tokens",
    "           24 h: 6 launches, of which 1 review and 1 judgment · 81 turns · 1,139,000 tokens",
    "           what this project has launched, not the account's consumption: /usage gives it",
  ]);
});

test("un ticket qui pourrait partir et que sa station ne prend pas dit pourquoi, sur sa ligne et sous les cooks ; ce que le rail retient garde sa raison", (t) => {
  const { journal, noter, arriver } = cuisine(t);
  noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["code"], maxCooks: 30 } }); // 10:00:00
  arriver(14, 1);
  noter(
    { type: "ticket.arrived", payload: { title: "Ticket 16", priority: null, createdAt: "2026-10-01T00:00:16Z", url: "https://exemple.test/16", card: { waitsFor: [14], zone: [], problems: [] } } },
    16,
    "github",
  );
  const lire = () => {
    const lignes = decrire(journal, `${JOUR_HORLOGE}T10:01:03.000Z`);
    return [...lignes.filter((ligne) => /^  #1[46]/.test(ligne)), ...lignes.filter((ligne) => ligne.includes("WITHHOLDING"))];
  };
  assert.deepEqual(lire(), ["  #14  queued  prio:1  since 1 min  Ticket 14", "  #16  queued  -  awaiting #14 — since 1 min  Ticket 16"]);

  noter({ type: "station.held", payload: { station: "box/claude", reason: "ramp" } }, null, "station:box/claude"); // 10:00:03
  assert.deepEqual(lire(), [
    "  #14  queued  prio:1  withheld by box/claude (gradual ramp-up, cooks that have just left weigh in advance) — since 1 min  Ticket 14",
    "  #16  queued  -  awaiting #14 — since 1 min  Ticket 16",
    "           box/claude WITHHOLDING for 1 min — gradual ramp-up, cooks that have just left weigh in advance: the servable tickets wait",
  ]);

  // La base d'intégration rouge se lit comme toute autre retenue.
  noter({ type: "station.held", payload: { station: "box/claude", reason: "base" } }, null, "station:box/claude"); // 10:00:04
  assert.deepEqual(lire(), [
    "  #14  queued  prio:1  withheld by box/claude (integration base red) — since 1 min  Ticket 14",
    "  #16  queued  -  awaiting #14 — since 1 min  Ticket 16",
    "           box/claude WITHHOLDING for 59 s — integration base red: the servable tickets wait",
  ]);

  noter({ type: "station.released", payload: { station: "box/claude" } }, null, "station:box/claude");
  assert.equal(lire().length, 2);
});

test("le chef retrouve les worktrees que le runtime n'a pas pu ranger : le ticket, où, pourquoi, depuis quand — et rien quand il n'y en a pas", (t) => {
  const { journal, noter } = cuisine(t);
  noter({ type: "runtime.started", payload: { pid: 4211, host: "box", node: "v26" } }); // 10:00:00
  const sans = decrire(journal, `${JOUR_HORLOGE}T10:04:00.000Z`);
  assert.equal(sans.some((ligne) => ligne.startsWith("worktrees")), false);

  noter({ type: "worktree.kept", payload: { worktree: "worktrees/17-aaa", branch: "cook/17-aaa", reason: "failed", detail: "« worktrees/17-aaa » n'est plus sur sa branche `cook/17-aaa`" } }, 17, "nettoyage"); // 10:00:01
  noter({ type: "worktree.kept", payload: { worktree: "worktrees/18-aaa", branch: "cook/18-aaa", reason: "failed", detail: "git worktree : fatal: verrou tenu" } }, 18, "nettoyage");
  noter({ type: "worktree.kept", payload: { worktree: "worktrees/19-aaa", branch: "cook/19-aaa", reason: "failed", detail: "git worktree : fatal: verrou tenu" } }, 19, "nettoyage");
  // Rangé depuis : il n'est plus à retrouver.
  noter({ type: "worktree.removed", payload: { worktree: "worktrees/18-aaa", branch: "cook/18-aaa", harvest: null } }, 18, "nettoyage");

  const lignes = decrire(journal, `${JOUR_HORLOGE}T10:04:01.000Z`);
  const debut = lignes.findIndex((ligne) => ligne.startsWith("worktrees"));
  assert.deepEqual(lignes.slice(debut, debut + 4), [
    "worktrees  2 not cleaned up after their cook — nothing in them is touched, the runtime comes back to them at every tick",
    "  #17  worktrees/17-aaa  cook/17-aaa  cleanup failed since 4 min — « worktrees/17-aaa » n'est plus sur sa branche `cook/17-aaa`",
    "  #19  worktrees/19-aaa  cook/19-aaa  cleanup failed since 3 min — git worktree : fatal: verrou tenu",
    "",
  ]);
  // Entre les cooks et ce qu'ils ont consommé.
  assert.ok(debut > lignes.findIndex((ligne) => ligne.startsWith("cooks")) && debut < lignes.findIndex((ligne) => ligne.startsWith("consumed")));
});

test("sous cloison, le chef lit ce que le dernier rangement des transcripts a gardé et retiré, et la règle — et rien sans cloison", (t) => {
  const { journal, noter } = cuisine(t);
  noter({ type: "runtime.started", payload: { pid: 4211, host: "box", node: "v26" } }); // 10:00:00
  const claude = (maintenant: string) => decrire(journal, maintenant).filter((ligne) => ligne.startsWith("claude"));
  assert.deepEqual(claude(`${JOUR_HORLOGE}T10:04:00.000Z`), []);

  const semaine = 7 * 24 * 3_600_000;
  noter({ type: "transcripts.tidied", payload: { removed: 0, freedBytes: 0, kept: 1, keptBytes: 52_429, keepMs: semaine } }, null, "nettoyage"); // 10:00:01
  assert.deepEqual(claude(`${JOUR_HORLOGE}T10:04:01.000Z`), [
    "claude     project transcripts: 1 kept (0.1 MB), no removed at the cleanup 4 min ago — a transcript goes 7 d after its last write",
  ]);

  // Seul le dernier passage se lit.
  noter({ type: "transcripts.tidied", payload: { removed: 12, freedBytes: 48 * 1024 * 1024, kept: 1_027, keptBytes: 112 * 1024 * 1024, keepMs: semaine } }, null, "nettoyage"); // 10:00:02
  const lignes = decrire(journal, `${JOUR_HORLOGE}T13:00:02.000Z`);
  assert.deepEqual(lignes.filter((ligne) => ligne.startsWith("claude")), [
    "claude     project transcripts: 1,027 kept (112 MB), 12 removed (48 MB) at the cleanup 3 h 00 ago — a transcript goes 7 d after its last write",
  ]);
  // Après ce que les cooks ont consommé, avant les derniers événements.
  const ou = lignes.findIndex((ligne) => ligne.startsWith("claude"));
  assert.ok(ou > lignes.findIndex((ligne) => ligne.startsWith("consumed")) && ou < lignes.indexOf("latest events"));

  // Le projet redémarre sans cloison : la ligne s'en va avec le rangement.
  noter({ type: "transcripts.released", payload: {} }, null, "nettoyage");
  assert.deepEqual(claude(`${JOUR_HORLOGE}T13:00:03.000Z`), []);
});

test("une mesure qui a franchi un seuil déclaré est signalée dans l'état, sans qu'on la demande ; sinon le bloc n'existe pas", (t) => {
  const { journal, noter } = cuisine(t);
  const bloc = () => decrire(journal, `${JOUR_HORLOGE}T10:05:00.000Z`).filter((ligne) => ligne.startsWith("drift"));
  const gates = { outcome: "green" as const, code: 0, failures: [], tail: "", measures: { tests: 622, tests_s: 6.2 } };
  noter({ type: "drift.configured", payload: { limits: { tests: 500, testsSeconds: 5, gatesSeconds: null, contextKb: null, repoMb: null, merges: null, growthPercent: null } } });
  noter({ type: "pass.replayed", payload: { sha: "sha-17", base: "base-1", gates, findings: [] } }, 17, "pass");

  // Jugée, pas encore mergée : le projet ne porte pas cette livraison.
  assert.deepEqual(bloc(), []);

  noter({ type: "merge.done", payload: { pr: "https://exemple.test/pull/17", sha: "sha-17", by: "pass", reconciled: false } }, 17, "pass");

  assert.deepEqual(bloc(), ["drift      tests 622 for a threshold of 500 · test suite 6.2 s for a threshold of 5 s — `brigade <projet> measures`"]);
});
