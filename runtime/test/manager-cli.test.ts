// La commande par laquelle le chef voit le manager et le tient :
// `npm run manager -- [allumer | eteindre | rendre <n°>]`. Elle se joue dans le
// process du test ; depuis le sien, là où c'est lui qu'on regarde — allumer
// pendant que le runtime tourne, un refus rendu par son code.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { principal as manager } from "../src/manager-cli.ts";
import { etatDuManager } from "../src/projections/manager.ts";
import { demarrer } from "../src/runtime.ts";
import { appeler, horloge, lancer, repertoireTemporaire } from "./outils.ts";

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
    assert.match(sortie, /manager\s+ÉTEINT — jamais allumé : aucune issue n'est jugée, `fire` et le calibrage se posent à la main/);
    assert.match(sortie, /dernières décisions\s+aucune/);
    assert.deepEqual(journal.tout(), avant);
  });

  test("allumer s'écrit au journal, une seule fois, au nom du chef", async (t) => {
    const { lancee, commandes, journal } = cuisine(t);

    const premiere = await lancee("allumer");
    const seconde = await lancee("allumer");

    assert.equal(premiere.code, 0);
    assert.match(premiere.sortie, /manager allumé : il juge les issues ouvertes/);
    assert.match(seconde.sortie, /déjà allumé depuis le/);
    assert.deepEqual(commandes().map((e) => [e.type, e.author]), [["manager.enabled", "chef"]]);
    assert.equal(etatDuManager(journal.base)?.active, true);
    assert.match((await lancee()).sortie, /manager\s+ALLUMÉ depuis le \d{4}-\d{2}-\d{2}T\S+ \(par chef\)/);
  });

  test("éteindre arrête les jugements à venir, et ne défait rien de ce qui est posé", async (t) => {
    const { commande, commandes } = cuisine(t);
    assert.match((await commande("eteindre")).sortie, /rien à éteindre/);
    await commande("allumer");

    const { code, sortie } = await commande("eteindre");

    assert.equal(code, 0);
    assert.match(sortie, /manager éteint : plus aucune issue n'est jugée — ce qu'il a posé reste posé/);
    assert.deepEqual(commandes().map((e) => e.type), ["manager.enabled", "manager.disabled"]);
    assert.match((await commande()).sortie, /manager\s+ÉTEINT depuis le/);
  });

  test("le chef lit les dernières décisions, chacune avec son motif", async (t) => {
    const { commande, noter } = cuisine(t);
    noter({ type: "manager.judged", payload: { run: "juge-30-a", fingerprint: "e1", verdict: "fire", kind: "ticket", reason: "Un livrable, un test.", missing: null, model: "haiku", effort: "low", calibration: "Mécanique." } }, 30);
    noter({ type: "manager.labeled", payload: { labels: ["fire", "effort:low"] } }, 30);
    noter({ type: "manager.judged", payload: { run: "juge-31-a", fingerprint: "e2", verdict: "refused", kind: "epic", reason: "Trois livrables.", missing: "La découper.", model: null, effort: null, calibration: null } }, 31);
    noter({ type: "manager.failed", payload: { run: "juge-32-a", fingerprint: "e3", reason: "aucun objet JSON dans la réponse" } }, 32);
    noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 1);

    const { sortie } = await commande();

    const lignes = sortie.slice(0, sortie.indexOf("écartées")).split("\n").filter((ligne) => /^\s+\d{4}-/.test(ligne));
    assert.equal(lignes.length, 4);
    assert.match(lignes[0] ?? "", /#1\s+écartée \(roadmap\)/);
    assert.match(lignes[1] ?? "", /#32\s+jugement illisible — aucun objet JSON dans la réponse/);
    assert.match(lignes[2] ?? "", /#31\s+refusée \(une épique\) — Trois livrables\./);
    assert.match(lignes[3] ?? "", /#30\s+sur le rail, haiku \/ low \(posé : fire, effort:low\) — Un livrable, un test\./);
  });

  test("le chef lit où en est chaque épique : découpée et servie, en cours, ou en attente de sa réponse", async (t) => {
    const { commande, noter } = cuisine(t);
    const prevu = (title: string) => ({ title, context: "", criteria: ["Un critère."], waitsFor: [], zone: ["docs/"], model: "haiku", effort: "low", calibration: "Doc." });
    noter({ type: "manager.split", payload: { run: "decoupe-30-a", fingerprint: "e1", reason: "Deux livrables.", order: "Le socle d'abord.", tickets: [prevu("Le socle"), prevu("La suite")] } }, 30);
    noter({ type: "manager.split-created", payload: { epic: 30, index: 1, reconciled: false } }, 501);
    noter({ type: "manager.split-fired", payload: { epic: 30, index: 1 } }, 501);
    noter({ type: "manager.split-asked", payload: { run: "decoupe-31-a", fingerprint: "e2", question: "Quel écran ?" } }, 31);

    const encours = (await commande()).sortie;
    assert.match(encours, /#31\s+QUESTION POSÉE, attend ta réponse sur l'épique — Quel écran \?/);
    assert.match(encours, /#30\s+découpage en cours, 1\/2 tickets créés et lancés — Deux livrables\./);

    noter({ type: "manager.split-created", payload: { epic: 30, index: 2, reconciled: false } }, 502);
    noter({ type: "manager.split-fired", payload: { epic: 30, index: 2 } }, 502);
    noter({ type: "manager.split-done", payload: {} }, 30);
    noter({ type: "ticket.arrived", payload: { title: "Le socle", priority: null, createdAt: "2026-10-08T10:00:00Z", url: "u" } }, 501, "github");
    noter({ type: "ticket.served", payload: {} }, 501, "runtime");

    assert.match((await commande()).sortie, /#30\s+découpée, 1\/2 servi \(#501, #502\) — Deux livrables\./);
  });

  test("le chef lit les réactions du manager aux tickets restés rouges : le choix, et son motif", async (t) => {
    const { commande, noter } = cuisine(t);
    assert.match((await commande()).sortie, /réactions\s+aucune/);
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

    assert.match(sortie, /#30\s+après 2 renvois, calibrage monté de haiku \/ low à haiku \/ medium — Le cook cale\./);
    assert.match(sortie, /#34\s+après 2 renvois, montée de haiku \/ low à haiku \/ medium abandonnée : recalibré par le chef entre-temps/);
    assert.match(sortie, /#31\s+après 2 renvois, redécoupé — Deux livrables\./);
    assert.match(sortie, /#32\s+après 2 renvois, remonté au chef — Le critère 2 se contredit\. Proposé : Le trancher\./);
    assert.match(sortie, /#33\s+second renvoi au même calibrage \(haiku \/ low\) — aucun plafond/);
  });

  test("le chef lit ce que le manager a écarté, pourquoi, et le geste qui lève chaque écart", async (t) => {
    const { commande, noter } = cuisine(t);
    assert.match((await commande()).sortie, /écartées\s+aucune/);
    noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 1);
    noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 31);
    noter({ type: "manager.set-aside", payload: { reason: "already-split", fired: false } }, 32);
    noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } }, 30);

    const { sortie } = await commande();

    const ecartees = sortie.slice(sortie.indexOf("écartées"), sortie.indexOf("épiques"));
    assert.match(ecartees, /#30\s+tu y as retiré `fire` ou un calibrage que le manager avait posé — pour la lui rendre : `npm --prefix runtime run manager -- rendre 30` : il la rejuge à neuf/);
    assert.match(ecartees, /#32\s+son corps liste déjà les tickets d'une épique, découpée à la main — pour la lui rendre : retire cette liste de son corps/);
    assert.match(ecartees, /#31\s+elle porte `blocked-on-human` — pour la lui rendre : retire `blocked-on-human` : elle est jugée au réveil suivant/);
    assert.match(ecartees, /#1\s+c'est la roadmap du projet — rien ne la rend au manager/);
  });

  test("rendre s'écrit au journal au nom du chef, une fois, pour une issue écartée `chef-changed` — et le relevé la montre rendue", async (t) => {
    const { commande, noter, journal } = cuisine(t);
    noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } }, 30);

    const premiere = await commande("rendre", "30");
    const seconde = await commande("rendre", "30");

    assert.equal(premiere.code, 0);
    assert.match(premiere.sortie, /#30 rendue au manager : il la rejuge à neuf .* Une remise vaut pour un jugement \(le manager est éteint : elle sera rejugée quand tu l'allumeras\)/);
    assert.equal(seconde.code, 0);
    assert.match(seconde.sortie, /#30 est déjà rendue au manager/);
    assert.deepEqual(journal.duTicket(30).map((e) => [e.type, e.author]), [["manager.set-aside", "manager"], ["manager.handed-back", "chef"]]);
    assert.match((await commande()).sortie, /écartées\s*\n\s+\S+\s+#30\s+rendue au manager, pas encore rejugée/);
  });

  test("rendre ne force aucun autre écart : la commande dit le geste qui le lève, et n'écrit rien", async (t) => {
    const { commande, noter, journal } = cuisine(t);
    noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 31);
    noter({ type: "manager.set-aside", payload: { reason: "untrusted-author", fired: false } }, 33);
    noter({ type: "manager.judged", payload: { run: "juge-34-a", fingerprint: "e1", verdict: "refused", kind: "incomplete", reason: "Aucun critère.", missing: null, model: null, effort: null, calibration: null } }, 34);
    const avant = journal.tout().length;

    const [retenue, inconnu, refusee, jamaisVue, illisible] = await Promise.all([commande("rendre", "31"), commande("rendre", "33"), commande("rendre", "34"), commande("rendre", "99"), commande("rendre", "trente")]);

    assert.equal(retenue.code, 1);
    assert.match(retenue.sortie, /#31 n'est pas rendue : elle porte `blocked-on-human`\. Ce qui lève cet écart : retire `blocked-on-human`/);
    assert.equal(inconnu.code, 1);
    assert.match(inconnu.sortie, /#33 n'est pas rendue : son auteur n'a pas la main sur le dépôt\. Rien ne la rend au manager\./);
    assert.equal(refusee.code, 1);
    assert.match(refusee.sortie, /rien à rendre : #34 n'est pas écartée — refusée \(un ticket incomplet\)/);
    assert.equal(jamaisVue.code, 1);
    assert.match(jamaisVue.sortie, /rien à rendre : le manager n'a rien décidé sur #99/);
    assert.equal(illisible.code, 2);
    assert.match(illisible.sortie, /usage : /);
    assert.equal(journal.tout().length, avant);
  });

  test("sans épique regardée, la commande le dit", async (t) => {
    const { commande } = cuisine(t);
    assert.match((await commande()).sortie, /épiques\s+aucune/);
  });

  test("une commande inconnue est refusée avec l'usage, sans rien écrire", async (t) => {
    const { commande, commandes } = cuisine(t);

    const { code, sortie } = await commande("demarrer");

    assert.equal(code, 2);
    assert.match(sortie, /usage : .*\[allumer \| eteindre \| rendre <n° d'issue>\]/);
    assert.deepEqual(commandes(), []);
  });

  test("sans répertoire d'état, ou sans journal, la commande échoue et ne crée rien", async (t) => {
    const vide = repertoireTemporaire(t);
    const sansVariable = lancer(t, CLI, []);
    const sansJournal = appeler(manager, ["allumer"], { BRIGADE_STATE_DIR: vide });

    assert.equal(await sansVariable.fin, 2);
    assert.equal(await sansJournal.fin, 1);
    assert.match(sansJournal.sortie(), /aucun journal/);
    assert.equal(existsSync(join(vide, "log.db")), false);
  });
});
