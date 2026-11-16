// La part de chaque projet dans le budget horaire d'appels GitHub de la station
// (#3683) : un projet à sa part attend seul, les autres gardent leurs appels ;
// six projets à une charge ordinaire restent sous le budget sans attendre ; et
// `status` dit, par projet, ses appels de l'heure et s'il est ralenti.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BUDGET_DE_LA_STATION_PAR_HEURE, PART_D_UN_PROJET, PartAtteinte, PROJETS_DE_LA_STATION } from "../../src/budget-github/part-des-projets.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { etiquetteDe, FENETRE_MS, limiteDeLaStation, ouvrirLimite, partsDeLaStation, prendreUnAppel, REPERTOIRE_COMPTEUR } from "../../src/limite-github.ts";
import { photoDuProjet } from "../../src/status.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

const DEBUT = Date.UTC(2026, 10, 15, 20, 0, 0);
const lectureDe = (projet: string) => etiquetteDe([`repos/benomite/${projet}/issues`], { projet });

// Une horloge que le test avance, et un réveil de la file qu'il déclenche.
const horloge = (depart: number) => {
  const h = { instant: depart, maintenant: () => h.instant };
  return h;
};

test("deux projets sur le même compte : celui qui appelle bien au-dessus de sa part attend seul, l'autre garde ses appels", async () => {
  const h = horloge(DEBUT);
  const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: () => {} });
  // Le gros projet fait sa part de l'heure, une lecture toutes les 200 ms (sous le débit de la minute).
  for (let i = 0; i < PART_D_UN_PROJET; i++) {
    h.instant += 200;
    limite.prendre("cuisine", undefined, lectureDe("brigade"));
  }
  const premier = DEBUT + 200;

  // Son appel suivant attend dans la file, réveillé quand son plus ancien appel sort de l'heure.
  const reveils: Array<{ ms: number; sonner: () => void }> = [];
  const attendre = (ms: number) => new Promise<void>((sonner) => reveils.push({ ms, sonner }));
  let parti = false;
  const demande = h.instant;
  const gros = prendreUnAppel(limite, { gh: "gh", etiquette: lectureDe("brigade"), maintenant: h.maintenant, attendre }).then((appel) => {
    parti = true;
    return appel;
  });

  // Pendant ce temps, l'autre projet fait ses appels ordinaires : aucun n'attend.
  for (let i = 0; i < 50; i++) {
    h.instant += 200;
    await prendreUnAppel(limite, { gh: "gh", etiquette: lectureDe("secondes"), maintenant: h.maintenant, attendre });
  }
  assert.equal(parti, false, "le gros projet attend sa part");
  assert.ok(reveils.length >= 1);
  assert.equal(reveils[0]?.ms, premier + FENETRE_MS - demande);
  const parts = limite.repartition().parProjet;
  assert.deepEqual(parts, [
    { nom: "brigade", appels: PART_D_UN_PROJET },
    { nom: "secondes", appels: 50 },
  ]);

  // Son plus ancien appel sort de l'heure : il part.
  h.instant = premier + FENETRE_MS;
  for (const reveil of reveils.splice(0)) reveil.sonner();
  await gros;
  assert.equal(parti, true);
  limite.fermer();
});

test("six projets à une charge ordinaire : le total reste sous le budget de la station et aucun projet n'attend", () => {
  assert.ok(PART_D_UN_PROJET * PROJETS_DE_LA_STATION <= BUDGET_DE_LA_STATION_PAR_HEURE);
  const h = horloge(DEBUT);
  const limite = ouvrirLimite({ maintenant: h.maintenant, alerter: () => {} });
  const projets = ["brigade", "secondes", "alpha", "beta", "gamma", "delta"];
  // Une charge ordinaire : 400 appels par projet sur l'heure, entremêlés.
  const PAR_PROJET = 400;
  const pas = Math.floor((FENETRE_MS - 1000) / (PAR_PROJET * projets.length));
  for (let i = 0; i < PAR_PROJET; i++) {
    for (const projet of projets) {
      h.instant += pas;
      // Un projet retenu par sa part lèverait ici : aucun ne l'est.
      limite.prendre("cuisine", undefined, lectureDe(projet));
    }
  }
  assert.equal(limite.appels(), PAR_PROJET * projets.length);
  assert.ok(limite.appels() < BUDGET_DE_LA_STATION_PAR_HEURE);
  assert.deepEqual(
    limite.repartition().parProjet.map(({ appels }) => appels),
    projets.map(() => PAR_PROJET),
  );
  // Le même appel, une fois la part faite, attend : la charge ordinaire est sous la part, pas au-delà de toute retenue.
  for (let i = PAR_PROJET; i < PART_D_UN_PROJET; i++) limite.prendre("cuisine", undefined, lectureDe("alpha"));
  assert.throws(() => limite.prendre("cuisine", undefined, lectureDe("alpha")), PartAtteinte);
  limite.prendre("cuisine", undefined, lectureDe("beta"));
  limite.fermer();
});

test("`status` dit, par projet, ses appels de l'heure contre sa part, et pour le seul projet retenu, l'heure où il reprend", (t) => {
  const repertoire = repertoireTemporaire(t);
  const station = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();
  const h = horloge(DEBUT);
  const limite = limiteDeLaStation(station, { maintenant: h.maintenant, alerter: () => {} });
  aArreter(t, () => limite.fermer());
  for (let i = 0; i < PART_D_UN_PROJET; i++) {
    h.instant += 200;
    limite.prendre("cuisine", undefined, lectureDe("brigade"));
  }
  for (let i = 0; i < 12; i++) {
    h.instant += 200;
    limite.prendre("cuisine", undefined, lectureDe("secondes"));
  }
  // Les appels de la station elle-même n'ont pas de part.
  limite.prendre("cuisine");

  const lignes = photoDuProjet({ BRIGADE_STATE_DIR: repertoire, BRIGADE_STATION_DIR: station, BRIGADE_PROJECT: "secondes" }, { maintenant: new Date(h.instant) });
  const debut = lignes.findIndex((l) => l.startsWith("gh share"));
  assert.deepEqual(lignes.slice(debut, debut + 2), [
    `gh share   brigade ${PART_D_UN_PROJET}/${PART_D_UN_PROJET} calls in the last hour — held back for its GitHub share, resumes at 21:00 UTC`,
    `           secondes 12/${PART_D_UN_PROJET} calls in the last hour`,
  ]);
  assert.equal(lignes.some((l) => /station \d+\/\d+ calls in the last hour/.test(l)), false);
});

test("sans compteur de station, ou s'il ne se lit pas, `status` ne dit aucune part plutôt que d'inventer des zéros", (t) => {
  const repertoire = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();
  assert.equal(partsDeLaStation(undefined, DEBUT), null);
  assert.equal(photoDuProjet({ BRIGADE_STATE_DIR: repertoire }, { maintenant: new Date(DEBUT) }).some((l) => l.startsWith("gh share")), false);

  const station = repertoireTemporaire(t);
  mkdirSync(join(station, REPERTOIRE_COMPTEUR), { recursive: true });
  writeFileSync(join(station, REPERTOIRE_COMPTEUR, "compteur.db"), "pas une base");
  assert.equal(partsDeLaStation(station, DEBUT), null);
  assert.equal(photoDuProjet({ BRIGADE_STATE_DIR: repertoire, BRIGADE_STATION_DIR: station }, { maintenant: new Date(DEBUT) }).some((l) => l.startsWith("gh share")), false);
});
