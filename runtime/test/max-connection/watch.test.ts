// La veille de la station : elle relit le fichier d'état du renouvellement,
// expose la connexion Max à côté de la configuration, le dit quand ça change,
// et prévient les cuisines — sur une horloge simulée.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { configVeille, EXPOSITION, lireConnexionExposee, RELECTURE_MS, veillerConnexionMax } from "../../src/max-connection/watch.ts";
import { ConfigInvalide } from "../../src/runtime.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { horlogeSimulee } from "./clock.ts";

const rienNeReste = temporaireDuFichier();

function veille(t: TestContext, racine = repertoireTemporaire(t)) {
  const fichiers = configVeille({}, racine);
  mkdirSync(join(racine, ".session"), { recursive: true });
  const lignes: string[] = [];
  const horloge = horlogeSimulee();
  const ecrire = (texte: string) => writeFileSync(fichiers.renouvellement, texte);
  const ouvrir = () => {
    const veillee = veillerConnexionMax({ ...fichiers, dire: (ligne) => void lignes.push(ligne), maintenant: horloge.maintenant, minuterie: horloge.minuterie });
    aArreter(t, () => veillee.arreter());
    return veillee;
  };
  return { racine, fichiers, lignes, horloge, ecrire, ouvrir };
}

// Une date du fichier d'état, `s` secondes après le départ de l'horloge simulée.
const a = (s: number) => new Date(Date.parse("2026-10-15T12:00:00Z") + s * 1000).toISOString().replace(".000Z", "Z");

test("les deux fichiers : le fichier d'état sous le répertoire de la station, ou celui que l'unité donne ; l'exposition à côté de la configuration", () => {
  assert.deepEqual(configVeille({}, "/var/lib/brigade"), { renouvellement: "/var/lib/brigade/.session/renouvellement", exposition: `/var/lib/brigade/${EXPOSITION}` });
  assert.equal(configVeille({ BRIGADE_SESSION_STATE: "/srv/etat" }, "/var/lib/brigade").renouvellement, "/srv/etat");
  assert.throws(() => configVeille({ BRIGADE_SESSION_STATE: "relatif" }, "/var/lib/brigade"), ConfigInvalide);
});

test("au démarrage, la station expose ce qu'elle sait et le dit — avant tout passage, une connexion inconnue", (t) => {
  const { fichiers, lignes, ouvrir } = veille(t);
  ouvrir();
  assert.equal(lireConnexionExposee(fichiers.exposition)?.etat, "inconnue");
  assert.match(lignes.join("\n"), /connexion Max encore inconnue/);
});

test("une perte puis un login : chacun est exposé, dit une fois, et les cuisines l'apprennent", (t) => {
  const { fichiers, lignes, horloge, ecrire, ouvrir } = veille(t);
  ecrire(`verifie=${a(-30)}\necrits=${a(-3600)}\n`);
  const veillee = ouvrir();
  const vues: string[] = [];
  veillee.surChangement((connexion) => void vues.push(connexion.etat));
  assert.equal(veillee.connexion().etat, "connectee");

  ecrire(`verifie=${a(-30)}\necrits=${a(-3600)}\nechec=${a(10)}\nechec_nature=session-refusee\nechec_detail=Anthropic a refusé le renouvellement\n`);
  horloge.avancer(RELECTURE_MS * 3);
  const perdue = lireConnexionExposee(fichiers.exposition);
  assert.deepEqual([perdue?.etat, perdue?.raison, perdue?.depuis], ["perdue", "session-refusee", new Date(a(10)).toISOString()]);
  assert.match(perdue?.geste ?? "", /claude auth login/);

  ecrire(`verifie=${a(40)}\necrits=${a(35)}\nechec=${a(10)}\nechec_nature=session-refusee\n`);
  horloge.avancer(RELECTURE_MS);
  assert.equal(lireConnexionExposee(fichiers.exposition)?.etat, "connectee");

  assert.deepEqual(vues, ["perdue", "connectee"]);
  assert.equal(lignes.filter((ligne) => /connexion Max perdue/.test(ligne)).length, 1);
  assert.match(lignes.at(-1) ?? "", /connexion Max rétablie, la cuisine reprend — connexion Max valide/);
  // Ni l'exposition ni ce qui est dit ne porte autre chose que des dates et des natures.
  assert.doesNotMatch(readFileSync(fichiers.exposition, "utf8") + lignes.join("\n"), /jeton-|sk-ant|credentials/);
});

test("une perte signalée par un projet survit au redémarrage de la station, tant qu'aucun login ne l'a levée", (t) => {
  const racine = repertoireTemporaire(t);
  const premiere = veille(t, racine);
  premiere.ecrire(`verifie=${a(-30)}\necrits=${a(-3600)}\n`);
  const avant = premiere.ouvrir();
  avant.signalerPerte("authentication_failed", new Date(a(5)).toISOString());
  assert.equal(avant.connexion().etat, "perdue");
  avant.arreter();

  // Le renouvellement continue de réussir sans rien réécrire.
  const seconde = veille(t, racine);
  seconde.ecrire(`verifie=${a(30)}\necrits=${a(-3600)}\n`);
  const apres = seconde.ouvrir().connexion();
  assert.deepEqual([apres.etat, apres.raison], ["perdue", "authentication_failed"]);
});

test("une cuisine qui bute en apprenant la connexion n'empêche pas les autres de l'apprendre", (t) => {
  const { lignes, horloge, ecrire, ouvrir } = veille(t);
  const veillee = ouvrir();
  const vues: string[] = [];
  veillee.surChangement(() => {
    throw new Error("journal fermé");
  });
  veillee.surChangement((connexion) => void vues.push(connexion.etat));
  ecrire(`echec=${a(1)}\nechec_nature=identifiants-absents\n`);
  horloge.avancer(RELECTURE_MS);
  assert.deepEqual(vues, ["perdue"]);
  assert.match(lignes.join("\n"), /une cuisine n'a pas pris la connexion Max en compte — journal fermé/);
});

test("arrêtée, la veille ne relit plus rien", (t) => {
  const { horloge, ecrire, ouvrir } = veille(t);
  const veillee = ouvrir();
  veillee.arreter();
  ecrire(`echec=${a(1)}\nechec_nature=identifiants-absents\n`);
  horloge.avancer(RELECTURE_MS * 10);
  assert.equal(veillee.connexion().etat, "inconnue");
});

test("rien ne reste", () => rienNeReste());
