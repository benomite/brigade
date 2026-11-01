// La file de la pass à plusieurs places, lue du journal seul (#2000) : les
// livraisons dont les zones ne se recouvrent pas sont dans leur pass à la fois,
// au plus autant que le plafond des jugements simultanés ; celles qui partagent
// une zone s'attendent, et celle qui n'a pas de zone, ou qui a écrit hors de la
// sienne, se juge seule. `pass` dit ce que chacune attend.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../../src/evenements.ts";
import { livraisonsCoincees, relancerLeJugement, toursDeLaPass, tourAttendu } from "../../src/file-de-la-pass.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as montrerPass } from "../../src/montrer-pass.ts";
import { ouvrirRail } from "../../src/rail.ts";
import { aArreter, appeler, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const STATION = "box/claude";
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const a = (heure: string) => `${JOUR_HORLOGE}T${heure}.000Z`;

// Un journal dont le test tient l'heure. `zone` : celle de la fiche du ticket ;
// nulle, il n'a pas de fiche.
function cuisine(t: TestContext, jugements?: number) {
  let instant = a("10:00:00");
  const maintenant = () => new Date(instant);
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant });
  aArreter(t, () => journal.fermer());
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 3_600_000, maintenant });
  const noter = (fait: Fait, ticket: number | null) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  if (jugements !== undefined) noter({ type: "guard.configured", payload: { limits: LIMITES, breakerThreshold: 3, judgements: jugements } }, null);
  const fiche = (zone: string[]) => ({ waitsFor: [], zone, problems: [] });
  let minute = 0;
  // Le ticket arrive, un cook le prend et le livre : il est en pass, à juger.
  const livrer = (ticket: number, zone: string[] | null, dehors: string[] = []) => {
    instant = a(`10:${String(++minute).padStart(2, "0")}:00`);
    noter({ type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: instant, url: `https://exemple.test/${ticket}`, ...(zone === null ? {} : { card: fiche(zone) }) } }, ticket);
    assert.equal(rail.prendre(STATION)?.ticket, ticket);
    const run = `${ticket}-aa`;
    noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, branch: `cook/${run}`, worktree: `worktrees/${run}` } }, ticket);
    noter({ type: "cook.reported", payload: { run, ending: "done", reason: null, summary: null, branch: `cook/${run}`, pr: `https://exemple.test/pull/${ticket}` } }, ticket);
    rail.envoyerEnPass(ticket, STATION);
    // Sa station la confronte à sa zone, et dit ce qu'elle a écrit dehors.
    if (dehors.length > 0) journal.ajouter({ project: "brigade", ticket, author: `station:${STATION}`, type: "cook.out-of-zone", payload: { run, zone: zone ?? [], files: dehors.map((path) => ({ path, owners: [] })), cardChanged: false } });
  };
  // La pass la prend : elle est dans sa pass.
  const juger = (ticket: number) => noter({ type: "pass.started", payload: { run: `${ticket}-aa`, pr: `https://exemple.test/pull/${ticket}`, number: ticket, sha: `sha-${ticket}` } }, ticket);
  const changer = (ticket: number, zone: string[]) => noter({ type: "ticket.changed", payload: { title: `Ticket ${ticket}`, priority: null, card: fiche(zone) } }, ticket);
  // Les livraisons que la pass prendrait à cet instant, dans l'ordre de la file.
  const libres = () => [...toursDeLaPass(journal.base)].filter(([, tour]) => tour === null).map(([ticket]) => ticket);
  // Ce que dit `pass`, comme le chef le lirait.
  const pass = async (numero: number) => {
    const appel = appeler(montrerPass, [String(numero)], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await appel.fin, 0);
    return appel.sortie();
  };
  return { journal, livrer, juger, changer, libres, pass };
}

test("des zones qui ne se recouvrent pas : les livraisons entrent dans leur pass à la fois, et `pass` les dit chacune jugée", async (t) => {
  const { journal, livrer, juger, libres, pass } = cuisine(t, 3);
  livrer(14, ["runtime/src/rail"]);
  livrer(15, ["runtime/src/pass"]);
  livrer(16, ["app/src"]);
  assert.deepEqual(libres(), [14, 15, 16]);

  juger(14);
  juger(15);
  juger(16);
  assert.deepEqual(libres(), [14, 15, 16]);
  for (const numero of [14, 15, 16]) {
    assert.equal(tourAttendu(journal.base, numero), null);
    assert.match(await pass(numero), new RegExp(`^#${numero} {2}being judged`));
  }
});

test("une livraison dont la zone recouvre celle d'une autre dans sa pass l'attend, et `pass` la nomme — une troisième, ailleurs, ne l'attend pas", async (t) => {
  const { journal, livrer, juger, changer, libres, pass } = cuisine(t, 3);
  livrer(14, ["runtime/src/rail"]);
  livrer(15, ["runtime/src/pass"]);
  livrer(16, ["app/src"]);
  juger(14);
  // La fiche de 15 a changé depuis sa prise : elle déborde sur la zone de 14.
  changer(15, ["runtime/src/pass", "runtime/src/rail/file.ts"]);

  assert.deepEqual(libres(), [14, 16]);
  assert.deepEqual(tourAttendu(journal.base, 15), { tenants: [14], devant: 0, pourquoi: { quoi: "zone", ticket: 14, chemin: "runtime/src/rail/file.ts" } });
  assert.match(await pass(15), /^#15 {2}delivered, waiting for its turn — #14 is in its pass, next in line — waiting for #14: their zones overlap on runtime\/src\/rail\/file\.ts/);
  assert.doesNotMatch(await pass(16), /waiting for its turn/);
  assert.deepEqual(relancerLeJugement(journal, 15), { fait: false, raison: "#15 is waiting for its turn — #14 is in its pass, next in line: it is not stuck, the pass judges it after" });

  // Une quatrième sur la zone de 15 ne la double pas : elle garde sa place.
  livrer(17, ["docs"]);
  changer(17, ["runtime/src/pass/merge.ts"]);
  assert.deepEqual(tourAttendu(journal.base, 17)?.pourquoi, { quoi: "zone", ticket: 15, chemin: "runtime/src/pass/merge.ts" });
  assert.match(await pass(17), /waiting for #15, ahead of it: their zones overlap on runtime\/src\/pass\/merge\.ts/);
});

test("une livraison sans zone se juge seule : elle attend que les autres sortent de leur pass, et rien ne la double tant qu'elle attend", async (t) => {
  const { journal, livrer, juger, libres, pass } = cuisine(t, 3);
  livrer(14, ["runtime/src/rail"]);
  livrer(15, null);
  livrer(16, ["app/src"]);
  juger(14);

  // 15 n'a pas de zone : elle attend 14 ; 16 ne passe pas devant elle.
  assert.deepEqual(libres(), [14]);
  assert.deepEqual(tourAttendu(journal.base, 15)?.pourquoi, { quoi: "seule", cause: "sans-zone" });
  assert.match(await pass(15), /^#15 {2}delivered, waiting for its turn — #14 is in its pass, next in line — judged alone: it declares no zone/);
  assert.deepEqual(tourAttendu(journal.base, 16)?.pourquoi, { quoi: "seul", ticket: 15 });
  assert.match(await pass(16), /waiting for its turn — #14 is in its pass, 1 ahead of it — #15, ahead of it, is judged alone/);
});

test("une livraison qui a écrit hors de sa zone se juge seule : rien d'autre n'entre dans sa pass tant qu'elle y est", async (t) => {
  const { journal, livrer, juger, libres, pass } = cuisine(t, 3);
  livrer(14, ["runtime/src/rail"], ["docs/runtime/pass-merge.md"]);
  livrer(15, ["app/src"]);
  juger(14);

  assert.deepEqual(libres(), [14]);
  assert.deepEqual(tourAttendu(journal.base, 15)?.pourquoi, { quoi: "seul", ticket: 14 });
  assert.match(await pass(15), /waiting for its turn — #14 is in its pass, next in line — #14 is judged alone/);

  // Et derrière une autre dans sa pass, elle attend : elle se juge seule.
  livrer(16, ["runtime/src/pass"], ["runtime/src/rail.ts"]);
  assert.deepEqual(tourAttendu(journal.base, 16)?.pourquoi, { quoi: "seule", cause: "hors-zone" });
  assert.match(await pass(16), /#14 is in its pass, 1 ahead of it — judged alone: it wrote outside its zone/);
});

test("hors de sa zone, elle attend que les autres sortent de leur pass", (t) => {
  const { journal, livrer, juger, libres } = cuisine(t, 3);
  livrer(14, ["runtime/src/rail"]);
  livrer(15, ["app/src"], ["docs/runtime/pass-merge.md"]);
  juger(14);

  assert.deepEqual(libres(), [14]);
  assert.deepEqual(tourAttendu(journal.base, 15)?.pourquoi, { quoi: "seule", cause: "hors-zone" });
});

test("au-delà du plafond, des livraisons aux zones disjointes attendent une place libre, et `pass` le dit", async (t) => {
  const { journal, livrer, juger, libres, pass } = cuisine(t, 2);
  livrer(14, ["runtime/src/rail"]);
  livrer(15, ["runtime/src/pass"]);
  livrer(16, ["app/src"]);
  livrer(17, ["docs"]);
  assert.deepEqual(libres(), [14, 15]);
  juger(14);
  juger(15);

  assert.deepEqual(libres(), [14, 15]);
  assert.deepEqual(tourAttendu(journal.base, 16), { tenants: [14, 15], devant: 0, pourquoi: { quoi: "place", plafond: 2 } });
  assert.match(await pass(16), /^#16 {2}delivered, waiting for its turn — #14, #15 are in their pass, next in line — waiting for a free slot: 2 judgements at once at most/);
  assert.match(await pass(17), /#14, #15 are in their pass, 1 ahead of it — waiting for a free slot/);
  // Ce qui attend sa place n'est pas coincé.
  assert.deepEqual(livraisonsCoincees(journal.base, new Date(a("12:00:00"))), []);
});

test("un plafond d'un jugement : la file est celle d'avant, une livraison à la fois, dans l'ordre", async (t) => {
  const { journal, livrer, juger, libres, pass } = cuisine(t, 1);
  livrer(14, ["runtime/src/rail"]);
  livrer(15, ["runtime/src/pass"]);
  livrer(16, null);
  assert.deepEqual(libres(), [14]);
  juger(14);

  assert.deepEqual(libres(), [14]);
  assert.match(await pass(15), /waiting for its turn — #14 is in its pass, next in line — waiting for a free slot: 1 judgement at once at most/);
  assert.match(await pass(16), /waiting for its turn — #14 is in its pass, 1 ahead of it — judged alone/);
  assert.deepEqual(toursDeLaPass(journal.base, { plafond: 3 }).get(15), null);
});

test("un journal qui ne dit pas le plafond — écrit avant lui — prend celui par défaut : trois", (t) => {
  const { livrer, libres } = cuisine(t);
  for (const [numero, zone] of [[14, "a"], [15, "b"], [16, "c"], [17, "d"]] as const) livrer(numero, [zone]);
  assert.deepEqual(libres(), [14, 15, 16]);
});
