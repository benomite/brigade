// Le planificateur des tickets récurrents (#3230), contre un faux GitHub : à sa
// date, exactement une issue avec le titre, le corps et `fire`, puis la date
// suivante ; rien tant que l'issue précédente est ouverte ; rien pour un ticket suspendu.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { test, type TestContext } from "node:test";
import type { Issue } from "../../src/github.ts";
import type { CauseReveil, Runtime } from "../../src/runtime.ts";
import { brancherRecurrents, planifierLesRecurrents, type GitHubDesRecurrents } from "../../src/recurrents/planificateur.ts";
import { cheminDesRecurrents, lireLesRecurrents, ouvrirRecurrents } from "../../src/recurrents/recurrents.ts";
import type { Rythme } from "../../src/recurrents/rythme.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

type Creee = { titre: string; corps: string; labels: string[] };

// Un faux GitHub : les issues qu'il a créées, chacune ouverte jusqu'à ce que le test la ferme.
function fauxGitHub() {
  const creees: Creee[] = [];
  const etats = new Map<number, Issue["state"]>();
  let panne: string | null = null;
  const github: GitHubDesRecurrents = {
    async issue(numero) {
      if (panne) throw new Error(panne);
      const state = etats.get(numero);
      return state === undefined ? null : { number: numero, title: "", labels: [], state, createdAt: "", updatedAt: "", url: "" };
    },
    async creerIssue(issue) {
      if (panne) throw new Error(panne);
      creees.push(issue);
      const numero = 100 + creees.length;
      etats.set(numero, "open");
      return numero;
    },
  };
  return { github, creees, fermer: (numero: number) => etats.set(numero, "closed"), oublier: (numero: number) => etats.delete(numero), tomber: (message: string | null) => void (panne = message) };
}

function projet(t: TestContext, rhythm: Rythme, jour: string) {
  const repertoireEtat = repertoireTemporaire(t);
  const recurrents = ouvrirRecurrents(repertoireEtat, { maintenant: () => new Date(`${jour}T08:00:00Z`) });
  const declare = recurrents.declare({ title: "Monthly invoice", body: "Send the invoice to the client", rhythm });
  const gh = fauxGitHub();
  const dits: string[] = [];
  const passer = (le: string) => planifierLesRecurrents({ repertoireEtat, github: gh.github, avertir: (ligne) => dits.push(ligne), maintenant: () => new Date(`${le}T10:00:00Z`) });
  const prochaine = () => recurrents.list()[0]?.nextDate;
  return { repertoireEtat, recurrents, declare, gh, dits, passer, prochaine };
}

test("when nextDate is reached, exactly one issue is created with the title, the body and `fire`, and nextDate moves to the following occurrence", async (t) => {
  const cas: Array<[Rythme, string, string]> = [
    [{ kind: "daily" }, "2026-11-11", "2026-11-12"],
    [{ kind: "weekly", weekday: 3 }, "2026-11-11", "2026-11-18"],
    [{ kind: "monthly", dayOfMonth: 11 }, "2026-11-11", "2026-12-11"],
    // Un 31 dans un mois de 30 jours, puis en février.
    [{ kind: "monthly", dayOfMonth: 31 }, "2026-10-31", "2026-11-30"],
    [{ kind: "monthly", dayOfMonth: 31 }, "2027-01-31", "2027-02-28"],
  ];
  for (const [rythme, jour, suivante] of cas) {
    const p = projet(t, rythme, jour);
    assert.equal(p.prochaine(), jour, JSON.stringify(rythme));
    // La veille, rien.
    assert.deepEqual(await p.passer(new Date(Date.parse(`${jour}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)), []);
    assert.deepEqual(await p.passer(jour), [101]);
    assert.deepEqual(p.gh.creees, [{ titre: "Monthly invoice", corps: "Send the invoice to the client", labels: ["fire"] }]);
    assert.equal(p.prochaine(), suivante, JSON.stringify(rythme));
    // Le même jour, un second passage ne crée rien de plus.
    p.gh.fermer(101);
    assert.deepEqual(await p.passer(jour), []);
    assert.equal(p.gh.creees.length, 1);
  }
});

test("the 31st keeps falling on each month's last day: November 30, December 31, February 28", async (t) => {
  const p = projet(t, { kind: "monthly", dayOfMonth: 31 }, "2026-11-01");
  assert.equal(p.prochaine(), "2026-11-30");
  const dates: Array<[string, string]> = [["2026-11-30", "2026-12-31"], ["2026-12-31", "2027-01-31"], ["2027-01-31", "2027-02-28"], ["2027-02-28", "2027-03-31"]];
  for (const [jour, suivante] of dates) {
    const [creee] = await p.passer(jour);
    assert.ok(creee !== undefined, jour);
    p.gh.fermer(creee);
    assert.equal(p.prochaine(), suivante);
  }
  assert.equal(p.gh.creees.length, 4);
});

test("no issue is created while the previous occurrence's issue is open; nextDate still advances; one is created at the next due date once it is closed", async (t) => {
  const p = projet(t, { kind: "daily" }, "2026-11-11");
  assert.deepEqual(await p.passer("2026-11-11"), [101]);
  // Encore ouverte : rien, et la date avance quand même.
  assert.deepEqual(await p.passer("2026-11-12"), []);
  assert.equal(p.gh.creees.length, 1);
  assert.equal(p.prochaine(), "2026-11-13");
  assert.ok(p.dits.some((ligne) => /#101 is still open: none created, next on 2026-11-13/.test(ligne)), p.dits.join("\n"));
  // Fermée : rien avant la date, une issue à la date.
  p.gh.fermer(101);
  assert.deepEqual(await p.passer("2026-11-12"), []);
  assert.deepEqual(await p.passer("2026-11-13"), [102]);
  assert.equal(p.gh.creees.length, 2);
  assert.equal(p.prochaine(), "2026-11-14");
});

test("missed dates do not pile up: after a week off, one issue, and nextDate is the occurrence after today", async (t) => {
  const p = projet(t, { kind: "daily" }, "2026-11-11");
  assert.deepEqual(await p.passer("2026-11-18"), [101]);
  assert.equal(p.prochaine(), "2026-11-19");
});

test("a previous issue GitHub no longer has does not block the next occurrence", async (t) => {
  const p = projet(t, { kind: "daily" }, "2026-11-11");
  await p.passer("2026-11-11");
  p.gh.oublier(101);
  assert.deepEqual(await p.passer("2026-11-12"), [102]);
});

test("a paused recurring ticket creates no issue; resume restores it; remove deletes it", async (t) => {
  const p = projet(t, { kind: "daily" }, "2026-11-11");
  p.recurrents.pause(p.declare.id);
  assert.deepEqual(await p.passer("2026-11-11"), []);
  assert.deepEqual(await p.passer("2026-11-12"), []);
  assert.equal(p.gh.creees.length, 0);
  // Repris : il crée de nouveau à sa date.
  p.recurrents.resume(p.declare.id);
  assert.deepEqual(await p.passer("2026-11-12"), [101]);
  p.gh.fermer(101);
  p.recurrents.remove(p.declare.id);
  assert.deepEqual(p.recurrents.list(), []);
  assert.deepEqual(await p.passer("2026-11-13"), []);
  assert.equal(p.gh.creees.length, 1);
});

test("GitHub failing changes nothing: no date advanced, and the next tick creates the issue", async (t) => {
  const p = projet(t, { kind: "daily" }, "2026-11-11");
  await p.passer("2026-11-11");
  p.gh.fermer(101);
  // La lecture de l'issue précédente échoue : rien de créé, la date ne bouge pas.
  p.gh.tomber("HTTP 502");
  assert.deepEqual(await p.passer("2026-11-12"), []);
  assert.equal(p.prochaine(), "2026-11-12");
  assert.ok(p.dits.some((ligne) => /not served this tick, retried on the next: HTTP 502/.test(ligne)), p.dits.join("\n"));
  p.gh.tomber(null);
  assert.deepEqual(await p.passer("2026-11-12"), [102]);
  assert.equal(p.prochaine(), "2026-11-13");
});

test("an unreadable file creates nothing and is not rewritten", async (t) => {
  const p = projet(t, { kind: "daily" }, "2026-11-11");
  writeFileSync(cheminDesRecurrents(p.repertoireEtat), "{ pas du json");
  assert.deepEqual(await p.passer("2026-11-11"), []);
  assert.equal(p.gh.creees.length, 0);
  assert.equal(readFileSync(cheminDesRecurrents(p.repertoireEtat), "utf8"), "{ pas du json");
  assert.ok(p.dits.some((ligne) => /recurring tickets — not read, nothing created/.test(ligne)), p.dits.join("\n"));
});

test("a pause written while GitHub is answering holds: the scheduler rereads before writing", async (t) => {
  const p = projet(t, { kind: "daily" }, "2026-11-11");
  const creer = p.gh.github.creerIssue;
  p.gh.github.creerIssue = async (issue) => {
    p.recurrents.pause(p.declare.id);
    return creer(issue);
  };
  await p.passer("2026-11-11");
  const [lu] = lireLesRecurrents(p.repertoireEtat);
  assert.equal(lu?.paused, true);
  assert.equal(lu?.lastIssue, 101);
  assert.equal(lu?.nextDate, "2026-11-12");
});

test("plugged on the runtime, it passes on each tick, never on a log wake-up", async (t) => {
  const p = projet(t, { kind: "daily" }, new Date().toISOString().slice(0, 10));
  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const runtime = { surReveil: (ecouter: (cause: CauseReveil) => void) => (ecouteurs.push(ecouter), () => {}) } as unknown as Runtime;
  brancherRecurrents(runtime, { repertoireEtat: p.repertoireEtat, github: p.gh.github, avertir: () => {} });
  for (const ecouter of ecouteurs) ecouter("log");
  await new Promise((resoudre) => setImmediate(resoudre));
  assert.equal(p.gh.creees.length, 0);
  for (const ecouter of ecouteurs) ecouter("tick");
  await jusqua(() => p.gh.creees.length === 1);
});
