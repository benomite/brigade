// Une issue du disjoncteur, que la station déposait avant #3911, n'est jamais un ticket du projet servi (#3620). Le 15 novembre 2026,
// secondes#46, l'issue du disjoncteur, a été jugée `fire` dans le dépôt d'une
// app Android et prise par un cook, sans rien pouvoir y faire.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alerteDeLaCuisine, horsDesTickets } from "../../src/issue-de-la-cuisine.ts";
import { lireInstantane } from "../../src/github-etat/instantane.ts";
import { issueDuManager } from "../../src/projections/manager.ts";
import { chef, CALIBRE, cuisine, issue } from "../aides/cuisine.ts";
import { FauxGitHub } from "../faux-github.ts";
import { jusqua } from "../outils.ts";

// What the station filed before #3911: its issues, still open, are never tickets.
const TITRE_46 = "Kitchen secondes held: its breaker is open";
const CORPS_46 = "<!-- brigade:breaker-open project=secondes -->\nThe breaker of the `secondes` kitchen opened after 3 failures in a row.";

describe("an issue the station opened for its own needs is never a ticket of the project", { concurrency: 4 }, () => {
  test("its durable mark, its label or its known title makes it the kitchen's issue", () => {
    assert.equal(alerteDeLaCuisine({ title: "anything", labels: [], body: `<!-- brigade:breaker-open project=secondes -->\nThe breaker…` }), "disjoncteur");
    assert.equal(alerteDeLaCuisine({ title: TITRE_46, labels: [], body: "" }), "disjoncteur");
    assert.equal(alerteDeLaCuisine({ title: "anything", labels: ["brigade:breaker-open"] }), "disjoncteur");
    assert.equal(alerteDeLaCuisine({ title: "The lap screen is idle when the timer stops", labels: CALIBRE, body: "The kitchen is idle" }), null);
    assert.equal(horsDesTickets("disjoncteur"), true);
    assert.equal(horsDesTickets(undefined), false);
  });

  test("the station's reading of its tickets carries the alert", () => {
    const { tickets } = lireInstantane({
      repository: {
        issues: { nodes: [{ number: 46, title: "Held", body: "<!-- brigade:breaker-open project=secondes -->", labels: { nodes: CALIBRE.map((name) => ({ name })) } }, { number: 44, title: "Add the lap screen", body: "", labels: { nodes: [] } }] },
        pullRequests: { nodes: [] },
        ref: null,
      },
    });
    assert.deepEqual(tickets.map((ticket) => [ticket.number, ticket.alerte ?? null]), [[46, "disjoncteur"], [44, null]]);
  });

  test("the manager's triage: the breaker issue is set aside, never judged nor fired; the ordinary issue is judged and fired as before", async (t) => {
    const c = cuisine(t, {
      manager: {},
      issues: [issue(44, [], { title: "Add the lap screen" }), issue(46, ["brigade:breaker-open"], { title: TITRE_46 })],
    });
    c.gh.decrire(44, { body: "The lap screen shows each lap of the timer." });
    c.gh.decrire(46, { body: CORPS_46 });
    chef(c.repertoire, "manager.enabled");

    await jusqua(() => c.gh.lire(44)?.labels.includes("effort:low") === true && issueDuManager(c.journal.base, 46) !== null);

    assert.deepEqual(c.gh.lire(44)?.labels, ["fire", "model:haiku", "effort:low"]);
    for (const numero of [46]) {
      assert.deepEqual([issueDuManager(c.journal.base, numero)?.decision, issueDuManager(c.journal.base, numero)?.reason], ["aside", "kitchen-alert"]);
      assert.equal(c.journal.duTicket(numero).some((fait) => fait.type === "manager.judged"), false);
    }
    assert.deepEqual(c.gh.labellisations, [[44, ["fire", "model:haiku", "effort:low"]]]);
    // Un seul jugement : celui de l'issue du projet.
    assert.equal(c.lancements().filter((lancement) => lancement.args.includes("--tools")).length, 1);
  });

  test("replaying 2026-11-15 on secondes: the breaker issue already fired and calibrated is handed to no cook; only the issue about secondes is cooked", async () => {
    const faux = new FauxGitHub();
    faux.feu(44, CALIBRE, "The lap screen shows each lap of the timer.");
    faux.feu(46, CALIBRE, "the body copied without its mark");
    faux.ticket(46).title = TITRE_46;
    const station = faux.station("box/claude", { places: 3, avertir: () => {} });

    await station.tour();
    await station.calme();

    assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [44]);
    assert.deepEqual(faux.pris().filter((numero) => numero !== 44), []);
  });
});
