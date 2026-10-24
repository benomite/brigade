// Le bandeau d'une version plus haute (#1528) : la vue jouée devant un pont dont l'avis est celui de
// mise-a-jour/avis.ts, lu dans une liste de releases simulée, et dont la version écartée est gardée dans un
// vrai fichier — comme main.ts les câble. « Version X available — Download », le lien direct du paquet du
// poste, la ligne du premier lancement sur un Mac et sous Windows, la croix qui l'écarte pour cette
// version d'un lancement à l'autre, et rien quand l'app est à jour.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { tenirAccueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { chercherUneMiseAJour, refuser, type Poste } from "../../src/mise-a-jour/avis.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { jouerLaVue, repos } from "../aides/fausse-vue.ts";

const BASE = "https://github.com/benomite/brigade/releases/download";
const PAQUETS = ["Brigade-%V.dmg", "Brigade-Setup-%V.exe", "brigade-%V.apk", "latest-mac.yml"];
const release = (version: string) => ({
  html_url: `https://github.com/benomite/brigade/releases/tag/app-v${version}`,
  assets: PAQUETS.map((nom) => nom.replace("%V", version)).map((nom) => ({ name: nom, browser_download_url: `${BASE}/app-v${version}/${nom}` })),
});
// La liste des releases simulée : les tags `app-v` publiés, et le corps de chaque release.
const github = (versions: string[]): typeof fetch =>
  (async (url: string | URL | Request) => {
    const adresse = String(url);
    if (adresse.endsWith("/git/matching-refs/tags/app-v")) return Response.json(versions.map((v) => ({ ref: `refs/tags/app-v${v}` })));
    const version = decodeURIComponent(adresse.split("/releases/tags/app-v")[1] ?? "");
    return versions.includes(version) ? Response.json(release(version)) : new Response("none", { status: 404 });
  }) as typeof fetch;

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "brigade", dossier: "/tmp/brigade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  accueil: { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } } as ReturnType<ReturnType<typeof tenirAccueil>["faits"]> extends infer T ? Exclude<T, undefined> : never,
});

const fichierNeuf = () => join(mkdtempSync(join(tmpdir(), "bandeau-")), "version-ecartee.json");

// Un lancement de l'app : la version qui tourne, le poste, les releases publiées et le fichier de la version écartée.
async function lancer({ version = "1.4.0", poste = "mac", publiees, fichier = fichierNeuf() }: { version?: string; poste?: Poste; publiees: string[]; fichier?: string }) {
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [],
    avisDeVersion: () => chercherUneMiseAJour({ version, poste, fichier, fetch: github(publiees) }),
    refuserVersion: (ecartee: string) => refuser(fichier, ecartee),
    telechargerVersion: async () => true,
  });
  await repos();
  const lieu = () => vue.element("nouvelle-version");
  const bandeau = () => lieu().children[0];
  const classe = (nom: string) => [...lieu().descendants()].find(({ className }) => className === nom);
  return { vue, lieu, bandeau, classe, fichier };
}

for (const [poste, paquet, indice] of [
  ["mac", "Brigade-1.5.0.dmg", "First open of this unsigned build: right-click Brigade, then Open."],
  ["windows", "Brigade-Setup-1.5.0.exe", "First open of this unsigned build: in SmartScreen, click More info, then Run anyway."],
  ["android", "brigade-1.5.0.apk", undefined],
] as const) {
  test(`${poste} : une version plus haute — « Version 1.5.0 available — Download », le lien direct du paquet, ${indice === undefined ? "sans ligne de premier lancement" : "et la ligne du premier lancement"}`, async () => {
    const { vue, lieu, classe } = await lancer({ poste, publiees: ["1.4.0", "1.5.0"] });
    assert.equal(lieu().hidden, false);
    assert.equal(classe("phrase")?.textContent, "Version 1.5.0 available — Download");
    const lien = classe("telecharger") as unknown as { balise: string; href: string; textContent: string; click(): void };
    assert.equal(lien.balise, "a");
    assert.equal(lien.textContent, "Download");
    assert.equal(lien.href, `${BASE}/app-v1.5.0/${paquet}`);
    assert.doesNotMatch(lien.href, /\/releases\/tag\//);
    assert.equal(classe("indice")?.textContent, indice);
    lien.click();
    await repos();
    assert.deepEqual(vue.dernier("telechargerVersion"), [`${BASE}/app-v1.5.0/${paquet}`]);
  });
}

test("la croix cache le bandeau, et il reste caché au lancement suivant pour la même version", async () => {
  const premier = await lancer({ publiees: ["1.5.0"] });
  const croix = premier.classe("ecarter");
  assert.equal(croix?.balise, "button");
  assert.equal(croix?.ariaLabel, "dismiss version 1.5.0");
  croix?.click();
  await repos();
  assert.equal(premier.lieu().hidden, true);
  assert.equal(premier.lieu().children.length, 0);
  assert.deepEqual(premier.vue.dernier("refuserVersion"), ["1.5.0"]);
  // L'app relancée : le même fichier, la même liste.
  const relance = await lancer({ publiees: ["1.5.0"], fichier: premier.fichier });
  assert.equal(relance.lieu().hidden, true);
  assert.equal(relance.lieu().children.length, 0);
});

test("une version plus haute publiée après l'écart rouvre le bandeau", async () => {
  const premier = await lancer({ publiees: ["1.5.0"] });
  premier.classe("ecarter")?.click();
  await repos();
  const relance = await lancer({ publiees: ["1.5.0", "1.6.0"], fichier: premier.fichier });
  assert.equal(relance.lieu().hidden, false);
  assert.equal(relance.classe("phrase")?.textContent, "Version 1.6.0 available — Download");
  // Et sans relancer : la vérification suivante le pousse à la vue.
  premier.vue.dire("surAvisDeVersion", await chercherUneMiseAJour({ version: "1.4.0", poste: "mac", fichier: premier.fichier, fetch: github(["1.5.0", "1.6.0"]) }));
  assert.equal(premier.lieu().hidden, false);
  assert.equal(premier.classe("phrase")?.textContent, "Version 1.6.0 available — Download");
});

test("l'app sur la dernière version, ou en avance : aucun bandeau", async () => {
  for (const version of ["1.5.0", "1.6.0"]) {
    const { lieu, bandeau } = await lancer({ version, publiees: ["1.4.0", "1.5.0"] });
    assert.equal(lieu().hidden, true);
    assert.equal(bandeau(), undefined);
  }
});

test("une vérification qui ne trouve plus rien retire le bandeau", async () => {
  const { vue, lieu } = await lancer({ publiees: ["1.5.0"] });
  assert.equal(lieu().hidden, false);
  vue.dire("surAvisDeVersion", undefined);
  assert.equal(lieu().hidden, true);
  assert.equal(lieu().children.length, 0);
});
