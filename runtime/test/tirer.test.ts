// Le geste d'une station distante (`run tirer`), tel que son runner le lance
// sur la box : il écrit la demande au journal, lit la réponse du runtime, la
// rend en JSON — et dit par son code de sortie si elle est servie, refusée,
// mal écrite, ou restée sans réponse.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Reponse } from "../src/evenements/distante.ts";
import { MARQUEUR } from "../src/fiche.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { MAL_ECRIT, principal, REFUSEE, SANS_REPONSE, SERVIE } from "../src/tirer-cli.ts";
import { demander, SansReponse } from "../src/tirer.ts";
import { cuisine, issue, pousserSurLOrigine } from "./aides/cuisine.ts";
import { jusqua, repertoireTemporaire } from "./outils.ts";

const MAC = "mac/claude";
const DECLAREES = lireStations({ BRIGADE_STATIONS: `${MAC}:1:chrome-connecté:distante` });

// Joue le geste dans ce process : ses arguments, son entrée, ce qu'il dit.
async function geste(repertoire: string, maintenant: () => Date, args: string[], entree = "") {
  const [sortie, erreur]: [string[], string[]] = [[], []];
  let code = SERVIE;
  try {
    await principal({ args, env: { BRIGADE_STATE_DIR: repertoire }, dire: (ligne) => void sortie.push(ligne), redire: (ligne) => void erreur.push(ligne) }, async () => entree, { maintenant, pasMs: 2 });
  } catch (levee) {
    code = (levee as { code: number }).code;
  }
  return { code, erreur: erreur.join("\n"), reponse: sortie.length === 0 ? null : (JSON.parse(sortie.join("")) as Reponse) };
}

function service(t: TestContext) {
  const lieu = cuisine(t, { stations: DECLAREES, scenario: "muet" });
  lieu.gh.ficher(16, "2026-10-08T09:00:00Z", [MARQUEUR, "- requiert : chrome-connecté"].join("\n"));
  lieu.gh.poser(issue(16));
  return { ...lieu, lancer: (args: string[], entree?: string) => geste(lieu.repertoire, lieu.heure.maintenant, args, entree) };
}

describe("le geste d'une station distante", { concurrency: 8 }, () => {
  test("annoncer, réclamer, renouveler, rendre : chaque demande rend la réponse du runtime en JSON, et le code dit si elle est servie", async (t) => {
    const { repertoire, etat, lancer, dernier, journal } = service(t);
    await jusqua(() => etat(16) === "86");

    const annonce = await lancer([MAC, "annoncer"]);
    assert.deepEqual([annonce.code, annonce.reponse?.ok, annonce.reponse?.verb], [SERVIE, true, "announce"]);
    await jusqua(() => etat(16) === "waiting");

    const prise = await lancer([MAC, "reclamer"]);
    assert.equal(prise.code, SERVIE);
    assert.ok(prise.reponse?.ok && prise.reponse.verb === "claim" && prise.reponse.mission !== null);
    const { run, branch, ticket } = prise.reponse.mission;
    assert.equal(ticket, 16);

    // Sans preuve : la demande part, le runtime la refuse — et le refus est au journal.
    const sansPreuve = await lancer([MAC, "renouveler", run, "--tours", "1", "--jetons", "10"]);
    assert.deepEqual([sansPreuve.code, sansPreuve.reponse?.ok, !sansPreuve.reponse?.ok && sansPreuve.reponse?.refusal], [REFUSEE, false, "no-progress"]);
    assert.match(sansPreuve.erreur, /^brigade : renouvellement sans preuve : le bail ne se renouvelle que sur un progrès observable/);
    assert.equal(journal.tout().filter((e) => e.type === "ticket.renewed").length, 0);

    const renouvele = await lancer([MAC, "renouveler", run, "--preuve", "empreinte-1", "--tours", "2", "--jetons", "20"]);
    assert.deepEqual([renouvele.code, renouvele.reponse?.ok], [SERVIE, true]);
    assert.equal(journal.tout().filter((e) => e.type === "ticket.renewed").length, 1);

    // Le dernier message du cook arrive par l'entrée standard du geste.
    pousserSurLOrigine(repertoire, branch);
    const rendu = await lancer([MAC, "rendre", run, "--fin", "livre", "--tours", "3", "--jetons", "30"], "Fini.\n<livrable>\nC'est livré.\n</livrable>\n");
    assert.deepEqual([rendu.code, rendu.reponse], [SERVIE, { ok: true, verb: "deliver", ending: "done", reason: null }]);
    await jusqua(() => etat(16) === "pass");
    assert.deepEqual([dernier("cook.reported", 16)?.deliverable, dernier("cook.exited", 16)?.turns], ["C'est livré.", 3]);
  });

  test("un échec se rend avec son motif, et le ticket revient", async (t) => {
    const { etat, lancer, dernier, journal } = service(t);
    await jusqua(() => etat(16) === "86");
    await lancer([MAC, "annoncer"]);
    await jusqua(() => etat(16) === "waiting");
    const prise = await lancer([MAC, "reclamer"]);
    assert.ok(prise.reponse?.ok && prise.reponse.verb === "claim" && prise.reponse.mission !== null);

    const rendu = await lancer([MAC, "rendre", prise.reponse.mission.run, "--fin", "echec", "--raison", "setup-failed", "--tours", "0", "--jetons", "0"]);
    assert.deepEqual([rendu.code, rendu.reponse], [SERVIE, { ok: true, verb: "deliver", ending: "failed", reason: "setup-failed" }]);
    await jusqua(() => journal.tout().some((e) => e.type === "cook.reported"));
    assert.deepEqual([dernier("cook.exited", 16)?.outcome, dernier("cook.reported", 16)?.reason], ["failed", "setup-failed"]);
    await jusqua(() => etat(16) === "waiting");
  });

  test("un geste mal écrit ne demande rien à la box : code 2, et rien au journal", async (t) => {
    const { lancer, journal } = service(t);
    const avant = () => journal.tout().filter((e) => e.type === "remote.asked").length;
    for (const args of [
      [],
      [MAC],
      [MAC, "voler"],
      [MAC, "annoncer", "de-trop"],
      [MAC, "renouveler", "--preuve", "e1", "--tours", "1", "--jetons", "1"],
      [MAC, "renouveler", "16-abc", "--preuve", "e1", "--jetons", "1"],
      [MAC, "renouveler", "16-abc", "--preuve", "e1", "--tours", "beaucoup", "--jetons", "1"],
      [MAC, "renouveler", "16-abc", "--preuve", "e1", "--tours", "1", "--jetons", "1", "--fin", "livre"],
      [MAC, "rendre", "16-abc", "--tours", "1", "--jetons", "1"],
      [MAC, "rendre", "16-abc", "--fin", "bien", "--tours", "1", "--jetons", "1"],
      [MAC, "rendre", "16-abc", "--fin", "livre", "--fin", "echec", "--tours", "1", "--jetons", "1"],
    ]) {
      const rendu = await lancer(args);
      assert.deepEqual([rendu.code, rendu.reponse], [MAL_ECRIT, null], args.join(" "));
    }
    assert.equal(avant(), 0);
  });

  test("une station que le projet ne déclare pas distante est refusée par le runtime, et le geste le dit", async (t) => {
    const { lancer } = service(t);
    const inconnue = await lancer(["mac/chrome", "reclamer"]);
    assert.deepEqual([inconnue.code, !inconnue.reponse?.ok && inconnue.reponse?.refusal], [REFUSEE, "unknown-station"]);
    assert.match(inconnue.erreur, /le projet ne déclare aucune station mac\/chrome/);
    // Ce qui n'a pas la forme d'un nom de station ne part même pas.
    const informe = await lancer(["reviewer", "reclamer"]);
    assert.deepEqual([informe.code, informe.reponse], [SANS_REPONSE, null]);
  });

  test("sans runtime qui tourne, la demande n'est pas écrite : personne n'y répondrait — code 3", async (t) => {
    const { repertoire, heure, runtime, journal } = service(t);
    runtime.arreter("test");
    const rendu = await geste(repertoire, heure.maintenant, [MAC, "reclamer"]);
    assert.deepEqual([rendu.code, rendu.reponse], [SANS_REPONSE, null]);
    assert.match(rendu.erreur, /aucun runtime ne tourne pour ce projet/);
    const relu = ouvrirJournal(repertoire, { lectureSeule: true });
    t.after(() => relu.fermer());
    assert.equal(relu.tout().filter((e) => e.type === "remote.asked").length, 0);
    // Et sans journal du tout, il n'en crée pas.
    const vide = repertoireTemporaire(t);
    assert.equal((await geste(vide, heure.maintenant, [MAC, "reclamer"])).code, SANS_REPONSE);
    assert.throws(() => ouvrirJournal(vide, { lectureSeule: true }), /aucun journal/);
  });

  test("un runtime qui ne répond pas à temps : le geste rend la main, sans rien supposer de ce que la box a fait", async (t) => {
    const repertoire = repertoireTemporaire(t);
    // Un journal dont la session est ouverte, et personne pour lire les demandes.
    const journal = ouvrirJournal(repertoire);
    t.after(() => journal.fermer());
    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
    await assert.rejects(demander(repertoire, MAC, { verb: "claim" }, { attenteMs: 30, pasMs: 2 }), (erreur) => erreur instanceof SansReponse && /n'a pas répondu à temps/.test(erreur.message));
    // La demande, elle, est au journal : c'est ce que le runtime trouvera — trop tard.
    assert.equal(journal.tout().filter((e) => e.type === "remote.asked").length, 1);
  });
});
