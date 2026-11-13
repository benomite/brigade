// Un refus de GitHub ne retient que la sorte d'appel refusée (#3481). Le
// 2026-11-13, un 403 sur l'écriture du gist (le signe de vie) a arrêté tous
// les appels de la station — issues, PR, checks — et rien n'a cuit de 16:50 à
// 17:10. Ici, le vrai canal du gist (`canal.ts`) reçoit ce 403 d'un `gh`
// dicté, sur le même compteur que la vraie station GitHub seul.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canalGitHub } from "../../src/appairage/canal.ts";
import { join } from "node:path";
import { Base } from "../../src/base.ts";
import { constaterLimite, dernierRefusDeLaStation, etiquetteDe, journaliserLaPause, LimiteGitHubAtteinte, limiteDeLaStation, ouvrirLimite, pauseDeLaStation, pausesDeLaStation, prendreUnAppel, REPERTOIRE_COMPTEUR } from "../../src/limite-github.ts";
import { FauxGitHub } from "../cout-par-ticket/faux-github.ts";
import { jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { CALIBRE, DEPOT, unGhDeGist, uneStation } from "./aides.ts";

const rienNeReste = temporaireDuFichier();

test("a 403 on gist writes holds gist calls only: issue, PR and check calls still go through, and a cook still starts (#3481)", async (t) => {
  const racine = repertoireTemporaire(t);
  const limite = limiteDeLaStation(racine);
  t.after(() => limite.fermer());
  const gh = unGhDeGist(t);
  const canal = canalGitHub({ gh: gh.bin, limite });

  // Le signe de vie : GitHub refuse l'écriture du gist.
  gh.refuser(true);
  await assert.rejects(canal.ecrire("g1", { "brigade-enregistrement.json": "{}" }), LimiteGitHubAtteinte);
  assert.equal(gh.ecritures(), 1);

  // Les appels du gist attendent : rien ne part vers GitHub.
  await assert.rejects(canal.ecrire("g1", { "brigade-enregistrement.json": "{}" }), LimiteGitHubAtteinte);
  await assert.rejects(canal.lire("g1"), LimiteGitHubAtteinte);
  assert.equal(gh.ecritures(), 1, "no gist write leaves during the pause");

  // Issues, PR et checks partent.
  const options = (chemin: string, ...methode: string[]) => ({ gh: "gh-absent", etiquette: etiquetteDe([...methode, chemin], { projet: "brigade" }) });
  for (const [chemin, ...methode] of [[`repos/${DEPOT}/issues`], [`repos/${DEPOT}/issues/42/comments`, "-X", "POST"], [`repos/${DEPOT}/pulls`], [`repos/${DEPOT}/commits/abc/check-runs`]] as const) {
    assert.equal(typeof (await prendreUnAppel(limite, options(chemin, ...methode))), "number", chemin);
  }
  // La cuisine n'est pas retenue : `status` et la retenue ne voient ni pause ni refus.
  assert.equal(pauseDeLaStation(racine, Date.now()), null);
  assert.equal(dernierRefusDeLaStation(racine, Date.now(), 60 * 60_000), null);
  assert.equal(pausesDeLaStation(racine, Date.now()), null);

  // Et un cook part : la station GitHub seul prend le ticket et le lance.
  const faux = new FauxGitHub(DEPOT);
  faux.feu(42, CALIBRE);
  const { station, lances } = uneStation(t, faux, limite);
  await station.tour();
  assert.deepEqual(station.enCuisine(), [42]);
  await jusqua(() => lances.length === 1);
  assert.ok(faux.appels.some(({ chemin, statut }) => chemin.startsWith(`repos/${DEPOT}/issues`) && statut < 400), "issue calls went through");

  // Le gist attend toujours.
  await assert.rejects(canal.ecrire("g1", { "brigade-enregistrement.json": "{}" }), LimiteGitHubAtteinte);
  assert.equal(gh.ecritures(), 1);
});

test("a pause posed for every kind (no kind named) still holds every kitchen call, as before #3481", (t) => {
  const racine = repertoireTemporaire(t);
  const limite = limiteDeLaStation(racine);
  t.after(() => limite.fermer());
  limite.suspendre(Date.now() + 60_000);
  for (const lecture of ["gist", "issues", "pull-requests", "other"] as const) {
    assert.throws(() => limite.prendre("cuisine", undefined, { projet: "brigade", lecture }), LimiteGitHubAtteinte, lecture);
  }
  assert.notEqual(pauseDeLaStation(racine, Date.now()), null);
});

test("the log says a kind's pause once when it starts and once when a call of that kind leaves again; other kinds say nothing (#3481)", async (t) => {
  let instant = Date.parse("2026-11-13T16:50:00Z");
  const maintenant = () => instant;
  const limite = ouvrirLimite({ maintenant });
  t.after(() => limite.fermer());
  const lignes: string[] = [];
  journaliserLaPause((ligne) => void lignes.push(ligne));
  t.after(() => journaliserLaPause(() => {}));
  const refus = { statut: 403, entetes: new Map([["retry-after", "60"]]), corps: JSON.stringify({ message: "You have exceeded a secondary rate limit." }) };
  await constaterLimite(limite, refus, { gh: "gh-absent", maintenant, lecture: "gist" });
  await constaterLimite(limite, refus, { gh: "gh-absent", maintenant, lecture: "gist" });
  await prendreUnAppel(limite, { gh: "gh-absent", maintenant, etiquette: { projet: "brigade", lecture: "issues" } });
  assert.equal(lignes.length, 1);
  assert.match(lignes[0] ?? "", /^brigade : GitHub limit reached on gist calls — they wait until \d\d:\d\d, other calls go on$/);
  instant += 60_000;
  await prendreUnAppel(limite, { gh: "gh-absent", maintenant, etiquette: { projet: "station", lecture: "gist" } });
  await prendreUnAppel(limite, { gh: "gh-absent", maintenant, etiquette: { projet: "station", lecture: "gist" } });
  assert.deepEqual(lignes.slice(1), ["brigade : GitHub gist calls resumed"]);
});

test("a counter written before #3481, without the kind columns, opens and keeps its pause for every kind", (t) => {
  const racine = repertoireTemporaire(t);
  const ancienne = limiteDeLaStation(racine);
  ancienne.fermer();
  // Le compteur tel qu'une station d'avant l'a laissé : ses tables sans la sorte d'appel.
  const base = new Base(join(racine, REPERTOIRE_COMPTEUR, "compteur.db"));
  base.script("DROP TABLE pause; DROP TABLE refus; DROP TABLE pauses; CREATE TABLE pause (jusqua INTEGER NOT NULL); CREATE TABLE refus (instant INTEGER NOT NULL); CREATE TABLE pauses (depuis INTEGER NOT NULL, jusqua INTEGER NOT NULL, statut INTEGER, ressource TEXT, retry_after TEXT);");
  base.executer("INSERT INTO pause (jusqua) VALUES (?)", Date.now() + 60_000);
  base.fermer();
  const limite = limiteDeLaStation(racine);
  t.after(() => limite.fermer());
  assert.throws(() => limite.prendre("cuisine", undefined, { projet: "brigade", lecture: "issues" }), LimiteGitHubAtteinte);
  assert.notEqual(pauseDeLaStation(racine, Date.now()), null);
});

test("pause-par-sorte.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
