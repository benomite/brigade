// La section « Folders and sandbox » de la page d'une station (#2644) : elle montre les dossiers, le bac à sable et la
// porte réseau, change un dossier ou la porte sur cet ordinateur et le relit, et ne change rien sur une autre station.
// Chaque réglage est une rangée de réglage (ticket 2920) : un champ s'applique dès qu'il change, sans « Save ».
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ecrireReglagesDeLaStation, lireReglagesDeLaStation } from "../src/reglages-de-la-station.ts";
import { EN_COURS } from "../src/vue/station/page/appliquer.js";
import { FERMER_NON, FERMER_OUI } from "../src/vue/station/page/sections/dossiers-et-bac-a-sable.js";
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
const champ = (rangee: Faux) => descendants(rangee).find((n) => n.balise === "input") as Faux;
const bouton = (rangee: Faux, libelle: string) => descendants(rangee).find((n) => n.balise === "button" && n.textContent === libelle) as Faux;
// Le chef tape, puis quitte le champ : `change`, et le réglage s'applique.
const changer = (entree: Faux, saisi: string) => {
  entree.value = saisi;
  entree.declencher("change");
};

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
    assert.match(texte(ligne(page, "clones")), /\/st\/clones/);
    const lignes = descendants(page).filter((n) => n.className === "reglage");
    assert.deepEqual(lignes.map((l) => (l.children[0]?.textContent ?? "").replace("this machine", "")), ["clones folder", "worktrees folder", "sandbox", "network door"]);
    for (const l of lignes) assert.equal(descendants(l).filter((n) => n.className === "niveau").length, 1, "une marque de niveau par réglage");
    // Des réglages de la machine, jamais du dépôt : aucune ligne de PR ; et aucun bouton « Save ».
    assert.ok(descendants(page).every((n) => n.className !== "par-pr"));
    assert.ok(!descendants(page).some((n) => n.balise === "button" && /^(save|open)$/i.test(n.textContent)), "pas de bouton pour enregistrer");
    assert.match(texte(ligne(page, "bac")), /on/);
    assert.match(texte(ligne(page, "porte")), /github\.com/);
    assert.match(texte(page), /\/st\/worktrees/);
    rmSync(reglages.dossier, { recursive: true });
  });

  test("changer un dossier et la porte depuis cet ordinateur s'enregistre et se montre au rechargement", async () => {
    const reglages = port();
    let page = await section("gist-mac", reglages);
    changer(champ(ligne(page, "clones")), "/data/clones");
    await repos();
    assert.match(texte(page), /\/data\/clones/);
    assert.match(texte(ligne(page, "clones")), /saved on this machine/);
    changer(champ(ligne(page, "porte")), "registry.npmjs.org");
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
    changer(champ(ligne(page, "clones")), "relative/path");
    await repos();
    const refus = ligne(page, "clones").children.slice(3);
    assert.equal(refus[0]?.dataset.ligne, "erreur", "le refus est la ligne d'erreur, sous la rangée");
    assert.match(texte(ligne(page, "clones")), /must be an absolute path/);
    assert.ok(descendants(refus[0]!).some((n) => /relative\/path/.test(n.ariaLabel)), "son détail au survol");
    assert.equal((await reglages.lire() as { clones: string }).clones, "/st/clones");
    rmSync(reglages.dossier, { recursive: true });
  });

  test("un changement s'applique dès que le champ change : « applying… » et le champ désactivé le temps qu'il court", async () => {
    const reglages = port();
    const envoyes: unknown[] = [];
    let fini: () => void = () => {};
    const lent = { ...reglages, ecrire: (c: any) => (envoyes.push(c), new Promise((r) => (fini = () => r(reglages.ecrire(c))))) };
    const page = await section("gist-mac", lent as never);
    const entree = champ(ligne(page, "worktrees"));
    entree.value = "/data/worktrees";
    assert.deepEqual(envoyes, [], "taper n'envoie rien");
    entree.declencher("change");
    assert.deepEqual(envoyes, [{ worktrees: "/data/worktrees" }]);
    assert.equal(entree.disabled, true);
    assert.match(texte(ligne(page, "worktrees")), new RegExp(EN_COURS));
    fini();
    await repos();
    await repos();
    assert.match(texte(ligne(page, "worktrees")), /\/data\/worktrees/);
    assert.doesNotMatch(texte(page), new RegExp(EN_COURS));
    changer(champ(ligne(page, "worktrees")), "/data/worktrees");
    assert.equal(envoyes.length, 1, "la même valeur ne s'envoie pas");
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
    changer(champ(ligne(page, "porte")), "registry.npmjs.org");
    await repos();
    assert.match(texte(page), /registry\.npmjs\.org/);
    changer(champ(ligne(page, "porte")), "not a host");
    await repos();
    assert.match(texte(ligne(page, "porte")), /not a host/);
    assert.doesNotMatch(texte(ligne(page, "clones")), /not a host/, "le refus reste sous son réglage");
    // Retirer se confirme en ligne : « keep it open » ne retire rien, « close it » retire.
    bouton(ligne(page, "porte"), "remove").click();
    bouton(ligne(page, "porte"), FERMER_NON).click();
    await repos();
    assert.match(texte(page), /registry\.npmjs\.org/);
    assert.equal(bouton(ligne(page, "porte"), FERMER_OUI), undefined);
    bouton(ligne(page, "porte"), "remove").click();
    bouton(ligne(page, "porte"), FERMER_OUI).click();
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
