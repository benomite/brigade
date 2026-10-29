// L'état d'une station, tel que le journal le raconte : son annonce, son quota,
// sa connexion, et les cooks qu'elle a lancés avec leur calibrage.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { compteRetenu, consommationDesCooks, cooksDeStation, direPlafondEn, etatStation, plafondDeCooks, plafondDesCoeurs, sansStationDepuis, stationsAnnoncees } from "../src/projections/stations.ts";
import { faitInconnu, horloge, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const STATION = "box/claude";
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const ANNONCE = { station: STATION, engine: "claude", provides: ["code"], maxCooks: 1 };

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = `station:${STATION}`) =>
    journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const lancer = (run: string, ticket: number) =>
    noter(
      {
        type: "cook.launched",
        payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: STATION, model: "sonnet", effort: "medium", branch: `cook/${run}`, worktree: `worktrees/${run}` },
      },
      ticket,
      "runtime",
    );
  return { base: journal.base, noter, lancer };
}

test("une station qui ne s'est jamais annoncée est inconnue", (t) => {
  assert.equal(etatStation(cuisine(t).base, STATION), null);
});

test("une station annoncée se lit avec son moteur, ce qu'elle fournit et son plafond de cooks", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });

  assert.deepEqual(etatStation(base, STATION), {
    ...ANNONCE,
    cores: null,
    cap: null,
    announcedAt: `${JOUR_HORLOGE}T10:00:00.000Z`,
    quotaUntil: null,
    quotaReason: null,
    disconnectedAt: null,
    disconnectedReason: null,
    saturatedAt: null,
    saturatedResource: null,
    saturatedObserved: null,
    saturatedLimit: null,
    saturatedCauses: [],
    heldAt: null,
    heldReason: null,
    unarbitratedAt: null,
    unarbitratedReason: null,
    remote: false,
    seenAt: null,
    presentSince: null,
    ordinary: false,
    alongside: false,
    sandbox: null,
  });
});

test("une station distante réglée pour les tickets ordinaires se lit avec ce qu'elle a dit de son bac à sable, et depuis quand", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: { station: "mac/claude", engine: "claude", provides: ["chrome-connecté"], maxCooks: 1, remote: true, ordinary: true } });
  assert.deepEqual([etatStation(base, "mac/claude")?.ordinary, etatStation(base, "mac/claude")?.sandbox], [true, null]);

  noter({ type: "station.sandbox", payload: { station: "mac/claude", available: false, reason: "Seatbelt est introuvable", version: null } });
  const indisponible = etatStation(base, "mac/claude")?.sandbox;
  assert.deepEqual(indisponible, { available: false, reason: "Seatbelt est introuvable", version: null, at: indisponible?.at });
  noter({ type: "station.sandbox", payload: { station: "mac/claude", available: true, reason: null, version: "2.1.250" } });
  assert.deepEqual({ ...etatStation(base, "mac/claude")?.sandbox, at: null }, { available: true, reason: null, version: "2.1.250", at: null });
  // Réannoncée sans le réglage, elle ne les prend plus — ce qu'elle a dit de son poste reste.
  noter({ type: "station.announced", payload: { station: "mac/claude", engine: "claude", provides: ["chrome-connecté"], maxCooks: 1, remote: true } });
  assert.deepEqual([etatStation(base, "mac/claude")?.ordinary, etatStation(base, "mac/claude")?.sandbox?.available], [false, true]);
});

test("une station de plus du projet — distante, déclarée `ensemble` — se lit comme telle, et ne l'est plus une fois réannoncée sans", (t) => {
  const { base, noter } = cuisine(t);
  const annonce = { station: "mac/claude", engine: "claude", provides: ["code"], maxCooks: 2, remote: true as const, ordinary: true as const };
  noter({ type: "station.announced", payload: { ...annonce, alongside: true } });
  assert.deepEqual([etatStation(base, "mac/claude")?.ordinary, etatStation(base, "mac/claude")?.alongside], [true, true]);
  noter({ type: "station.announced", payload: annonce });
  assert.deepEqual([etatStation(base, "mac/claude")?.ordinary, etatStation(base, "mac/claude")?.alongside], [true, false]);
});

test("un arbitre injoignable se lit sur la station, avec ce que l'échange a donné, jusqu'à son retour", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  noter({ type: "station.unarbitrated", payload: { station: STATION, reason: "connexion refusée" } });
  assert.deepEqual([etatStation(base, STATION)?.unarbitratedAt, etatStation(base, STATION)?.unarbitratedReason], [`${JOUR_HORLOGE}T10:00:01.000Z`, "connexion refusée"]);

  noter({ type: "station.arbitrated", payload: { station: STATION } });
  assert.deepEqual([etatStation(base, STATION)?.unarbitratedAt, etatStation(base, STATION)?.unarbitratedReason], [null, null]);
});

test("la consommation des cooks se totalise sur 24 h et sur 7 jours glissants : ceux qui ont fini dans la fenêtre", (t) => {
  const { base, noter, lancer } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  const finir = (run: string, tokens: number) =>
    noter({ type: "cook.exited", payload: { run, outcome: "ok", code: 0, signal: null, turns: 3, tokens, durationMs: 1000 } }, 15, "runtime");
  lancer("15-a", 15);
  finir("15-a", 1000);
  lancer("15-b", 15);
  finir("15-b", 200);
  // Un cook qui tourne encore n'a rien consommé de compté.
  lancer("15-c", 15);

  const a = (decalage: number) => new Date(Date.parse(`${JOUR_HORLOGE}T10:00:00.000Z`) + decalage);
  assert.deepEqual(consommationDesCooks(base, STATION, a(60_000)), { jour: 1200, semaine: 1200 });
  assert.deepEqual(consommationDesCooks(base, STATION, a(2 * 86_400_000)), { jour: 0, semaine: 1200 });
  assert.deepEqual(consommationDesCooks(base, STATION, a(8 * 86_400_000)), { jour: 0, semaine: 0 });
  assert.deepEqual(consommationDesCooks(base, "ailleurs", a(60_000)), { jour: 0, semaine: 0 });
});

test("ce qui retient la station se lit sur elle, avec la raison, jusqu'à ce qu'elle se libère ; une raison inconnue reste au journal, sans effet", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  const retenue = () => [etatStation(base, STATION)?.heldAt, etatStation(base, STATION)?.heldReason];

  noter({ type: "station.held", payload: { station: STATION, reason: "cap" } });
  assert.deepEqual(retenue(), [`${JOUR_HORLOGE}T10:00:01.000Z`, "cap"]);
  noter({ type: "station.held", payload: { station: STATION, reason: "ramp" } });
  assert.deepEqual(retenue(), [`${JOUR_HORLOGE}T10:00:02.000Z`, "ramp"]);
  noter(faitInconnu("station.held", { station: STATION, reason: "humeur" }));
  assert.deepEqual(retenue(), [`${JOUR_HORLOGE}T10:00:02.000Z`, "ramp"]);

  noter({ type: "station.held", payload: { station: STATION, reason: "base" } });
  assert.deepEqual(retenue(), [`${JOUR_HORLOGE}T10:00:04.000Z`, "base"]);

  noter({ type: "station.released", payload: { station: STATION } });
  assert.deepEqual(retenue(), [null, null]);
});

test("le plafond de cooks est celui de l'annonce tant que le chef n'a rien réglé ; son réglage l'emporte, et zéro lève la limite", (t) => {
  const { base, noter } = cuisine(t);
  const plafond = () => plafondDeCooks(etatStation(base, STATION) ?? { maxCooks: -1, cores: null, cap: null });
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 30 } });
  assert.equal(plafond(), 30);

  noter({ type: "station.capped", payload: { station: STATION, maxCooks: 4 } }, null, "chef");
  assert.equal(plafond(), 4);
  // Une annonce réécrite au redémarrage ne défait pas le réglage du chef.
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 12 } });
  assert.deepEqual([etatStation(base, STATION)?.maxCooks, plafond()], [12, 4]);

  noter({ type: "station.capped", payload: { station: STATION, maxCooks: 0 } }, null, "chef");
  assert.equal(plafond(), null);

  // Retiré, le réglage du chef rend la main au plafond par défaut.
  noter({ type: "station.capped", payload: { station: STATION, maxCooks: null } }, null, "chef");
  assert.deepEqual([etatStation(base, STATION)?.cap, plafond()], [null, 12]);
});

test("le plafond par défaut dérive des cœurs de la machine, jamais des trente déclarés : deux cœurs, un cook ; huit, trois ; seize, sept", (t) => {
  const { base, noter } = cuisine(t);
  const plafond = () => plafondDeCooks(etatStation(base, STATION) ?? { maxCooks: -1, cores: null, cap: null });
  const dit = () => direPlafondEn(etatStation(base, STATION) ?? { maxCooks: -1, cores: null, cap: null });
  for (const [cores, attendu] of [
    [1, 1],
    [2, 1],
    [4, 1],
    [8, 3],
    [16, 7],
  ] as const) {
    assert.equal(plafondDesCoeurs(cores), attendu);
    noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 30, cores } });
    assert.deepEqual([cores, etatStation(base, STATION)?.cores, plafond(), dit()], [cores, cores, attendu, `${attendu} at most — ${cores} cores`]);
  }
  // Soixante-quatre cœurs en permettraient trente et un : la déclaration, plus
  // basse, l'emporte, et le dit.
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 30, cores: 64 } });
  assert.deepEqual([plafondDesCoeurs(64), plafond(), dit()], [31, 30, "30 at most — declared"]);
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 30, cores: 8 } });
  assert.equal(dit(), "3 at most — 8 cores");
  // Une déclaration plus basse que les cœurs l'emporte : `box/playwright:2`.
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 2, cores: 16 } });
  assert.deepEqual([plafond(), dit()], [2, "2 at most — declared"]);
  // Des cœurs inconnus — une station distante, un journal d'avant — : la déclaration tient.
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 30 } });
  assert.deepEqual([etatStation(base, STATION)?.cores, plafond(), dit()], [null, 30, "30 at most — declared"]);
  // Des cœurs illisibles ne comptent pas.
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 30, cores: 0 } });
  assert.equal(etatStation(base, STATION)?.cores, null);
});

test("le réglage du chef se dit avec ce qu'il remplace : `5 at most — set by you, replaces 3 (8 cores)`", (t) => {
  const { base, noter } = cuisine(t);
  const dit = () => direPlafondEn(etatStation(base, STATION) ?? { maxCooks: -1, cores: null, cap: null });
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 30, cores: 8 } });

  noter({ type: "station.capped", payload: { station: STATION, maxCooks: 5 } }, null, "chef");
  assert.equal(dit(), "5 at most — set by you, replaces 3 (8 cores)");
  noter({ type: "station.capped", payload: { station: STATION, maxCooks: 0 } }, null, "chef");
  assert.equal(dit(), "no limit — set by you, replaces 3 (8 cores)");
  noter({ type: "station.capped", payload: { station: STATION, maxCooks: null } }, null, "chef");
  assert.equal(dit(), "3 at most — 8 cores");
});

test("un plafond illisible est ignoré : il reste au journal, sans effet", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  for (const maxCooks of [-1, 1.5, "trois"]) noter({ type: "station.capped", payload: { station: STATION, maxCooks: maxCooks as number } }, null, "chef");

  assert.equal(etatStation(base, STATION)?.cap, null);
});

test("une machine saturée se lit sur la station, avec ce qui manque, jusqu'à ce qu'elle respire", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  noter({ type: "station.saturated", payload: { station: STATION, resource: "cpu", observed: 16.2, limit: 15 } });

  const etat = etatStation(base, STATION);
  assert.deepEqual(
    [etat?.saturatedAt, etat?.saturatedResource, etat?.saturatedObserved, etat?.saturatedLimit],
    [`${JOUR_HORLOGE}T10:00:01.000Z`, "cpu", 16.2, 15],
  );

  assert.deepEqual(etat?.saturatedCauses, [{ resource: "cpu", observed: 16.2, limit: 15 }]);

  noter({ type: "station.relieved", payload: { station: STATION } });
  assert.deepEqual([etatStation(base, STATION)?.saturatedAt, etatStation(base, STATION)?.saturatedResource, etatStation(base, STATION)?.saturatedCauses], [null, null, []]);
});

test("une machine qui manque de plusieurs ressources se lit avec chacune, dans l'ordre, et d'où vient le seuil de la mémoire ; ce qui est illisible est écarté", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  const memoire = { resource: "memory", observed: 812, limit: 3205, limitFrom: { totalMb: 32050 } } as const;
  noter({ type: "station.saturated", payload: { station: STATION, resource: "cpu", observed: 18.4, limit: 12, also: [memoire] } });

  assert.deepEqual(etatStation(base, STATION)?.saturatedCauses, [{ resource: "cpu", observed: 18.4, limit: 12 }, memoire]);
  assert.equal(etatStation(base, STATION)?.saturatedResource, "cpu");

  const illisibles = [{ resource: "swap", observed: 1, limit: 2 }, { resource: "disk", observed: "beaucoup", limit: 2 }] as never[];
  noter({ type: "station.saturated", payload: { station: STATION, resource: "memory", observed: 812, limit: 2000, limitFrom: "env", also: illisibles } });
  assert.deepEqual(etatStation(base, STATION)?.saturatedCauses, [{ resource: "memory", observed: 812, limit: 2000, limitFrom: "env" }]);
});

test("un quota épuisé se lit sur la station, avec son heure de retour", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  noter({ type: "station.86", payload: { station: STATION, reason: "quota", until: `${JOUR_HORLOGE}T15:00:00.000Z`, window: "five_hour" } });

  const etat = etatStation(base, STATION);
  assert.deepEqual([etat?.quotaUntil, etat?.quotaReason], [`${JOUR_HORLOGE}T15:00:00.000Z`, "quota"]);
});

test("une station déconnectée le reste, annonce comprise, jusqu'au « resume » du chef", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: "7-a" } }, 7);
  noter({ type: "station.announced", payload: { ...ANNONCE, maxCooks: 2 } });

  const etat = etatStation(base, STATION);
  assert.deepEqual([etat?.disconnectedAt, etat?.disconnectedReason, etat?.maxCooks], [`${JOUR_HORLOGE}T10:00:01.000Z`, "authentication_failed", 2]);

  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");
  assert.equal(etatStation(base, STATION)?.disconnectedAt, null);
});

test("chaque cook de la station se lit avec son calibrage, sa fin et ce qu'il a consommé", (t) => {
  const { base, noter, lancer } = cuisine(t);
  lancer("7-a", 7);
  noter({ type: "cook.exited", payload: { run: "7-a", outcome: "ok", code: 0, signal: null, turns: 12, tokens: 3400, durationMs: 90_000 } }, 7, "runtime");
  noter({ type: "cook.reported", payload: { run: "7-a", ending: "done", reason: null, summary: "fait", branch: "cook/7-a", pr: "https://github.com/o/r/pull/9" } }, 7);
  lancer("8-b", 8);

  assert.deepEqual(cooksDeStation(base, STATION, 10), [
    {
      run: "8-b", ticket: 8, model: "sonnet", effort: "medium", branch: "cook/8-b", worktree: "worktrees/8-b", launchedAt: `${JOUR_HORLOGE}T10:00:03.000Z`,
      endedAt: null, ending: null, turns: null, tokens: null, durationMs: null, pr: null,
    },
    {
      run: "7-a", ticket: 7, model: "sonnet", effort: "medium", branch: "cook/7-a", worktree: "worktrees/7-a", launchedAt: `${JOUR_HORLOGE}T10:00:00.000Z`,
      endedAt: `${JOUR_HORLOGE}T10:00:01.000Z`, ending: "done", turns: 12, tokens: 3400, durationMs: 90_000, pr: "https://github.com/o/r/pull/9",
    },
  ]);
});

test("sans compte-rendu de la station, la fin d'un cook est celle que les garde-fous ont notée", (t) => {
  const { base, noter, lancer } = cuisine(t);
  lancer("7-a", 7);
  noter({ type: "cook.exited", payload: { run: "7-a", outcome: "guard", code: null, signal: "SIGTERM", turns: 101, tokens: 9, durationMs: 5 } }, 7, "runtime");
  lancer("8-b", 8);
  noter({ type: "cook.interrupted", payload: { run: "8-b" } }, 8, "runtime");

  assert.deepEqual(cooksDeStation(base, STATION, 10).map((cook) => [cook.run, cook.ending]), [["8-b", "interrupted"], ["7-a", "guard"]]);
});

test("un cook lancé sans station — d'avant elle — n'appartient à aucune", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "cook.launched", payload: { run: "7-a", limits: LIMITES, stream: "runs/7-a.jsonl" } }, 7, "runtime");

  assert.deepEqual(cooksDeStation(base, STATION, 10), []);
});

test("une station que le projet ne déclare plus sort des stations annoncées, avec ce qui la retenait ; ses cooks restent au relevé", (t) => {
  const { base, noter, lancer } = cuisine(t);
  noter({ type: "station.announced", payload: ANNONCE });
  noter({ type: "station.announced", payload: { station: "box/playwright", engine: "playwright", provides: ["navigateur-headless"], maxCooks: 2 } });
  noter({ type: "station.held", payload: { station: STATION, reason: "cap" } });
  lancer("a", 14);
  assert.deepEqual(stationsAnnoncees(base), [STATION, "box/playwright"]);

  noter({ type: "station.withdrawn", payload: { station: STATION } });

  assert.deepEqual(stationsAnnoncees(base), ["box/playwright"]);
  assert.equal(etatStation(base, STATION), null);
  assert.deepEqual(cooksDeStation(base, STATION, 5).map((cook) => cook.run), ["a"]);
  // Déclarée à nouveau, elle revient neuve : rien ne la retient.
  noter({ type: "station.announced", payload: ANNONCE });
  assert.deepEqual([etatStation(base, STATION)?.maxCooks, etatStation(base, STATION)?.heldReason], [1, null]);
});

test("un projet sans station se lit, depuis le démarrage qui l'a dit ; la première annonce l'efface", (t) => {
  const { base, noter } = cuisine(t);
  assert.equal(sansStationDepuis(base), null);

  noter({ type: "stations.undeclared", payload: {} }, null, "runtime");
  noter({ type: "stations.undeclared", payload: {} }, null, "runtime");
  assert.equal(sansStationDepuis(base), `${JOUR_HORLOGE}T10:00:00.000Z`);

  noter({ type: "station.announced", payload: ANNONCE });
  assert.equal(sansStationDepuis(base), null);
});

test("le compte est retenu dès qu'une station le dit déconnecté, ou épuisé jusqu'à une heure qui n'est pas passée", (t) => {
  const { base, noter } = cuisine(t);
  const a = (heure: string) => new Date(`${JOUR_HORLOGE}T${heure}:00.000Z`);
  // Sans station, rien ne le dit.
  assert.equal(compteRetenu(base, a("12:00")), false);
  noter({ type: "station.announced", payload: ANNONCE });
  noter({ type: "station.announced", payload: { station: "box/playwright", engine: "playwright", provides: ["navigateur-headless"], maxCooks: 2 } });
  assert.equal(compteRetenu(base, a("12:00")), false);

  noter({ type: "station.86", payload: { station: "box/playwright", reason: "quota", until: `${JOUR_HORLOGE}T15:00:00.000Z`, window: "five_hour" } });
  assert.deepEqual([compteRetenu(base, a("14:59")), compteRetenu(base, a("15:00")), compteRetenu(base, a("15:01"))], [true, false, false]);

  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: null } });
  assert.equal(compteRetenu(base, a("16:00")), true);
  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");
  assert.equal(compteRetenu(base, a("16:00")), false);
});
