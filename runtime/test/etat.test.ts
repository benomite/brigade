// L'état de la cuisine, composé à partir du journal seul.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, duree, lireEtat, suivre } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirRail } from "../src/rail.ts";
import { faitInconnu, horloge, jusqua, repertoireTemporaire } from "./outils.ts";

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

const decrire = (journal: ReturnType<typeof ouvrirJournal>, maintenant: string) => decrireEtat(lireEtat(journal), new Date(maintenant));

test("une durée se lit à la précision qui sert à piloter", () => {
  assert.deepEqual(
    [0, 12_400, 59_600, 240_000, 3_600_000, 7_800_000, 200_000_000, -5].map(duree),
    ["0 s", "12 s", "1 min", "4 min", "1 h 00", "2 h 10", "2 j", "0 s"],
  );
});

test("le chef voit le runtime et son dernier tick, les tickets par état, les cooks avec leur budget consommé, et les derniers événements", (t) => {
  const { journal, noter, arriver } = cuisine(t);
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date("2026-10-08T10:00:30.000Z") });
  noter({ type: "runtime.started", payload: { pid: 4211, host: "box", node: "v26" } }); // 10:00:00
  noter({ type: "guard.configured", payload: { limits: LIMITES, breakerThreshold: 3 } });
  for (const [ticket, priority] of [[14, 1], [15, 1], [16, 2], [17, 2], [18, null]] as const) arriver(ticket, priority);
  rail.prendre("box/claude-opus"); // 14, à 10:00:07
  rail.prendre("box/claude-sonnet");
  rail.envoyerEnPass(15, "box/claude-sonnet"); // 10:00:09
  rail.quatreVingtSix(17, { motif: "quota", retour: new Date("2026-10-08T15:00:00.000Z") }); // 10:00:10
  noter({ type: "cook.launched", payload: { run: "14-3f9a01bc", limits: LIMITES, stream: "runs/14-3f9a01bc.jsonl" } }, 14); // 10:00:11
  noter({ type: "cook.launched", payload: { run: "16-aa", limits: LIMITES, stream: "runs/16-aa.jsonl" } }, 16); // 10:00:12
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } }); // 10:00:13
  noter({ type: "cook.progressed", payload: { run: "14-3f9a01bc", turns: 12, tokens: 184_000 } }, 14); // 10:00:14

  assert.deepEqual(decrire(journal, "2026-10-08T10:04:11.000Z"), [
    "projet     brigade",
    "runtime    en marche d'après le journal — pid 4211 sur box, démarré il y a 4 min",
    "           dernier tick il y a 3 min (cadence : 1 min)",
    "cuisine    ouverte · disjoncteur fermé (0 échec d'affilée, ouverture à 3)",
    "sauvegarde JAMAIS FAITE — le timer brigade-sauvegarde@brigade tourne-t-il ?",
    "",
    "rail       1 pris · 1 en pass · 2 en attente · 1 86",
    "  #14  pris  prio:1  par box/claude-opus depuis 4 min, sans progrès depuis 4 min, bail encore 6 min  Ticket 14",
    "  #15  en pass  prio:1  depuis 4 min, cuisiné par box/claude-sonnet  Ticket 15",
    "  #16  en attente  prio:2  depuis 4 min  Ticket 16",
    "  #17  86  prio:2  depuis 4 min (quota), retour dans 4 h 55  Ticket 17",
    "  #18  en attente  -  depuis 4 min  Ticket 18",
    "",
    "cooks      2 en cours",
    "  #14  14-3f9a01bc  4 min sur 1 h 00 · 12 tours sur 100 · 184 000 tokens sur 2 000 000 (relevé il y a 3 min)",
    "  #16  16-aa  3 min sur 1 h 00 · tours et tokens : pas encore de relevé",
    "",
    "derniers événements",
    '  1  2026-10-08T10:00:00.000Z  brigade  -  runtime.started  runtime  {"pid":4211,"host":"box","node":"v26"}',
    '  2  2026-10-08T10:00:01.000Z  brigade  -  guard.configured  runtime  {"limits":{"turns":100,"durationMs":3600000,"tokens":2000000,"idleMs":600000},"breakerThreshold":3}',
    '  3  2026-10-08T10:00:02.000Z  brigade  #14  ticket.arrived  github  {"title":"Ticket 14","priority":1,"createdAt":"2026-10-01T00:00:14Z","url":"https://exemple.test/14"}',
    '  4  2026-10-08T10:00:03.000Z  brigade  #15  ticket.arrived  github  {"title":"Ticket 15","priority":1,"createdAt":"2026-10-01T00:00:15Z","url":"https://exemple.test/15"}',
    '  5  2026-10-08T10:00:04.000Z  brigade  #16  ticket.arrived  github  {"title":"Ticket 16","priority":2,"createdAt":"2026-10-01T00:00:16Z","url":"https://exemple.test/16"}',
    '  6  2026-10-08T10:00:05.000Z  brigade  #17  ticket.arrived  github  {"title":"Ticket 17","priority":2,"createdAt":"2026-10-01T00:00:17Z","url":"https://exemple.test/17"}',
    '  7  2026-10-08T10:00:06.000Z  brigade  #18  ticket.arrived  github  {"title":"Ticket 18","priority":null,"createdAt":"2026-10-01T00:00:18Z","url":"https://exemple.test/18"}',
    '  8  2026-10-08T10:00:07.000Z  brigade  #14  ticket.taken  station:box/claude-opus  {"station":"box/claude-opus","leaseUntil":"2026-10-08T10:10:30.000Z"}',
    '  9  2026-10-08T10:00:08.000Z  brigade  #15  ticket.taken  station:box/claude-sonnet  {"station":"box/claude-sonnet","leaseUntil":"2026-10-08T10:10:30.000Z"}',
    '  10  2026-10-08T10:00:09.000Z  brigade  #15  ticket.passing  station:box/claude-sonnet  {"station":"box/claude-sonnet"}',
    '  11  2026-10-08T10:00:10.000Z  brigade  #17  ticket.86  runtime  {"reason":"quota","until":"2026-10-08T15:00:00.000Z"}',
    '  12  2026-10-08T10:00:11.000Z  brigade  #14  cook.launched  runtime  {"run":"14-3f9a01bc","limits":{"turns":100,"durationMs":3600000,"tokens":2000000,"idleMs":600000},"stream":"runs/14-3f9a01bc.jsonl"}',
    '  13  2026-10-08T10:00:12.000Z  brigade  #16  cook.launched  runtime  {"run":"16-aa","limits":{"turns":100,"durationMs":3600000,"tokens":2000000,"idleMs":600000},"stream":"runs/16-aa.jsonl"}',
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

  assert.equal(decrire(journal, "2026-10-08T10:25:01.000Z")[2], "           dernier tick il y a 25 min (cadence : 1 min)");

  noter({ type: "runtime.interrupted", payload: { startedSeq: 1 } });
  noter({ type: "runtime.started", payload: { pid: 2, host: "box", node: "v26" } });

  assert.deepEqual(decrire(journal, "2026-10-08T10:25:01.000Z").slice(1, 3), [
    "runtime    en marche d'après le journal — pid 2 sur box, démarré il y a 24 min",
    "           aucun tick depuis le démarrage",
  ]);
});

test("un runtime arrêté, une cuisine arrêtée et un disjoncteur ouvert se lisent en tête ; un cook sans fin n'y passe pas pour vivant", (t) => {
  const { journal, noter } = cuisine(t);
  assert.deepEqual(decrire(journal, "2026-10-08T10:00:00.000Z"), [
    "projet     inconnu — journal vide",
    "runtime    jamais démarré",
    "cuisine    ouverte · disjoncteur fermé (0 échec d'affilée, ouverture à ?)",
    "sauvegarde JAMAIS FAITE — le timer brigade-sauvegarde@<projet> tourne-t-il ?",
    "",
    "rail       vide",
    "",
    "cooks      aucun en cours",
    "",
    "derniers événements",
    "  aucun",
  ]);

  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } }); // 10:00:00
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } });
  noter({ type: "cook.launched", payload: { run: "a", limits: LIMITES, stream: "runs/a.jsonl" } }, 7);
  noter({ type: "cook.exited", payload: { run: "a", outcome: "failed", code: 1, signal: null, turns: 2, tokens: 30, durationMs: 12 } }, 7);
  noter({ type: "breaker.opened", payload: { failures: 1, threshold: 1 } }); // 10:00:04
  noter({ type: "kitchen.stopped", payload: {} }, null, "chef"); // 10:00:05
  noter({ type: "cook.launched", payload: { run: "b", limits: LIMITES, stream: "runs/b.jsonl" } }, 8); // 10:00:06
  noter({ type: "runtime.stopped", payload: { signal: "SIGTERM" } }); // 10:00:07

  assert.deepEqual(decrire(journal, "2026-10-08T10:02:07.000Z").slice(0, 3), [
    "projet     brigade",
    "runtime    arrêté il y a 2 min",
    "cuisine    ARRÊTÉE par le chef il y a 2 min · disjoncteur OUVERT depuis 2 min (1 échec d'affilée)",
  ]);
  assert.equal(
    decrire(journal, "2026-10-08T10:02:07.000Z").find((ligne) => ligne.startsWith("cooks")),
    "cooks      1 sans fin au journal — morts avec le runtime, notés à son prochain démarrage",
  );
});

test("la dernière sauvegarde se lit en tête, avec son âge ; trop vieille ou jamais faite, elle est marquée", (t) => {
  const { journal, noter } = cuisine(t);
  const sauvegarde = (maintenant: string, ageMaxMs?: number) => decrireEtat(lireEtat(journal), new Date(maintenant), ageMaxMs).find((ligne) => ligne.startsWith("sauvegarde"));
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } }); // 10:00:00

  assert.equal(sauvegarde("2026-10-08T10:00:00.000Z"), "sauvegarde JAMAIS FAITE — le timer brigade-sauvegarde@brigade tourne-t-il ?");

  noter({ type: "backup.completed", payload: { name: "2026-10-08T10-00-00Z", lastSeq: 1, events: 1, streams: 0 } }, null, "sauvegarde"); // 10:00:01
  noter({ type: "backup.completed", payload: { name: "2026-10-08T10-00-02Z", lastSeq: 2, events: 2, streams: 0 } }, null, "sauvegarde"); // 10:00:02

  assert.equal(sauvegarde("2026-10-08T17:12:02.000Z"), "sauvegarde il y a 7 h 12 (2026-10-08T10-00-02Z, jusqu'à l'événement 2)");
  // Le plafond par défaut : deux jours. Atteint, il ne marque pas encore.
  assert.equal(sauvegarde("2026-10-10T10:00:02.000Z"), "sauvegarde il y a 2 j (2026-10-08T10-00-02Z, jusqu'à l'événement 2)");
  assert.equal(
    sauvegarde("2026-10-11T10:00:03.000Z"),
    "sauvegarde TROP VIEILLE : il y a 3 j (2026-10-08T10-00-02Z, jusqu'à l'événement 2) — plus de 2 j : systemctl status brigade-sauvegarde@brigade",
  );
  assert.equal(
    sauvegarde("2026-10-08T17:12:02.000Z", 3_600_000),
    "sauvegarde TROP VIEILLE : il y a 7 h 12 (2026-10-08T10-00-02Z, jusqu'à l'événement 2) — plus de 1 h 00 : systemctl status brigade-sauvegarde@brigade",
  );
});

test("un bail échu se dit coincé et un 86 dont l'heure est passée se dit tel quel, en attendant le tick qui les rendra", (t) => {
  const { journal, noter, arriver } = cuisine(t);
  arriver(14, 1);
  arriver(15, 2);
  noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: "2026-10-08T10:10:00.000Z" } }, 14, "station:box/claude");
  noter({ type: "ticket.86", payload: { reason: "quota", until: "2026-10-08T10:05:00.000Z" } }, 15);

  assert.deepEqual(decrire(journal, "2026-10-08T10:12:00.000Z").slice(5, 8), [
    "rail       1 pris · 1 86",
    "  #14  pris  prio:1  par box/claude depuis 11 min, COINCE : sans progrès depuis 11 min, bail échu depuis 2 min  Ticket 14",
    "  #15  86  prio:2  depuis 11 min (quota), retour au prochain tick  Ticket 15",
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

  const lignes = decrire(journal, "2026-10-08T10:04:10.000Z");

  assert.deepEqual(lignes.slice(5, 9), [
    "rail       2 en attente · 1 BLOQUÉ",
    "  #14  en attente  prio:1  depuis 4 min  Ticket 14",
    "  #16  en attente  -  attend #14 — depuis 4 min  Ticket 16",
    "  #17  BLOQUÉ  -  #15 abandonné (label `fire` retiré) · attend aussi #14 — depuis 4 min  Ticket 17",
  ]);
});

test("un ticket pris dit depuis quand il n'a pas progressé, à côté du temps depuis la prise", (t) => {
  let heure = "2026-10-08T10:00:00.000Z";
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(heure) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, author = "station:box/claude") => journal.ajouter({ project: "brigade", ticket: 14, author, ...fait });
  const ligne = () => decrireEtat(lireEtat(journal), new Date(heure))[6];
  noter({ type: "ticket.arrived", payload: { title: "Ticket 14", priority: 1, createdAt: "2026-10-01T00:00:14Z", url: "https://exemple.test/14" } }, "github");
  noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: "2026-10-08T10:30:00.000Z" } });

  heure = "2026-10-08T10:12:00.000Z";
  assert.equal(ligne(), "  #14  pris  prio:1  par box/claude depuis 12 min, sans progrès depuis 12 min, bail encore 18 min  Ticket 14");

  // Le relevé du cook n'est pas un progrès ; le renouvellement du bail, si.
  heure = "2026-10-08T10:30:00.000Z";
  noter({ type: "ticket.renewed", payload: { station: "box/claude", leaseUntil: "2026-10-08T11:00:00.000Z" } });
  heure = "2026-10-08T10:42:00.000Z";
  noter({ type: "cook.progressed", payload: { run: "14-aa", turns: 9, tokens: 4000 } }, "runtime");

  assert.equal(ligne(), "  #14  pris  prio:1  par box/claude depuis 42 min, sans progrès depuis 12 min, bail encore 18 min  Ticket 14");
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
    "2  2026-10-08T10:00:01.000Z  brigade  #7  ticket.arrived  github  {}",
    '4  2026-10-08T10:00:03.000Z  brigade  #7  cook.progressed  runtime  {"run":"a","turns":1,"tokens":10}',
    '5  2026-10-08T10:00:04.000Z  brigade  #7  pass.verdict  pass  {"vert":true}',
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

  assert.deepEqual(lignes, ["2  2026-10-08T10:00:01.000Z  brigade  #7  ticket.arrived  github  {}"]);
});
