// Le signe de vie de la station (son enregistrement, #1705) et la couche
// d'appels à GitHub (#3481) : refusé, il n'arrête ni les tours ni le service
// des tickets, et se retente en reculant ; accepté, il écrit bien moins
// qu'avant, sans jamais laisser passer les 270 s de la règle de fraîcheur.
// L'horloge est celle du test : rien n'attend le temps réel.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DELAI_MS, type Canal, type Fichiers } from "../../src/appairage/canal.ts";
import { disponible, ECRITURE_MS, enregistrementLu, FICHIER_ENREGISTREMENT, indisponibleApres, RAFRAICHI_MS } from "../../src/enregistrement-station/contrat.ts";
import { tenirEnregistrement } from "../../src/enregistrement-station/enregistrer.ts";
import { appelerGitHub, constaterLimite, ouvrirLimite, type Limite } from "../../src/limite-github.ts";
import { FauxGitHub } from "../cout-par-ticket/faux-github.ts";
import { jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { CALIBRE, DEPOT, fausseHorloge, uneStation } from "./aides.ts";

const rienNeReste = temporaireDuFichier();

const MINUTE = 60_000;
const DEPART = Date.parse("2026-11-13T16:50:00Z");

// Le canal du gist sur le compteur `limite`, comme `canal.ts` : chaque appel y
// est pris comme un appel du gist, et, tant que `refuser`, GitHub répond à
// l'écriture par le 403 de sa limite secondaire, que `constaterLimite` constate.
// `ecritures` : l'instant de chaque écriture partie vers GitHub, et son contenu.
function unCanal(limite: Limite, maintenant: () => number) {
  const etat = { refuser: false, ecritures: [] as Array<{ instant: number; fichiers: Fichiers }> };
  const refus = { statut: 403, entetes: new Map([["retry-after", "60"]]), corps: JSON.stringify({ message: "You have exceeded a secondary rate limit." }) };
  const appeler = <T>(ecriture: boolean, horsPause: boolean, faire: () => Promise<T>) =>
    appelerGitHub(limite, { ...(horsPause ? { usage: "geste" as const } : {}), etiquette: { projet: "station", lecture: "gist", ecriture }, gh: "gh-absent", maintenant }, async () => {
      if (ecriture && etat.refuser) throw await constaterLimite(limite, refus, { gh: "gh-absent", maintenant, lecture: "gist" });
      return faire();
    });
  const canal: Canal = {
    creer: (_description, fichiers) => appeler(true, false, async () => (etat.ecritures.push({ instant: maintenant(), fichiers }), "g1")),
    ecrire: (_id, fichiers, options) => appeler(true, options?.horsPause === true, async () => (etat.ecritures.push({ instant: maintenant(), fichiers }), "ecrit" as const)),
    lire: () => appeler(false, false, async () => ({})),
  };
  return { canal, etat };
}

test("a refused heartbeat stops neither the station's turns nor its tickets, and is retried backing off, not every minute (#3481)", async (t) => {
  const horloge = fausseHorloge(DEPART);
  const limite = ouvrirLimite({ maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  const { canal, etat } = unCanal(limite, horloge.maintenant);
  const lignes: string[] = [];
  const tenue = tenirEnregistrement({ racine: repertoireTemporaire(t), canal, identite: { nom: "box", machine: "Linux 6.1.0", version: "1" }, plateforme: "linux", dire: (ligne) => void lignes.push(ligne), apres: horloge.apres, maintenant: horloge.maintenant });
  t.after(() => tenue.arreter());
  await horloge.avancer(0);
  assert.equal(tenue.gist(), "g1");

  // GitHub refuse désormais l'écriture du gist ; la station sert le projet.
  etat.refuser = true;
  const faux = new FauxGitHub(DEPOT);
  faux.feu(42, CALIBRE);
  const { station, lances } = uneStation(t, faux, limite, horloge.maintenant);
  const essais: number[] = [];
  let tentes = 0;
  const tours: number[] = [];
  // Vingt minutes, un tour de la station chaque minute.
  for (let minute = 1; minute <= 20; minute += 1) {
    const avant = faux.appels.length;
    await horloge.avancer(MINUTE);
    await station.tour();
    if (faux.appels.length > avant) tours.push(minute);
    // Chaque essai d'écriture du gist, l'instant où il a été tenté : un refus ne laisse pas d'écriture,
    // mais un appel pris au compteur — compté sur l'heure, sorte `gist`.
    const gist = limite.repartition().parLecture.find(({ nom }) => nom === "gist")?.appels ?? 0;
    for (; tentes < gist; tentes += 1) essais.push(minute);
  }
  // La station a tourné à chaque minute, et son ticket est parti en cuisine.
  assert.deepEqual(tours, Array.from({ length: 20 }, (_, i) => i + 1), "every turn called GitHub");
  assert.deepEqual(station.enCuisine(), [42]);
  await jusqua(() => lances.length === 1);
  // Le signe de vie, refusé à 3 min 30 (son pas de 210 s), recule : un essai
  // une minute plus tard, puis deux, quatre, huit — et non plus chaque minute.
  assert.equal(essais[0], 1, "the creation at the start counts as the first gist write of the hour");
  assert.deepEqual(essais.slice(1), [4, 5, 7, 11, 19], "gist tries, by minute");
  assert.equal(etat.ecritures.length, 1, "nothing written while GitHub refuses");

  // GitHub accepte de nouveau : le signe de vie repart à son essai suivant, au plus quinze minutes plus tard.
  etat.refuser = false;
  await horloge.avancer(15 * MINUTE);
  assert.ok(etat.ecritures.length > 1);
  assert.ok(lignes.some((ligne) => /GitHub répond de nouveau/.test(ligne)), lignes.join("\n"));
});

test("an hour of heartbeats while GitHub accepts them: 17 writes instead of 30, and the station is never seen offline (#3481)", async (t) => {
  const horloge = fausseHorloge(DEPART);
  const limite = ouvrirLimite({ maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  const { canal, etat } = unCanal(limite, horloge.maintenant);
  const tenue = tenirEnregistrement({ racine: repertoireTemporaire(t), canal, identite: { nom: "box", machine: "Linux 6.1.0", version: "1" }, plateforme: "linux", dire: () => {}, apres: horloge.apres, maintenant: horloge.maintenant });
  t.after(() => tenue.arreter());
  await horloge.avancer(0);
  const depuis = etat.ecritures.length;
  // Une heure, lue toutes les dix secondes comme l'app la lirait.
  for (let seconde = 10; seconde <= 3600; seconde += 10) {
    await horloge.avancer(10_000);
    const derniere = etat.ecritures.at(-1)?.fichiers[FICHIER_ENREGISTREMENT] ?? "";
    const lu = enregistrementLu(derniere);
    assert.ok(!("illisible" in lu));
    assert.ok(disponible(lu, horloge.maintenant()), `seen offline at second ${seconde}`);
  }
  const ecrites = etat.ecritures.length - depuis;
  // Avant #3481 : une écriture par `RAFRAICHI_MS`, 30 par heure.
  assert.equal(3_600_000 / RAFRAICHI_MS, 30);
  assert.equal(ecrites, 17, `${ecrites} heartbeat writes in an hour`);
  // Le pas des écritures, plus deux écritures qui durent chacune le délai du canal, tient dans la règle de 270 s.
  assert.equal(indisponibleApres(RAFRAICHI_MS), 270_000);
  assert.ok(ECRITURE_MS + 2 * DELAI_MS <= indisponibleApres(RAFRAICHI_MS));
  const ecarts = etat.ecritures.slice(1).map(({ instant }, i) => instant - (etat.ecritures[i] as { instant: number }).instant);
  assert.ok(ecarts.every((ecart) => ecart === ECRITURE_MS), `gaps: ${ecarts.join(", ")}`);
});

test("signe-de-vie.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
