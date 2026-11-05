// La liste des projets que la station d'un ordinateur sert sur GitHub seul
// (`station-ordinateur/projets-servis.ts`, #2357) : vide sur une installation
// neuve, lue et écrite par son interface et par sa commande, et gardée sur le
// disque d'un démarrage à l'autre.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ajouterProjetServi, cheminDesProjetsServis, DepotRefuse, lireProjetsServis, ProjetsServisIllisibles, retirerProjetServi } from "../../src/station-ordinateur/projets-servis.ts";
import { CACHE_DE_COMPILATION, ENV_ENFANT, repertoireTemporaire } from "../outils.ts";

const CLI = join(import.meta.dirname, "../../src/station-ordinateur/cli.ts");

function commande(racine: string, ...args: string[]): Promise<{ code: number; sortie: string; erreur: string }> {
  return new Promise((resoudre) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...ENV_ENFANT, ...CACHE_DE_COMPILATION, BRIGADE_STATION_DIR: racine }, encoding: "utf8" }, (erreur, sortie, erreurs) => {
      resoudre({ code: erreur === null ? 0 : Number(erreur.code), sortie, erreur: erreurs });
    });
  });
}

test("a fresh install has an empty list: the interface and the command both read []", async (t) => {
  const racine = repertoireTemporaire(t);
  assert.deepEqual(lireProjetsServis(racine), []);
  const lue = await commande(racine, "list");
  assert.equal(lue.code, 0, lue.erreur);
  assert.deepEqual(JSON.parse(lue.sortie), []);
});

test("a project added then removed through the interface is written to disk, and read again as a restarted station would", (t) => {
  const racine = repertoireTemporaire(t);
  assert.deepEqual(ajouterProjetServi(racine, "acme/shop"), ["acme/shop"]);
  // Le même dépôt, autrement écrit, n'entre pas deux fois.
  assert.deepEqual(ajouterProjetServi(racine, "https://github.com/ACME/shop.git"), ["acme/shop"]);
  assert.deepEqual(ajouterProjetServi(racine, "acme/widgets"), ["acme/shop", "acme/widgets"]);
  // Ce qu'une station redémarrée lit : le fichier, rien d'autre.
  assert.deepEqual(JSON.parse(readFileSync(cheminDesProjetsServis(racine), "utf8")).depots, ["acme/shop", "acme/widgets"]);
  assert.deepEqual(lireProjetsServis(racine), ["acme/shop", "acme/widgets"]);
  assert.deepEqual(retirerProjetServi(racine, "Acme/Shop"), ["acme/widgets"]);
  assert.deepEqual(lireProjetsServis(racine), ["acme/widgets"]);
  assert.deepEqual(retirerProjetServi(racine, "acme/widgets"), []);
  assert.deepEqual(lireProjetsServis(racine), []);
});

test("a repository that gives no project, or an unreadable list, is refused without guessing", (t) => {
  const racine = repertoireTemporaire(t);
  for (const brut of ["shop", "acme/", "a/b/c", "acme/___"]) assert.throws(() => ajouterProjetServi(racine, brut), DepotRefuse, brut);
  assert.deepEqual(lireProjetsServis(racine), []);
  writeFileSync(cheminDesProjetsServis(racine), "{ pas du json");
  assert.throws(() => lireProjetsServis(racine), ProjetsServisIllisibles);
  writeFileSync(cheminDesProjetsServis(racine), JSON.stringify({ brigade: "projets-servis", format: 2, depots: [] }));
  assert.throws(() => lireProjetsServis(racine), /format 2/);
});

// Un process par test : chacun coûte le démarrage de Node.
test("the command adds a project to the list", async (t) => {
  const racine = repertoireTemporaire(t);
  const ajoute = await commande(racine, "add", "acme/shop");
  assert.equal(ajoute.code, 0, ajoute.erreur);
  assert.deepEqual(JSON.parse(ajoute.sortie), ["acme/shop"]);
  assert.deepEqual(lireProjetsServis(racine), ["acme/shop"]);
});

test("the command removes a project from the list", async (t) => {
  const racine = repertoireTemporaire(t);
  ajouterProjetServi(racine, "acme/shop");
  const retire = await commande(racine, "remove", "acme/shop");
  assert.equal(retire.code, 0, retire.erreur);
  assert.deepEqual(JSON.parse(retire.sortie), []);
  assert.deepEqual(lireProjetsServis(racine), []);
});

test("the command refuses a repository that gives no project, and writes nothing", async (t) => {
  const racine = repertoireTemporaire(t);
  const refuse = await commande(racine, "add", "shop");
  assert.equal(refuse.code, 2);
  assert.match(refuse.erreur, /not a GitHub repository this station can serve/);
  assert.deepEqual(lireProjetsServis(racine), []);
});
