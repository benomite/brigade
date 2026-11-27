// La section « Folders and sandbox » de la page d'une station (#2644) : elle montre les dossiers, le bac à sable et la
// porte réseau, change un dossier ou la porte sur cet ordinateur et le relit, et ne change rien sur une autre station.
// Chaque réglage est une rangée de réglage (ticket 2920) : un champ s'applique dès qu'il change, sans « Save ».
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { writeSettingsOfTheStation, readSettingsOfTheStation } from "../src/settings-of-the-station.ts";
import { IN_PROGRESS } from "../src/vue/station/page/apply.js";
import { CLOSE_NOT, CLOSE_YES } from "../src/vue/station/page/sections/folders-and-sandbox.js";
import { setPageOfStation } from "../src/vue/station/page/StationPage.js";
import { Fake, repos } from "./helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const STATION = { id: "gist-mac", nom: "mac/claude" };
const COMPUTED = { clone: "/st/clones", worktrees: "/st/worktrees" };

function descendants(node: Fake): Fake[] {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}
const line = (page: Fake, key: string) => descendants(page).find((n) => n.dataset.cle === key) as Fake;
const text = (node: Fake): string => descendants(node).map((n) => n.textContent).join("|");
const field = (row: Fake) => descendants(row).find((n) => n.balise === "input") as Fake;
const button = (row: Fake, wording: string) => descendants(row).find((n) => n.balise === "button" && n.textContent === wording) as Fake;
// Le chef tape, puis quitte le champ : `change`, et le réglage s'applique.
const change = (entry: Fake, typed: string) => {
  entry.value = typed;
  entry.declencher("change");
};

// Un port en mémoire, soutenu par le vrai magasin de l'app dans un dossier d'essai.
function port(withoutBac = false) {
  const folder = mkdtempSync(join(tmpdir(), "reglages-"));
  const file = join(folder, "station-reglages.json");
  return { fichier: file, dossier: folder, lire: async () => readSettingsOfTheStation(file, COMPUTED, withoutBac), ecrire: async (c: any) => writeSettingsOfTheStation(file, c) };
}
async function section(locale: string, settings: ReturnType<typeof port>) {
  const page = (await setPageOfStation(doc, { station: STATION, locale, reglages: settings })) as Fake;
  return page.children.find((s) => s.dataset.section === "dossiers-et-bac-a-sable") as Fake;
}

describe("la section dossiers et bac à sable", () => {
  test("montre les deux dossiers, le bac à sable et la porte réseau, chacun avec sa marque de niveau", async () => {
    const settings = port();
    const page = await section("gist-mac", settings);
    assert.match(text(line(page, "clones")), /\/st\/clones/);
    const lines = descendants(page).filter((n) => n.className === "reglage");
    assert.deepEqual(lines.map((l) => (l.children[0]?.textContent ?? "").replace("this computer", "")), ["clones folder", "worktrees folder", "sandbox", "network door"]);
    for (const l of lines) assert.equal(descendants(l).filter((n) => n.className === "niveau").length, 1, "une marque de niveau par réglage");
    // Des réglages de la machine, jamais du dépôt : aucune ligne de PR ; et aucun bouton « Save ».
    assert.ok(descendants(page).every((n) => n.className !== "par-pr"));
    assert.ok(!descendants(page).some((n) => n.balise === "button" && /^(save|open)$/i.test(n.textContent)), "pas de bouton pour enregistrer");
    assert.match(text(line(page, "bac")), /on/);
    assert.match(text(line(page, "porte")), /github\.com/);
    assert.match(text(page), /\/st\/worktrees/);
    rmSync(settings.dossier, { recursive: true });
  });

  test("changer un dossier et la porte depuis cet ordinateur s'enregistre et se montre au rechargement", async () => {
    const settings = port();
    let page = await section("gist-mac", settings);
    change(field(line(page, "clones")), "/data/clones");
    await repos();
    assert.match(text(page), /\/data\/clones/);
    assert.match(text(line(page, "clones")), /saved on this computer/);
    change(field(line(page, "porte")), "registry.npmjs.org");
    await repos();
    assert.match(text(page), /registry\.npmjs\.org/);
    // Rechargé : une page neuve relit le fichier.
    page = await section("gist-mac", settings);
    assert.match(text(page), /\/data\/clones/);
    assert.match(text(page), /registry\.npmjs\.org/);
    rmSync(settings.dossier, { recursive: true });
  });

  test("une valeur refusée ne s'écrit pas et le refus se lit sous le réglage", async () => {
    const settings = port();
    const page = await section("gist-mac", settings);
    change(field(line(page, "clones")), "relative/path");
    await repos();
    const refusal = line(page, "clones").children.slice(3);
    assert.equal(refusal[0]?.dataset.ligne, "erreur", "le refus est la ligne d'erreur, sous la rangée");
    assert.match(text(line(page, "clones")), /must be an absolute path/);
    assert.ok(descendants(refusal[0]!).some((n) => /relative\/path/.test(n.ariaLabel)), "son détail au survol");
    assert.equal((await settings.lire() as { clones: string }).clones, "/st/clones");
    rmSync(settings.dossier, { recursive: true });
  });

  test("un changement s'applique dès que le champ change : « applying… » et le champ désactivé le temps qu'il court", async () => {
    const settings = port();
    const sent: unknown[] = [];
    let finished: () => void = () => {};
    const slow = { ...settings, ecrire: (c: any) => (sent.push(c), new Promise((r) => (finished = () => r(settings.ecrire(c))))) };
    const page = await section("gist-mac", slow as never);
    const entry = field(line(page, "worktrees"));
    entry.value = "/data/worktrees";
    assert.deepEqual(sent, [], "taper n'envoie rien");
    entry.declencher("change");
    assert.deepEqual(sent, [{ worktrees: "/data/worktrees" }]);
    assert.equal(entry.disabled, true);
    assert.match(text(line(page, "worktrees")), new RegExp(IN_PROGRESS));
    finished();
    await repos();
    await repos();
    assert.match(text(line(page, "worktrees")), /\/data\/worktrees/);
    assert.doesNotMatch(text(page), new RegExp(IN_PROGRESS));
    change(field(line(page, "worktrees")), "/data/worktrees");
    assert.equal(sent.length, 1, "la même valeur ne s'envoie pas");
    rmSync(settings.dossier, { recursive: true });
  });

  test("le bac à sable s'affiche « off » quand le chef a choisi de continuer sans", async () => {
    const settings = port(true);
    const page = await section("gist-mac", settings);
    assert.match(text(line(page, "bac")), /off/);
    rmSync(settings.dossier, { recursive: true });
  });

  test("un hôte ouvert se retire, un hôte invalide est refusé sous la porte", async () => {
    const settings = port();
    const page = await section("gist-mac", settings);
    change(field(line(page, "porte")), "registry.npmjs.org");
    await repos();
    assert.match(text(page), /registry\.npmjs\.org/);
    change(field(line(page, "porte")), "not a host");
    await repos();
    assert.match(text(line(page, "porte")), /not a host/);
    assert.doesNotMatch(text(line(page, "clones")), /not a host/, "le refus reste sous son réglage");
    // Retirer se confirme en ligne : « keep it open » ne retire rien, « close it » retire.
    button(line(page, "porte"), "remove").click();
    button(line(page, "porte"), CLOSE_NOT).click();
    await repos();
    assert.match(text(page), /registry\.npmjs\.org/);
    assert.equal(button(line(page, "porte"), CLOSE_YES), undefined);
    button(line(page, "porte"), "remove").click();
    button(line(page, "porte"), CLOSE_YES).click();
    await repos();
    assert.doesNotMatch(text(page), /registry\.npmjs\.org/);
    rmSync(settings.dossier, { recursive: true });
  });

  test("un fichier corrompu se dit et n'est pas écrasé ; un chemin Windows absolu passe", () => {
    const folder = mkdtempSync(join(tmpdir(), "reglages-"));
    const file = join(folder, "station-reglages.json");
    writeFileSync(file, "{ pas du json");
    assert.ok("refus" in readSettingsOfTheStation(file, COMPUTED));
    assert.ok("refus" in writeSettingsOfTheStation(file, { clones: "/a" }));
    assert.equal(readFileSync(file, "utf8"), "{ pas du json");
    rmSync(file);
    assert.deepEqual(writeSettingsOfTheStation(file, { clones: "C:\\brigade\\clones" }), { fait: "saved on this computer" });
    rmSync(folder, { recursive: true });
  });

  test("sur une autre station, la section ne montre rien de cet ordinateur et n'offre rien à changer", async () => {
    const settings = port();
    const page = await section("autre-station", settings);
    assert.match(text(page), /not available for this station/);
    assert.doesNotMatch(text(page), /\/st\/clones|github\.com/);
    assert.equal(descendants(page).filter((n) => n.balise === "input" || (n.balise === "button" && n.textContent !== "?")).length, 0);
    rmSync(settings.dossier, { recursive: true });
  });
});
