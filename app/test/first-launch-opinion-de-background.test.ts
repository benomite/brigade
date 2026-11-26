// L'écran du premier lancement avant l'avis de macOS (#4081) : ses trois états — premier lancement, après confirmation,
// second lancement —, la marque qui ne s'écrit pas, la porte qui ne s'ouvre que sur un Mac pas encore inscrit, l'écran
// tel que le process principal le tient, et tel que la vue le pose et le retire.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { opinionDeMacOS, passerLeFirstLaunch, holdLOpinionDeBackground } from "../src/first-launch/index.ts";
import { holdOpinionDeBackground } from "../src/vue/first-launch/opinion-de-background.js";
import { Faux } from "./aides/fausse-vue.ts";

const marqueNeuve = () => join(mkdtempSync(join(tmpdir(), "avis-de-fond-")), "app", "avis-de-fond-vu");
const doc = { createElement: (balise: string) => new Faux(balise) };
const repos = () => new Promise((resoudre) => setTimeout(resoudre, 5));

test("first launch: the screen shows, the action waits for the button, then runs", async () => {
  const marque = marqueNeuve();
  const opinion = holdLOpinionDeBackground(() => undefined);
  let actions = 0;
  const fini = passerLeFirstLaunch({ marque, afficher: opinion.afficher, declencher: async () => ++actions });
  await repos();
  assert.equal(opinion.attendu(), true, "the screen is awaited");
  assert.equal(actions, 0, "the action waits for the button");
  assert.equal(existsSync(marque), false, "nothing is noted before the button");
  opinion.continuer();
  assert.equal(await fini, 1, "the action's result is handed back");
  assert.equal(opinion.attendu(), false);
});

test("after confirmation: the mark is written, and the second launch runs the action without the screen", async () => {
  const marque = marqueNeuve();
  let screens = 0;
  await passerLeFirstLaunch({ marque, afficher: async () => void screens++, declencher: async () => undefined });
  assert.equal(existsSync(marque), true, "the confirmation is noted");
  let actions = 0;
  await passerLeFirstLaunch({ marque, afficher: async () => void screens++, declencher: async () => void actions++ });
  assert.equal(screens, 1, "second launch: no screen");
  assert.equal(actions, 1, "second launch: the action runs");
});

test("a mark that cannot be written: the action still runs, and the line says the screen comes back", async () => {
  const dossier = mkdtempSync(join(tmpdir(), "avis-de-fond-"));
  const fichier = join(dossier, "un-fichier");
  writeFileSync(fichier, "");
  const marque = join(fichier, "avis-de-fond-vu");
  const lines: string[] = [];
  let actions = 0;
  await passerLeFirstLaunch({ marque, afficher: async () => undefined, declencher: async () => void actions++, dire: (line) => lines.push(line) });
  assert.equal(actions, 1);
  assert.equal(existsSync(marque), false);
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /shows again at the next launch/);
});

test("a screen that fails before the button: the action does not run, and nothing is noted", async () => {
  const marque = marqueNeuve();
  let actions = 0;
  await assert.rejects(passerLeFirstLaunch({ marque, afficher: async () => Promise.reject(new Error("window closed")), declencher: async () => void actions++ }), /window closed/);
  assert.equal(actions, 0);
  assert.equal(existsSync(marque), false);
});

test("the screen comes first only on a Mac where the station is not registered yet", async () => {
  for (const [mac, inscrite, screen] of [[true, false, 1], [true, true, 0], [false, false, 0], [false, true, 0]] as const) {
    const marque = marqueNeuve();
    let screens = 0;
    let actions = 0;
    await passerLeFirstLaunch({ avis: opinionDeMacOS({ mac, inscrite }), marque, afficher: async () => void screens++, declencher: async () => void actions++ });
    assert.equal(screens, screen, `mac ${mac}, registered ${inscrite}`);
    assert.equal(actions, 1, `mac ${mac}, registered ${inscrite}`);
    assert.equal(existsSync(marque), screen === 1, "only a shown screen is noted");
  }
});

test("the main process asks the view for the screen, and the button resolves the wait once", async () => {
  let montre = 0;
  const opinion = holdLOpinionDeBackground(() => void montre++);
  assert.equal(opinion.attendu(), false, "nothing awaited before the launch asks");
  opinion.continuer();
  const wait = opinion.afficher();
  assert.equal(montre, 1);
  assert.equal(opinion.attendu(), true);
  opinion.continuer();
  await wait;
  assert.equal(opinion.attendu(), false);
  opinion.continuer();
});

test("the screen card: its title names Brigade, it says macOS will tell, and it has one recommended button", async () => {
  const lieu = new Faux("section");
  await holdOpinionDeBackground(lieu, new Faux("div"), doc, { avisDeFond: async () => true });
  const card = lieu.children[0];
  assert.deepEqual(card?.children.map((enfant) => enfant.balise), ["h2", "p", "p", "div"]);
  assert.match(card?.children[0]?.textContent ?? "", /^Brigade runs in the background$/);
  assert.match(card?.children[1]?.textContent ?? "", /background/);
  assert.match(card?.children[2]?.textContent ?? "", /macOS/);
  const boutons = lieu.querySelectorAll("button");
  assert.equal(boutons.length, 1);
  assert.equal(boutons[0]?.textContent, "continue");
  assert.equal(boutons[0]?.className, "recommande");
  assert.equal(boutons[0]?.dataset.taille, "grand");
});

test("the view shows the screen over the hidden app when the main process awaits it, and the button gives the app back", async () => {
  const lieu = new Faux("section");
  lieu.hidden = true;
  const cadre = new Faux("div");
  let rendus = 0;
  let recevoir: () => void = () => undefined;
  await holdOpinionDeBackground(lieu, cadre, doc, { avisDeFond: async () => true, surAvisDeFond: (r) => void (recevoir = r), continuerLePremierLancement: async () => void rendus++ });
  assert.equal(lieu.hidden, false, "first launch: the screen shows");
  assert.equal(cadre.hidden, true, "the app is hidden behind it");
  lieu.querySelectorAll("button")[0]?.click();
  assert.equal(rendus, 1, "the button hands back to the main process");
  assert.equal(lieu.hidden, true);
  assert.equal(cadre.hidden, false);
  assert.equal(lieu.children.length, 0);
  recevoir();
  assert.equal(lieu.hidden, false, "asked later, it shows");
});

test("second launch: the view shows no screen when the main process awaits none", async () => {
  const lieu = new Faux("section");
  lieu.hidden = true;
  const cadre = new Faux("div");
  await holdOpinionDeBackground(lieu, cadre, doc, { avisDeFond: async () => false, surAvisDeFond: () => undefined });
  assert.equal(lieu.hidden, true);
  assert.equal(cadre.hidden, false);
  await holdOpinionDeBackground(lieu, cadre, doc, {});
  assert.equal(lieu.hidden, true, "a bridge without it (the phone) shows nothing");
});
