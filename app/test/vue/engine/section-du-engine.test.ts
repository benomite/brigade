// La section « Engine » de la page d'une station (#3746) : trois moteurs exactement — l'abonnement Claude, la clé d'API de
// Claude, Codex —, le choix gardé sur cet ordinateur et relu à la réouverture ; la clé d'API dans un champ masqué, gardée à
// part, qui ne revient jamais à l'écran ; un moteur de secours, aucun ou l'un des deux autres. La page est posée par sa
// coque (StationPage.js), soutenue par le vrai magasin de l'app (settings-de-la-station.ts) dans un dossier d'essai.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ouvertADAutres } from "../../../../runtime/src/droits.ts";
import { ecrireSettingsDeLaStation, lireSettingsDeLaStation } from "../../../src/settings-de-la-station.ts";
import { poserPageDeStation } from "../../../src/vue/station/page/StationPage.js";
import { Faux, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const STATION = { id: "gist-mac", nom: "mac/claude" };
const CALCULES = { clone: "/st/clones", worktrees: "/st/worktrees" };
const CLE = "sk-ant-api03-SECRETSECRETSECRET";

const tout = (noeud: Faux): Faux[] => [...noeud.descendants()];
const rangee = (section: Faux, cle: string) => tout(section).find((n) => n.dataset.cle === cle);
const liste = (r: Faux) => tout(r).find((n) => n.balise === "select") ?? assert.fail("pas de liste");
const options = (r: Faux) => liste(r).children.map((o) => [o.value, o.textContent]);
const choisie = (r: Faux) => liste(r).children.find((o) => (o as unknown as { selected?: boolean }).selected)?.value;
const valeur = (r: Faux) => r.children[1]?.textContent ?? "";

function magasin() {
  const dossier = mkdtempSync(join(tmpdir(), "moteur-"));
  const fichier = join(dossier, "station-reglages.json");
  return { dossier, fichier, lire: async () => lireSettingsDeLaStation(fichier, CALCULES), ecrire: async (c: any) => ecrireSettingsDeLaStation(fichier, c) };
}
// La page ouverte — à nouveau à chaque appel : c'est la réouverture des réglages.
async function ouvrir(settings: ReturnType<typeof magasin>, locale = "gist-mac") {
  const page = (await poserPageDeStation(doc, { station: STATION, locale, reglages: settings })) as Faux;
  return page.children.find((s) => s.dataset.section === "moteur") ?? assert.fail("pas de section « Engine »");
}
// Le chef choisit dans une liste : `change`, et le réglage s'applique.
async function choisir(r: Faux, valeurVoulue: string) {
  const select = liste(r);
  select.value = valeurVoulue;
  select.declencher("change");
  await repos();
}

describe("la section « Engine » de la page d'une station (#3746)", () => {
  test("elle est sous son titre, et sa liste offre exactement trois moteurs, l'abonnement choisi tant que rien n'est gardé", async () => {
    const settings = magasin();
    const section = await ouvrir(settings);
    const page = (await poserPageDeStation(doc, { station: STATION, locale: "gist-mac", reglages: settings })) as Faux;
    assert.equal(page.children.find((s) => s.dataset.section === "moteur")?.children[0]?.textContent, "Engine");
    const engine = rangee(section, "moteur") ?? assert.fail("pas de rangée du moteur");
    assert.deepEqual(options(engine), [
      ["claude-subscription", "Claude subscription"],
      ["claude-api-key", "Claude API key"],
      ["codex", "Codex"],
    ]);
    assert.equal(choisie(engine), "claude-subscription");
    assert.match(valeur(engine), /^Claude subscription/);
    assert.equal(tout(engine).filter((n) => n.className === "niveau").map((n) => n.dataset.niveau).join(), "machine");
    assert.equal(rangee(section, "cle-api"), undefined, "pas de champ de clé sans le moteur à clé");
    rmSync(settings.dossier, { recursive: true });
  });

  test("le moteur choisi est gardé, et se relit à la réouverture des réglages", async () => {
    const settings = magasin();
    await choisir(rangee(await ouvrir(settings), "moteur") as Faux, "codex");
    assert.equal(JSON.parse(readFileSync(settings.fichier, "utf8")).engine, "codex");
    const rouverte = await ouvrir(settings);
    assert.equal(choisie(rangee(rouverte, "moteur") as Faux), "codex");
    assert.match(valeur(rangee(rouverte, "moteur") as Faux), /^Codex/);
    rmSync(settings.dossier, { recursive: true });
  });

  test("la clé d'API : un champ masqué ; gardée, elle n'est plus jamais montrée, ni à la réouverture", async () => {
    const settings = magasin();
    const section = await ouvrir(settings);
    await choisir(rangee(section, "moteur") as Faux, "claude-api-key");
    const cle = rangee(section, "cle-api") ?? assert.fail("pas de champ de clé avec la clé d'API");
    const champ = tout(cle).find((n) => n.balise === "input") ?? assert.fail("pas de champ");
    assert.equal(champ.type, "password");
    assert.match(valeur(cle), /not saved yet/);
    champ.value = `  ${CLE}  `;
    champ.declencher("change");
    await repos();
    // Gardée à part, lisible du seul compte, hors du fichier des réglages.
    const fichierDeLaCle = join(settings.dossier, "station-cle-api");
    assert.equal(readFileSync(fichierDeLaCle, "utf8"), CLE);
    // Sous Windows, Node rend toujours 0o666 : c'est l'ACL du fichier qui dit qui le lit, relue par le runtime (#3680).
    if (process.platform === "win32") assert.equal(ouvertADAutres(fichierDeLaCle, "la clé d'API"), null);
    else assert.equal(statSync(fichierDeLaCle).mode & 0o777, 0o600);
    assert.doesNotMatch(readFileSync(settings.fichier, "utf8"), /SECRET/);
    for (const vue of [section, await ouvrir(settings)]) {
      const r = rangee(vue, "cle-api") ?? assert.fail("pas de rangée de la clé");
      assert.match(valeur(r), /•+ saved/);
      assert.ok(tout(vue).every((n) => !String(n.textContent).includes("SECRET") && !String(n.value ?? "").includes("SECRET") && !String(n.placeholder ?? "").includes("SECRET")), "la clé n'est montrée nulle part");
      assert.equal((tout(r).find((n) => n.balise === "input") as Faux).type, "password");
    }
    assert.ok(!JSON.stringify(await settings.lire()).includes("SECRET"), "la lecture ne rend jamais la clé");
    rmSync(settings.dossier, { recursive: true });
  });

  test("une clé qui n'en est pas une ne se garde pas, et le refus se dit sous sa rangée", async () => {
    const settings = magasin();
    await settings.ecrire({ engine: "claude-api-key" });
    const section = await ouvrir(settings);
    const champ = tout(rangee(section, "cle-api") as Faux).find((n) => n.balise === "input") as Faux;
    champ.value = "two words";
    champ.declencher("change");
    await repos();
    assert.match(tout(rangee(section, "cle-api") as Faux).map((n) => n.textContent).join("|"), /not an API key/);
    assert.equal(champ.value, "", "le champ ne garde pas ce qui a été tapé");
    assert.match(valeur(rangee(section, "cle-api") as Faux), /not saved yet/);
    rmSync(settings.dossier, { recursive: true });
  });

  test("le moteur de secours : aucun, ou l'un des deux autres ; gardé et relu ; prendre le secours pour moteur le retire du secours", async () => {
    const settings = magasin();
    const section = await ouvrir(settings);
    const secours = rangee(section, "secours") ?? assert.fail("pas de rangée du secours");
    assert.deepEqual(options(secours), [
      ["", "none"],
      ["claude-api-key", "Claude API key"],
      ["codex", "Codex"],
    ]);
    assert.equal(choisie(secours), "");
    await choisir(secours, "claude-api-key");
    const rouverte = await ouvrir(settings);
    assert.equal(choisie(rangee(rouverte, "secours") as Faux), "claude-api-key");
    // Le secours à clé demande la clé, lui aussi.
    assert.ok(rangee(rouverte, "cle-api"));
    await choisir(rangee(rouverte, "moteur") as Faux, "claude-api-key");
    const apres = await ouvrir(settings);
    assert.equal(choisie(rangee(apres, "moteur") as Faux), "claude-api-key");
    assert.equal(choisie(rangee(apres, "secours") as Faux), "");
    assert.deepEqual(options(rangee(apres, "secours") as Faux).map(([cle]) => cle), ["", "claude-subscription", "codex"]);
    await choisir(rangee(apres, "secours") as Faux, "");
    assert.equal(JSON.parse(readFileSync(settings.fichier, "utf8")).fallbackEngine, null);
    rmSync(settings.dossier, { recursive: true });
  });

  test("le magasin refuse un moteur inconnu ou un secours égal au moteur, et rien n'est changé", () => {
    const settings = magasin();
    assert.ok("refus" in ecrireSettingsDeLaStation(settings.fichier, { engine: "gpt" }));
    assert.ok("refus" in ecrireSettingsDeLaStation(settings.fichier, { fallbackEngine: "claude-subscription" }));
    assert.ok("refus" in ecrireSettingsDeLaStation(settings.fichier, { engine: "codex", fallbackEngine: "codex" }));
    const lus = lireSettingsDeLaStation(settings.fichier, CALCULES);
    assert.ok(!("refus" in lus));
    assert.deepEqual([lus.engine, lus.fallbackEngine, lus.apiKey], [undefined, null, false]);
    rmSync(settings.dossier, { recursive: true });
  });

  test("un fichier de réglages illisible se dit en une ligne, sans liste ; un moteur gardé inconnu se dit tel quel", async () => {
    const settings = magasin();
    writeFileSync(settings.fichier, "{ pas du json");
    const illisible = await ouvrir(settings);
    assert.equal(rangee(illisible, "moteur"), undefined);
    assert.match(illisible.textContent, /could not be read/);
    writeFileSync(settings.fichier, JSON.stringify({ engine: "gpt" }));
    const inconnu = await ouvrir(settings);
    assert.match(valeur(rangee(inconnu, "moteur") as Faux), /“gpt” — an engine this app does not know/);
    assert.equal(choisie(rangee(inconnu, "moteur") as Faux), "gpt");
    rmSync(settings.dossier, { recursive: true });
  });

  test("sur une autre station, rien ne se règle d'ici : une ligne le dit", async () => {
    const settings = magasin();
    const section = await ouvrir(settings, "gist-pc");
    assert.equal(tout(section).filter((n) => n.balise === "select" || n.balise === "input").length, 0);
    assert.match(section.textContent, /not available for this station/);
    rmSync(settings.dossier, { recursive: true });
  });
});
