// La commande par laquelle le chef voit le manager et le tient :
// `npm run manager -- [allumer | eteindre]`, depuis son propre process.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { etatDuManager } from "../src/projections/manager.ts";
import { demarrer } from "../src/runtime.ts";
import { horloge, lancer, repertoireTemporaire } from "./outils.ts";

const CLI = join(import.meta.dirname, "../src/manager-cli.ts");

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, maintenant: horloge() });
  t.after(() => runtime.arreter("test"));
  const { journal } = runtime;
  const noter = (fait: Fait, ticket: number | null, author = "manager") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const commande = async (...args: string[]) => {
    const enfant = lancer(t, CLI, args, { BRIGADE_STATE_DIR: repertoire });
    return { code: await enfant.fin, sortie: enfant.sortie() };
  };
  const commandes = () => journal.tout().filter((e) => e.type === "manager.enabled" || e.type === "manager.disabled");
  return { repertoire, journal, noter, commande, commandes };
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
    const { commande, commandes, journal } = cuisine(t);

    const premiere = await commande("allumer");
    const seconde = await commande("allumer");

    assert.equal(premiere.code, 0);
    assert.match(premiere.sortie, /manager allumé : il juge les issues ouvertes/);
    assert.match(seconde.sortie, /déjà allumé depuis le/);
    assert.deepEqual(commandes().map((e) => [e.type, e.author]), [["manager.enabled", "chef"]]);
    assert.equal(etatDuManager(journal.base)?.active, true);
    assert.match((await commande()).sortie, /manager\s+ALLUMÉ depuis le 2026-10-08T\S+ \(par chef\)/);
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

    const lignes = sortie.split("\n").filter((ligne) => /^\s+\d{4}-/.test(ligne));
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

    const { sortie } = await commande();

    assert.match(sortie, /#30\s+après 2 renvois, calibrage monté de haiku \/ low à haiku \/ medium — Le cook cale\./);
    assert.match(sortie, /#31\s+après 2 renvois, redécoupé — Deux livrables\./);
    assert.match(sortie, /#32\s+après 2 renvois, remonté au chef — Le critère 2 se contredit\. Proposé : Le trancher\./);
    assert.match(sortie, /#33\s+second renvoi au même calibrage \(haiku \/ low\) — aucun plafond/);
  });

  test("sans épique regardée, la commande le dit", async (t) => {
    const { commande } = cuisine(t);
    assert.match((await commande()).sortie, /épiques\s+aucune/);
  });

  test("une commande inconnue est refusée avec l'usage, sans rien écrire", async (t) => {
    const { commande, commandes } = cuisine(t);

    const { code, sortie } = await commande("demarrer");

    assert.equal(code, 2);
    assert.match(sortie, /usage : .*\[allumer \| eteindre\]/);
    assert.deepEqual(commandes(), []);
  });

  test("sans répertoire d'état, ou sans journal, la commande échoue et ne crée rien", async (t) => {
    const vide = repertoireTemporaire(t);
    const sansVariable = lancer(t, CLI, []);
    const sansJournal = lancer(t, CLI, ["allumer"], { BRIGADE_STATE_DIR: vide });

    assert.equal(await sansVariable.fin, 2);
    assert.equal(await sansJournal.fin, 1);
    assert.match(sansJournal.sortie(), /aucun journal/);
    assert.equal(existsSync(join(vide, "log.db")), false);
  });
});
