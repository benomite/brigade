// Le nom de la station : tiré du nom de la machine au premier démarrage, puis
// retenu, quoi que macOS fasse de ce nom ensuite ; seul un renommage le change.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { identiteDeLaStation } from "../../src/appairage/presence.ts";
import { FICHIER_NOM, lireNomRetenu, nomDeclare, nomDeLaStation, nomDeLHote, renommerLaStation } from "../../src/station/nom.ts";
import { CACHE_DE_COMPILATION, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const RENOMMER = join(import.meta.dirname, "../../src/station/renommer.ts");

// Ce que la station déclare à un démarrage sur la machine `hote`, comme
// `main.ts` le calcule — sa présence et son enregistrement — et ce que ses
// cuisines lui connaissent.
function declare(racine: string, hote: string): string {
  const nom = identiteDeLaStation({ BRIGADE_STATION_NOM: nomDeLaStation(racine, {}, () => hote) }).nom;
  assert.equal(nomDeclare({ BRIGADE_STATION_DIR: racine }), nom);
  return nom;
}

const rienNeReste = temporaireDuFichier();

test("le nom de la machine perd son suffixe .home ou .local, ses majuscules et le numéro d'un conflit", () => {
  for (const hote of ["macbook-air-de-benoit.home", "macbook-air-de-benoit4.home", "MacBook-Air-de-Benoit.local", "MacBook-Air-de-Benoit-2.local"]) {
    assert.equal(nomDeLHote(hote), "macbook-air-de-benoit", hote);
  }
  assert.equal(nomDeLHote("parade-box"), "parade-box");
  assert.equal(nomDeLHote("1234"), "1234");
  assert.equal(nomDeLHote(""), "station");
});

test("une station démarrée sous macbook-air-de-benoit.home, puis …4.home, puis MacBook-Air-de-Benoit.local se déclare macbook-air-de-benoit chaque fois", (t) => {
  for (const hote of ["macbook-air-de-benoit.home", "macbook-air-de-benoit4.home", "MacBook-Air-de-Benoit.local"]) {
    assert.equal(nomDeLaStation(repertoireTemporaire(t), {}, () => hote), "macbook-air-de-benoit", `premier démarrage sous ${hote}`);
  }
  const racine = repertoireTemporaire(t);
  for (const hote of ["macbook-air-de-benoit.home", "macbook-air-de-benoit4.home", "MacBook-Air-de-Benoit.local"]) {
    assert.equal(declare(racine, hote), "macbook-air-de-benoit", `redémarrage sous ${hote}`);
  }
});

test("redémarrée sous un autre nom de machine, la station garde le nom retenu à son premier démarrage", (t) => {
  const racine = repertoireTemporaire(t);
  assert.equal(nomDeLaStation(racine, {}, () => "atelier"), "atelier");
  assert.deepEqual(JSON.parse(readFileSync(join(racine, FICHIER_NOM), "utf8")), { nom: "atelier" });
  assert.equal(nomDeLaStation(racine, {}, () => "tout-autre-chose.local"), "atelier");
  assert.equal(lireNomRetenu(racine), "atelier");
});

test("un premier démarrage sur la machine parade-box déclare parade-box", (t) => {
  assert.equal(declare(repertoireTemporaire(t), "parade-box"), "parade-box");
});

test("renommée, la station se déclare sous le nouveau nom, et plus jamais sous l'ancien", (t) => {
  const racine = repertoireTemporaire(t);
  assert.equal(declare(racine, "macbook-air-de-benoit4.home"), "macbook-air-de-benoit");
  assert.deepEqual(renommerLaStation(racine, "Cuisine du Salon"), { ancien: "macbook-air-de-benoit", nouveau: "cuisine-du-salon" });
  for (const hote of ["macbook-air-de-benoit.home", "macbook-air-de-benoit4.home"]) {
    const nom = declare(racine, hote);
    assert.equal(nom, "cuisine-du-salon");
    assert.notEqual(nom, "macbook-air-de-benoit");
  }
});

test("la commande de renommage change le nom retenu, et refuse un nom vide ou l'absence du répertoire", (t) => {
  const racine = repertoireTemporaire(t);
  declare(racine, "macbook-air-de-benoit4.home");
  const renommer = (args: string[], env: Record<string, string>) =>
    spawnSync(process.execPath, [RENOMMER, ...args], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...CACHE_DE_COMPILATION, ...env } });
  const fait = renommer(["Atelier"], { BRIGADE_STATION_DIR: racine });
  assert.equal(fait.status, 0, fait.stderr);
  assert.match(fait.stdout, /la station macbook-air-de-benoit s'appelle désormais atelier/);
  assert.equal(declare(racine, "macbook-air-de-benoit.local"), "atelier");
  assert.equal(renommer(["--"], { BRIGADE_STATION_DIR: racine }).status, 2);
  assert.equal(renommer(["atelier"], {}).status, 2);
  assert.equal(renommer([], { BRIGADE_STATION_DIR: racine }).status, 2);
  assert.equal(lireNomRetenu(racine), "atelier");
});

test("un renommage qui ne dit plus rien est refusé, et le nom retenu reste", (t) => {
  const racine = repertoireTemporaire(t);
  nomDeLaStation(racine, {}, () => "parade-box");
  assert.throws(() => renommerLaStation(racine, " !! "), /nom de station invalide/);
  assert.equal(nomDeLaStation(racine, {}, () => "autre"), "parade-box");
});

test("BRIGADE_STATION_NOM prime sans rien écrire ; un nom retenu illisible est repris du nom de la machine", (t) => {
  const racine = repertoireTemporaire(t);
  assert.equal(nomDeLaStation(racine, { BRIGADE_STATION_NOM: "box" }, () => "parade-box"), "box");
  assert.equal(lireNomRetenu(racine), null);
  mkdirSync(racine, { recursive: true });
  writeFileSync(join(racine, FICHIER_NOM), "pas du json");
  assert.equal(nomDeLaStation(racine, {}, () => "parade-box"), "parade-box");
  assert.equal(lireNomRetenu(racine), "parade-box");
});

test("nom.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
