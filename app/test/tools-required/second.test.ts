// L'onglet Second sans Claude Code (#4059, corrections du chef) : le produit nommé — le binaire au survol —, à quoi il
// sert ici, le pas qui l'installe sur cette machine à plat, la connexion qui suit, et « Try again », qui relit les outils
// avant de relancer le second : installé, il part sans redémarrer l'app.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIONS_OF_WAIT } from "../../src/wait.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { SaysOfSecond, Terminal } from "../../src/terminals.ts";
import { PAGE_OF, setToolsOfSecond, RETRY_THE_SECOND } from "../../src/vue/tools-of-second.js";
import { Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) } as never;
const ON_MAC = "Install Claude Code with its official installer: run `curl -fsSL https://claude.ai/install.sh | bash` in a terminal.";
const PREVENTS: SaysOfSecond = {
  reason: "The second cannot start: Claude Code is missing on this Mac.",
  tools: [{ tool: "claude", reason: "`claude` is not installed on this Mac, and the second is a Claude Code session.", install: ON_MAC, link: "https://code.claude.com/docs/en/setup" }],
};
const THEN_THE_CONNECTION = "Once it is installed, click “Try again”: the second opens, and Claude Code asks you to sign in with your Max account.";
const buttons = (place: Fake) => place.dessous("button").map((b) => b.textContent);

test("sans Claude Code, l'onglet Second nomme le produit, dit à quoi il sert, pose son pas à copier et la connexion qui suit", () => {
  const place = new Fake("div");
  place.append(setToolsOfSecond(doc, PREVENTS, { bloque: true, reessayer: () => {}, ouvrirLaPage: () => {} }) as unknown as Fake);
  assert.equal(place.dessous("strong")[0]?.textContent, "Claude Code");
  assert.equal(place.dessous("strong").some((s) => s.textContent === "claude"), false);
  assert.match(place.textContent, /Claude Code is what the second and the cooks run on, with your Max account\./);
  assert.equal(place.dessous("code").map((c) => c.textContent).join(" "), "curl -fsSL https://claude.ai/install.sh | bash");
  assert.ok(place.textContent.includes(THEN_THE_CONNECTION));
  // « ? » : le survol qui porte le binaire.
  assert.deepEqual(buttons(place), ["?", "how to get Claude Code", RETRY_THE_SECOND]);
  assert.equal(PAGE_OF("gh"), "how to get the GitHub CLI");
});

test("un second qui part sans le GitHub CLI le nomme, sans la connexion de Claude Code", () => {
  const place = new Fake("div");
  const withoutGh: SaysOfSecond = { reason: "The second starts, but the GitHub CLI is missing on this Mac.", tools: [{ tool: "gh", reason: "`gh` is missing.", install: "Install the GitHub CLI with its macOS installer.", link: "https://github.com/cli/cli/releases/latest" }] };
  place.append(setToolsOfSecond(doc, withoutGh, { bloque: false, reessayer: () => {}, ouvrirLaPage: () => {} }) as unknown as Fake);
  assert.equal(place.dessous("strong")[0]?.textContent, "The GitHub CLI");
  assert.match(place.textContent, /The GitHub CLI is how brigade reads your stations, their rails and your repositories on GitHub\./);
  assert.equal(place.textContent.includes(THEN_THE_CONNECTION), false);
});

test("« Try again » relit les outils de l'app d'abord — ce qui rattache un outil posé hors du PATH —, puis relance le second", async () => {
  const second: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: PREVENTS.reason, arrete: true, empeche: PREVENTS };
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: { attente: ACTIONS_OF_WAIT },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [second],
    outilsManquants: () => [],
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const trial = vue.element("outils-du-second").dessous("button").find((b) => b.textContent === RETRY_THE_SECOND) ?? assert.fail("pas de « Try again »");
  const before = vue.appels.length;
  trial.click();
  await repos();
  const actions = vue.appels.slice(before).map(({ geste: action }) => action).filter((action) => action === "outilsManquants" || action === "ecrire");
  assert.deepEqual(actions, ["outilsManquants", "ecrire"]);
  assert.deepEqual(vue.dernier("ecrire"), [1, ""]);
});
