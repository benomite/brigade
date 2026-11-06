// La section « Folders and sandbox » de la page d'une station (#2644) : elle montre les dossiers, le bac à sable et la
// porte réseau, change un dossier ou la porte sur cet ordinateur et le relit, et ne change rien sur une autre station.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ecrireReglagesDeLaStation, lireReglagesDeLaStation } from "../src/reglages-de-la-station.ts";
import { poserPageDeStation } from "../src/vue/station/page/StationPage.js";
import { Faux, repos } from "./aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const STATION = { id: "gist-mac", nom: "mac/claude" };
const CALCULES = { clone: "/st/clones", worktrees: "/st/worktrees" };

function descendants(noeud: Faux): Faux[] {
  return noeud.children.flatMap((enfant) => [enfant, ...descendants(enfant)]);
}
const ligne = (page: Faux, cle: string) => descendants(page).find((n) => n.dataset.cle === cle) as Faux;
const texte = (noeud: Faux): string => descendants(noeud).map((n) => n.textContent).join("|");

// Un port en mémoire, soutenu par le vrai magasin de l'app dans un dossier d'essai.
function port() {
  const dossier = mkdtempSync(join(tmpdir(), "reglages-"));
  const fichier = join(dossier, "station-reglages.json");
  return { fichier, dossier, lire: async () => lireReglagesDeLaStation(fichier, CALCULES), ecrire: async (c: any) => ecrireReglagesDeLaStation(fichier, c) };
}
async function section(locale: string, reglages: ReturnType<typeof port>) {
  const page = (await poserPageDeStation(doc, { station: STATION, locale, reglages })) as Faux;
  return page.children.find((s) => s.dataset.section === "dossiers-et-bac-a-sable") as Faux;
}

describe("la section dossiers et bac à sable", () => {
  test("montre les deux dossiers, le bac à sable et la porte réseau, chacun avec sa marque de niveau", async () => {
    const reglages = port();
    const page = await section("gist-mac", reglages);
    assert.match(texte(ligne(page, "dossier")), /\/st\/clones/);
    const lignes = descendants(page).filter((n) => n.className === "reglage");
    assert.deepEqual(lignes.map((l) => (l.children[0]?.textContent ?? "").replace("this machine", "")), ["clones folder", "worktrees folder", "sandbox", "network door"]);
    for (const l of lignes) assert.equal(descendants(l).filter((n) => n.className === "niveau").length, 1, "une marque de niveau par réglage");
    assert.match(texte(ligne(page, "bac")), /on/);
    assert.match(texte(ligne(page, "porte")), /github\.com/);
    assert.match(texte(page), /\/st\/worktrees/);
    rmSync(reglages.dossier, { recursive: true });
  });

  test("changer un dossier et la porte depuis cet ordinateur s'enregistre et se montre au rechargement", async () => {
    const reglages = port();
    let page = await section("gist-mac", reglages);
    const champ = descendants(ligne(page, "dossier")).find((n) => n.balise === "input") as Faux;
    champ.value = "/data/clones";
    descendants(ligne(page, "dossier")).find((n) => n.balise === "button" && n.textContent === "save")?.click();
    await repos();
    assert.match(texte(page), /\/data\/clones/);
    const porte = descendants(ligne(page, "porte"));
    (porte.find((n) => n.balise === "input") as Faux).value = "registry.npmjs.org";
    porte.find((n) => n.balise === "button" && n.textContent === "open")?.click();
    await repos();
    assert.match(texte(page), /registry\.npmjs\.org/);
    // Rechargé : une page neuve relit le fichier.
    page = await section("gist-mac", reglages);
    assert.match(texte(page), /\/data\/clones/);
    assert.match(texte(page), /registry\.npmjs\.org/);
    rmSync(reglages.dossier, { recursive: true });
  });

  test("une valeur refusée ne s'écrit pas et le refus se lit sous le réglage", async () => {
    const reglages = port();
    const page = await section("gist-mac", reglages);
    (descendants(ligne(page, "dossier")).find((n) => n.balise === "input") as Faux).value = "relative/path";
    descendants(ligne(page, "dossier")).find((n) => n.balise === "button" && n.textContent === "save")?.click();
    await repos();
    assert.match(texte(page), /must be an absolute path/);
    assert.equal((await reglages.lire()).clones, "/st/clones");
    rmSync(reglages.dossier, { recursive: true });
  });

  test("sur une autre station, la section montre sans offrir de rien changer", async () => {
    const reglages = port();
    const page = await section("autre-station", reglages);
    assert.match(texte(page), /\/st\/clones/);
    assert.match(texte(page), /github\.com/);
    assert.equal(descendants(page).filter((n) => n.balise === "input" || n.balise === "button" && n.textContent !== "?").length, 0);
    rmSync(reglages.dossier, { recursive: true });
  });
});
