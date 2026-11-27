// Le bloc de la station de cet ordinateur, sur l'accueil (#2640) : pas installée, en cours d'installation, installée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { INSTALLER, THE_OTHERS, ITS_PAGE, holdBlockOfTheStation } from "../../src/vue/home/station/StationBlock.js";
import { Fake, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const buttons = (block: Fake) => block.dessous("button").map(({ textContent }) => textContent);
const button = (block: Fake, text: string) => block.dessous("button").find(({ textContent }) => textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);

function theBlock(installer: () => Promise<{ refus: string; detail?: string } | void> = async () => undefined) {
  const openEntries: string[] = [];
  const set: string[] = [];
  const block = holdBlockOfTheStation(doc, {
    installer,
    etapes: [
      { nom: "GitHub", dit: "connect it", geste: { libelle: "Connect to GitHub", faire: async () => void set.push("github") } },
      { nom: "Projects", dit: "choose projects" },
    ],
    ouvrir: (id) => void openEntries.push(id),
  });
  return { bloc: block, racine: block.racine as unknown as Fake, ouvertes: openEntries, reglees: set };
}

test("sans station sur cet ordinateur, le bloc n'offre qu'un bouton d'installation, et aucun autre réglage", () => {
  const { bloc: block, racine: root } = theBlock();
  block.lire({ station: null });
  assert.deepEqual(buttons(root), [INSTALLER]);
  assert.equal(button(root, INSTALLER).parentElement?.children.length, 1, "pas de survol de prix : l'installation ne dit pas le sien");
  assert.doesNotMatch(root.textContent, /Step|Next/);
});

test("l'installation en cours se dit, sans bouton ; puis les premiers réglages se déroulent un à un jusqu'à la station prête", async () => {
  let finish: () => void = () => {};
  const { bloc: block, racine: root, reglees: set } = theBlock(() => new Promise<void>((finished) => (finish = finished)));
  block.lire({ station: null });
  button(root, INSTALLER).click();
  assert.match(root.textContent, /installing the station/);
  assert.deepEqual(buttons(root), []);
  finish();
  await repos();
  assert.match(root.textContent, /Step 1 of 2 — GitHub/);
  assert.deepEqual(buttons(root), ["Connect to GitHub", "Next"]);
  button(root, "Connect to GitHub").click();
  await repos();
  assert.deepEqual(set, ["github"]);
  button(root, "Next").click();
  assert.match(root.textContent, /Step 2 of 2 — Projects/);
  assert.deepEqual(buttons(root), ["Done"]);
  button(root, "Done").click();
  assert.match(root.textContent, /the station is ready/);
  assert.deepEqual(buttons(root), [], "plus de bouton d'installation une fois prête");
  block.lire({ station: { id: "g1", nom: "Mac", phrase: "online" }, autres: [] });
  assert.deepEqual(buttons(root), [ITS_PAGE]);
});

test("une installation refusée se dit en une ligne et le bouton revient", async () => {
  const { bloc: block, racine: root } = theBlock(async () => ({ refus: "sudo refused", detail: "exit code 1" }));
  block.lire({ station: null });
  button(root, INSTALLER).click();
  await repos();
  assert.ok(buttons(root).includes(INSTALLER));
  assert.match(root.textContent, /could not be installed/);
});

test("installée, le bloc dit le nom de la station et lie sa page, sans bouton d'installation ; les autres stations du chef ont chacune la leur", () => {
  const { bloc: block, racine: root, ouvertes: openEntries } = theBlock();
  block.lire({
    station: { id: "g1", nom: "Mac", phrase: "online · version 1.4.0" },
    autres: [
      { id: "g2", nom: "box", phrase: "online · 2 cooks" },
      { id: "g3", nom: "nas", phrase: "offline" },
    ],
  });
  assert.match(root.textContent, /Mac/);
  assert.ok(!buttons(root).includes(INSTALLER));
  assert.match(root.textContent, new RegExp(THE_OTHERS));
  button(root, ITS_PAGE).click();
  const lines = root.dessous("button").filter(({ className }) => className === "ligne");
  assert.deepEqual(lines.map(({ children }) => children[0]?.textContent), ["box", "nas"]);
  for (const line of lines) line.click();
  assert.deepEqual(openEntries, ["g1", "g2", "g3"]);
});
