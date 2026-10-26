// La vraie station (`station/main.ts`) lit la sélection que l'app écrit dans
// le gist de son enregistrement (#1707) : sans sélection, son journal de
// service dit qu'elle ne sert aucun projet ; un dépôt choisi, elle le prend en
// main et en publie le suivi dans le même gist. GitHub est la doublure des
// gists du compte ; `SIGHUP` lui fait relire tout de suite, sans attendre sa cadence.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { FICHIER_SELECTION } from "../../src/enregistrement-station/contrat.ts";
import { FICHIER_LOCAL } from "../../src/enregistrement-station/enregistrer.ts";
import { FICHIER_SUIVI } from "../../src/projets/demande.ts";
import { AUCUN_PROJET } from "../../src/projets-station/source.ts";
import { FAUX_GH_GISTS } from "../appairage/doublure-des-gists.ts";
import { ENV_GIT, FAUX_CLAUDE, lancer, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const STATION = join(import.meta.dirname, "../../src/station/main.ts");

type Gist = { files: Record<string, { filename: string; content: string }> };

// SIGHUP n'existe pas sous Windows : la relecture y attend sa cadence.
test("sans sélection, la vraie station dit qu'elle ne sert aucun projet ; un dépôt choisi dans l'app, elle le prend en main et le suit dans son enregistrement", { skip: posixOnly("SIGHUP, which makes the station reread at once, does not exist on Windows") }, async (t) => {
  const machine = repertoireTemporaire(t);
  const racine = join(machine, "station");
  const compte = join(machine, "compte");
  const gists = repertoireTemporaire(t);
  mkdirSync(racine);
  mkdirSync(compte);
  const station = lancer(t, STATION, [], {
    ...ENV_GIT,
    BRIGADE_GH_BIN: FAUX_GH_GISTS,
    FAUX_GISTS: gists,
    HOME: compte,
    BRIGADE_STATION_DIR: racine,
    BRIGADE_STATION_NOM: "box",
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  });
  await station.attendre("station enregistrée sous le compte GitHub de sa machine");
  await station.attendre("station démarrée");
  const id = (JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")) as { gist: string }).gist;
  const fichier = join(gists, `${id}.gist.json`);
  const lire = () => JSON.parse(readFileSync(fichier, "utf8")) as Gist;

  station.process.kill("SIGHUP");
  await station.attendre(AUCUN_PROJET);
  assert.doesNotMatch(station.sortie(), /refus de démarrer/);

  // L'app coche un dépôt : elle réécrit la sélection entière dans le gist de la station.
  const gist = lire();
  gist.files[FICHIER_SELECTION] = { filename: FICHIER_SELECTION, content: JSON.stringify({ brigade: "station-selection", format: 1, repositories: ["acme/shop"], updatedAt: new Date().toISOString() }) };
  writeFileSync(`${fichier}.test`, JSON.stringify(gist));
  renameSync(`${fichier}.test`, fichier);
  station.process.kill("SIGHUP");
  await station.attendre("projet choisi pour elle dans l'app : acme/shop");

  // Ce qu'elle en fait, elle le publie à côté de son enregistrement : la doublure
  // ne clone rien, mais le projet est le sien.
  for (;;) {
    const suivi = lire().files[FICHIER_SUIVI]?.content;
    if (suivi !== undefined && (JSON.parse(suivi) as { projets: Array<{ nom: string }> }).projets.some(({ nom }) => nom === "shop")) break;
    assert.equal(station.process.exitCode, null, station.sortie());
    await new Promise((resoudre) => setTimeout(resoudre, 50));
  }
  // La sélection reste celle de l'app.
  assert.match(lire().files[FICHIER_SELECTION]?.content ?? "", /"acme\/shop"/);
});

test("station.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
