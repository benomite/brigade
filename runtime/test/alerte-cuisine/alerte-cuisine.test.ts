// Les alertes de la cuisine se déposent sur la brigade, jamais dans le dépôt du
// projet servi, et n'y sont jamais des tickets (#3620). Le 15 novembre 2026, la
// station a ouvert benomite/secondes#45 (« The kitchen is idle … (empty-rail) »)
// dans le dépôt d'une app Android ; le manager l'a jugée `fire` et un cook l'a
// prise, sans rien pouvoir y faire. L'issue du disjoncteur, secondes#46, a été
// jugée de même.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alerteDeLaCuisine, horsDesTickets, marqueDuDisjoncteur, LABEL_DU_DISJONCTEUR } from "../../src/alerte-cuisine/alerte-cuisine.ts";
import { clientDuDisjoncteur, corpsDeLIssue, publierLeDisjoncteur, titreDeLIssue } from "../../src/breaker-issue.ts";
import { repriseDemandee } from "../../src/breaker-resume-github.ts";
import { lireInstantane } from "../../src/github-etat/instantane.ts";
import type { Commentaire, GitHub } from "../../src/github.ts";
import { INERTIE_MINUTES, LABEL_DU_BUG, MARQUE_D_INERTIE, signalerInertie } from "../../src/guerison/cuisine-inerte.ts";
import { ouvrirLimite } from "../../src/limite-github.ts";
import { issueDuManager } from "../../src/projections/manager.ts";
import { DEPOT_BRIGADE, marqueDuProjet } from "../../src/routage-temps-perdu.ts";
import { chef, CALIBRE, cuisine, issue } from "../aides/cuisine.ts";
import { FauxGitHub } from "../faux-github.ts";
import { fauxGh, jusqua } from "../outils.ts";

const SECONDES = "benomite/secondes";
const MAINTENANT = new Date("2026-11-15T17:00:00Z");
const ilYA = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();
const TITRE_45 = `The kitchen is idle: no merge for ${INERTIE_MINUTES} minutes with 1 cookable ticket(s) (empty-rail)`;
const CORPS_45 = `${MARQUE_D_INERTIE}\nNo PR has been merged since ${ilYA(95)}, for at least ${INERTIE_MINUTES} minutes, while 1 ticket(s) are cookable: #44.`;
const TITRE_46 = titreDeLIssue("secondes");

// Deux dépôts en mémoire : celui du projet, secondes, et la brigade.
function deuxDepots() {
  type Cree = { number: number; titre: string; corps: string; labels: string[] };
  const projet: Cree[] = [];
  const brigade: Cree[] = [];
  const creer = (ou: Cree[], debut: number) => async (issue: Omit<Cree, "number">) => {
    const number = debut + ou.length;
    ou.push({ number, ...issue });
    return number;
  };
  // Le 15 novembre : 90 minutes sans merge, un ticket cuisinable, aucune PR en passe.
  const github = {
    dernierMerge: async () => ilYA(95),
    cuisinables: async () => [{ number: 44, title: "Add the lap screen" }],
    prises: async () => [],
    prsEnPasse: async () => 0,
    issuesOuvertes: async (label: string) => projet.filter((i) => i.labels.includes(label)).map((i) => ({ number: i.number, body: i.corps })),
    creerIssue: creer(projet, 45),
  };
  const surLaBrigade = {
    servi: SECONDES,
    marqueDuProjet: marqueDuProjet(SECONDES),
    issuesOuvertes: async () => brigade.map((i) => ({ number: i.number, body: i.corps })),
    creerIssue: creer(brigade, 3700),
  };
  return { projet, brigade, github, surLaBrigade };
}

describe("a kitchen alert is filed on Brigade, never in the project's repository", () => {
  test("an empty-rail idle kitchen on benomite/secondes: the bug is created on benomite/brigade, nothing on secondes", async () => {
    const d = deuxDepots();
    const fait = await signalerInertie({ github: d.github, maintenant: MAINTENANT, brigade: d.surLaBrigade });

    assert.deepEqual(fait, { fait: "bug", cause: "empty-rail", bug: 3700, sur: "brigade" });
    assert.deepEqual(d.projet, []);
    assert.equal(d.brigade.length, 1);
    assert.match(d.brigade[0]?.titre ?? "", /\(empty-rail\)$/);
    assert.deepEqual(d.brigade[0]?.labels, [LABEL_DU_BUG]);
    assert.ok(d.brigade[0]?.corps.includes(MARQUE_D_INERTIE) && d.brigade[0]?.corps.includes(marqueDuProjet(SECONDES)));
    // Toujours ouvert sur la brigade : pas un second.
    assert.deepEqual(await signalerInertie({ github: d.github, maintenant: MAINTENANT, brigade: d.surLaBrigade }), { fait: "deja-signale", bug: 3700, sur: "brigade" });
    assert.deepEqual(d.projet, []);
  });

  test("an idle kitchen with no Brigade to file on: nothing is created, the project's repository least of all", async () => {
    const d = deuxDepots();
    assert.deepEqual(await signalerInertie({ github: d.github, maintenant: MAINTENANT }), { fait: "sans-brigade" });
    assert.deepEqual(d.projet, []);
    // La brigade qui se sert elle-même garde son bug chez elle : c'est là qu'est le code de la cuisine.
    assert.equal((await signalerInertie({ github: d.github, maintenant: MAINTENANT, projetBrigade: true })).fait, "bug");
    assert.equal(d.projet.length, 1);
  });

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
  test("its durable mark, or its known title, makes it a kitchen alert; on Brigade itself, an idle-kitchen alert stays a ticket", () => {
    assert.equal(alerteDeLaCuisine({ title: "anything", labels: [], body: CORPS_45 }), "inertie");
    assert.equal(alerteDeLaCuisine({ title: TITRE_45, labels: [], body: "" }), "inertie");
    assert.equal(alerteDeLaCuisine({ title: "anything", labels: [], body: `${marqueDuDisjoncteur("secondes")}\nThe breaker…` }), "disjoncteur");
    assert.equal(alerteDeLaCuisine({ title: TITRE_46, labels: [], body: "" }), "disjoncteur");
    assert.equal(alerteDeLaCuisine({ title: "anything", labels: [LABEL_DU_DISJONCTEUR] }), "disjoncteur");
    assert.equal(alerteDeLaCuisine({ title: "The lap screen is idle when the timer stops", labels: CALIBRE, body: "The kitchen is idle" }), null);
    assert.equal(horsDesTickets("inertie", SECONDES), true);
    assert.equal(horsDesTickets("inertie", undefined), true);
    assert.equal(horsDesTickets("disjoncteur", DEPOT_BRIGADE), true);
    assert.equal(horsDesTickets("inertie", "Benomite/Brigade"), false);
    assert.equal(horsDesTickets(undefined, SECONDES), false);
  });

  test("the station's reading of its tickets carries the alert", () => {
    const { tickets } = lireInstantane({
      repository: {
        issues: { nodes: [{ number: 45, title: "Idle", body: CORPS_45, labels: { nodes: CALIBRE.map((name) => ({ name })) } }, { number: 44, title: "Add the lap screen", body: "", labels: { nodes: [] } }] },
        pullRequests: { nodes: [] },
        ref: null,
      },
    });
    assert.deepEqual(tickets.map((ticket) => [ticket.number, ticket.alerte ?? null]), [[45, "inertie"], [44, null]]);
  });

  test("the manager's triage: the idle-kitchen alert and the breaker issue are set aside, never judged nor fired; the ordinary issue is judged and fired as before", async (t) => {
    const c = cuisine(t, {
      manager: {},
      issues: [issue(44, [], { title: "Add the lap screen" }), issue(45, [], { title: TITRE_45 }), issue(46, [LABEL_DU_DISJONCTEUR], { title: TITRE_46 })],
    });
    c.gh.decrire(44, { body: "The lap screen shows each lap of the timer." });
    c.gh.decrire(45, { body: CORPS_45 });
    c.gh.decrire(46, { body: corpsDeLIssue("secondes", { ouvert: true, depuis: ilYA(5), ticket: 44, code: 1, erreur: null, echecs: [], seuil: 3 }) });
    chef(c.repertoire, "manager.enabled");

    await jusqua(() => c.gh.lire(44)?.labels.includes("effort:low") === true && issueDuManager(c.journal.base, 45) !== null && issueDuManager(c.journal.base, 46) !== null);

    assert.deepEqual(c.gh.lire(44)?.labels, ["fire", "model:haiku", "effort:low"]);
    for (const numero of [45, 46]) {
      assert.deepEqual([issueDuManager(c.journal.base, numero)?.decision, issueDuManager(c.journal.base, numero)?.reason], ["aside", "kitchen-alert"]);
      assert.equal(c.journal.duTicket(numero).some((fait) => fait.type === "manager.judged"), false);
    }
    assert.deepEqual(c.gh.labellisations, [[44, ["fire", "model:haiku", "effort:low"]]]);
    // Un seul jugement : celui de l'issue du projet.
    assert.equal(c.lancements().filter((lancement) => lancement.args.includes("--tools")).length, 1);
  });

  test("replaying 2026-11-15 on secondes: the alerts already fired and calibrated are handed to no cook; only the issue about secondes is cooked", async () => {
    const faux = new FauxGitHub();
    faux.feu(44, CALIBRE, "The lap screen shows each lap of the timer.");
    faux.feu(45, CALIBRE, CORPS_45);
    faux.ticket(45).title = TITRE_45;
    faux.feu(46, CALIBRE, "the body copied without its mark");
    faux.ticket(46).title = TITRE_46;
    const station = faux.station("box/claude", { places: 3, avertir: () => {} });

    await station.tour();
    await station.calme();

    assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [44]);
    assert.deepEqual(faux.pris().filter((numero) => numero !== 44), []);
  });
});
