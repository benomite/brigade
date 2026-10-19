// La commande par laquelle le chef voit le manager et le tient :
// `npm run manager -- [on | off | return <n°> | backlog | upstream]`. Elle se joue
// dans le process du test ; depuis le sien, là où c'est lui qu'on regarde — allumer
// pendant que le runtime tourne, un refus rendu par son code. `backlog` lit GitHub :
// un faux `gh` lui dicte un backlog connu.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { principal as manager } from "../src/manager-cli.ts";
import { etatDuManager } from "../src/projections/manager.ts";
import { demarrer } from "../src/runtime.ts";
import { sansMotFrancais } from "./helpers/glossary.ts";
import { appeler, DEPOT, fauxGh, horloge, issueGitHub, lancer, repertoireTemporaire } from "./outils.ts";

const CLI = join(import.meta.dirname, "../src/manager-cli.ts");

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, maintenant: horloge() });
  t.after(() => runtime.arreter("test"));
  const { journal } = runtime;
  const noter = (fait: Fait, ticket: number | null, author = "manager") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const rendre = async (cli: { fin: Promise<number | null>; sortie: () => string }) => ({ code: await cli.fin, sortie: cli.sortie() });
  const commande = (...args: string[]) => rendre(appeler(manager, args, { BRIGADE_STATE_DIR: repertoire }));
  // Par son fichier, dans son propre process : comme `npm run` la lance.
  const lancee = (...args: string[]) => rendre(lancer(t, CLI, args, { BRIGADE_STATE_DIR: repertoire }));
  const commandes = () => journal.tout().filter((e) => e.type === "manager.enabled" || e.type === "manager.disabled");
  return { repertoire, journal, noter, commande, lancee, commandes };
}

describe("la commande manager", { concurrency: 8 }, () => {
  test("sans argument et sans rien au journal, le manager est éteint et le chef lit ce que cela veut dire", async (t) => {
    const { commande, journal } = cuisine(t);
    const avant = journal.tout();

    const { code, sortie } = await commande();

    assert.equal(code, 0);
    assert.match(sortie, /manager\s+OFF — never turned on: no issue is judged, `fire` and the calibration are set by hand/);
    assert.match(sortie, /latest decisions\s+none/);
    assert.deepEqual(journal.tout(), avant);
  });

  test("allumer s'écrit au journal, une seule fois, au nom du chef", async (t) => {
    const { lancee, commandes, journal } = cuisine(t);

    const premiere = await lancee("on");
    const seconde = await lancee("on");

    assert.equal(premiere.code, 0);
    assert.match(premiere.sortie, /manager on: it judges the open issues/);
    assert.match(seconde.sortie, /already on since/);
    assert.deepEqual(commandes().map((e) => [e.type, e.author]), [["manager.enabled", "chef"]]);
    assert.equal(etatDuManager(journal.base)?.active, true);
    assert.match((await lancee()).sortie, /manager\s+ON since \d{4}-\d{2}-\d{2}T\S+ \(by chef\)/);
  });

  test("éteindre arrête les jugements à venir, et ne défait rien de ce qui est posé", async (t) => {
    const { commande, commandes } = cuisine(t);
    assert.match((await commande("off")).sortie, /nothing to turn off/);
    await commande("on");

    const { code, sortie } = await commande("off");

    assert.equal(code, 0);
    assert.match(sortie, /manager off: no issue is judged any more — what it set stays set/);
    assert.deepEqual(commandes().map((e) => e.type), ["manager.enabled", "manager.disabled"]);
    assert.match((await commande()).sortie, /manager\s+OFF since/);
  });

  test("le chef lit les dernières décisions, chacune avec son motif", async (t) => {
    const { commande, noter } = cuisine(t);
    noter({ type: "manager.judged", payload: { run: "juge-30-a", fingerprint: "e1", verdict: "fire", kind: "ticket", reason: "Un livrable, un test.", missing: null, model: "haiku", effort: "low", calibration: "Mécanique." } }, 30);
    noter({ type: "manager.labeled", payload: { labels: ["fire", "effort:low"] } }, 30);
    noter({ type: "manager.judged", payload: { run: "juge-31-a", fingerprint: "e2", verdict: "refused", kind: "epic", reason: "Trois livrables.", missing: "La découper.", model: null, effort: null, calibration: null } }, 31);
    noter({ type: "manager.failed", payload: { run: "juge-32-a", fingerprint: "e3", reason: "aucun objet JSON dans la réponse" } }, 32);
    noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 1);

    const { sortie } = await commande();

    const lignes = sortie.slice(0, sortie.indexOf("\nset aside")).split("\n").filter((ligne) => /^\s+\d{4}-/.test(ligne));
    assert.equal(lignes.length, 4);
    assert.match(lignes[0] ?? "", /#1\s+set aside \(`roadmap`\)/);
    assert.match(lignes[1] ?? "", /#32\s+unreadable judgment — aucun objet JSON dans la réponse/);
    assert.match(lignes[2] ?? "", /#31\s+refused \(an epic\) — Trois livrables\./);
    assert.match(lignes[3] ?? "", /#30\s+on the rail, haiku \/ low \(set: fire, effort:low\) — Un livrable, un test\./);
  });

  test("le chef lit où en est chaque épique : découpée et servie, en cours, ou en attente de sa réponse", async (t) => {
    const { commande, noter } = cuisine(t);
    const prevu = (title: string) => ({ title, context: "", criteria: ["Un critère."], waitsFor: [], zone: ["docs/"], model: "haiku", effort: "low", calibration: "Doc." });
    noter({ type: "manager.split", payload: { run: "decoupe-30-a", fingerprint: "e1", reason: "Deux livrables.", order: "Le socle d'abord.", tickets: [prevu("Le socle"), prevu("La suite")] } }, 30);
    noter({ type: "manager.split-created", payload: { epic: 30, index: 1, reconciled: false } }, 501);
    noter({ type: "manager.split-fired", payload: { epic: 30, index: 1 } }, 501);
    noter({ type: "manager.split-asked", payload: { run: "decoupe-31-a", fingerprint: "e2", question: "Quel écran ?" } }, 31);

    const encours = (await commande()).sortie;
    assert.match(encours, /#31\s+QUESTION ASKED, awaiting your answer on the epic — Quel écran \?/);
    assert.match(encours, /#30\s+split in progress, 1\/2 tickets created and fired — Deux livrables\./);

    noter({ type: "manager.split-created", payload: { epic: 30, index: 2, reconciled: false } }, 502);
    noter({ type: "manager.split-fired", payload: { epic: 30, index: 2 } }, 502);
    noter({ type: "manager.split-done", payload: {} }, 30);
    noter({ type: "ticket.arrived", payload: { title: "Le socle", priority: null, createdAt: "2026-10-08T10:00:00Z", url: "u" } }, 501, "github");
    noter({ type: "ticket.served", payload: {} }, 501, "runtime");

    assert.match((await commande()).sortie, /#30\s+split, 1\/2 served \(#501, #502\) — Deux livrables\./);
  });

  test("le chef lit les réactions du manager aux tickets restés rouges : le choix, et son motif", async (t) => {
    const { commande, noter } = cuisine(t);
    assert.match((await commande()).sortie, /reactions\s+none/);
    const reaction = { verdict: 9, returns: 2, proposal: null, run: "reagit-30-a", from: { model: "haiku", effort: "low" } };
    noter({ type: "manager.reacted", payload: { ...reaction, choice: "raise", reason: "Le cook cale.", to: { model: "haiku", effort: "medium" } } }, 30);
    noter({ type: "manager.reacted", payload: { ...reaction, choice: "split", reason: "Deux livrables.", to: null } }, 31);
    noter({ type: "manager.reacted", payload: { ...reaction, choice: "escalate", reason: "Le critère 2 se contredit.", proposal: "Le trancher.", to: null } }, 32);
    noter({ type: "manager.reacted", payload: { ...reaction, returns: 1, run: null, choice: "retry", reason: "aucun plafond", to: null } }, 33);
    noter({ type: "manager.raised", payload: { added: ["effort:medium"], removed: ["effort:low"] } }, 30);
    // Une montée que le chef a devancée : rien n'a été posé.
    noter({ type: "manager.reacted", payload: { ...reaction, choice: "raise", reason: "Le cook cale.", to: { model: "haiku", effort: "medium" } } }, 34);
    noter({ type: "manager.raised", payload: { added: [], removed: [] } }, 34);

    const { sortie } = await commande();

    assert.match(sortie, /#30\s+after 2 returns, calibration raised from haiku \/ low to haiku \/ medium — Le cook cale\./);
    assert.match(sortie, /#34\s+after 2 returns, raise from haiku \/ low to haiku \/ medium dropped: the chef recalibrated in the meantime/);
    assert.match(sortie, /#31\s+after 2 returns, split again — Deux livrables\./);
    assert.match(sortie, /#32\s+after 2 returns, escalated to the chef — Le critère 2 se contredit\. Proposed: Le trancher\./);
    assert.match(sortie, /#33\s+second return at the same calibration \(haiku \/ low\) — aucun plafond/);
  });

  test("le chef lit ce que le manager a écarté, pourquoi, et le geste qui lève chaque écart", async (t) => {
    const { commande, noter } = cuisine(t);
    assert.match((await commande()).sortie, /set aside\s+none/);
    noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 1);
    noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 31);
    noter({ type: "manager.set-aside", payload: { reason: "already-split", fired: false } }, 32);
    noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } }, 30);

    const { sortie } = await commande();

    const ecartees = sortie.slice(sortie.indexOf("\nset aside"), sortie.indexOf("epics"));
    assert.match(ecartees, /#30\s+you removed `fire` or a calibration the manager had set — to return it to the manager: `brigade <projet> manager return 30`: it rejudges it from scratch/);
    assert.match(ecartees, /#32\s+its body already lists the tickets of an epic, split by hand — to return it to the manager: remove that list from its body/);
    assert.match(ecartees, /#31\s+it carries `blocked-on-human` — to return it to the manager: remove `blocked-on-human`: it is judged on the next wake-up/);
    assert.match(ecartees, /#1\s+it is the project's roadmap — nothing returns it to the manager/);
  });

  test("rendre s'écrit au journal au nom du chef, une fois, pour une issue écartée `chef-changed` — et le relevé la montre rendue", async (t) => {
    const { commande, noter, journal } = cuisine(t);
    noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } }, 30);

    const premiere = await commande("return", "30");
    const seconde = await commande("return", "30");

    assert.equal(premiere.code, 0);
    assert.match(premiere.sortie, /#30 returned to the manager: it rejudges it from scratch .* A return counts for one judgment \(the manager is off: it will be rejudged when you turn it on\)/);
    assert.equal(seconde.code, 0);
    assert.match(seconde.sortie, /#30 is already returned to the manager/);
    assert.deepEqual(journal.duTicket(30).map((e) => [e.type, e.author]), [["manager.set-aside", "manager"], ["manager.handed-back", "chef"]]);
    assert.match((await commande()).sortie, /set aside\s*\n\s+\S+\s+#30\s+returned to the manager, not rejudged yet/);
  });

  test("rendre ne force aucun autre écart : la commande dit le geste qui le lève, et n'écrit rien", async (t) => {
    const { commande, noter, journal } = cuisine(t);
    noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 31);
    noter({ type: "manager.set-aside", payload: { reason: "untrusted-author", fired: false } }, 33);
    noter({ type: "manager.judged", payload: { run: "juge-34-a", fingerprint: "e1", verdict: "refused", kind: "incomplete", reason: "Aucun critère.", missing: null, model: null, effort: null, calibration: null } }, 34);
    const avant = journal.tout().length;

    const [retenue, inconnu, refusee, jamaisVue, illisible] = await Promise.all([commande("return", "31"), commande("return", "33"), commande("return", "34"), commande("return", "99"), commande("return", "trente")]);

    assert.equal(retenue.code, 1);
    assert.match(retenue.sortie, /#31 is not returned: it carries `blocked-on-human`\. What lifts this: remove `blocked-on-human`/);
    assert.equal(inconnu.code, 1);
    assert.match(inconnu.sortie, /#33 is not returned: its author has no write access to the repository\. Nothing returns it to the manager\./);
    assert.equal(refusee.code, 1);
    assert.match(refusee.sortie, /nothing to return: #34 is not set aside — refused \(an incomplete ticket\)/);
    assert.equal(jamaisVue.code, 1);
    assert.match(jamaisVue.sortie, /nothing to return: the manager has decided nothing on #99/);
    assert.equal(illisible.code, 2);
    assert.match(illisible.sortie, /usage: /);
    assert.equal(journal.tout().length, avant);
  });

  // Tout ce que `manager` dit passe le test de glossaire (#951) : une sortie, un refus, une erreur — sans mot français
  // de docs/glossary.md. Les raisons que le manager écrit lui-même sont des données : elles sont posées ici en anglais.
  test("aucune ligne de `manager on|off|return|backlog|upstream`, refus et erreurs compris, ne porte un mot français du glossaire", async (t) => {
    const { repertoire, commande, noter } = cuisine(t);
    const prevu = (title: string) => ({ title, context: "", criteria: ["A criterion."], waitsFor: [], zone: ["docs/"], model: "haiku", effort: "low", calibration: "Doc." });
    const reaction = { verdict: 9, returns: 2, proposal: null, run: "reagit-30-a", from: { model: "haiku", effort: "low" } };
    noter({ type: "manager.judged", payload: { run: "juge-30-a", fingerprint: "e1", verdict: "fire", kind: "ticket", reason: "One deliverable.", missing: null, model: "haiku", effort: "low", calibration: "Mechanical." } }, 30);
    noter({ type: "manager.labeled", payload: { labels: ["fire", "effort:low"] } }, 30);
    noter({ type: "manager.judged", payload: { run: "juge-31-a", fingerprint: "e2", verdict: "refused", kind: "epic", reason: "Three deliverables.", missing: null, model: null, effort: null, calibration: null } }, 31);
    noter({ type: "manager.failed", payload: { run: "juge-32-a", fingerprint: "e3", reason: "no JSON object in the answer" } }, 32);
    for (const [ticket, reason] of [[1, "roadmap"], [2, "blocked-on-human"], [3, "question"], [4, "decision"], [5, "epic"], [6, "hors-cuisine"], [7, "already-split"], [8, "untrusted-author"], [9, "chef-changed"]] as const) {
      noter({ type: "manager.set-aside", payload: { reason, fired: ticket === 9 } }, ticket);
    }
    noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } }, 10);
    noter({ type: "manager.handed-back", payload: {} }, 10, "chef");
    noter({ type: "manager.split", payload: { run: "decoupe-40-a", fingerprint: "e4", reason: "Two deliverables.", order: "The base first.", tickets: [prevu("The base"), prevu("The rest")] } }, 40);
    noter({ type: "manager.split-created", payload: { epic: 40, index: 1, reconciled: false } }, 501);
    noter({ type: "manager.split-fired", payload: { epic: 40, index: 1 } }, 501);
    noter({ type: "manager.split-asked", payload: { run: "decoupe-41-a", fingerprint: "e5", question: "Which screen?" } }, 41);
    noter({ type: "manager.split", payload: { run: "decoupe-42-a", fingerprint: "e6", reason: "One deliverable.", order: "", tickets: [] } }, 42);
    noter({ type: "manager.split-done", payload: {} }, 42);
    for (const [ticket, choice, to] of [[50, "raise", { model: "haiku", effort: "medium" }], [51, "split", null], [52, "escalate", null], [53, "retry", null]] as const) {
      noter({ type: "manager.reacted", payload: { ...reaction, choice, reason: "Because.", proposal: choice === "escalate" ? "Decide it." : null, to } }, ticket);
    }
    noter({ type: "manager.raised", payload: { added: ["effort:medium"], removed: ["effort:low"] } }, 50);

    const lignes = async (...args: string[]) => (await commande(...args)).sortie.trimEnd().split("\n");
    sansMotFrancais(await lignes());
    await commande("on");
    sansMotFrancais(await lignes());
    sansMotFrancais(await lignes("on"));
    // Rendre : réussi, déjà rendu, et chaque écart que la commande ne force pas.
    for (const ticket of ["9", "10", "1", "2", "6", "7", "8", "30", "31", "32", "99"]) sansMotFrancais(await lignes("return", ticket));
    sansMotFrancais(await lignes("off"));
    sansMotFrancais(await lignes("off"));
    // Les refus : un mot inconnu, un numéro qui n'en est pas un, un argument de trop.
    for (const args of [["start"], ["return", "ten"], ["return"], ["on", "now"]]) {
      const refus = await commande(...args);
      assert.equal(refus.code, 2, args.join(" "));
      sansMotFrancais(refus.sortie.trimEnd().split("\n"));
    }
    const sansVariable = appeler(manager, [], {});
    assert.equal(await sansVariable.fin, 2);
    sansMotFrancais(sansVariable.sortie().trimEnd().split("\n"));
    const sansJournal = appeler(manager, ["on"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
    assert.equal(await sansJournal.fin, 1);
    sansMotFrancais(sansJournal.sortie().trimEnd().split("\n"));

    // `backlog` et `upstream` : leurs lignes, et leurs erreurs de lecture de GitHub.
    const ouvertes = `repos/${DEPOT}/issues?state=open&per_page=100`;
    const gh = fauxGh(t);
    gh.repondre(ouvertes, { corps: Array.from({ length: 60 }, (_, rang) => issueGitHub(rang + 1, { labels: rang % 7 === 0 ? ["epic"] : rang % 5 === 0 ? ["blocked-on-human"] : [] })) });
    const lire = async (args: string[], env: Record<string, string>) => {
      const cli = appeler(manager, args, env);
      const code = await cli.fin;
      return { code, lignes: cli.sortie().trimEnd().split("\n") };
    };
    const backlog = await lire(["backlog"], { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
    assert.equal(backlog.code, 0);
    sansMotFrancais(backlog.lignes);
    const amont = await lire(["upstream"], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
    assert.equal(amont.code, 0);
    const lu = JSON.parse(amont.lignes.join("\n")) as { issues: { dit: string }[] };
    assert.ok(lu.issues.length > 10);
    sansMotFrancais(lu.issues.map(({ dit }) => dit));
    // Les clés ne changent pas.
    assert.deepEqual(Object.keys(lu), ["lu", "depot", "issues"]);
    assert.deepEqual(Object.keys(lu.issues[0] ?? {}), ["ticket", "titre", "url", "priorite", "etat", "dit"]);
    for (const [args, env] of [[["backlog"], { BRIGADE_GH_BIN: gh.bin }], [["backlog"], { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: fauxGh(t).bin }], [["upstream"], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: fauxGh(t).bin }], [["upstream"], { BRIGADE_STATE_DIR: repertoireTemporaire(t), BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin }]] as const) {
      const refus = await lire([...args], { ...env });
      assert.notEqual(refus.code, 0);
      // Le message de la doublure de `gh` (« connexion impossible ») est celui d'un outil de test, pas de `manager`.
      sansMotFrancais(refus.lignes.map((ligne) => ligne.replace("gh: connexion impossible", "gh: no connection")));
    }
  });

  test("sans épique regardée, la commande le dit", async (t) => {
    const { commande } = cuisine(t);
    assert.match((await commande()).sortie, /epics\s+none/);
  });

  test("une commande inconnue est refusée avec l'usage, sans rien écrire", async (t) => {
    const { commande, commandes } = cuisine(t);

    const { code, sortie } = await commande("start");

    assert.equal(code, 2);
    assert.match(sortie, /usage: .*\[on \| off \| return <issue number> \| backlog \| upstream\]/);
    assert.deepEqual(commandes(), []);
  });

  test("sans répertoire d'état, ou sans journal, la commande échoue et ne crée rien", async (t) => {
    const vide = repertoireTemporaire(t);
    const sansVariable = lancer(t, CLI, []);
    const sansJournal = appeler(manager, ["on"], { BRIGADE_STATE_DIR: vide });

    assert.equal(await sansVariable.fin, 2);
    assert.equal(await sansJournal.fin, 1);
    assert.match(sansJournal.sortie(), /no log in/);
    assert.equal(existsSync(join(vide, "log.db")), false);
  });

  // Ce qu'allumer engage : les issues ouvertes du dépôt, et celles que `blocked-on-human` retient.
  describe("backlog", () => {
    const OUVERTES = `repos/${DEPOT}/issues?state=open&per_page=100`;
    // Un backlog connu : cinq issues ouvertes, dont deux retenues — et une PR, que l'API rend parmi elles.
    const CONNU = [
      issueGitHub(10, { labels: [] }),
      issueGitHub(11, { labels: ["blocked-on-human"] }),
      issueGitHub(12, { labels: ["fire", "model:haiku", "effort:low"] }),
      issueGitHub(13, { labels: ["epic", "blocked-on-human"] }),
      issueGitHub(14, { labels: ["question"] }),
      issueGitHub(15, { labels: ["blocked-on-human"], pull_request: {} }),
    ];
    const lire = (gh: { bin: string }, env: Record<string, string> = {}) => {
      const cli = appeler(manager, ["backlog"], { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin, ...env });
      return cli.fin.then((code) => ({ code, sortie: cli.sortie() }));
    };

    test("les deux nombres sont ceux du dépôt : les issues ouvertes, PR écartées, et celles qui portent `blocked-on-human`", async (t) => {
      const gh = fauxGh(t);
      gh.repondre(OUVERTES, { corps: CONNU });

      const { code, sortie } = await lire(gh);

      assert.equal(code, 0);
      assert.equal(sortie, `backlog               5 open issues, of which 2 carry \`blocked-on-human\` — read just now on GitHub (${DEPOT})\n`);
    });

    test("elle ne fait que lire : un GET sur la liste que le manager sonde, rien au journal, et pas besoin de lui", async (t) => {
      const { repertoire, journal } = cuisine(t);
      const gh = fauxGh(t);
      gh.repondre(OUVERTES, { corps: CONNU });
      const avant = journal.tout();

      const avecJournal = await lire(gh, { BRIGADE_STATE_DIR: repertoire });
      const sansJournal = await lire(gh, { BRIGADE_STATE_DIR: repertoireTemporaire(t) });

      assert.equal(avecJournal.code, 0);
      assert.equal(sansJournal.sortie, avecJournal.sortie);
      assert.deepEqual(journal.tout(), avant);
      assert.deepEqual(gh.appels(), [["api", "-i", OUVERTES], ["api", "-i", OUVERTES]]);
    });

    test("un backlog de plus d'une page est compté en entier", async (t) => {
      const gh = fauxGh(t);
      const suite = `repositories/1/issues?state=open&per_page=100&page=2`;
      gh.repondre(OUVERTES, { corps: Array.from({ length: 100 }, (_, rang) => issueGitHub(100 + rang, { labels: rang < 3 ? ["blocked-on-human"] : [] })), suivant: suite });
      gh.repondre(suite, { corps: [issueGitHub(300, { labels: ["blocked-on-human"] }), issueGitHub(301, { labels: [] })] });

      const { sortie } = await lire(gh);

      assert.match(sortie, /^backlog\s+102 open issues, of which 4 carry `blocked-on-human`/);
    });

    test("une seule issue, aucune : les nombres restent en chiffres, en tête de leur mot", async (t) => {
      const [une, aucune] = [fauxGh(t), fauxGh(t)];
      une.repondre(OUVERTES, { corps: [issueGitHub(11, { labels: ["blocked-on-human"] })] });
      aucune.repondre(OUVERTES, { corps: [] });

      assert.match((await lire(une)).sortie, /^backlog\s+1 open issue, of which 1 carries `blocked-on-human`/);
      assert.match((await lire(aucune)).sortie, /^backlog\s+0 open issues, of which 0 carry `blocked-on-human`/);
    });

    test("GitHub pas joint : la commande échoue en le disant, sans aucun nombre — ce n'est pas « aucune issue »", async (t) => {
      // Rien n'est dicté : la doublure échoue comme un `gh` sans réseau.
      const { code, sortie } = await lire(fauxGh(t));

      assert.equal(code, 1);
      assert.match(sortie, new RegExp(`^brigade : the backlog of ${DEPOT} was not read: .*gh: connexion impossible.* — this is not “no issue”`));
      assert.doesNotMatch(sortie, /^backlog/m);
    });

    test("sans dépôt déclaré, ou avec un argument de trop, elle est refusée", async (t) => {
      const gh = fauxGh(t);
      gh.repondre(OUVERTES, { corps: CONNU });
      const sansDepot = appeler(manager, ["backlog"], { BRIGADE_GH_BIN: gh.bin });
      const deTrop = appeler(manager, ["backlog", "tout"], { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin, BRIGADE_STATE_DIR: repertoireTemporaire(t) });

      assert.equal(await sansDepot.fin, 2);
      assert.match(sansDepot.sortie(), /BRIGADE_GITHUB_REPO is not set/);
      assert.equal(await deTrop.fin, 2);
      assert.match(deTrop.sortie(), /usage: /);
      assert.deepEqual(gh.appels(), []);
    });

    test("lancée par son fichier, comme `npm run` la lance, elle rend la même ligne et sort en 0", async (t) => {
      const gh = fauxGh(t);
      gh.repondre(OUVERTES, { corps: CONNU });

      const cli = lancer(t, CLI, ["backlog"], { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });

      assert.equal(await cli.fin, 0);
      assert.match(cli.sortie(), /^backlog\s+5 open issues, of which 2 carry `blocked-on-human`/);
    });
  });
  // Ce qui n'est pas encore sur le rail : chaque issue ouverte qu'il ne porte pas, et ce qui lui arrive.
  describe("upstream", () => {
    const OUVERTES = `repos/${DEPOT}/issues?state=open&per_page=100`;
    const lire = async (repertoire: string, gh: { bin: string }) => {
      const cli = appeler(manager, ["upstream"], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
      return { code: await cli.fin, sortie: cli.sortie() };
    };
    const arrivee = (title: string) => ({ type: "ticket.arrived" as const, payload: { title, priority: null, createdAt: "2026-10-08T10:00:00Z", url: "u" } });

    test("chaque issue ouverte hors du rail porte ce qui lui arrive, dans l'ordre où le manager les lit — les PR et le rail n'y sont pas", async (t) => {
      const { repertoire, journal, noter } = cuisine(t);
      const prevu = (title: string) => ({ title, context: "", criteria: ["Un critère."], waitsFor: [], zone: ["docs/"], model: "haiku", effort: "low", calibration: "Doc." });
      // Sur le rail : il n'est pas en amont.
      noter(arrivee("Sur le rail"), 10, "github");
      // Sortie du rail : `fire` retiré, encore ouverte.
      noter(arrivee("Sortie"), 11, "github");
      noter({ type: "ticket.left", payload: { reason: "unfired" } }, 11, "github");
      // Le manager attend le chef : elle est aussi dans T'attend.
      noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 12);
      // Écartées : la roadmap, une issue refusée.
      noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 13);
      noter({ type: "manager.judged", payload: { run: "juge-14-a", fingerprint: "e1", verdict: "refused", kind: "incomplete", reason: "Aucun critère\nobservable.", missing: null, model: null, effort: null, calibration: null } }, 14);
      // Une épique jugée, pas encore découpée ; une autre qui porte `epic`, jamais lue.
      noter({ type: "manager.judged", payload: { run: "juge-15-a", fingerprint: "e2", verdict: "refused", kind: "epic", reason: "Trois livrables.", missing: null, model: null, effort: null, calibration: null } }, 15);
      // Une épique découpée : ses tickets portent le travail.
      noter({ type: "manager.split", payload: { run: "decoupe-17-a", fingerprint: "e3", reason: "Deux livrables.", order: "Le socle d'abord.", tickets: [prevu("Le socle")] } }, 17);
      noter({ type: "manager.split-created", payload: { epic: 17, index: 1, reconciled: false } }, 501);
      noter({ type: "manager.split-fired", payload: { epic: 17, index: 1 } }, 501);
      noter({ type: "manager.split-done", payload: {} }, 17);
      noter(arrivee("Le socle"), 501, "github");
      // Servie, puis sortie du rail sans que son issue soit fermée.
      noter(arrivee("Servie"), 19, "github");
      noter({ type: "ticket.served", payload: {} }, 19, "runtime");
      noter({ type: "ticket.left", payload: { reason: "unfired" } }, 19, "github");
      const gh = fauxGh(t);
      gh.repondre(OUVERTES, {
        corps: [
          issueGitHub(10, { labels: ["fire", "model:haiku", "effort:low"] }),
          issueGitHub(11, { labels: ["prio:2"] }),
          issueGitHub(12, { labels: ["question"] }),
          issueGitHub(13, { labels: [] }),
          issueGitHub(14, { labels: [] }),
          issueGitHub(15, { labels: [] }),
          issueGitHub(16, { labels: ["epic", "prio:1"] }),
          issueGitHub(17, { labels: ["epic"] }),
          issueGitHub(18, { labels: ["fire"] }),
          issueGitHub(19, { labels: [] }),
          issueGitHub(20, { labels: [] }),
          issueGitHub(21, { labels: ["fire"], pull_request: {} }),
        ],
      });
      const avant = journal.tout();

      const { code, sortie } = await lire(repertoire, gh);

      assert.equal(code, 0);
      assert.equal(sortie.split("\n").filter(Boolean).length, 1);
      const lu = JSON.parse(sortie);
      assert.equal(lu.depot, DEPOT);
      assert.ok(!Number.isNaN(Date.parse(lu.lu)));
      const ranges = lu.issues.map(({ ticket, etat, priorite }: { ticket: number; etat: string; priorite: number | null }) => [ticket, etat, priorite]);
      assert.deepEqual(ranges, [
        [16, "epique", 1],
        [11, "sortie", 2],
        [12, "attend", null],
        [13, "ecartee", null],
        [14, "ecartee", null],
        [15, "epique", null],
        [17, "decoupee", null],
        [18, "en-route", null],
        [19, "servie", null],
        [20, "non-lue", null],
      ]);
      const dit = (ticket: number) => lu.issues.find((issue: { ticket: number }) => issue.ticket === ticket);
      assert.deepEqual(dit(11), { ticket: 11, titre: "Ticket 11", url: `https://github.com/${DEPOT}/issues/11`, priorite: 2, etat: "sortie", dit: "left the rail: label `fire` removed" });
      assert.match(dit(12).dit, /^set aside by the manager, it carries `question`/);
      assert.equal(dit(13).dit, "it is the project's roadmap — nothing returns it to the manager");
      // En une ligne : la raison du manager garde ses mots, pas ses retours à la ligne.
      assert.equal(dit(14).dit, "refused (an incomplete ticket) — Aucun critère observable.");
      assert.equal(dit(15).dit, "not split yet — Trois livrables.");
      assert.equal(dit(16).dit, "it carries `epic`: not split yet");
      assert.equal(dit(17).dit, "split, 0/1 ticket served (#501)");
      assert.equal(dit(18).dit, "it carries `fire`: the rail takes it on its next poll");
      assert.equal(dit(20).dit, "the manager has not judged it yet");
      // Une lecture : rien au journal, un seul GET.
      assert.deepEqual(journal.tout(), avant);
      assert.deepEqual(gh.appels(), [["api", "-i", OUVERTES]]);
    });

    test("ce que le rail en a fait ne vaut que s'il est plus récent que ce que le manager en a décidé", async (t) => {
      const { repertoire, noter } = cuisine(t);
      // Sortie du rail, puis rendue et rejugée : c'est le jugement qui se lit.
      noter(arrivee("Rejugée"), 30, "github");
      noter({ type: "ticket.left", payload: { reason: "unfired" } }, 30, "github");
      noter({ type: "manager.judged", payload: { run: "juge-30-a", fingerprint: "e1", verdict: "refused", kind: "question", reason: "Rien à livrer.", missing: null, model: null, effort: null, calibration: null } }, 30);
      // Mise sur le rail par le manager, sans que `fire` y soit encore : elle est en route.
      noter({ type: "manager.judged", payload: { run: "juge-31-a", fingerprint: "e2", verdict: "fire", kind: "ticket", reason: "Un livrable.", missing: null, model: "haiku", effort: "low", calibration: "Court." } }, 31);
      // Rendue au manager : il ne l'a pas encore rejugée.
      noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } }, 32);
      noter({ type: "manager.handed-back", payload: {} }, 32, "chef");
      const gh = fauxGh(t);
      gh.repondre(OUVERTES, { corps: [issueGitHub(30, { labels: [] }), issueGitHub(31, { labels: [] }), issueGitHub(32, { labels: [] })] });

      const lu = JSON.parse((await lire(repertoire, gh)).sortie);

      assert.deepEqual(
        lu.issues.map(({ ticket, etat, dit }: { ticket: number; etat: string; dit: string }) => [ticket, etat, dit]),
        [
          [30, "ecartee", "refused (a question) — Rien à livrer."],
          [31, "en-route", "put on the rail by the manager, haiku / low — `fire` is not set on it yet"],
          [32, "non-lue", "returned to the manager, not rejudged yet"],
        ],
      );
    });

    test("GitHub pas joint : elle échoue en le disant, sans rien lister — ce n'est pas « rien en amont »", async (t) => {
      const { repertoire } = cuisine(t);

      const { code, sortie } = await lire(repertoire, fauxGh(t));

      assert.equal(code, 1);
      assert.match(sortie, new RegExp(`^brigade : what is upstream of the rail of ${DEPOT} was not read: .* — this is not “no issue”`));
    });

    test("sans journal, ou avec un argument de trop, elle est refusée sans rien demander à GitHub", async (t) => {
      const gh = fauxGh(t);
      gh.repondre(OUVERTES, { corps: [] });
      const sansJournal = appeler(manager, ["upstream"], { BRIGADE_STATE_DIR: repertoireTemporaire(t), BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
      const deTrop = appeler(manager, ["upstream", "tout"], { BRIGADE_STATE_DIR: repertoireTemporaire(t), BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });

      assert.equal(await sansJournal.fin, 1);
      assert.match(sansJournal.sortie(), /no log in/);
      assert.equal(await deTrop.fin, 2);
      assert.match(deTrop.sortie(), /usage: .*\| upstream\]/);
      assert.deepEqual(gh.appels(), []);
    });
  });
});
