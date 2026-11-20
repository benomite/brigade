// L'alerte de la cuisine — l'issue du disjoncteur — se dépose sur la brigade,
// jamais dans le dépôt du projet servi, et n'y est jamais un ticket (#3620). Le
// 15 novembre 2026, l'issue du disjoncteur, secondes#46, a été jugée `fire`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alerteDeLaCuisine, horsDesTickets, marqueDuDisjoncteur, LABEL_DU_DISJONCTEUR } from "../../src/alerte-cuisine/alerte-cuisine.ts";
import { clientDuDisjoncteur, corpsDeLIssue, publierLeDisjoncteur, titreDeLIssue } from "../../src/breaker-issue.ts";
import { repriseDemandee } from "../../src/breaker-resume-github.ts";
import { lireInstantane } from "../../src/github-etat/instantane.ts";
import type { Commentaire, GitHub } from "../../src/github.ts";
import { ouvrirLimite } from "../../src/limite-github.ts";
import { issueDuManager } from "../../src/projections/manager.ts";
import { DEPOT_BRIGADE, marqueDuProjet } from "../../src/routage-temps-perdu.ts";
import { chef, CALIBRE, cuisine, issue } from "../aides/cuisine.ts";
import { FauxGitHub } from "../faux-github.ts";
import { fauxGh, jusqua } from "../outils.ts";

const SECONDES = "benomite/secondes";
const MAINTENANT = new Date("2026-11-15T17:00:00Z");
const ilYA = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();
const TITRE_46 = titreDeLIssue("secondes");
// L'issue que le détecteur de cuisine inerte ouvrait avant le superviseur (#3914), secondes#45 : son titre et sa marque ne
// font plus une alerte de la cuisine.
const TITRE_45 = "The kitchen is idle: no merge for 90 minutes with 1 cookable ticket(s) (empty-rail)";
const CORPS_45 = "<!-- brigade:cuisine-inerte -->\nNo PR has been merged since 2026-11-15T15:25:00.000Z, for at least 90 minutes, while 1 ticket(s) are cookable: #44.";

describe("a kitchen alert is filed on Brigade, never in the project's repository", () => {
  test("a breaker alert for secondes: every call goes to benomite/brigade, none to the project's repository", { skip: process.platform === "win32" && "le faux `gh` est un script bash" }, async (t) => {
    const gh = fauxGh(t);
    gh.repondre(`repos/${DEPOT_BRIGADE}/issues?labels=brigade%3Abreaker-open&state=open&per_page=100`, { corps: [] });
    gh.repondre(`repos/${DEPOT_BRIGADE}/labels`, { statut: 422, corps: {} });
    gh.repondre(`repos/${DEPOT_BRIGADE}/issues`, { statut: 201, corps: { number: 3701 } });
    const ouvert = { ouvert: true as const, depuis: ilYA(5), ticket: 44, code: 1, erreur: null, echecs: [], seuil: 3 };

    assert.equal(await publierLeDisjoncteur(clientDuDisjoncteur({ bin: gh.bin, limite: ouvrirLimite() }), "secondes", ouvert, { servi: SECONDES }), 3701);
    // Sur la brigade, son corps nomme le dépôt du projet : l'app y retrouve l'issue de sa cuisine.
    assert.ok(corpsDeLIssue("secondes", ouvert, null, SECONDES).split("\n").includes(marqueDuProjet(SECONDES)));

    const chemins = gh.appels().map((args) => args.at(-1) ?? "");
    assert.ok(chemins.includes(`repos/${DEPOT_BRIGADE}/issues`), chemins.join("\n"));
    assert.deepEqual(chemins.filter((chemin) => !chemin.startsWith(`repos/${DEPOT_BRIGADE}/`)), []);
  });

  test("on Brigade, a `/resume` counts only on the issue of this kitchen: another project's breaker issue resumes nothing", async () => {
    const corps = new Map([
      [3702, corpsDeLIssue("autre", { ouvert: true, depuis: ilYA(5), ticket: 9, code: 1, erreur: null, echecs: [], seuil: 3 })],
      [3701, corpsDeLIssue("secondes", { ouvert: true, depuis: ilYA(5), ticket: 44, code: 1, erreur: null, echecs: [], seuil: 3 })],
    ]);
    const commentaires = new Map<number, Commentaire[]>();
    const resume = (numero: number) => commentaires.set(numero, [{ body: "/resume", author: "chef", association: "OWNER", createdAt: ilYA(1) }]);
    const brigade = {
      issuesDepuis: async () => [...corps].map(([number, body]) => ({ ...issue(number, [LABEL_DU_DISJONCTEUR]), body, association: "OWNER" })),
      commentaires: async (numero: number) => commentaires.get(numero) ?? [],
    } as unknown as GitHub;

    resume(3702);
    assert.equal(await repriseDemandee(brigade, ilYA(5), "secondes"), null);
    resume(3701);
    assert.equal((await repriseDemandee(brigade, ilYA(5), "secondes"))?.issue, 3701);
  });
});

describe("an issue the station opened for its own needs is never a ticket of the project", { concurrency: 4 }, () => {
  test("its durable mark, or its known title, makes it a kitchen alert — the breaker's only, no more the idle kitchen's", () => {
    assert.equal(alerteDeLaCuisine({ title: "anything", labels: [], body: CORPS_45 }), null);
    assert.equal(alerteDeLaCuisine({ title: TITRE_45, labels: [], body: "" }), null);
    assert.equal(alerteDeLaCuisine({ title: "anything", labels: [], body: `${marqueDuDisjoncteur("secondes")}\nThe breaker…` }), "disjoncteur");
    assert.equal(alerteDeLaCuisine({ title: TITRE_46, labels: [], body: "" }), "disjoncteur");
    assert.equal(alerteDeLaCuisine({ title: "anything", labels: [LABEL_DU_DISJONCTEUR] }), "disjoncteur");
    assert.equal(alerteDeLaCuisine({ title: "The lap screen is idle when the timer stops", labels: CALIBRE, body: "The kitchen is idle" }), null);
    assert.equal(horsDesTickets("disjoncteur", DEPOT_BRIGADE), true);
    assert.equal(horsDesTickets(undefined, SECONDES), false);
  });

  test("the station's reading of its tickets carries the alert", () => {
    const { tickets } = lireInstantane({
      repository: {
        issues: { nodes: [{ number: 46, title: "Breaker", body: `${marqueDuDisjoncteur("secondes")}\nThe breaker…`, labels: { nodes: CALIBRE.map((name) => ({ name })) } }, { number: 44, title: "Add the lap screen", body: "", labels: { nodes: [] } }] },
        pullRequests: { nodes: [] },
        ref: null,
      },
    });
    assert.deepEqual(tickets.map((ticket) => [ticket.number, ticket.alerte ?? null]), [[46, "disjoncteur"], [44, null]]);
  });

  test("the manager's triage: the breaker issue is set aside, never judged nor fired; an old idle-kitchen issue is judged and fired like the ordinary one", async (t) => {
    const c = cuisine(t, {
      manager: {},
      issues: [issue(44, [], { title: "Add the lap screen" }), issue(45, [], { title: TITRE_45 }), issue(46, [LABEL_DU_DISJONCTEUR], { title: TITRE_46 })],
    });
    c.gh.decrire(44, { body: "The lap screen shows each lap of the timer." });
    c.gh.decrire(45, { body: CORPS_45 });
    c.gh.decrire(46, { body: corpsDeLIssue("secondes", { ouvert: true, depuis: ilYA(5), ticket: 44, code: 1, erreur: null, echecs: [], seuil: 3 }) });
    chef(c.repertoire, "manager.enabled");

    await jusqua(() => c.gh.lire(44)?.labels.includes("effort:low") === true && c.gh.lire(45)?.labels.includes("effort:low") === true && issueDuManager(c.journal.base, 46) !== null);

    assert.deepEqual(c.gh.lire(44)?.labels, ["fire", "model:haiku", "effort:low"]);
    assert.deepEqual(c.gh.lire(45)?.labels, ["fire", "model:haiku", "effort:low"]);
    for (const numero of [46]) {
      assert.deepEqual([issueDuManager(c.journal.base, numero)?.decision, issueDuManager(c.journal.base, numero)?.reason], ["aside", "kitchen-alert"]);
      assert.equal(c.journal.duTicket(numero).some((fait) => fait.type === "manager.judged"), false);
    }
    assert.deepEqual(c.gh.labellisations.sort(([a], [b]) => a - b), [[44, ["fire", "model:haiku", "effort:low"]], [45, ["fire", "model:haiku", "effort:low"]]]);
    // Deux jugements : l'issue du projet, et celle de l'ancien détecteur — l'issue du disjoncteur n'en a aucun.
    assert.equal(c.lancements().filter((lancement) => lancement.args.includes("--tools")).length, 2);
  });

  test("replaying 2026-11-15 on secondes: the breaker issue already fired and calibrated is handed to no cook; the old idle-kitchen issue is cooked like the issue about secondes", async () => {
    const faux = new FauxGitHub();
    faux.feu(44, CALIBRE, "The lap screen shows each lap of the timer.");
    faux.feu(45, CALIBRE, CORPS_45);
    faux.ticket(45).title = TITRE_45;
    faux.feu(46, CALIBRE, "the body copied without its mark");
    faux.ticket(46).title = TITRE_46;
    const station = faux.station("box/claude", { places: 3, avertir: () => {} });

    await station.tour();
    await station.calme();

    assert.deepEqual(faux.cuissons.map(({ issue }) => issue).sort(), [44, 45]);
    assert.deepEqual(faux.pris().filter((numero) => numero !== 44 && numero !== 45), []);
  });
});
