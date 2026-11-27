// La section « Engine » de la page d'une station (#3746) : trois moteurs exactement — l'abonnement Claude, la clé d'API de
// Claude, Codex —, le choix gardé sur cet ordinateur et relu à la réouverture ; la clé d'API dans un champ masqué, gardée à
// part, qui ne revient jamais à l'écran ; un moteur de secours, aucun ou l'un des deux autres. La page est posée par sa
// coque (StationPage.js), soutenue par le vrai magasin de l'app (settings-of-the-station.ts) dans un dossier d'essai.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ouvertADAutres } from "../../../../runtime/src/droits.ts";
import { writeSettingsOfTheStation, readSettingsOfTheStation } from "../../../src/settings-of-the-station.ts";
import { setPageOfStation } from "../../../src/vue/station/page/StationPage.js";
import { Fake, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const STATION = { id: "gist-mac", nom: "mac/claude" };
const COMPUTED = { clone: "/st/clones", worktrees: "/st/worktrees" };
const KEY = "sk-ant-api03-SECRETSECRETSECRET";

const all = (node: Fake): Fake[] => [...node.descendants()];
const row = (section: Fake, key: string) => all(section).find((n) => n.dataset.cle === key);
const list = (r: Fake) => all(r).find((n) => n.balise === "select") ?? assert.fail("pas de liste");
const options = (r: Fake) => list(r).children.map((o) => [o.value, o.textContent]);
const chosenOne = (r: Fake) => list(r).children.find((o) => (o as unknown as { selected?: boolean }).selected)?.value;
const value = (r: Fake) => r.children[1]?.textContent ?? "";

function store() {
  const folder = mkdtempSync(join(tmpdir(), "moteur-"));
  const file = join(folder, "station-reglages.json");
  return { dossier: folder, fichier: file, lire: async () => readSettingsOfTheStation(file, COMPUTED), ecrire: async (c: any) => writeSettingsOfTheStation(file, c) };
}
// La page ouverte — à nouveau à chaque appel : c'est la réouverture des réglages.
async function open(settings: ReturnType<typeof store>, locale = "gist-mac") {
  const page = (await setPageOfStation(doc, { station: STATION, locale, reglages: settings })) as Fake;
  return page.children.find((s) => s.dataset.section === "moteur") ?? assert.fail("pas de section « Engine »");
}
// Le chef choisit dans une liste : `change`, et le réglage s'applique.
async function choose(r: Fake, valueWanted: string) {
  const select = list(r);
  select.value = valueWanted;
  select.declencher("change");
  await repos();
}

describe("la section « Engine » de la page d'une station (#3746)", () => {
  test("elle est sous son titre, et sa liste offre exactement trois moteurs, l'abonnement choisi tant que rien n'est gardé", async () => {
    const settings = store();
    const section = await open(settings);
    const page = (await setPageOfStation(doc, { station: STATION, locale: "gist-mac", reglages: settings })) as Fake;
    assert.equal(page.children.find((s) => s.dataset.section === "moteur")?.children[0]?.textContent, "Engine");
    const engine = row(section, "moteur") ?? assert.fail("pas de rangée du moteur");
    assert.deepEqual(options(engine), [
      ["claude-subscription", "Claude subscription"],
      ["claude-api-key", "Claude API key"],
      ["codex", "Codex"],
    ]);
    assert.equal(chosenOne(engine), "claude-subscription");
    assert.match(value(engine), /^Claude subscription/);
    assert.equal(all(engine).filter((n) => n.className === "niveau").map((n) => n.dataset.niveau).join(), "machine");
    assert.equal(row(section, "cle-api"), undefined, "pas de champ de clé sans le moteur à clé");
    rmSync(settings.dossier, { recursive: true });
  });

  test("le moteur choisi est gardé, et se relit à la réouverture des réglages", async () => {
    const settings = store();
    await choose(row(await open(settings), "moteur") as Fake, "codex");
    assert.equal(JSON.parse(readFileSync(settings.fichier, "utf8")).engine, "codex");
    const reopened = await open(settings);
    assert.equal(chosenOne(row(reopened, "moteur") as Fake), "codex");
    assert.match(value(row(reopened, "moteur") as Fake), /^Codex/);
    rmSync(settings.dossier, { recursive: true });
  });

  test("la clé d'API : un champ masqué ; gardée, elle n'est plus jamais montrée, ni à la réouverture", async () => {
    const settings = store();
    const section = await open(settings);
    await choose(row(section, "moteur") as Fake, "claude-api-key");
    const key = row(section, "cle-api") ?? assert.fail("pas de champ de clé avec la clé d'API");
    const field = all(key).find((n) => n.balise === "input") ?? assert.fail("pas de champ");
    assert.equal(field.type, "password");
    assert.match(value(key), /not saved yet/);
    field.value = `  ${KEY}  `;
    field.declencher("change");
    await repos();
    // Gardée à part, lisible du seul compte, hors du fichier des réglages.
    const fileOfTheKey = join(settings.dossier, "station-cle-api");
    assert.equal(readFileSync(fileOfTheKey, "utf8"), KEY);
    // Sous Windows, Node rend toujours 0o666 : c'est l'ACL du fichier qui dit qui le lit, relue par le runtime (#3680).
    if (process.platform === "win32") assert.equal(ouvertADAutres(fileOfTheKey, "la clé d'API"), null);
    else assert.equal(statSync(fileOfTheKey).mode & 0o777, 0o600);
    assert.doesNotMatch(readFileSync(settings.fichier, "utf8"), /SECRET/);
    for (const vue of [section, await open(settings)]) {
      const r = row(vue, "cle-api") ?? assert.fail("pas de rangée de la clé");
      assert.match(value(r), /•+ saved/);
      assert.ok(all(vue).every((n) => !String(n.textContent).includes("SECRET") && !String(n.value ?? "").includes("SECRET") && !String(n.placeholder ?? "").includes("SECRET")), "la clé n'est montrée nulle part");
      assert.equal((all(r).find((n) => n.balise === "input") as Fake).type, "password");
    }
    assert.ok(!JSON.stringify(await settings.lire()).includes("SECRET"), "la lecture ne rend jamais la clé");
    rmSync(settings.dossier, { recursive: true });
  });

  test("une clé qui n'en est pas une ne se garde pas, et le refus se dit sous sa rangée", async () => {
    const settings = store();
    await settings.ecrire({ engine: "claude-api-key" });
    const section = await open(settings);
    const field = all(row(section, "cle-api") as Fake).find((n) => n.balise === "input") as Fake;
    field.value = "two words";
    field.declencher("change");
    await repos();
    assert.match(all(row(section, "cle-api") as Fake).map((n) => n.textContent).join("|"), /not an API key/);
    assert.equal(field.value, "", "le champ ne garde pas ce qui a été tapé");
    assert.match(value(row(section, "cle-api") as Fake), /not saved yet/);
    rmSync(settings.dossier, { recursive: true });
  });

  test("le moteur de secours : aucun, ou l'un des deux autres ; gardé et relu ; prendre le secours pour moteur le retire du secours", async () => {
    const settings = store();
    const section = await open(settings);
    const fallback = row(section, "secours") ?? assert.fail("pas de rangée du secours");
    assert.deepEqual(options(fallback), [
      ["", "none"],
      ["claude-api-key", "Claude API key"],
      ["codex", "Codex"],
    ]);
    assert.equal(chosenOne(fallback), "");
    await choose(fallback, "claude-api-key");
    const reopened = await open(settings);
    assert.equal(chosenOne(row(reopened, "secours") as Fake), "claude-api-key");
    // Le secours à clé demande la clé, lui aussi.
    assert.ok(row(reopened, "cle-api"));
    await choose(row(reopened, "moteur") as Fake, "claude-api-key");
    const after = await open(settings);
    assert.equal(chosenOne(row(after, "moteur") as Fake), "claude-api-key");
    assert.equal(chosenOne(row(after, "secours") as Fake), "");
    assert.deepEqual(options(row(after, "secours") as Fake).map(([key]) => key), ["", "claude-subscription", "codex"]);
    await choose(row(after, "secours") as Fake, "");
    assert.equal(JSON.parse(readFileSync(settings.fichier, "utf8")).fallbackEngine, null);
    rmSync(settings.dossier, { recursive: true });
  });

  test("le magasin refuse un moteur inconnu ou un secours égal au moteur, et rien n'est changé", () => {
    const settings = store();
    assert.ok("refus" in writeSettingsOfTheStation(settings.fichier, { engine: "gpt" }));
    assert.ok("refus" in writeSettingsOfTheStation(settings.fichier, { fallbackEngine: "claude-subscription" }));
    assert.ok("refus" in writeSettingsOfTheStation(settings.fichier, { engine: "codex", fallbackEngine: "codex" }));
    const readOnes = readSettingsOfTheStation(settings.fichier, COMPUTED);
    assert.ok(!("refus" in readOnes));
    assert.deepEqual([readOnes.engine, readOnes.fallbackEngine, readOnes.apiKey], [undefined, null, false]);
    rmSync(settings.dossier, { recursive: true });
  });

  test("un fichier de réglages illisible se dit en une ligne, sans liste ; un moteur gardé inconnu se dit tel quel", async () => {
    const settings = store();
    writeFileSync(settings.fichier, "{ pas du json");
    const unreadable = await open(settings);
    assert.equal(row(unreadable, "moteur"), undefined);
    assert.match(unreadable.textContent, /could not be read/);
    writeFileSync(settings.fichier, JSON.stringify({ engine: "gpt" }));
    const unknown = await open(settings);
    assert.match(value(row(unknown, "moteur") as Fake), /“gpt” — an engine this app does not know/);
    assert.equal(chosenOne(row(unknown, "moteur") as Fake), "gpt");
    rmSync(settings.dossier, { recursive: true });
  });

  test("sur une autre station, rien ne se règle d'ici : une ligne le dit", async () => {
    const settings = store();
    const section = await open(settings, "gist-pc");
    assert.equal(all(section).filter((n) => n.balise === "select" || n.balise === "input").length, 0);
    assert.match(section.textContent, /not available for this station/);
    rmSync(settings.dossier, { recursive: true });
  });
});
