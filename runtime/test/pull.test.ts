// Le geste d'une station distante (`run tirer`), tel que son runner le lance
// sur la box : il écrit la demande au journal, lit la réponse du runtime, la
// rend en JSON — et dit par son code de sortie si elle est servie, refusée,
// mal écrite, ou restée sans réponse.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Reponse } from "../src/events/remote.ts";
import { MARQUEUR } from "../src/card.ts";
import { openLog } from "../src/log.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { MAL_ECRIT, principal, REFUSEE, SANS_REPONSE, SERVED } from "../src/pull-cli.ts";
import { demander, SansReponse } from "../src/pull.ts";
import { kitchen, issue, pousserSurLOrigine } from "./aides/kitchen.ts";
import { jusqua, repertoireTemporaire } from "./outils.ts";

const MAC = "mac/claude";
const DECLAREES = lireStations({ BRIGADE_STATIONS: `${MAC}:1:chrome-connecté:distante` });

// Joue le geste dans ce process : ses arguments, son entrée, ce qu'il dit.
async function geste(repertoire: string, maintenant: () => Date, args: string[], entree = "") {
  const [sortie, erreur]: [string[], string[]] = [[], []];
  let code = SERVED;
  try {
    await principal({ args, env: { BRIGADE_STATE_DIR: repertoire }, dire: (ligne) => void sortie.push(ligne), redire: (ligne) => void erreur.push(ligne) }, async () => entree, { maintenant, pasMs: 2 });
  } catch (levee) {
    code = (levee as { code: number }).code;
  }
  return { code, erreur: erreur.join("\n"), reponse: sortie.length === 0 ? null : (JSON.parse(sortie.join("")) as Reponse) };
}

function service(t: TestContext) {
  const lieu = kitchen(t, { stations: DECLAREES, scenario: "muet" });
  lieu.gh.ficher(16, "2026-10-08T09:00:00Z", [MARQUEUR, "- requiert : chrome-connecté"].join("\n"));
  lieu.gh.poser(issue(16));
  return { ...lieu, lancer: (args: string[], entree?: string) => geste(lieu.repertoire, lieu.heure.maintenant, args, entree) };
}

describe("le geste d'une station distante", { concurrency: 8 }, () => {
  test("annoncer, réclamer, renouveler, rendre : chaque demande rend la réponse du runtime en JSON, et le code dit si elle est servie", async (t) => {
    const { repertoire, etat, lancer, dernier, journal: log } = service(t);
    await jusqua(() => etat(16) === "86");

    const annonce = await lancer([MAC, "announce"]);
    assert.deepEqual([annonce.code, annonce.reponse?.ok, annonce.reponse?.verb], [SERVED, true, "announce"]);
    await jusqua(() => etat(16) === "waiting");

    const prise = await lancer([MAC, "claim"]);
    assert.equal(prise.code, SERVED);
    assert.ok(prise.reponse?.ok && prise.reponse.verb === "claim" && prise.reponse.mission !== null);
    const { run, branch, ticket } = prise.reponse.mission;
    assert.equal(ticket, 16);

    // Sans preuve : la demande part, le runtime la refuse — et le refus est au journal.
    const withoutProof = await lancer([MAC, "renew", run, "--turns", "1", "--tokens", "10"]);
    assert.deepEqual([withoutProof.code, withoutProof.reponse?.ok, !withoutProof.reponse?.ok && withoutProof.reponse?.refusal], [REFUSEE, false, "no-progress"]);
    assert.match(withoutProof.erreur, /^brigade : renewal without proof: the lease is renewed only on observable progress/);
    assert.equal(log.tout().filter((e) => e.type === "ticket.renewed").length, 0);

    const renouvele = await lancer([MAC, "renew", run, "--proof", "empreinte-1", "--turns", "2", "--tokens", "20"]);
    assert.deepEqual([renouvele.code, renouvele.reponse?.ok], [SERVED, true]);
    assert.equal(log.tout().filter((e) => e.type === "ticket.renewed").length, 1);

    // Le dernier message du cook arrive par l'entrée standard du geste.
    pousserSurLOrigine(repertoire, branch);
    const rendu = await lancer([MAC, "return", run, "--end", "livre", "--turns", "3", "--tokens", "30"], "Fini.\n<livrable>\nC'est livré.\n</livrable>\n");
    assert.deepEqual([rendu.code, rendu.reponse], [SERVED, { ok: true, verb: "deliver", ending: "done", reason: null }]);
    await jusqua(() => etat(16) === "pass");
    assert.deepEqual([dernier("cook.reported", 16)?.deliverable, dernier("cook.exited", 16)?.turns], ["C'est livré.", 3]);
  });

  test("annoncer et réclamer portent, avec `--sandbox`, ce que la sonde du poste dit de son bac à sable : la demande le passe tel quel à la box", async (t) => {
    const { etat, lancer, journal: log } = service(t);
    await jusqua(() => etat(16) === "86");
    const dit = { available: false, reason: "Seatbelt est introuvable" };
    const annonce = await lancer([MAC, "announce", "--sandbox", JSON.stringify(dit)]);
    assert.deepEqual([annonce.code, annonce.reponse?.ok], [SERVED, true]);
    const prise = await lancer([MAC, "claim", "--sandbox", JSON.stringify(dit)]);
    assert.equal(prise.code, SERVED);
    const demandes = log.tout().flatMap((e) => (e.type === "remote.asked" ? [e.payload] : []));
    assert.deepEqual(
      demandes.map((demande) => [demande.verb, "sandbox" in demande ? demande.sandbox : undefined]),
      [
        ["announce", dit],
        ["claim", dit],
      ],
    );
  });

  test("un échec se rend avec son motif, et le ticket revient", async (t) => {
    const { etat, lancer, dernier, journal: log } = service(t);
    await jusqua(() => etat(16) === "86");
    await lancer([MAC, "announce"]);
    await jusqua(() => etat(16) === "waiting");
    const prise = await lancer([MAC, "claim"]);
    assert.ok(prise.reponse?.ok && prise.reponse.verb === "claim" && prise.reponse.mission !== null);

    const rendu = await lancer([MAC, "return", prise.reponse.mission.run, "--end", "echec", "--reason", "setup-failed", "--turns", "0", "--tokens", "0"]);
    assert.deepEqual([rendu.code, rendu.reponse], [SERVED, { ok: true, verb: "deliver", ending: "failed", reason: "setup-failed" }]);
    await jusqua(() => log.tout().some((e) => e.type === "cook.reported"));
    assert.deepEqual([dernier("cook.exited", 16)?.outcome, dernier("cook.reported", 16)?.reason], ["failed", "setup-failed"]);
    await jusqua(() => etat(16) === "waiting");
  });

  test("un geste mal écrit ne demande rien à la box : code 2, et rien au journal", async (t) => {
    const { lancer, journal: log } = service(t);
    const avant = () => log.tout().filter((e) => e.type === "remote.asked").length;
    for (const args of [
      [],
      [MAC],
      [MAC, "voler"],
      [MAC, "announce", "de-trop"],
      [MAC, "renew", "--proof", "e1", "--turns", "1", "--tokens", "1"],
      [MAC, "renew", "16-abc", "--proof", "e1", "--tokens", "1"],
      [MAC, "renew", "16-abc", "--proof", "e1", "--turns", "beaucoup", "--tokens", "1"],
      [MAC, "renew", "16-abc", "--proof", "e1", "--turns", "1", "--tokens", "1", "--end", "livre"],
      [MAC, "return", "16-abc", "--turns", "1", "--tokens", "1"],
      [MAC, "return", "16-abc", "--end", "bien", "--turns", "1", "--tokens", "1"],
      [MAC, "return", "16-abc", "--end", "livre", "--end", "echec", "--turns", "1", "--tokens", "1"],
      [MAC, "claim", "--sandbox"],
      [MAC, "claim", "--sandbox", "pas du json"],
      [MAC, "claim", "--sandbox", "[1]"],
      [MAC, "claim", "--sandbox", "null"],
      [MAC, "announce", "--sandbox", "{}", "de-trop"],
      [MAC, "claim", "--proof", "e1"],
      [MAC, "renew", "16-abc", "--proof", "e1", "--turns", "1", "--tokens", "1", "--sandbox", "{}"],
    ]) {
      const rendu = await lancer(args);
      assert.deepEqual([rendu.code, rendu.reponse], [MAL_ECRIT, null], args.join(" "));
    }
    assert.equal(avant(), 0);
  });

  test("une station que le projet ne déclare pas distante est refusée par le runtime, et le geste le dit", async (t) => {
    const { lancer } = service(t);
    const inconnue = await lancer(["mac/chrome", "claim"]);
    assert.deepEqual([inconnue.code, !inconnue.reponse?.ok && inconnue.reponse?.refusal], [REFUSEE, "unknown-station"]);
    assert.match(inconnue.erreur, /the project declares no station mac\/chrome/);
    // Ce qui n'a pas la forme d'un nom de station ne part même pas.
    const informe = await lancer(["reviewer", "claim"]);
    assert.deepEqual([informe.code, informe.reponse], [SANS_REPONSE, null]);
  });

  test("sans runtime qui tourne, la demande n'est pas écrite : personne n'y répondrait — code 3", async (t) => {
    const { repertoire, heure, runtime, journal: log } = service(t);
    runtime.arreter("test");
    const rendu = await geste(repertoire, heure.maintenant, [MAC, "claim"]);
    assert.deepEqual([rendu.code, rendu.reponse], [SANS_REPONSE, null]);
    assert.match(rendu.erreur, /no runtime is running for this project/);
    const relu = openLog(repertoire, { lectureSeule: true });
    t.after(() => relu.fermer());
    assert.equal(relu.tout().filter((e) => e.type === "remote.asked").length, 0);
    // Et sans journal du tout, il n'en crée pas.
    const vide = repertoireTemporaire(t);
    assert.equal((await geste(vide, heure.maintenant, [MAC, "claim"])).code, SANS_REPONSE);
    assert.throws(() => openLog(vide, { lectureSeule: true }), /no log in/);
  });

  test("un runtime qui ne répond pas à temps : le geste rend la main, sans rien supposer de ce que la box a fait", async (t) => {
    const repertoire = repertoireTemporaire(t);
    // Un journal dont la session est ouverte, et personne pour lire les demandes.
    const log = openLog(repertoire);
    t.after(() => log.fermer());
    log.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
    await assert.rejects(demander(repertoire, MAC, { verb: "claim" }, { attenteMs: 30, pasMs: 2 }), (erreur) => erreur instanceof SansReponse && /did not answer in time/.test(erreur.message));
    // La demande, elle, est au journal : c'est ce que le runtime trouvera — trop tard.
    assert.equal(log.tout().filter((e) => e.type === "remote.asked").length, 1);
  });
});
