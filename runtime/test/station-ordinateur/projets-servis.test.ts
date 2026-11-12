// La liste des projets qu'une station sert (`station-ordinateur/projets-servis.ts`) :
// vide sur une installation neuve, lue et écrite par son interface et par sa
// commande, et gardée sur le disque d'un démarrage à l'autre. Depuis #3402,
// c'est le fichier de configuration de la station, `projets` — sa seule liste :
// l'ancienne, `projets-servis.json` (#2357), y passe, puis est mise de côté.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DEBUT, FIN } from "../../src/projets/bloc.ts";
import { ajouterProjetServi, ANCIENNE_LISTE_MIGREE, cheminDeLAncienneListe, cheminDesProjetsServis, DepotRefuse, lireProjetsServis, migrerLAncienneListe, ProjetsServisIllisibles, retirerProjetServi } from "../../src/station-ordinateur/projets-servis.ts";
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
  // Ce qu'une station redémarrée lit : sa configuration, une ligne par projet, rien d'autre.
  assert.equal(readFileSync(cheminDesProjetsServis(racine), "utf8"), "shop acme/shop\nwidgets acme/widgets\n");
  assert.equal(existsSync(cheminDeLAncienneListe(racine)), false);
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
  // Une ancienne liste illisible n'est ni migrée ni mise de côté : rien n'est écrit.
  writeFileSync(cheminDeLAncienneListe(racine), "{ pas du json");
  assert.throws(() => lireProjetsServis(racine), ProjetsServisIllisibles);
  writeFileSync(cheminDeLAncienneListe(racine), JSON.stringify({ brigade: "projets-servis", format: 2, depots: [] }));
  assert.throws(() => lireProjetsServis(racine), /format 2/);
  assert.throws(() => ajouterProjetServi(racine, "acme/shop"), /format 2/);
  assert.equal(existsSync(cheminDesProjetsServis(racine)), false);
});

test("a configuration that cannot be read is refused, and nothing is written over it", (t) => {
  const racine = repertoireTemporaire(t);
  // Un répertoire à la place du fichier : il ne se lit pas.
  mkdirSync(cheminDesProjetsServis(racine));
  assert.throws(() => lireProjetsServis(racine), ProjetsServisIllisibles);
  assert.throws(() => ajouterProjetServi(racine, "acme/shop"), ProjetsServisIllisibles);
  assert.throws(() => retirerProjetServi(racine, "acme/shop"), ProjetsServisIllisibles);
});

test("an added project gets its line before the station's block; a removed one loses its line, in the block or out of it", (t) => {
  const racine = repertoireTemporaire(t);
  writeFileSync(cheminDesProjetsServis(racine), `# à la main\nbrigade acme/brigade v2\n\n${DEBUT}\nweb acme/web main\n${FIN}\n`);
  assert.deepEqual(lireProjetsServis(racine), ["acme/brigade", "acme/web"]);
  assert.deepEqual(ajouterProjetServi(racine, "acme/shop"), ["acme/brigade", "acme/shop", "acme/web"]);
  assert.equal(readFileSync(cheminDesProjetsServis(racine), "utf8"), `# à la main\nbrigade acme/brigade v2\nshop acme/shop\n\n${DEBUT}\nweb acme/web main\n${FIN}\n`);
  // Déjà servi, par une ligne de la station : rien ne change.
  assert.deepEqual(ajouterProjetServi(racine, "ACME/web"), ["acme/brigade", "acme/shop", "acme/web"]);
  // Retiré, qu'il soit dans le bloc ou hors de lui.
  assert.deepEqual(retirerProjetServi(racine, "acme/web"), ["acme/brigade", "acme/shop"]);
  assert.deepEqual(retirerProjetServi(racine, "Acme/Brigade"), ["acme/shop"]);
  assert.equal(readFileSync(cheminDesProjetsServis(racine), "utf8"), `# à la main\nshop acme/shop\n\n${DEBUT}\n${FIN}\n`);
  // Un dépôt qui n'y est pas : rien n'est écrit.
  assert.deepEqual(retirerProjetServi(racine, "acme/absent"), ["acme/shop"]);
});

test("a repository whose name is already another project of the station is refused, in plain words", (t) => {
  const racine = repertoireTemporaire(t);
  ajouterProjetServi(racine, "acme/shop");
  assert.throws(() => ajouterProjetServi(racine, "other/shop"), (erreur: Error) => erreur instanceof DepotRefuse && /already serves a project named shop, from acme\/shop/.test(erreur.message));
  assert.deepEqual(lireProjetsServis(racine), ["acme/shop"]);
});

test("the old projets-servis.json list is merged into the configuration once, then set aside and never read again", (t) => {
  const racine = repertoireTemporaire(t);
  writeFileSync(cheminDesProjetsServis(racine), `brigade acme/brigade v2\n${DEBUT}\nweb acme/web main\n${FIN}\n`);
  writeFileSync(cheminDeLAncienneListe(racine), JSON.stringify({ brigade: "projets-servis", format: 1, depots: ["acme/shop", "ACME/web", "other/brigade", "acme/widgets"] }));
  const migration = migrerLAncienneListe(racine);
  // Ce qui y était déjà n'entre pas deux fois ; un nom pris par un autre dépôt est écarté, et dit.
  assert.deepEqual(migration.migres, ["acme/shop", "acme/widgets"]);
  assert.deepEqual(migration.ecartes.map(({ depot }) => depot), ["other/brigade"]);
  assert.match(migration.ecartes[0]?.pourquoi ?? "", /already serves a project named brigade/);
  assert.equal(readFileSync(cheminDesProjetsServis(racine), "utf8"), `brigade acme/brigade v2\nshop acme/shop\nwidgets acme/widgets\n${DEBUT}\nweb acme/web main\n${FIN}\n`);
  assert.equal(existsSync(cheminDeLAncienneListe(racine)), false);
  assert.ok(existsSync(join(racine, ANCIENNE_LISTE_MIGREE)), "the old list is kept aside, under another name");
  // Une seule liste : la lecture rend celle de la configuration, et une seconde migration ne fait rien.
  assert.deepEqual(lireProjetsServis(racine), ["acme/brigade", "acme/shop", "acme/widgets", "acme/web"]);
  assert.deepEqual(migrerLAncienneListe(racine), { migres: [], ecartes: [] });
  // Un projet retiré ne revient pas de l'ancienne liste.
  retirerProjetServi(racine, "acme/shop");
  assert.deepEqual(lireProjetsServis(racine), ["acme/brigade", "acme/widgets", "acme/web"]);
});

test("reading the list migrates the old one: a project the station served from projets-servis.json is still served", (t) => {
  const racine = repertoireTemporaire(t);
  writeFileSync(cheminDeLAncienneListe(racine), JSON.stringify({ brigade: "projets-servis", format: 1, depots: ["acme/shop"] }));
  assert.deepEqual(lireProjetsServis(racine), ["acme/shop"]);
  assert.equal(readFileSync(cheminDesProjetsServis(racine), "utf8"), "shop acme/shop\n");
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
