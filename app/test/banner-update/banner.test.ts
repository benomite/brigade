// La ligne d'une version plus haute (#1528, #2431) : la vue jouée devant un pont dont l'avis est celui de
// update/opinion.ts, lu dans une liste de releases simulée, et dont l'état de la mise à jour est celui de
// mise-a-jour/etat.ts — comme main.ts les câble. « Brigade 1.4.0 is running — 1.5.0 is out », puis où en est la
// mise à jour ou le lien direct du paquet du poste ; rien ne l'écarte, et rien quand l'app est à jour.
import assert from "node:assert/strict";
import { test } from "node:test";
import { holdHome } from "../../src/home.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { searchOneUpdate, type Workstation } from "../../src/update/opinion.ts";
import type { StateOfUpdate } from "../../src/update/state.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { playTheVue, repos } from "../helpers/false-vue.ts";

const BASE = "https://github.com/benomite/brigade/releases/download";
const PACKAGES = ["Brigade-%V.dmg", "Brigade-Setup-%V.exe", "brigade-%V.apk", "latest-mac.yml"];
const release = (version: string) => ({
  html_url: `https://github.com/benomite/brigade/releases/tag/app-v${version}`,
  assets: PACKAGES.map((name) => name.replace("%V", version)).map((name) => ({ name: name, browser_download_url: `${BASE}/app-v${version}/${name}` })),
});
// La liste des releases simulée : les tags `app-v` publiés, et le corps de chaque release.
const github = (versions: string[]): typeof fetch =>
  (async (url: string | URL | Request) => {
    const address = String(url);
    if (address.endsWith("/git/matching-refs/tags/app-v")) return Response.json(versions.map((v) => ({ ref: `refs/tags/app-v${v}` })));
    const version = decodeURIComponent(address.split("/releases/tags/app-v")[1] ?? "");
    return versions.includes(version) ? Response.json(release(version)) : new Response("none", { status: 404 });
  }) as typeof fetch;

const startup = (update?: StateOfUpdate) => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "brigade", dossier: "/tmp/brigade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
  accueil: { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } } as ReturnType<ReturnType<typeof holdHome>["faits"]> extends infer T ? Exclude<T, undefined> : never,
  ...(update === undefined ? {} : { miseAJour: update }),
});

// Un lancement de l'app : la version qui tourne, le poste, les releases publiées et l'état de sa mise à jour au démarrage.
async function launch({ version = "1.4.0", poste: workstation = "mac", publiees: published, miseAJour: update, installer }: { version?: string; poste?: Workstation; publiees: string[]; miseAJour?: StateOfUpdate; installer?: () => { refus: string } | undefined }) {
  const vue = await playTheVue({
    demarrage: () => startup(update),
    espace: () => [],
    avisDeVersion: () => searchOneUpdate({ version, poste: workstation, fetch: github(published) }),
    telechargerVersion: async () => true,
    installerMiseAJour: async () => installer?.(),
  });
  await repos();
  const place = () => vue.element("nouvelle-version");
  const banner = () => place().children[0];
  const classe = (name: string) => [...place().descendants()].find(({ className }) => className === name);
  const sentence = () => classe("phrase")?.textContent;
  return { vue, lieu: place, bandeau: banner, classe, phrase: sentence };
}

for (const [workstation, pkg, hint] of [
  ["mac", "Brigade-1.5.0.dmg", "First open of this unsigned build: right-click Brigade, then Open."],
  ["windows", "Brigade-Setup-1.5.0.exe", "First open of this unsigned build: in SmartScreen, click More info, then Run anyway."],
  ["android", "brigade-1.5.0.apk", undefined],
] as const) {
  test(`${workstation} : une version plus haute — une ligne, la version qui tourne et la dernière, le lien direct du paquet${hint === undefined ? "" : " et le premier lancement au survol"}`, async () => {
    const { vue, lieu: place, phrase: sentence, classe, bandeau: banner } = await launch({ poste: workstation, publiees: ["1.4.0", "1.5.0"] });
    assert.equal(place().hidden, false);
    assert.equal(sentence(), "Brigade 1.4.0 is running — 1.5.0 is out — Download");
    // Une seule ligne : la phrase, rien dessous, et pas de croix.
    assert.equal(banner()?.children.length, 1);
    assert.equal(classe("ecarter"), undefined);
    assert.equal(classe("indice"), undefined);
    const link = classe("telecharger") as unknown as { balise: string; href: string; textContent: string; title: string; click(): void };
    assert.equal(link.balise, "a");
    assert.equal(link.textContent, "Download");
    assert.equal(link.href, `${BASE}/app-v1.5.0/${pkg}`);
    assert.doesNotMatch(link.href, /\/releases\/tag\//);
    assert.equal(link.title, [`download ${pkg} in your browser`, ...(hint === undefined ? [] : [hint])].join(" — "));
    link.click();
    await repos();
    assert.deepEqual(vue.dernier("telechargerVersion"), [`${BASE}/app-v1.5.0/${pkg}`]);
  });
}

test("la ligne suit la mise à jour de l'app installée : téléchargement, prête avec « Update now », installation", async () => {
  const { vue, phrase: sentence, classe } = await launch({ publiees: ["1.5.0"], miseAJour: { etat: "telechargement", version: "1.4.0", nouvelle: "1.5.0", recus: 40, taille: 100 } });
  assert.equal(sentence(), "Brigade 1.4.0 is running — 1.5.0 is out · downloading 1.5.0, 40 %");
  assert.equal(classe("telecharger"), undefined);
  vue.dire("surMiseAJour", { etat: "prete", version: "1.4.0", nouvelle: "1.5.0" });
  assert.equal(sentence(), "Brigade 1.4.0 is running — 1.5.0 is out · 1.5.0 is downloaded: it installs at the next launch");
  const installer = [...vue.element("nouvelle-version").descendants()].find(({ textContent, balise }) => balise === "button" && textContent === "Update now");
  assert.ok(installer, "« Update now » est sur la ligne");
  assert.equal(installer.className, "recommande");
  installer.click();
  await repos();
  assert.deepEqual(vue.dernier("installerMiseAJour"), []);
  vue.dire("surMiseAJour", { etat: "installation", version: "1.4.0", nouvelle: "1.5.0" });
  assert.equal(sentence(), "Brigade 1.4.0 is running — 1.5.0 is out · installing 1.5.0 — the app relaunches itself…");
  assert.equal(updateNow(vue), undefined);
});

const updateNow = (vue: Awaited<ReturnType<typeof launch>>["vue"]) => [...vue.element("nouvelle-version").descendants()].find(({ textContent, balise }) => balise === "button" && textContent === "Update now");

test("« Update now » cliqué pendant le téléchargement de la dernière version : la ligne dit sa progression et qu'elle s'installera à la fin, sans second clic (#4494)", async () => {
  // L'installation ne rend rien tant que le téléchargement n'est pas fini : l'app se ferme alors.
  let finish: (rendered: undefined) => void = () => undefined;
  const vue = await playTheVue({
    demarrage: () => startup({ etat: "telechargement", version: "1.0.424", nouvelle: "1.0.428", recus: 40, taille: 100 }),
    espace: () => [],
    avisDeVersion: () => searchOneUpdate({ version: "1.0.424", poste: "mac", fetch: github(["1.0.425", "1.0.428"]) }),
    telechargerVersion: async () => true,
    installerMiseAJour: () => new Promise<undefined>((resolve) => (finish = resolve)),
  });
  await repos();
  const sentence = () => [...vue.element("nouvelle-version").descendants()].find(({ className }) => className === "phrase")?.textContent;
  assert.equal(sentence(), "Brigade 1.0.424 is running — 1.0.428 is out · downloading 1.0.428, 40 %");
  const button = updateNow(vue);
  assert.ok(button, "« Update now » est offert pendant le téléchargement");
  button.click();
  await repos();
  assert.deepEqual(vue.dernier("installerMiseAJour"), []);
  assert.equal(sentence(), "Brigade 1.0.424 is running — 1.0.428 is out · downloading 1.0.428, 40 % — it installs as soon as it is downloaded, then the app relaunches itself");
  assert.equal(updateNow(vue), undefined, "pas de second clic à faire");
  vue.dire("surMiseAJour", { etat: "telechargement", version: "1.0.424", nouvelle: "1.0.428", recus: 90, taille: 100 });
  assert.equal(sentence(), "Brigade 1.0.424 is running — 1.0.428 is out · downloading 1.0.428, 90 % — it installs as soon as it is downloaded, then the app relaunches itself");
  vue.dire("surMiseAJour", { etat: "installation", version: "1.0.424", nouvelle: "1.0.428" });
  finish(undefined);
  await repos();
  assert.equal(sentence(), "Brigade 1.0.424 is running — 1.0.428 is out · installing 1.0.428 — the app relaunches itself…");
});

test("« Update now » refusé : la ligne dit pourquoi, à la place de ce qu'elle disait", async () => {
  const { lieu: place, phrase: sentence } = await launch({ publiees: ["1.5.0"], miseAJour: { etat: "prete", version: "1.4.0", nouvelle: "1.5.0" }, installer: () => ({ refus: "the update is not ready to install" }) });
  [...place().descendants()].find(({ textContent, balise }) => balise === "button" && textContent === "Update now")?.click();
  await repos();
  assert.equal(sentence(), "Brigade 1.4.0 is running — 1.5.0 is out · the update is not ready to install");
});

test("une mise à jour en échec : la ligne le dit, la raison au survol, et donne le lien Download", async () => {
  const { phrase: sentence, classe } = await launch({ publiees: ["1.5.0"], miseAJour: { etat: "erreur", version: "1.4.0", nouvelle: "1.5.0", raison: "the update 1.5.0 could not be downloaded: the server answered 502" } });
  assert.equal(sentence(), "Brigade 1.4.0 is running — 1.5.0 is out · it could not update itself — Download");
  assert.equal(classe("phrase")?.title, "the update 1.5.0 could not be downloaded: the server answered 502");
  assert.ok(classe("telecharger"));
});

test("une release sans latest-mac.yml : la mise à jour se dit à jour, la ligne reste et donne le lien Download", async () => {
  const { phrase: sentence } = await launch({ publiees: ["1.5.0"], miseAJour: { etat: "a-jour", version: "1.4.0", verifieeLe: "2026-11-05T10:40:00.000Z" } });
  assert.equal(sentence(), "Brigade 1.4.0 is running — 1.5.0 is out — Download");
});

test("1.0.425 téléchargée, 1.0.428 sortie : la ligne ne nomme que 1.0.428, et « Update now » va la chercher (#4494)", async () => {
  const { vue, phrase: sentence } = await launch({ version: "1.0.424", publiees: ["1.0.425", "1.0.428"], miseAJour: { etat: "prete", version: "1.0.424", nouvelle: "1.0.425" } });
  assert.equal(sentence(), "Brigade 1.0.424 is running — 1.0.428 is out");
  const button = updateNow(vue);
  assert.ok(button, "« Update now » est sur la ligne");
  assert.ok([...vue.element("nouvelle-version").descendants()].some(({ ariaLabel }) => /relaunches it on 1\.0\.428$/.test(String(ariaLabel ?? ""))), "son prix nomme 1.0.428");
  // Pendant le téléchargement d'une version moins haute, pas davantage.
  vue.dire("surMiseAJour", { etat: "telechargement", version: "1.0.424", nouvelle: "1.0.425", recus: 40, taille: 100 });
  assert.equal(sentence(), "Brigade 1.0.424 is running — 1.0.428 is out");
  // La mise à jour passe à 1.0.428 : la ligne dit où elle en est.
  vue.dire("surMiseAJour", { etat: "telechargement", version: "1.0.424", nouvelle: "1.0.428", recus: 40, taille: 100 });
  assert.equal(sentence(), "Brigade 1.0.424 is running — 1.0.428 is out · downloading 1.0.428, 40 %");
});

test("sans avis, la mise à jour qui a trouvé une version plus haute suffit à poser la ligne", async () => {
  const { phrase: sentence } = await launch({ publiees: [], miseAJour: { etat: "disponible", version: "1.4.0", nouvelle: "1.5.0" } });
  assert.equal(sentence(), "Brigade 1.4.0 is running — 1.5.0 is out · downloading 1.5.0");
});

test("une version plus haute publiée pendant que l'app tourne : la vérification suivante la pousse à la ligne", async () => {
  const { vue, lieu: place, phrase: sentence } = await launch({ publiees: ["1.5.0"] });
  vue.dire("surAvisDeVersion", await searchOneUpdate({ version: "1.4.0", poste: "mac", fetch: github(["1.5.0", "1.6.0"]) }));
  assert.equal(place().hidden, false);
  assert.equal(sentence(), "Brigade 1.4.0 is running — 1.6.0 is out — Download");
});

test("l'app sur la dernière version, ou en avance : aucune ligne", async () => {
  for (const version of ["1.5.0", "1.6.0"]) {
    const { lieu: place, bandeau: banner } = await launch({ version, publiees: ["1.4.0", "1.5.0"], miseAJour: { etat: "a-jour", version, verifieeLe: "2026-11-05T10:40:00.000Z" } });
    assert.equal(place().hidden, true);
    assert.equal(banner(), undefined);
  }
});

test("une vérification qui ne trouve plus rien retire la ligne", async () => {
  const { vue, lieu: place } = await launch({ publiees: ["1.5.0"] });
  assert.equal(place().hidden, false);
  vue.dire("surAvisDeVersion", undefined);
  assert.equal(place().hidden, true);
  assert.equal(place().children.length, 0);
});
