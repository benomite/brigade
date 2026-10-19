// L'alerte d'urgence : émise une fois, rappelée à espacement fixe, remise à
// zéro quand la cause change ou que l'urgence est levée, et lisible du journal.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { announceEmergency, RAPPEL_D_URGENCE_MS } from "../src/alerte-urgence.ts";
import { decrireEtat, facts, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { openLog } from "../src/log.ts";
import { JOUR_HORLOGE, jourDecale, repertoireTemporaire } from "./outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const STATION = "box/claude";
const pr = (ticket: number) => `https://exemple.test/pull/${ticket}`;
const heure = (h: string) => `${JOUR_HORLOGE}T${h}.000Z`;

// Une cuisine dont le test tient l'horloge : chaque fait s'écrit à l'heure dite.
function kitchen(t: TestContext) {
  let instant = heure("08:00:00");
  const log = openLog(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => log.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => log.ajouter({ project: "brigade", ticket, author, ...fait });
  const a = (h: string) => {
    instant = heure(h);
  };
  const arriver = (ticket: number, zone: string[], waitsFor: number[] = []) =>
    noter(
      {
        type: "ticket.arrived",
        payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor, zone, problems: [] } },
      },
      ticket,
      "github",
    );
  // Le ticket déjà sur le rail, pris, cuisiné, livré avec sa PR.
  const cook = (ticket: number) => {
    noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: `${jourDecale(30)}T00:00:00.000Z` } }, ticket, `station:${STATION}`);
    noter({ type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITES, stream: `runs/${ticket}-aa.jsonl`, branch: `cook/${ticket}-aa`, worktree: `worktrees/${ticket}-aa` } }, ticket);
    noter({ type: "cook.exited", payload: { run: `${ticket}-aa`, outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, ticket);
    noter({ type: "ticket.passing", payload: { station: STATION } }, ticket, `station:${STATION}`);
    noter({ type: "pass.started", payload: { run: `${ticket}-aa`, pr: pr(ticket), number: ticket, sha: `sha-${ticket}` } }, ticket, "pass");
  };
  // Verte, et laissée au chef : à merger à la main.
  const retenir = (ticket: number, reason = "review-required") => noter({ type: "pass.held", payload: { reason } } as never, ticket, "pass");
  // Le chef la merge à la main, et la pass le constate.
  const merger = (ticket: number) => {
    noter({ type: "merge.done", payload: { pr: pr(ticket), sha: `sha-${ticket}`, by: "outside", reconciled: false } }, ticket, "pass");
    noter({ type: "ticket.served", payload: {} }, ticket);
  };
  const lire = (h: string) => {
    const maintenant = new Date(heure(h));
    const etat = lireEtat(log, maintenant);
    return { etat, faits: facts(etat, maintenant, "benomite/brigade"), texte: decrireEtat(etat, maintenant) };
  };
  noter({ type: "runtime.started", payload: { pid: 1, host: "box" } } as Fait);
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  const announce = (h: string) => {
    a(h);
    return announceEmergency(log, new Date(heure(h)));
  };
  return { noter, a, arriver, cuisiner: cook, retenir, merger, lire, annoncer: announce, journal: log };
}


const alertes = (log: ReturnType<typeof kitchen>["journal"]) => log.base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'urgence.alerted' ORDER BY seq").map(({ payload }) => JSON.parse(payload));

function urgenceSurMerge(t: TestContext) {
  const c = kitchen(t);
  c.arriver(535, ["runtime", "app"]);
  c.arriver(536, ["runtime/src"]);
  c.cuisiner(535);
  c.a("08:30:00");
  c.retenir(535);
  return c;
}

test("l'urgence est annoncée une fois, d'une ligne, puis plus rien aux calculs suivants — dont un rappel absent à 5 min", (t) => {
  const { annoncer: announce, journal: log } = urgenceSurMerge(t);
  assert.equal(announce("08:35:00"), "alerte");
  assert.equal(announce("08:40:00"), null);
  assert.equal(announce("09:00:00"), null);
  assert.equal(announce("10:29:00"), null);
  const [alerte, ...autres] = alertes(log);
  assert.equal(autres.length, 0);
  assert.equal(alerte.label, "brigade : toute la cuisine attend ton merge de #535");
  assert.ok(!alerte.label.includes("\n"));
  assert.equal(alerte.reminder, false);
  assert.equal(alerte.since, heure("08:30:00"));
});

test("un rappel unique à 2 h, puis le suivant 2 h après lui", (t) => {
  const { annoncer: announce, journal: log } = urgenceSurMerge(t);
  assert.equal(RAPPEL_D_URGENCE_MS, 2 * 3_600_000);
  assert.equal(announce("08:35:00"), "alerte");
  assert.equal(announce("10:34:59"), null);
  assert.equal(announce("10:35:00"), "rappel");
  assert.equal(announce("10:40:00"), null);
  assert.equal(announce("12:34:00"), null);
  assert.equal(announce("12:35:00"), "rappel");
  assert.deepEqual(
    alertes(log).map(({ reminder }) => reminder),
    [false, true, true],
  );
});

test("une urgence levée n'émet plus rien ; celle qui revient est annoncée tout de suite", (t) => {
  const { annoncer: announce, merger, arriver, cuisiner: cook, retenir, a, journal: log } = urgenceSurMerge(t);
  assert.equal(announce("08:35:00"), "alerte");
  a("09:00:00");
  merger(535);
  assert.equal(announce("09:00:00"), "levee");
  assert.equal(announce("09:05:00"), null);
  assert.equal(announce("12:00:00"), null);
  // Une nouvelle urgence, vingt minutes plus tard : annoncée sans attendre 2 h.
  a("12:10:00");
  arriver(537, ["runtime"]);
  cook(537);
  a("12:20:00");
  retenir(537);
  assert.equal(announce("12:25:00"), "alerte");
  assert.deepEqual(
    alertes(log).map(({ label, reminder }) => [label, reminder]),
    [
      ["brigade : toute la cuisine attend ton merge de #535", false],
      ["brigade : toute la cuisine attend ton merge de #537", false],
    ],
  );
});

test("un changement de cause remet le compteur à zéro : la nouvelle cause est annoncée sans attendre 2 h", (t) => {
  const c = kitchen(t);
  c.arriver(535, ["runtime"]);
  c.arriver(540, ["app"]);
  c.arriver(536, ["runtime", "app"]);
  c.cuisiner(535);
  c.cuisiner(540);
  c.a("08:30:00");
  c.retenir(535);
  c.retenir(540);
  assert.equal(c.annoncer("08:35:00"), "alerte");
  assert.equal(c.annoncer("08:45:00"), null);
  // Le chef merge #540 : #536 n'attend plus que #535 — une autre cause.
  c.a("09:00:00");
  c.merger(540);
  assert.equal(c.annoncer("09:05:00"), "alerte");
  assert.equal(c.annoncer("09:10:00"), null);
  assert.deepEqual(
    alertes(c.journal).map(({ reminder }) => reminder),
    [false, false],
  );
});

test("l'alerte en cours se lit de l'état, sans qu'aucune app ait été là, et survit à une relecture du journal", (t) => {
  const { annoncer: announce, lire, journal: log } = urgenceSurMerge(t);
  assert.equal(lire("08:30:00").faits.urgence?.alerte ?? null, null);
  announce("08:35:00");
  announce("10:35:00");
  const { faits: lus, etat } = lire("10:36:00");
  assert.deepEqual(lus.urgence?.alerte, {
    libelle: "brigade : toute la cuisine attend ton merge de #535",
    emiseLe: heure("08:35:00"),
    derniereLe: heure("10:35:00"),
    rappels: 1,
  });
  assert.equal(lus.urgence?.depuis, heure("08:30:00"));
  assert.equal(etat.alerteUrgence?.key, `${heure("08:30:00")}|#535`);
  log.reconstruire();
  assert.equal(lireEtat(log, new Date(heure("10:37:00"))).alerteUrgence?.rappels, 1);
});
