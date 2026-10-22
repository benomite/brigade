// L'ordre manuel du rail (`rail move`) : dans une priorité, l'ordre du chef
// prime sur l'âge ; placé contre un ticket d'une autre priorité, le ticket
// prend la sienne. Les règles d'avant passent toujours devant : un ticket qui
// en attend un autre ne part pas avant lui, et un déplacement qui le mettrait
// devant est refusé. L'ordre survit au redémarrage.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { deplacerSurLeRail } from "../src/geste-ticket.ts";
import type { GitHub, Issue } from "../src/github.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { lireRail, ticketDuRail } from "../src/projections/rail.ts";
import { ouvrirRail } from "../src/rail.ts";
import { DEPOT, repertoireTemporaire } from "./outils.ts";

const PROJET = "brigade";

type Pose = { ticket: number; priority: number | null; waitsFor?: number[] };

// Les tickets arrivent sur le rail dans l'ordre donné, chacun plus jeune que
// le précédent : le premier est le plus ancien.
function cuisine(t: TestContext, ...poses: Pose[]) {
  const repertoire = repertoireTemporaire(t);
  let journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const issues = new Map<number, Issue>();
  const ecrits: string[] = [];
  const github = {
    issue: async (numero: number) => issues.get(numero) ?? null,
    async labelliser(numero: number, labels: string[]) {
      ecrits.push(`+${numero}:${labels.join(",")}`);
      const i = issues.get(numero);
      if (i) issues.set(numero, { ...i, labels: [...i.labels, ...labels] });
    },
    async delabelliser(numero: number, label: string) {
      ecrits.push(`-${numero}:${label}`);
      const i = issues.get(numero);
      if (i) issues.set(numero, { ...i, labels: i.labels.filter((l) => l !== label) });
    },
  } as unknown as GitHub;
  poses.forEach(({ ticket, priority, waitsFor }, rang) => {
    const createdAt = `2026-09-${String(rang + 1).padStart(2, "0")}T00:00:00Z`;
    const url = `https://github.com/${DEPOT}/issues/${ticket}`;
    issues.set(ticket, { number: ticket, title: `Ticket ${ticket}`, labels: ["fire", ...(priority === null ? [] : [`prio:${priority}`])], state: "open", createdAt, updatedAt: createdAt, url });
    const card = waitsFor ? { waitsFor, zone: [], problems: [] } : null;
    journal.ajouter({ project: PROJET, ticket, author: "github", type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority, createdAt, url, card } });
  });
  const ordre = () => lireRail(journal.base).map(({ ticket }) => ticket);
  const deplacer = (ticket: number, place: { before: number } | { after: number }) => deplacerSurLeRail(journal, github, PROJET, ticket, place);
  // Ce que fait un démarrage : le journal rouvert, ses projections rejouées.
  const redemarrer = () => {
    journal.fermer();
    journal = ouvrirJournal(repertoire);
    journal.reconstruire();
  };
  const rail = () => ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000 });
  return { journal: () => journal, ecrits, issues, ordre, deplacer, redemarrer, rail };
}

const deplacements = (journal: Journal) => journal.tout().filter((e) => e.type === "ticket.moved");

test("B placé avant A, de même priorité, est servi avant lui même si A est plus ancien ; rien ne part vers GitHub", async (t) => {
  const { journal, ecrits, ordre, deplacer, rail } = cuisine(t, { ticket: 10, priority: 2 }, { ticket: 11, priority: 2 }, { ticket: 12, priority: 1 }, { ticket: 13, priority: null });
  assert.deepEqual(ordre(), [12, 10, 11, 13]);

  const resultat = await deplacer(11, { before: 10 });

  assert.deepEqual(resultat, { done: true, price: "none: only the order of service changes; no cook is launched or interrupted, and nothing is spent" });
  assert.deepEqual(ordre(), [12, 11, 10, 13]);
  assert.deepEqual(ecrits, []);
  const [fait] = deplacements(journal());
  assert.deepEqual([fait?.ticket, fait?.author, fait?.payload], [11, "chef", { priority: 2, order: [11, 10] }]);
  const station = rail();
  assert.deepEqual(["a", "b", "c", "d"].map((nom) => station.prendre(nom)?.ticket), [12, 11, 10, 13]);
});

test("--after place le ticket juste après l'autre, dans sa priorité", async (t) => {
  const { ordre, deplacer } = cuisine(t, { ticket: 10, priority: 2 }, { ticket: 11, priority: 2 }, { ticket: 12, priority: 2 });

  assert.equal((await deplacer(10, { after: 11 })).done, true);
  assert.deepEqual(ordre(), [11, 10, 12]);

  assert.equal((await deplacer(12, { after: 11 })).done, true);
  assert.deepEqual(ordre(), [11, 12, 10]);
});

test("B placé avant A d'une autre priorité prend celle de A — son label est remplacé — et se place juste avant lui", async (t) => {
  const { journal, ecrits, issues, ordre, deplacer } = cuisine(t, { ticket: 9, priority: 1 }, { ticket: 10, priority: 1 }, { ticket: 11, priority: 3 }, { ticket: 12, priority: 3 });

  const resultat = await deplacer(11, { before: 10 });

  assert.equal(resultat.done, true);
  assert.match(resultat.price, /^its issue's label becomes prio:1, that of #10; /);
  assert.deepEqual(ordre(), [9, 11, 10, 12]);
  assert.equal(ticketDuRail(journal().base, 11)?.priority, 1);
  assert.deepEqual(ecrits, ["+11:prio:1", "-11:prio:3"]);
  assert.deepEqual(issues.get(11)?.labels, ["fire", "prio:1"]);
  assert.deepEqual(deplacements(journal()).at(-1)?.payload, { priority: 1, order: [9, 11, 10] });
});

test("placé contre un ticket sans priorité, le ticket perd la sienne", async (t) => {
  const { journal, ecrits, ordre, deplacer } = cuisine(t, { ticket: 10, priority: 2 }, { ticket: 11, priority: null }, { ticket: 12, priority: null });

  assert.equal((await deplacer(10, { after: 11 })).done, true);

  assert.equal(ticketDuRail(journal().base, 10)?.priority, null);
  assert.deepEqual(ordre(), [11, 10, 12]);
  assert.deepEqual(ecrits, ["-10:prio:2"]);
});

test("B qui attend A ne se place pas avant lui : une phrase qui nomme A, et l'ordre ne bouge pas", async (t) => {
  const { journal, ecrits, ordre, deplacer } = cuisine(t, { ticket: 10, priority: 2 }, { ticket: 11, priority: 2, waitsFor: [10] }, { ticket: 12, priority: 3, waitsFor: [10] });

  assert.deepEqual(await deplacer(11, { before: 10 }), { done: false, reason: "#11 awaits #10, so it cannot be placed before it", price: "none: nothing was changed" });
  // A placé derrière celui qui l'attend : le même refus, vu de l'autre côté.
  assert.deepEqual(await deplacer(10, { after: 11 }), { done: false, reason: "#11 awaits #10, so #10 cannot be placed after it", price: "none: nothing was changed" });
  // D'une autre priorité : refusé avant que GitHub ne soit touché.
  assert.deepEqual(await deplacer(12, { before: 10 }), { done: false, reason: "#12 awaits #10, so it cannot be placed before it", price: "none: nothing was changed" });

  assert.deepEqual(ordre(), [10, 11, 12]);
  assert.equal(ticketDuRail(journal().base, 12)?.priority, 3);
  assert.deepEqual(ecrits, []);
  assert.deepEqual(deplacements(journal()), []);
});

test("B qui attend A par une chaîne ne se place pas avant lui non plus : la phrase nomme A, et le ticket par lequel il l'attend", async (t) => {
  const { journal, ordre, deplacer } = cuisine(t, { ticket: 10, priority: 2 }, { ticket: 11, priority: 2, waitsFor: [10] }, { ticket: 12, priority: 2, waitsFor: [11] });

  const resultat = await deplacer(12, { before: 10 });

  assert.deepEqual(resultat, { done: false, reason: "#12 awaits #10 through #11, so it cannot be placed before it", price: "none: nothing was changed" });
  assert.deepEqual(ordre(), [10, 11, 12]);
  assert.deepEqual(deplacements(journal()), []);
});

test("un ticket qui en attend un autre n'est jamais servi avant lui, quel que soit l'ordre manuel", (t) => {
  const { journal, ordre, rail } = cuisine(t, { ticket: 10, priority: 2 }, { ticket: 11, priority: 2, waitsFor: [10] });
  // L'ordre tel qu'un journal peut le porter, que le geste aurait refusé.
  journal().ajouter({ project: PROJET, ticket: 11, author: "chef", type: "ticket.moved", payload: { priority: 2, order: [11, 10] } });
  assert.deepEqual(ordre(), [11, 10]);

  const station = rail();
  assert.equal(station.prendre("a")?.ticket, 10);
  assert.equal(station.prendre("b"), null);
  station.envoyerEnPass(10, "a");
  station.servir(10);
  assert.equal(station.prendre("b")?.ticket, 11);
});

test("après un redémarrage, l'ordre manuel est identique, et la station sert dans cet ordre", async (t) => {
  const { ordre, deplacer, redemarrer, rail } = cuisine(t, { ticket: 9, priority: 1 }, { ticket: 10, priority: 2 }, { ticket: 11, priority: 2 }, { ticket: 12, priority: 2 }, { ticket: 13, priority: 3 });
  await deplacer(12, { before: 10 });
  await deplacer(13, { after: 9 });
  const avant = ordre();
  assert.deepEqual(avant, [9, 13, 12, 10, 11]);

  redemarrer();

  assert.deepEqual(ordre(), avant);
  const station = rail();
  assert.deepEqual(["a", "b", "c", "d", "e"].map((nom) => station.prendre(nom)?.ticket), avant);
});

test("les tickets jamais déplacés gardent l'ordre d'avant : priorité, puis le plus ancien ; un arrivé après un déplacement passe après les placés", async (t) => {
  const { journal, ordre, deplacer } = cuisine(t, { ticket: 20, priority: null }, { ticket: 21, priority: 2 }, { ticket: 22, priority: 1 }, { ticket: 23, priority: 2 }, { ticket: 24, priority: 1 });
  assert.deepEqual(ordre(), [22, 24, 21, 23, 20]);

  await deplacer(23, { before: 21 });
  assert.deepEqual(ordre(), [22, 24, 23, 21, 20]);

  // Plus ancien que tous, mais arrivé après le déplacement : l'ordre du chef reste devant.
  journal().ajouter({ project: PROJET, ticket: 25, author: "github", type: "ticket.arrived", payload: { title: "Ticket 25", priority: 2, createdAt: "2026-08-01T00:00:00Z", url: "https://exemple.test/25" } });
  assert.deepEqual(ordre(), [22, 24, 23, 21, 25, 20]);
});

test("un ticket placé qui change de priorité perd son rang : il se range par son âge dans sa nouvelle priorité ; parti puis revenu, de même", async (t) => {
  const { journal, ordre, deplacer } = cuisine(t, { ticket: 10, priority: 2 }, { ticket: 11, priority: 2 }, { ticket: 12, priority: 3 }, { ticket: 13, priority: 3 });
  await deplacer(13, { before: 12 });
  await deplacer(11, { before: 10 });
  assert.deepEqual(ordre(), [11, 10, 13, 12]);

  // Le titre change, pas la priorité : le rang tient.
  journal().ajouter({ project: PROJET, ticket: 13, author: "github", type: "ticket.changed", payload: { title: "Renommé", priority: 3 } });
  assert.deepEqual(ordre(), [11, 10, 13, 12]);

  journal().ajouter({ project: PROJET, ticket: 11, author: "github", type: "ticket.changed", payload: { title: "Ticket 11", priority: 3 } });
  assert.deepEqual(ordre(), [10, 13, 12, 11]);

  journal().ajouter({ project: PROJET, ticket: 13, author: "github", type: "ticket.left", payload: { reason: "unfired" } });
  journal().ajouter({ project: PROJET, ticket: 13, author: "github", type: "ticket.arrived", payload: { title: "Ticket 13", priority: 3, createdAt: "2026-09-04T00:00:00Z", url: "https://exemple.test/13" } });
  // 12 garde son rang ; 11 et 13 n'en ont plus : le plus ancien d'abord.
  assert.deepEqual(ordre(), [10, 12, 11, 13]);
});

test("le déplacement est refusé, sans rien toucher, pour un ticket absent, pris, ou placé contre lui-même ou contre un ticket pris", async (t) => {
  const { journal, ecrits, ordre, deplacer, rail } = cuisine(t, { ticket: 10, priority: 2 }, { ticket: 11, priority: 3 }, { ticket: 12, priority: 3 });
  rail().prendre("a");
  const refus = async (ticket: number, place: { before: number } | { after: number }) => {
    const resultat = await deplacer(ticket, place);
    return resultat.done ? "fait" : resultat.reason;
  };

  assert.equal(await refus(99, { before: 11 }), "#99 is not on the rail");
  assert.equal(await refus(11, { before: 99 }), "#99 is not on the rail");
  assert.equal(await refus(11, { after: 11 }), "#11 cannot be placed next to itself");
  assert.equal(await refus(10, { after: 12 }), "#10 is taken: only a queued ticket is moved, or placed against");
  assert.equal(await refus(12, { before: 10 }), "#10 is taken: only a queued ticket is moved, or placed against");

  assert.deepEqual(ordre(), [10, 11, 12]);
  assert.deepEqual(ecrits, []);
  assert.deepEqual(deplacements(journal()), []);
});
