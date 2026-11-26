// La ligne d'une version plus haute (#1528, #2431) : la vue jouée devant un pont dont l'avis est celui de
// update/opinion.ts, lu dans une liste de releases simulée, et dont l'état de la mise à jour est celui de
// mise-a-jour/etat.ts — comme main.ts les câble. « Brigade 1.4.0 is running — 1.5.0 is out », puis où en est la
// mise à jour ou le lien direct du paquet du poste ; rien ne l'écarte, et rien quand l'app est à jour.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdHome } from "../../src/home.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { chercherUneUpdate, type Workstation } from "../../src/update/opinion.ts";
import type { StateDeUpdate } from "../../src/update/state.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { jouerLaVue, repos } from "../aides/fausse-vue.ts";

const BASE = "https://github.com/benomite/brigade/releases/download";
const PAQUETS = ["Brigade-%V.dmg", "Brigade-Setup-%V.exe", "brigade-%V.apk", "latest-mac.yml"];
const release = (version: string) => ({
  html_url: `https://github.com/benomite/brigade/releases/tag/app-v${version}`,
  assets: PAQUETS.map((name) => name.replace("%V", version)).map((name) => ({ name: name, browser_download_url: `${BASE}/app-v${version}/${name}` })),
});
// La liste des releases simulée : les tags `app-v` publiés, et le corps de chaque release.
const github = (versions: string[]): typeof fetch =>
  (async (url: string | URL | Request) => {
    const adresse = String(url);
    if (adresse.endsWith("/git/matching-refs/tags/app-v")) return Response.json(versions.map((v) => ({ ref: `refs/tags/app-v${v}` })));
    const version = decodeURIComponent(adresse.split("/releases/tags/app-v")[1] ?? "");
    return versions.includes(version) ? Response.json(release(version)) : new Response("none", { status: 404 });
  }) as typeof fetch;

const demarrage = (update?: StateDeUpdate) => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "brigade", dossier: "/tmp/brigade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  accueil: { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } } as ReturnType<ReturnType<typeof holdHome>["faits"]> extends infer T ? Exclude<T, undefined> : never,
  ...(update === undefined ? {} : { miseAJour: update }),
});

// Un lancement de l'app : la version qui tourne, le poste, les releases publiées et l'état de sa mise à jour au démarrage.
async function lancer({ version = "1.4.0", poste: workstation = "mac", publiees, miseAJour: update, installer }: { version?: string; poste?: Workstation; publiees: string[]; miseAJour?: StateDeUpdate; installer?: () => { refus: string } | undefined }) {
  const vue = await jouerLaVue({
    demarrage: () => demarrage(update),
    espace: () => [],
    avisDeVersion: () => chercherUneUpdate({ version, poste: workstation, fetch: github(publiees) }),
    telechargerVersion: async () => true,
    installerMiseAJour: async () => installer?.(),
  });
  await repos();
  const lieu = () => vue.element("nouvelle-version");
  const banner = () => lieu().children[0];
  const classe = (name: string) => [...lieu().descendants()].find(({ className }) => className === name);
  const phrase = () => classe("phrase")?.textContent;
  return { vue, lieu, bandeau: banner, classe, phrase };
}

for (const [workstation, paquet, indice] of [
  ["mac", "Brigade-1.5.0.dmg", "First open of this unsigned build: right-click Brigade, then Open."],
  ["windows", "Brigade-Setup-1.5.0.exe", "First open of this unsigned build: in SmartScreen, click More info, then Run anyway."],
  ["android", "brigade-1.5.0.apk", undefined],
] as const) {
  test(`${workstation} : une version plus haute — une ligne, la version qui tourne et la dernière, le lien direct du paquet${indice === undefined ? "" : " et le premier lancement au survol"}`, async () => {
    const { vue, lieu, phrase, classe, bandeau: banner } = await lancer({ poste: workstation, publiees: ["1.4.0", "1.5.0"] });
    assert.equal(lieu().hidden, false);
    assert.equal(phrase(), "Brigade 1.4.0 is running — 1.5.0 is out — Download");
    // Une seule ligne : la phrase, rien dessous, et pas de croix.
    assert.equal(banner()?.children.length, 1);
    assert.equal(classe("ecarter"), undefined);
    assert.equal(classe("indice"), undefined);
    const lien = classe("telecharger") as unknown as { balise: string; href: string; textContent: string; title: string; click(): void };
    assert.equal(lien.balise, "a");
    assert.equal(lien.textContent, "Download");
    assert.equal(lien.href, `${BASE}/app-v1.5.0/${paquet}`);
    assert.doesNotMatch(lien.href, /\/releases\/tag\//);
    assert.equal(lien.title, [`download ${paquet} in your browser`, ...(indice === undefined ? [] : [indice])].join(" — "));
    lien.click();
    await repos();
    assert.deepEqual(vue.dernier("telechargerVersion"), [`${BASE}/app-v1.5.0/${paquet}`]);
  });
}

test("la ligne suit la mise à jour de l'app installée : téléchargement, prête avec « Update now », installation", async () => {
  const { vue, phrase, classe } = await lancer({ publiees: ["1.5.0"], miseAJour: { etat: "telechargement", version: "1.4.0", nouvelle: "1.5.0", recus: 40, taille: 100 } });
  assert.equal(phrase(), "Brigade 1.4.0 is running — 1.5.0 is out · downloading it, 40 %");
  assert.equal(classe("telecharger"), undefined);
  vue.dire("surMiseAJour", { etat: "prete", version: "1.4.0", nouvelle: "1.5.0" });
  assert.equal(phrase(), "Brigade 1.4.0 is running — 1.5.0 is out · it is downloaded: it installs at the next launch");
  const installer = [...vue.element("nouvelle-version").descendants()].find(({ textContent, balise }) => balise === "button" && textContent === "Update now");
  assert.ok(installer, "« Update now » est sur la ligne");
  assert.equal(installer.className, "recommande");
  installer.click();
  await repos();
  assert.deepEqual(vue.dernier("installerMiseAJour"), []);
  vue.dire("surMiseAJour", { etat: "installation", version: "1.4.0", nouvelle: "1.5.0" });
  assert.equal(phrase(), "Brigade 1.4.0 is running — 1.5.0 is out · installing it — the app relaunches itself…");
});

test("« Update now » refusé : la ligne dit pourquoi, à la place de ce qu'elle disait", async () => {
  const { lieu, phrase } = await lancer({ publiees: ["1.5.0"], miseAJour: { etat: "prete", version: "1.4.0", nouvelle: "1.5.0" }, installer: () => ({ refus: "the update is not ready to install" }) });
  [...lieu().descendants()].find(({ textContent, balise }) => balise === "button" && textContent === "Update now")?.click();
  await repos();
  assert.equal(phrase(), "Brigade 1.4.0 is running — 1.5.0 is out · the update is not ready to install");
});

test("une mise à jour en échec : la ligne le dit, la raison au survol, et donne le lien Download", async () => {
  const { phrase, classe } = await lancer({ publiees: ["1.5.0"], miseAJour: { etat: "erreur", version: "1.4.0", nouvelle: "1.5.0", raison: "the update 1.5.0 could not be downloaded: the server answered 502" } });
  assert.equal(phrase(), "Brigade 1.4.0 is running — 1.5.0 is out · it could not update itself — Download");
  assert.equal(classe("phrase")?.title, "the update 1.5.0 could not be downloaded: the server answered 502");
  assert.ok(classe("telecharger"));
});

test("une release sans latest-mac.yml : la mise à jour se dit à jour, la ligne reste et donne le lien Download", async () => {
  const { phrase } = await lancer({ publiees: ["1.5.0"], miseAJour: { etat: "a-jour", version: "1.4.0", verifieeLe: "2026-11-05T10:40:00.000Z" } });
  assert.equal(phrase(), "Brigade 1.4.0 is running — 1.5.0 is out — Download");
});

test("la mise à jour porte une version moins haute que la dernière : la ligne la nomme", async () => {
  const { phrase } = await lancer({ publiees: ["1.5.0", "1.6.0"], miseAJour: { etat: "prete", version: "1.4.0", nouvelle: "1.5.0" } });
  assert.equal(phrase(), "Brigade 1.4.0 is running — 1.6.0 is out · 1.5.0 is downloaded: it installs at the next launch");
});

test("sans avis, la mise à jour qui a trouvé une version plus haute suffit à poser la ligne", async () => {
  const { phrase } = await lancer({ publiees: [], miseAJour: { etat: "disponible", version: "1.4.0", nouvelle: "1.5.0" } });
  assert.equal(phrase(), "Brigade 1.4.0 is running — 1.5.0 is out · downloading it");
});

test("une version plus haute publiée pendant que l'app tourne : la vérification suivante la pousse à la ligne", async () => {
  const { vue, lieu, phrase } = await lancer({ publiees: ["1.5.0"] });
  vue.dire("surAvisDeVersion", await chercherUneUpdate({ version: "1.4.0", poste: "mac", fetch: github(["1.5.0", "1.6.0"]) }));
  assert.equal(lieu().hidden, false);
  assert.equal(phrase(), "Brigade 1.4.0 is running — 1.6.0 is out — Download");
});

test("l'app sur la dernière version, ou en avance : aucune ligne", async () => {
  for (const version of ["1.5.0", "1.6.0"]) {
    const { lieu, bandeau: banner } = await lancer({ version, publiees: ["1.4.0", "1.5.0"], miseAJour: { etat: "a-jour", version, verifieeLe: "2026-11-05T10:40:00.000Z" } });
    assert.equal(lieu().hidden, true);
    assert.equal(banner(), undefined);
  }
});

test("une vérification qui ne trouve plus rien retire la ligne", async () => {
  const { vue, lieu } = await lancer({ publiees: ["1.5.0"] });
  assert.equal(lieu().hidden, false);
  vue.dire("surAvisDeVersion", undefined);
  assert.equal(lieu().hidden, true);
  assert.equal(lieu().children.length, 0);
});
