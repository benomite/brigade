// Une carte coincée en pass, lue du journal seul : `status` la signale passé
// quinze minutes, avec son numéro et depuis quand, et le geste du chef ne
// relance que celle-là (#1425).
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { COINCEE_APRES_MS, livraisonsCoincees, relancerLeJugement } from "../src/file-de-la-pass.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { passDuTicket } from "../src/projections/pass.ts";
import { ouvrirRail } from "../src/rail.ts";
import { aArreter, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const STATION = "box/claude";
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const a = (heure: string) => `${JOUR_HORLOGE}T${heure}.000Z`;

// Un journal dont le test tient l'heure : chaque fait s'écrit à celle qu'il a posée.
function cuisine(t: TestContext) {
  let instant = a("10:00:00");
  const maintenant = () => new Date(instant);
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant });
  aArreter(t, () => journal.fermer());
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 3_600_000, maintenant });
  const noter = (fait: Fait, ticket: number) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  // Le ticket arrive, un cook le prend et le livre : il est en pass, à juger.
  const livrer = (ticket: number, heure: string) => {
    instant = a(heure);
    noter({ type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: a(heure), url: `https://exemple.test/${ticket}` } }, ticket);
    assert.equal(rail.prendre(STATION)?.ticket, ticket);
    const run = `${ticket}-aa`;
    noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, branch: `cook/${run}`, worktree: `worktrees/${run}` } }, ticket);
    noter({ type: "cook.reported", payload: { run, ending: "done", reason: null, summary: null, branch: `cook/${run}`, pr: `https://exemple.test/pull/${ticket}` } }, ticket);
    rail.envoyerEnPass(ticket, STATION);
  };
  const juger = (ticket: number, heure: string, verdict?: "green") => {
    instant = a(heure);
    const run = `${ticket}-aa`;
    const pr = `https://exemple.test/pull/${ticket}`;
    noter({ type: "pass.started", payload: { run, pr, number: ticket, sha: `sha-${ticket}` } }, ticket);
    if (verdict === undefined) return;
    const gates = { outcome: verdict, code: 0, failures: [], tail: "" };
    noter({ type: "pass.judged", payload: { run, pr, number: ticket, sha: `sha-${ticket}`, verdict, gates, ci: { outcome: "none", checks: [] }, findings: [], judgeModified: false, review: { outcome: "green", run: null, summary: null, findings: [] }, noDiff: false } }, ticket);
  };
  const coincees = (heure: string) => decrireEtat(lireEtat(journal, new Date(a(heure))), new Date(a(heure))).filter((ligne) => /^(stuck|           #)/.test(ligne));
  return { journal, livrer, juger, coincees };
}

test("le seuil d'une carte coincée est un quart d'heure", () => {
  assert.equal(COINCEE_APRES_MS, 15 * 60_000);
});

test("status signale une carte en pass sans pass depuis plus de 15 min, avec son numéro et la durée — pas celle livrée depuis moins, ni aucune quand une pass tourne", (t) => {
  const { journal, livrer, juger, coincees } = cuisine(t);
  livrer(15, "10:00:00");
  livrer(18, "10:10:00");

  assert.deepEqual(coincees("10:14:00"), []);
  // 15 attend depuis 20 min, 18 depuis 10 : seule 15 coince.
  assert.deepEqual(coincees("10:20:00"), ["stuck      #15 in pass for 20 min with no active pass — delivered, never judged: `brigade <projet> pass 15 --relaunch`"]);
  livrer(19, "10:21:00");
  assert.deepEqual(coincees("10:40:00"), [
    "stuck      #15 in pass for 40 min with no active pass — delivered, never judged: `brigade <projet> pass 15 --relaunch`",
    "           #18 in pass for 30 min with no active pass — delivered, never judged: `brigade <projet> pass 18 --relaunch`",
    "           #19 in pass for 19 min with no active pass — delivered, never judged: `brigade <projet> pass 19 --relaunch`",
  ]);

  // La pass de 18 tourne : elle n'est plus à juger, et les autres attendent leur tour.
  juger(18, "10:41:00");
  assert.deepEqual(coincees("11:30:00"), []);
  assert.deepEqual(livraisonsCoincees(journal.base, new Date(a("11:30:00"))), []);
});

test("le geste relance une carte coincée, sans changer sa phase, et refuse une carte déjà jugée, dont la pass tourne ou qui attend son tour", (t) => {
  const { journal, livrer, juger } = cuisine(t);
  const ecrits = () => journal.tout().filter((e) => e.type === "pass.relaunched").length;
  livrer(15, "10:00:00");
  livrer(16, "10:01:00");
  juger(16, "10:02:00", "green");

  assert.deepEqual(relancerLeJugement(journal, 16), { fait: false, raison: "#16 is already judged green: there is no judgement to relaunch" });
  assert.deepEqual(relancerLeJugement(journal, 99), { fait: false, raison: "#99 has never been through the pass: there is no delivery to judge" });
  assert.equal(ecrits(), 0);

  const relance = relancerLeJugement(journal, 15);
  assert.equal(relance.fait, true);
  assert.match(relance.fait ? relance.message : "", /^#15: a judgement is queued .* — no runtime is running: it is judged at its next start$/);
  assert.equal(ecrits(), 1);
  assert.equal(passDuTicket(journal.base, 15)?.phase, "delivered");

  livrer(17, "10:03:00");
  juger(15, "10:04:00");
  const active = relancerLeJugement(journal, 15);
  assert.match(active.fait ? active.message : active.raison, /^#15 already has an active pass: it is being judged since /);
  assert.deepEqual(relancerLeJugement(journal, 17), { fait: false, raison: "#17 is waiting for its turn — #15 is in its pass, next in line: it is not stuck, the pass judges it after" });
  assert.equal(ecrits(), 1);
});
