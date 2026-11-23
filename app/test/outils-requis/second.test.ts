// L'onglet Second sans Claude Code (#4059, corrections du chef) : le produit nommé — le binaire au survol —, à quoi il
// sert ici, le pas qui l'installe sur cette machine à plat, la connexion qui suit, et « Try again », qui relit les outils
// avant de relancer le second : installé, il part sans redémarrer l'app.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { GESTES_D_ATTENTE } from "../../src/attente.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { DitDuSecond, Terminal } from "../../src/terminaux.ts";
import { A_QUOI_IL_SERT, PAGE_DE, poserOutilsDuSecond, PUIS_LA_CONNEXION, REESSAYER_LE_SECOND } from "../../src/vue/outils-du-second.js";
import { Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;
const SUR_MAC = "Install Claude Code with its official installer: run `curl -fsSL https://claude.ai/install.sh | bash` in a terminal.";
const EMPECHE: DitDuSecond = {
  reason: "The second cannot start: Claude Code is missing on this Mac.",
  tools: [{ tool: "claude", reason: "`claude` is not installed on this Mac, and the second is a Claude Code session.", install: SUR_MAC, link: "https://code.claude.com/docs/en/setup" }],
};
const boutons = (lieu: Faux) => lieu.dessous("button").map((b) => b.textContent);

test("sans Claude Code, l'onglet Second nomme le produit, dit à quoi il sert, pose son pas à copier et la connexion qui suit", () => {
  const lieu = new Faux("div");
  lieu.append(poserOutilsDuSecond(doc, EMPECHE, { bloque: true, reessayer: () => {}, ouvrirLaPage: () => {} }) as unknown as Faux);
  assert.equal(lieu.dessous("strong")[0]?.textContent, "Claude Code");
  assert.equal(lieu.dessous("strong").some((s) => s.textContent === "claude"), false);
  assert.match(lieu.textContent, /Claude Code is what the second and the cooks run on, with your Max account\./);
  assert.equal(lieu.dessous("code").map((c) => c.textContent).join(" "), "curl -fsSL https://claude.ai/install.sh | bash");
  assert.ok(lieu.textContent.includes(PUIS_LA_CONNEXION));
  // « ? » : le survol qui porte le binaire.
  assert.deepEqual(boutons(lieu), ["?", "how to get Claude Code", REESSAYER_LE_SECOND]);
  assert.equal(PAGE_DE("gh"), "how to get the GitHub CLI");
  assert.equal(A_QUOI_IL_SERT.git, "Git makes and keeps the project's local copy, a git clone.");
});

test("un second qui part sans le GitHub CLI le nomme, sans la connexion de Claude Code", () => {
  const lieu = new Faux("div");
  const sansGh: DitDuSecond = { reason: "The second starts, but the GitHub CLI is missing on this Mac.", tools: [{ tool: "gh", reason: "`gh` is missing.", install: "Install the GitHub CLI with its macOS installer.", link: "https://github.com/cli/cli/releases/latest" }] };
  lieu.append(poserOutilsDuSecond(doc, sansGh, { bloque: false, reessayer: () => {}, ouvrirLaPage: () => {} }) as unknown as Faux);
  assert.equal(lieu.dessous("strong")[0]?.textContent, "The GitHub CLI");
  assert.equal(lieu.textContent.includes(PUIS_LA_CONNEXION), false);
});

test("« Try again » relit les outils de l'app d'abord — ce qui rattache un outil posé hors du PATH —, puis relance le second", async () => {
  const second: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: EMPECHE.reason, arrete: true, empeche: EMPECHE };
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES, attente: GESTES_D_ATTENTE },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [second],
    outilsManquants: () => [],
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const essai = vue.element("outils-du-second").dessous("button").find((b) => b.textContent === REESSAYER_LE_SECOND) ?? assert.fail("pas de « Try again »");
  const avant = vue.appels.length;
  essai.click();
  await repos();
  const gestes = vue.appels.slice(avant).map(({ geste }) => geste).filter((geste) => geste === "outilsManquants" || geste === "ecrire");
  assert.deepEqual(gestes, ["outilsManquants", "ecrire"]);
  assert.deepEqual(vue.dernier("ecrire"), [1, ""]);
});
