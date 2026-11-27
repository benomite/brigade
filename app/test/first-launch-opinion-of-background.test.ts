// L'écran du premier lancement avant l'avis de macOS (#4081) : ses trois états — premier lancement, après confirmation,
// second lancement —, la marque qui ne s'écrit pas, la porte qui ne s'ouvre que sur un Mac pas encore inscrit, l'écran
// tel que le process principal le tient, et tel que la vue le pose et le retire.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { opinionOfMacOS, passTheFirstLaunch, holdTheOpinionOfBackground } from "../src/first-launch/index.ts";
import { holdOpinionOfBackground } from "../src/vue/first-launch/opinion-of-background.js";
import { Fake } from "./helpers/false-vue.ts";

const brandNew = () => join(mkdtempSync(join(tmpdir(), "avis-de-fond-")), "app", "avis-de-fond-vu");
const doc = { createElement: (balise: string) => new Fake(balise) };
const repos = () => new Promise((resolve) => setTimeout(resolve, 5));

test("first launch: the screen shows, the action waits for the button, then runs", async () => {
  const brand = brandNew();
  const opinion = holdTheOpinionOfBackground(() => undefined);
  let actions = 0;
  const finished = passTheFirstLaunch({ marque: brand, afficher: opinion.afficher, declencher: async () => ++actions });
  await repos();
  assert.equal(opinion.attendu(), true, "the screen is awaited");
  assert.equal(actions, 0, "the action waits for the button");
  assert.equal(existsSync(brand), false, "nothing is noted before the button");
  opinion.continuer();
  assert.equal(await finished, 1, "the action's result is handed back");
  assert.equal(opinion.attendu(), false);
});

test("after confirmation: the mark is written, and the second launch runs the action without the screen", async () => {
  const brand = brandNew();
  let screens = 0;
  await passTheFirstLaunch({ marque: brand, afficher: async () => void screens++, declencher: async () => undefined });
  assert.equal(existsSync(brand), true, "the confirmation is noted");
  let actions = 0;
  await passTheFirstLaunch({ marque: brand, afficher: async () => void screens++, declencher: async () => void actions++ });
  assert.equal(screens, 1, "second launch: no screen");
  assert.equal(actions, 1, "second launch: the action runs");
});

test("a mark that cannot be written: the action still runs, and the line says the screen comes back", async () => {
  const folder = mkdtempSync(join(tmpdir(), "avis-de-fond-"));
  const file = join(folder, "un-fichier");
  writeFileSync(file, "");
  const brand = join(file, "avis-de-fond-vu");
  const lines: string[] = [];
  let actions = 0;
  await passTheFirstLaunch({ marque: brand, afficher: async () => undefined, declencher: async () => void actions++, dire: (line) => lines.push(line) });
  assert.equal(actions, 1);
  assert.equal(existsSync(brand), false);
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /shows again at the next launch/);
});

test("a screen that fails before the button: the action does not run, and nothing is noted", async () => {
  const brand = brandNew();
  let actions = 0;
  await assert.rejects(passTheFirstLaunch({ marque: brand, afficher: async () => Promise.reject(new Error("window closed")), declencher: async () => void actions++ }), /window closed/);
  assert.equal(actions, 0);
  assert.equal(existsSync(brand), false);
});

test("the screen comes first only on a Mac where the station is not registered yet", async () => {
  for (const [mac, registered, screen] of [[true, false, 1], [true, true, 0], [false, false, 0], [false, true, 0]] as const) {
    const brand = brandNew();
    let screens = 0;
    let actions = 0;
    await passTheFirstLaunch({ avis: opinionOfMacOS({ mac, inscrite: registered }), marque: brand, afficher: async () => void screens++, declencher: async () => void actions++ });
    assert.equal(screens, screen, `mac ${mac}, registered ${registered}`);
    assert.equal(actions, 1, `mac ${mac}, registered ${registered}`);
    assert.equal(existsSync(brand), screen === 1, "only a shown screen is noted");
  }
});

test("the main process asks the view for the screen, and the button resolves the wait once", async () => {
  let shows = 0;
  const opinion = holdTheOpinionOfBackground(() => void shows++);
  assert.equal(opinion.attendu(), false, "nothing awaited before the launch asks");
  opinion.continuer();
  const wait = opinion.afficher();
  assert.equal(shows, 1);
  assert.equal(opinion.attendu(), true);
  opinion.continuer();
  await wait;
  assert.equal(opinion.attendu(), false);
  opinion.continuer();
});

test("the screen card: its title names Brigade, it says macOS will tell, and it has one recommended button", async () => {
  const place = new Fake("section");
  await holdOpinionOfBackground(place, new Fake("div"), doc, { avisDeFond: async () => true });
  const card = place.children[0];
  assert.deepEqual(card?.children.map((child) => child.balise), ["h2", "p", "p", "div"]);
  assert.match(card?.children[0]?.textContent ?? "", /^Brigade runs in the background$/);
  assert.match(card?.children[1]?.textContent ?? "", /background/);
  assert.match(card?.children[2]?.textContent ?? "", /macOS/);
  const buttons = place.querySelectorAll("button");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0]?.textContent, "continue");
  assert.equal(buttons[0]?.className, "recommande");
  assert.equal(buttons[0]?.dataset.taille, "grand");
});

test("the view shows the screen over the hidden app when the main process awaits it, and the button gives the app back", async () => {
  const place = new Fake("section");
  place.hidden = true;
  const frame = new Fake("div");
  let renderedOnes = 0;
  let receive: () => void = () => undefined;
  await holdOpinionOfBackground(place, frame, doc, { avisDeFond: async () => true, surAvisDeFond: (r) => void (receive = r), continuerLePremierLancement: async () => void renderedOnes++ });
  assert.equal(place.hidden, false, "first launch: the screen shows");
  assert.equal(frame.hidden, true, "the app is hidden behind it");
  place.querySelectorAll("button")[0]?.click();
  assert.equal(renderedOnes, 1, "the button hands back to the main process");
  assert.equal(place.hidden, true);
  assert.equal(frame.hidden, false);
  assert.equal(place.children.length, 0);
  receive();
  assert.equal(place.hidden, false, "asked later, it shows");
});

test("second launch: the view shows no screen when the main process awaits none", async () => {
  const place = new Fake("section");
  place.hidden = true;
  const frame = new Fake("div");
  await holdOpinionOfBackground(place, frame, doc, { avisDeFond: async () => false, surAvisDeFond: () => undefined });
  assert.equal(place.hidden, true);
  assert.equal(frame.hidden, false);
  await holdOpinionOfBackground(place, frame, doc, {});
  assert.equal(place.hidden, true, "a bridge without it (the phone) shows nothing");
});
