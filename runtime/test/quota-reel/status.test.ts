// #3833, critère 6 : `status` dit le quota réel restant de GitHub, l'heure de son prochain reset,
// et les projets ralentis, ou qu'aucun ne l'est.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { etiquetteDe, limiteDeLaStation } from "../../src/limite-github.ts";
import { photoDuProjet } from "../../src/status.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

const DEBUT = Date.UTC(2026, 10, 18, 10, 0, 0);
const RESET = Date.UTC(2026, 10, 18, 10, 40, 0);
const lectureDe = (projet: string) => etiquetteDe([`repos/benomite/${projet}/issues`], { projet });

const photo = (t: Parameters<typeof repertoireTemporaire>[0], restant: number) => {
  const repertoire = repertoireTemporaire(t);
  const station = repertoireTemporaire(t);
  ouvrirJournal(repertoire).fermer();
  const h = { instant: DEBUT };
  const limite = limiteDeLaStation(station, { maintenant: () => h.instant, alerter: () => {} });
  aArreter(t, () => limite.fermer());
  for (const [projet, n] of Object.entries({ brigade: 30, secondes: 20, alpha: 10 })) {
    for (let i = 0; i < n; i++) {
      h.instant += 1000;
      limite.prendre("cuisine", undefined, lectureDe(projet));
    }
  }
  limite.noter("gh", { restant, plafond: 5000, reset: RESET });
  return photoDuProjet({ BRIGADE_STATE_DIR: repertoire, BRIGADE_STATION_DIR: station, BRIGADE_PROJECT: "alpha" }, { maintenant: new Date(h.instant) });
};

test("`status` shows the remaining quota, its next reset, and says that no project is slowed at 3000 remaining", (t) => {
  const texte = photo(t, 3000).join("\n");
  assert.match(texte, /3000/);
  assert.match(texte, /10:40/, "the time of the next reset");
  assert.match(texte, /no project (is )?slowed|none (is )?slowed/i);
});

test("`status` lists the slowed projects at 500 remaining: the top half, not the least busy", (t) => {
  const lignes = photo(t, 500);
  const texte = lignes.join("\n");
  assert.match(texte, /\b500\b/);
  assert.match(texte, /10:40/);
  assert.doesNotMatch(texte, /no project (is )?slowed|none (is )?slowed/i);
  const ralenties = lignes.filter((l) => /slowed/i.test(l)).join("\n");
  assert.match(ralenties, /brigade/);
  assert.match(ralenties, /secondes/);
  assert.doesNotMatch(ralenties, /alpha/);
});
