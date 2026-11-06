// La section « Folders and sandbox » de la page d'une station (#2644) : elle montre les dossiers, le bac à sable et la
// porte réseau, change un dossier ou la porte sur cet ordinateur et le relit, et ne change rien sur une autre station.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
function port(sansBac = false) {
  const dossier = mkdtempSync(join(tmpdir(), "reglages-"));
  const fichier = join(dossier, "station-reglages.json");
  return { fichier, dossier, lire: async () => lireReglagesDeLaStation(fichier, CALCULES, sansBac), ecrire: async (c: any) => ecrireReglagesDeLaStation(fichier, c) };
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
    assert.equal((await reglages.lire() as { clones: string }).clones, "/st/clones");
    rmSync(reglages.dossier, { recursive: true });
  });

  test("le bac à sable s'affiche « off » quand le chef a choisi de continuer sans", async () => {
    const reglages = port(true);
    const page = await section("gist-mac", reglages);
    assert.match(texte(ligne(page, "bac")), /off/);
    rmSync(reglages.dossier, { recursive: true });
  });

  test("un hôte ouvert se retire, un hôte invalide est refusé sous la porte", async () => {
    const reglages = port();
    const page = await section("gist-mac", reglages);
    const porte = () => descendants(ligne(page, "porte"));
    (porte().find((n) => n.balise === "input") as Faux).value = "registry.npmjs.org";
    porte().find((n) => n.balise === "button" && n.textContent === "open")?.click();
    await repos();
    assert.match(texte(page), /registry\.npmjs\.org/);
    (porte().find((n) => n.balise === "input") as Faux).value = "not a host";
    porte().find((n) => n.balise === "button" && n.textContent === "open")?.click();
    await repos();
    assert.match(texte(ligne(page, "porte")), /not a host/);
    assert.doesNotMatch(texte(ligne(page, "dossier")), /not a host/, "le refus reste sous son réglage");
    porte().find((n) => n.balise === "button" && n.textContent === "remove")?.click();
    await repos();
    assert.doesNotMatch(texte(page), /registry\.npmjs\.org/);
    rmSync(reglages.dossier, { recursive: true });
  });

  test("un fichier corrompu se dit et n'est pas écrasé ; un chemin Windows absolu passe", () => {
    const dossier = mkdtempSync(join(tmpdir(), "reglages-"));
    const fichier = join(dossier, "station-reglages.json");
    writeFileSync(fichier, "{ pas du json");
    assert.ok("refus" in lireReglagesDeLaStation(fichier, CALCULES));
    assert.ok("refus" in ecrireReglagesDeLaStation(fichier, { clones: "/a" }));
    assert.equal(readFileSync(fichier, "utf8"), "{ pas du json");
    rmSync(fichier);
    assert.deepEqual(ecrireReglagesDeLaStation(fichier, { clones: "C:\\brigade\\clones" }), { fait: "saved on this machine" });
    rmSync(dossier, { recursive: true });
  });

  test("sur une autre station, la section ne montre rien de cet ordinateur et n'offre rien à changer", async () => {
    const reglages = port();
    const page = await section("autre-station", reglages);
    assert.match(texte(page), /not available for this station/);
    assert.doesNotMatch(texte(page), /\/st\/clones|github\.com/);
    assert.equal(descendants(page).filter((n) => n.balise === "input" || (n.balise === "button" && n.textContent !== "?")).length, 0);
    rmSync(reglages.dossier, { recursive: true });
  });
});
