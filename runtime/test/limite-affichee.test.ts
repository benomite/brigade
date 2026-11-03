// La limite d'appels de GitHub, vue du chef : une seule ligne dans `status` et dans `faits`,
// avec l'heure de reprise, et rien du texte brut de `gh` ; elle disparaît quand la pause tombe.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { Base } from "../src/base.ts";
import { principal as faits } from "../src/faits.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { constaterLimite, direLesEcrituresRetenues, ECRITURES_PAR_HEURE, ECRITURES_PAR_MINUTE, ecrituresRetenuesDeLaStation, journaliserLaRetenue, limiteDeLaStation, pauseDeLaStation, prendreUnAppel, REPERTOIRE_COMPTEUR, retenueDeLaStation } from "../src/limite-github.ts";
import { principal as status } from "../src/status.ts";
import { appeler, jusqua, repertoireTemporaire } from "./outils.ts";

const TEXTE_BRUT = /request id|terms|HTTP 4|rate limit exceeded/i;

test("quand GitHub refuse pour sa limite, status et faits disent la reprise en une ligne, sans le texte de gh ; la ligne tombe avec la pause", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const station = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();
  const env = { BRIGADE_STATE_DIR: repertoire, BRIGADE_STATION_DIR: station };
  const lire = async (commande: typeof status) => {
    const rendu = appeler(commande, [], env);
    assert.equal(await rendu.fin, 0);
    return rendu.sortie();
  };

  // Aucun compteur, aucune ligne.
  assert.doesNotMatch(await lire(status), /rate-limiting/);
  assert.equal(JSON.parse(await lire(faits)).limiteGithub, undefined);

  // GitHub refuse : 429 et un `retry-after` de 20 minutes — le refus de `gh` n'entre pas dans ce qui s'affiche.
  const limite = limiteDeLaStation(station);
  t.after(() => limite.fermer());
  const avant = Date.now();
  await constaterLimite(limite, { statut: 429, entetes: new Map([["retry-after", "1200"]]), corps: "API rate limit exceeded, request id ABC, see the terms of service" }, { gh: "gh-absent" });
  const reprise = new Date(avant + 1_200_000);
  const hhmm = `${String(reprise.getHours()).padStart(2, "0")}:${String(reprise.getMinutes()).padStart(2, "0")}`;

  const sortie = await lire(status);
  const lignes = sortie.split("\n").filter((ligne) => /GitHub/.test(ligne));
  assert.equal(lignes.length, 1);
  assert.match(lignes[0] ?? "", /^github {5}GitHub is rate-limiting calls, back around (\d\d):(\d\d)$/);
  // Une minute près : l'appel a eu lieu un peu après `avant`.
  const [h, m] = (lignes[0] ?? "").slice(-5).split(":").map(Number);
  assert.ok(Math.abs((h ?? 0) * 60 + (m ?? 0) - (reprise.getHours() * 60 + reprise.getMinutes())) <= 1, `${lignes[0]} vs ${hhmm}`);
  assert.doesNotMatch(sortie, TEXTE_BRUT);

  const lus = JSON.parse(await lire(faits));
  assert.ok(Math.abs(Date.parse(lus.limiteGithub) - (avant + 1_200_000)) < 5_000);

  // Les appels reprennent : la pause tombe, la ligne aussi.
  const base = new Base(join(station, REPERTOIRE_COMPTEUR, "compteur.db"), { attenteMs: 5000 });
  base.executer("DELETE FROM pause");
  base.fermer();
  assert.equal(pauseDeLaStation(station, Date.now()), null);
  assert.doesNotMatch(await lire(status), /rate-limiting/);
  assert.equal(JSON.parse(await lire(faits)).limiteGithub, undefined);
});

test("quand la box retient ses appels à la réserve des gestes, status le dit à sa façon, sans dire que GitHub limite ; la ligne tombe avec la fenêtre", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const station = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();
  const env = { BRIGADE_STATE_DIR: repertoire, BRIGADE_STATION_DIR: station };
  const lire = async () => {
    const rendu = appeler(status, [], env);
    assert.equal(await rendu.fin, 0);
    return rendu.sortie();
  };
  const limite = limiteDeLaStation(station);
  t.after(() => limite.fermer());

  // Au-dessus de la réserve, rien à dire.
  limite.noter("gh", { restant: 2000, plafond: 5000, reset: Math.floor(Date.now() / 1000 + 1200) * 1000 });
  assert.equal(retenueDeLaStation(station, Date.now()), null);
  assert.doesNotMatch(await lire(), /^github /m);

  // À la réserve : la box retient, GitHub n'a rien refusé.
  limite.noter("gh", { restant: 500, plafond: 5000, reset: Math.floor(Date.now() / 1000 + 1200) * 1000 });
  assert.notEqual(retenueDeLaStation(station, Date.now()), null);
  const sortie = await lire();
  assert.match(sortie, /^github {5}the box holds its own calls to keep the reserve for your gestures, back around \d\d:\d\d$/m);
  assert.doesNotMatch(sortie, /rate-limiting/);

  // La fenêtre passée, la ligne tombe.
  assert.equal(retenueDeLaStation(station, Date.now() + 3_600_000), null);
});

test("quand le budget d'écritures retient la cuisine, status le dit en une ligne, et le journal une fois au début et une fois à la fin (#2226)", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const station = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();
  const env = { BRIGADE_STATE_DIR: repertoire, BRIGADE_STATION_DIR: station };
  const lire = async () => {
    const rendu = appeler(status, [], env);
    assert.equal(await rendu.fin, 0);
    return rendu.sortie();
  };
  let horloge = Date.now();
  const limite = limiteDeLaStation(station, { maintenant: () => horloge });
  t.after(() => limite.fermer());
  const ecriture = { projet: "p", lecture: "issues", ecriture: true } as const;

  // Sous le budget, rien à dire.
  for (let i = 0; i < ECRITURES_PAR_MINUTE - 1; i += 1) limite.prendre("cuisine", "gh", ecriture);
  assert.equal(ecrituresRetenuesDeLaStation(station, horloge), null);
  assert.doesNotMatch(await lire(), /write budget/);

  // Le budget de la minute plein : la ligne dit combien, et quand la suivante part.
  limite.prendre("cuisine", "gh", ecriture);
  const premiere = horloge - 0;
  const reprise = new Date(premiere + 60_000);
  const hhmm = `${String(reprise.getHours()).padStart(2, "0")}:${String(reprise.getMinutes()).padStart(2, "0")}`;
  const retenue = ecrituresRetenuesDeLaStation(station, horloge);
  assert.deepEqual(retenue, { ecrites: ECRITURES_PAR_MINUTE, reprise: premiere + 60_000 });
  assert.equal(direLesEcrituresRetenues(retenue!), `held by the GitHub write budget — ${ECRITURES_PAR_MINUTE} of ${ECRITURES_PAR_HEURE} in the last hour, next write at ${hhmm}`);
  const lignes = (await lire()).split("\n").filter((ligne) => /write budget/.test(ligne));
  assert.deepEqual(lignes, [`github     ${direLesEcrituresRetenues(retenue!)}`]);

  // Deux écritures attendent : le journal le dit une fois au début, et une fois à la fin.
  const journal: string[] = [];
  journaliserLaRetenue((ligne) => journal.push(ligne));
  const attente = Promise.withResolvers<void>();
  let attendent = 0;
  const attendre = async () => {
    attendent += 1;
    await attente.promise;
    horloge += 60_001;
  };
  const deux = [0, 1].map(() => prendreUnAppel(limite, { etiquette: ecriture, gh: "gh", maintenant: () => horloge, attendre }));
  await jusqua(() => attendent === 2);
  assert.equal(journal.length, 1);
  assert.match(journal[0]!, new RegExp(`^brigade : écritures GitHub retenues par le budget — ${ECRITURES_PAR_MINUTE} sur ${ECRITURES_PAR_HEURE} sur l'heure écoulée, la suivante à ${hhmm}$`));
  attente.resolve();
  await Promise.all(deux);
  assert.equal(journal.length, 2);
  assert.match(journal[1]!, /écritures GitHub reprises/);

  // La fenêtre passée, la ligne tombe.
  assert.equal(ecrituresRetenuesDeLaStation(station, horloge + 60_001), null);
});
