// Un refus du gist de la station n'arrête que le gist (#3681) : sa pause ne
// retient pas la cuisine, même quand GitHub le dit au quota `core`, et le
// battement de la présence recule à chaque refus, puis reprend son pas après
// une écriture réussie. L'horloge est celle du test.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Canal } from "../../src/appairage/canal.ts";
import { REGARD_MS, tenirPresence } from "../../src/appairage/presence.ts";
import { constaterLimite, limiteDeLaStation, LimiteGitHubAtteinte, pauseDeLaStation } from "../../src/limite-github.ts";
import { FauxGitHub } from "../cout-par-ticket/faux-github.ts";
import { aArreter, jusqua, repertoireTemporaire } from "../outils.ts";
import { CALIBRE, DEPOT, fausseHorloge, uneStation } from "./aides.ts";

const MINUTE = 60_000;
const DEPART = Date.parse("2026-11-15T20:00:00Z");

test("a 403 on the gist write, even at GitHub's core quota, pauses no cook: the station still takes and serves a ticket (#3681)", async (t) => {
  const horloge = fausseHorloge(DEPART);
  const racine = repertoireTemporaire(t);
  const limite = limiteDeLaStation(racine, { maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  // Le 403 que GitHub a rendu à l'écriture du gist : son quota `core` à zéro, sans fin dite d'autre part.
  const refus = { statut: 403, entetes: new Map([["x-ratelimit-remaining", "0"]]), corps: JSON.stringify({ message: "API rate limit exceeded for user ID 1." }) };
  const erreur = await constaterLimite(limite, refus, { gh: "gh-absent", maintenant: horloge.maintenant, lecture: "gist" });
  assert.ok(erreur instanceof LimiteGitHubAtteinte);
  assert.equal(pauseDeLaStation(racine, horloge.maintenant()), null, "no pause of the cooks is recorded");

  const faux = new FauxGitHub(DEPOT);
  faux.feu(42, CALIBRE);
  const { station, lances } = uneStation(t, faux, limite, horloge.maintenant);
  await station.tour();
  assert.deepEqual(station.enCuisine(), [42]);
  await jusqua(() => lances.length === 1);
});

test("repeated refusals of the heartbeat write: the gap between two attempts grows, bounded, then returns to normal after a successful write (#3681)", async (t) => {
  const horloge = fausseHorloge(DEPART);
  const essais: number[] = [];
  let refuser = false;
  const canal: Canal = {
    async creer() {
      return "g1";
    },
    async ecrire() {
      essais.push(horloge.maintenant());
      // GitHub ne demande qu'une seconde d'attente : seule la présence fait reculer.
      if (refuser) throw new LimiteGitHubAtteinte(horloge.maintenant() + 1000, 1000);
      return "ecrit";
    },
    async lire() {
      return {};
    },
  };
  let version = 0;
  const presence = tenirPresence({
    racine: repertoireTemporaire(t),
    canal,
    identite: { nom: "box", machine: "Linux 6.1.0", version: "1.4.0" },
    // Un état qui change à chaque regard : chaque regard voudrait écrire.
    projets: () => [`projet-${version}`],
    dire: () => {},
    apres: horloge.apres,
    maintenant: horloge.maintenant,
  });
  aArreter(t, () => presence.arreter());
  await horloge.avancer(0);
  refuser = true;
  const ecarts = () => essais.slice(1).map((instant, i) => (instant - (essais[i] as number)) / MINUTE);
  for (let minute = 1; minute <= 60; minute += 1) {
    version += 1;
    await horloge.avancer(REGARD_MS);
  }
  const reculs = ecarts();
  assert.deepEqual(reculs.slice(0, 5), [1, 2, 4, 8, 15], `gaps in minutes: ${reculs.join(", ")}`);
  assert.ok(reculs.every((ecart) => ecart <= 15), "the backoff is bounded");

  // GitHub accepte de nouveau : à l'essai suivant l'écriture passe, et le pas redevient celui du regard.
  refuser = false;
  for (let minute = 1; minute <= 16 && ecarts().at(-1) !== 1; minute += 1) {
    version += 1;
    await horloge.avancer(REGARD_MS);
  }
  const apres = essais.length;
  for (let minute = 1; minute <= 3; minute += 1) {
    version += 1;
    await horloge.avancer(REGARD_MS);
  }
  assert.equal(essais.length - apres, 3, "one attempt per look again");
});
