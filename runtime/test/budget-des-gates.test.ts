// Le ticket des gates hors budget : la cuisine l'ouvre seule sur le projet
// quand le dernier passage de ses gates dépasse son budget, un à la fois, et
// `facts` le donne à l'app.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { annonceDuBudget, LABELS_BUDGET, tenirLeBudget } from "../src/budget-des-gates.ts";
import { BUDGET_DUREE, BUDGET_PROCESSEUR } from "../src/cout-des-gates.ts";
import { poserDecision } from "../src/decisions.ts";
import type { FaitGates } from "../src/events/gates.ts";
import { principal as montrerLeRail } from "../src/montrer-rail.ts";
import { principal as faits } from "../src/faits.ts";
import type { GitHub } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { cuisine, fauxGitHub, issue } from "./aides/cuisine.ts";
import { aArreter, appeler, jusqua, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const PROJET = "espace";
const HEURE = "2026-10-08T10:00:00Z";
// Sous le budget par défaut (100 s, 400 s), et au-dessus : en durée, en processeur, les deux.
const SOUS: FaitGates["payload"] = { runner: "pass", outcome: "green", durationMs: 60_000, cpuMs: 200_000 };
const TROP_LONG: FaitGates["payload"] = { runner: "pass", outcome: "green", durationMs: 215_000, cpuMs: 300_000 };
const TROP_LOURD: FaitGates["payload"] = { runner: "pass", outcome: "red", durationMs: 90_000, cpuMs: 990_000 };

function cas(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  // À l'heure du faux GitHub, qui date de là les issues qu'il crée.
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(HEURE) });
  // Fermé avant que son répertoire soit retiré : sous Windows, un fichier ouvert ne s'efface pas.
  aArreter(t, () => journal.fermer());
  const gh = fauxGitHub();
  // Ce que la cuisine a demandé à GitHub, dans l'ordre.
  const appels: string[] = [];
  const github: Pick<GitHub, "issue" | "creerIssue" | "issuesDepuis"> = {
    issue: (numero) => (appels.push(`issue ${numero}`), gh.github.issue(numero)),
    creerIssue: (demande) => (appels.push("creerIssue"), gh.github.creerIssue(demande)),
    issuesDepuis: (instant) => (appels.push("issuesDepuis"), gh.github.issuesDepuis(instant)),
  };
  const passage = (payload: FaitGates["payload"], ticket: number | null = 17) => journal.ajouter({ project: PROJET, ticket, author: "pass", type: "gates.ran", payload });
  const tenir = () => tenirLeBudget({ journal, github, projet: PROJET, auteur: "pass", maintenant: () => new Date(HEURE) });
  const fermer = (numero: number) => gh.poser({ ...gh.lire(numero)!, state: "closed" });
  const types = () => journal.tout().filter((evenement) => evenement.type.startsWith("gates.budget-ticket")).map((evenement) => `${evenement.type} ${evenement.ticket ?? "-"}`);
  return { repertoire, journal, gh, appels, passage, tenir, fermer, types };
}

async function ticketLu(repertoire: string) {
  const lancee = appeler(faits, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: PROJET });
  assert.equal(await lancee.fin, 0, lancee.sortie());
  return JSON.parse(lancee.sortie()).coutDesGates.ticket;
}

describe("le ticket des gates hors budget", { concurrency: 8 }, () => {
  test("un passage hors budget, sans ticket ouvert, en ouvre exactement un : sa durée, son processeur, le budget et ce qui le dépasse", async (t) => {
    const { repertoire, journal, gh, passage, tenir, types } = cas(t);
    passage(TROP_LONG);

    assert.deepEqual(await tenir(), { ticket: 501, ouvert: true });

    assert.deepEqual(gh.creations, [501]);
    const ouvert = gh.lire(501)!;
    assert.deepEqual(ouvert.labels, LABELS_BUDGET);
    assert.equal(ouvert.title, "Bring the gates of a ticket of espace back under their budget: 215 s for a budget of 100 s");
    const corps = gh.corpsDe(501);
    assert.match(corps, /\| Duration \(wall-clock\) \| 215 s \| 100 s \(default\) \| \*\*exceeded\*\* \(\+115 %\) \|/);
    assert.match(corps, /\| CPU \(user \+ system, children included\) \| 300 s \| 400 s \(default\) \| within \|/);
    assert.match(corps, /wall-clock duration exceeded/);
    assert.match(corps, /the gates of #17, which play only the tests the change touches, run by the pass/);
    assert.match(corps, /went over their ticket budget/);
    assert.match(corps, /The full run is not in scope/);
    assert.deepEqual(types(), ["gates.budget-ticket-opening -", "gates.budget-ticket-opened 501"]);
    const [annonce] = journal.tout().filter((evenement) => evenement.type === "gates.budget-ticket-opening");
    assert.equal(annonceDuBudget(corps, PROJET), annonce?.seq);
    assert.equal(annonceDuBudget(corps, "autre"), null);

    // L'app le lit par `facts` : la cuisine l'a ouvert, pour ce qui dépassait.
    const lu = await ticketLu(repertoire);
    assert.equal(lu.number, 501);
    assert.deepEqual(lu.exceeded, ["duration"]);
    assert.ok(!Number.isNaN(Date.parse(lu.openedAt)));
  });

  test("le processeur dépassé se dit, avec le budget posé par le chef", async (t) => {
    const { journal, gh, passage, tenir } = cas(t);
    poserDecision(journal, { projet: PROJET, nom: BUDGET_PROCESSEUR, valeur: "500", auteur: "chef" });
    passage(TROP_LOURD);

    await tenir();

    assert.equal(gh.lire(501)!.title, "Bring the gates of a ticket of espace back under their budget: 990 s of CPU for a budget of 500 s");
    const corps = gh.corpsDe(501);
    assert.match(corps, /\| CPU \(user \+ system, children included\) \| 990 s \| 500 s \(set by the chef\) \| \*\*exceeded\*\* \(\+98 %\) \|/);
    assert.match(corps, /\| Duration \(wall-clock\) \| 90 s \| 100 s \(default\) \| within \|/);
  });

  test("le run complet sur la base ne se juge pas au budget d'un ticket : il a le sien, plus large", async (t) => {
    const { gh, passage, tenir, types } = cas(t);
    // 215 s et 990 s de processeur : très au-dessus du budget d'un ticket, sous celui de la base (400 s, 1600 s).
    passage({ ...TROP_LOURD, durationMs: 215_000 }, null);

    assert.equal(await tenir(), null);
    assert.deepEqual(gh.creations, []);
    assert.deepEqual(types(), []);

    // Le même passage sur un ticket dépasse.
    passage({ ...TROP_LOURD, durationMs: 215_000 });
    assert.deepEqual(await tenir(), { ticket: 501, ouvert: true });

  });

  test("le run complet sur la base au-dessus de son budget ouvre un ticket qui le dit, sans demander de tenir le budget d'un ticket", async (t) => {
    const { repertoire, gh, passage, tenir } = cas(t);
    passage({ runner: "pass", outcome: "green", durationMs: 450_000, cpuMs: 700_000 }, null);

    assert.deepEqual(await tenir(), { ticket: 501, ouvert: true });

    assert.equal(gh.lire(501)!.title, "Bring the full run of the gates of espace on the base back under its budget: 450 s for a budget of 400 s");
    const corps = gh.corpsDe(501);
    assert.match(corps, /The full run of the gates of espace went over its base budget/);
    assert.match(corps, /the full run of the gates on the integration base/);
    assert.match(corps, /\| CPU \(user \+ system, children included\) \| 700 s \| 1600 s \(default\) \| within \|/);
    assert.match(corps, /stays within the base budget: at most 400 s/);
    assert.doesNotMatch(corps, /ticket budget/);
    assert.equal((await ticketLu(repertoire)).run, "base");
  });

  test("tant que le ticket est ouvert, les passages hors budget suivants n'en ouvrent pas d'autre", async (t) => {
    const { gh, passage, tenir, types } = cas(t);
    passage(TROP_LONG);
    await tenir();

    for (const payload of [TROP_LOURD, TROP_LONG, { ...TROP_LONG, durationMs: 400_000 }]) {
      passage(payload);
      assert.deepEqual(await tenir(), { ticket: 501, ouvert: false });
    }

    assert.deepEqual(gh.creations, [501]);
    assert.deepEqual(types(), ["gates.budget-ticket-opening -", "gates.budget-ticket-opened 501"]);
  });

  test("le ticket s'ouvre en prio:1, pour passer devant les tickets de priorité plus basse", async (t) => {
    const { gh, passage, tenir } = cas(t);
    passage(TROP_LONG);
    await tenir();
    assert.ok(gh.lire(501)!.labels.includes("prio:1"));
  });

  test("un ticket retiré du rail, resté ouvert, ne retient pas le suivant — ni `hors-cuisine`", async (t) => {
    const { gh, passage, tenir, types } = cas(t);
    passage(TROP_LONG);
    await tenir();
    gh.poser({ ...gh.lire(501)!, labels: gh.lire(501)!.labels.filter((label) => label !== "fire") });

    passage(TROP_LONG);
    assert.deepEqual(await tenir(), { ticket: 502, ouvert: true });
    gh.poser({ ...gh.lire(502)!, labels: [...gh.lire(502)!.labels, "hors-cuisine"] });
    passage(TROP_LONG);
    assert.deepEqual(await tenir(), { ticket: 503, ouvert: true });
    assert.deepEqual(types().filter((type) => type.startsWith("gates.budget-ticket-closed")), ["gates.budget-ticket-closed 501", "gates.budget-ticket-closed 502"]);
  });

  test("la file du projet dit en une ligne que les gates sont hors budget sans ticket sur le rail, et se tait sinon", async (t) => {
    const { repertoire, journal, passage } = cas(t);
    const ligne = async () => {
      const lancee = appeler(montrerLeRail, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: PROJET });
      assert.equal(await lancee.fin, 0, lancee.sortie());
      return lancee.sortie().split("\n").filter((l) => l.includes("over budget"));
    };
    passage(SOUS);
    assert.deepEqual(await ligne(), []);
    passage(TROP_LONG);
    assert.deepEqual(await ligne(), ["gates of espace over budget (gates of a ticket: wall-clock duration) and no budget ticket on the rail"]);
    journal.ajouter({ project: PROJET, ticket: 501, author: "github", type: "gates.budget-ticket-opened", payload: { durationSeconds: 215, cpuSeconds: 300, budget: { durationSeconds: 100, cpuSeconds: 400 }, exceeded: ["duration"], run: "ticket", reconciled: false } });
    assert.deepEqual(await ligne(), ["gates of espace over budget (gates of a ticket: wall-clock duration) and no budget ticket on the rail"]);
  });

  test("fermé, le passage hors budget suivant en ouvre un neuf — disparu de même ; `facts` donne le dernier", async (t) => {
    const { repertoire, gh, passage, tenir, fermer, types } = cas(t);
    passage(TROP_LONG);
    await tenir();
    fermer(501);

    passage(TROP_LOURD);
    assert.deepEqual(await tenir(), { ticket: 502, ouvert: true });
    assert.equal((await ticketLu(repertoire)).number, 502);

    // Un ticket que GitHub ne rend plus est un ticket fermé.
    gh.github.issue = async () => null;
    passage(TROP_LONG);
    assert.deepEqual(await tenir(), { ticket: 503, ouvert: true });

    assert.deepEqual(gh.creations, [501, 502, 503]);
    assert.deepEqual(types(), [
      "gates.budget-ticket-opening -",
      "gates.budget-ticket-opened 501",
      "gates.budget-ticket-closed 501",
      "gates.budget-ticket-opening -",
      "gates.budget-ticket-opened 502",
      "gates.budget-ticket-closed 502",
      "gates.budget-ticket-opening -",
      "gates.budget-ticket-opened 503",
    ]);
  });

  test("sous le budget, rien ne part vers GitHub ni ne s'écrit — même ticket fermé, même passé au-dessus avant", async (t) => {
    const { repertoire, gh, appels, passage, tenir, fermer, types } = cas(t);

    // Aucun passage encore.
    assert.equal(await tenir(), null);
    passage(SOUS);
    assert.equal(await tenir(), null);
    // Pile au budget, ce n'est pas le dépasser.
    passage({ runner: "pass", outcome: "green", durationMs: 100_000, cpuMs: 400_000 });
    assert.equal(await tenir(), null);
    // Coupées, leur processeur n'est pas dit : seule la durée compte.
    passage({ runner: "pass", outcome: "timeout", durationMs: 90_000, cpuMs: null });
    assert.equal(await tenir(), null);
    assert.deepEqual(appels, []);
    assert.deepEqual(types(), []);
    assert.equal(await ticketLu(repertoire), null);

    // Au-dessus une fois, puis de retour dessous, ticket fermé : rien de neuf.
    passage(TROP_LONG);
    await tenir();
    fermer(501);
    appels.length = 0;
    passage(SOUS);
    assert.equal(await tenir(), null);
    assert.deepEqual(appels, []);
    assert.deepEqual(gh.creations, [501]);
  });

  test("la réponse de GitHub perdue, l'issue se retrouve par sa marque au passage suivant : pas de doublon", async (t) => {
    const { gh, passage, tenir, types } = cas(t);
    gh.pannes.apresCreation = true;
    passage(TROP_LONG);

    await assert.rejects(tenir(), /délai dépassé/);
    assert.deepEqual(types(), ["gates.budget-ticket-opening -"]);

    passage(TROP_LONG);
    assert.deepEqual(await tenir(), { ticket: 501, ouvert: false });
    assert.deepEqual(gh.creations, [501]);
    assert.deepEqual(types(), ["gates.budget-ticket-opening -", "gates.budget-ticket-opened 501"]);
  });

  test("GitHub en panne à la création : rien n'est ouvert, le passage suivant l'ouvre ; une marque posée par un inconnu ne compte pas", async (t) => {
    const { journal, gh, passage, tenir } = cas(t);
    gh.pannes.creation = true;
    passage(TROP_LONG);
    await assert.rejects(tenir(), /HTTP 502/);
    // Quelqu'un sans la main sur le dépôt ouvre, aussitôt, une issue qui porte la marque de l'annonce.
    const annonce = journal.tout().find((evenement) => evenement.type === "gates.budget-ticket-opening")?.seq ?? 0;
    gh.poser(issue(42, [], { createdAt: HEURE, updatedAt: HEURE }));
    gh.decrire(42, { body: `<!-- brigade:budget-gates espace ${annonce} -->`, association: "NONE" });
    assert.equal(annonceDuBudget(gh.corpsDe(42), PROJET), annonce);

    gh.pannes.creation = false;
    passage(TROP_LONG);
    assert.deepEqual(await tenir(), { ticket: 501, ouvert: true });
    assert.deepEqual(gh.creations, [501]);
  });

  test("la pass ouvre le ticket quand les gates qu'elle joue dépassent le budget du projet, une fois, et le dit", { skip: posixOnly("the gates are a shell script run by bash") }, async (t) => {
    const { journal, gh, gates, avertissements } = cuisine(t, { pass: true });
    poserDecision(journal, { projet: "brigade", nom: BUDGET_DUREE, valeur: "0.1", auteur: "chef" });
    gates.regler("pesant");
    gh.poser(issue(17));

    await jusqua(() => journal.tout().some((evenement) => evenement.type === "gates.budget-ticket-opened"));

    const [ouvert] = journal.tout().filter((evenement) => evenement.type === "gates.budget-ticket-opened");
    assert.equal(ouvert?.project, "brigade");
    assert.equal(ouvert?.author, "pass");
    const numero = ouvert?.ticket ?? 0;
    assert.deepEqual(gh.lire(numero)?.labels, LABELS_BUDGET);
    assert.match(gh.corpsDe(numero), /\| Duration \(wall-clock\) \| [\d.]+ s \| 0\.1 s \(set by the chef\) \| \*\*exceeded\*\*/);
    await jusqua(() => avertissements.some((ligne) => ligne.includes(`ticket #${numero} ouvert`)));
  });
});
