// "Since you last looked" (#4649), played in the whole vue: the bridge answers with the real reading (since-last-looked.ts)
// over a fake GitHub and a last look kept in a file, as the main process does. Opening the project after tickets were
// merged and one was parked shows them with their full counts at the top of the view; opening it again, with no change,
// shows "nothing" in every group; an entry opens its issue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { holdLastLooks, sinceYouLastLooked } from "../../src/since-last-looked.ts";
import { type Fake, type Played, playTheVue, repos } from "../helpers/false-vue.ts";
import { fakeGitHub, repositoryAround, REPOSITORY, type RepositoryState } from "./fake-github.ts";

const PARADE = "parade";
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER, calibrage: { modeles: MODELS, efforts: EFFORTS }, code: undefined,
});

// The app opened on the project: its rail read, and the card the bridge reads at its opening.
async function openTheProject(state: RepositoryState, looks: ReturnType<typeof holdLastLooks>): Promise<Played> {
  const { call } = fakeGitHub(state);
  const vue = await playTheVue({ demarrage: startup, espace: () => [], ouvrirIssue: async () => true, sinceYouLastLooked: (project: string) => sinceYouLastLooked({ projet: project, depot: REPOSITORY, appeler: call, looks }) } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const now = new Date().toISOString();
  const facts = { etat: "ouverte", lu: now, dernierTick: now, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, cooks: [], attend: [], rail: [{ ticket: 10, etat: "en attente", titre: "Ticket 10", url: "https://github.com/chef/parade/issues/10", activite: null }] } as unknown as Facts;
  const received = holdFacts().recevoir({ projet: PARADE, demande: 0, a: now, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...received, demande: vue.dernier("faits")[0] as number });
  for (let i = 0; i < 4; i++) await repos();
  return vue;
}
const cardOf = (vue: Played): Fake => {
  const first = vue.element("rail").children[0];
  assert.equal(first?.ariaLabel, "Since you last looked", "the card is the first thing of the project view");
  return first as Fake;
};
const headings = (card: Fake) => [...card.descendants()].filter((pose) => pose.tagName.toLowerCase() === "h4").map((pose) => pose.textContent);
const group = (card: Fake, key: string): Fake => [...card.descendants()].find((pose) => pose.dataset.group === key) ?? assert.fail(`no group ${key}`);

test("opening the project after merges and a park for the chef shows both in their groups, counted in full; opening it again with no change says nothing in every group", async () => {
  const folder = mkdtempSync(join(tmpdir(), "last-looked-vue-"));
  try {
    const looks = holdLastLooks(join(folder, "last-looked.json"));
    // The last look, two hours ago; the fake repository changed after it.
    const since = new Date(Date.now() - 2 * 3_600_000);
    looks.set(PARADE, since);
    const state = repositoryAround(since);

    const first = cardOf(await openTheProject(state, looks));
    assert.deepEqual(headings(first), ["Merged · 4", "Sent back or reverted · 3", "Parked for you · 2"]);
    assert.match(group(first, "merged").textContent, /#14 Fourteen by hand.*#13 Thirteen.*#12 Twelve/);
    assert.doesNotMatch(group(first, "merged").textContent, /#11/, "three entries at most");
    assert.match(group(first, "parked").textContent, /#32 Thirty-two.*#30 Thirty/);
    assert.doesNotMatch(first.textContent, /nothing/);

    // Opened again: the last look is the opening before, and nothing changed since.
    const again = cardOf(await openTheProject(state, looks));
    assert.deepEqual(headings(again), ["Merged · 0", "Sent back or reverted · 0", "Parked for you · 0"]);
    for (const key of ["merged", "sentBack", "parked"]) assert.match(group(again, key).textContent, /nothing/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("clicking an entry opens its issue", async () => {
  const folder = mkdtempSync(join(tmpdir(), "last-looked-vue-"));
  try {
    const looks = holdLastLooks(join(folder, "last-looked.json"));
    const since = new Date(Date.now() - 2 * 3_600_000);
    looks.set(PARADE, since);
    const vue = await openTheProject(repositoryAround(since), looks);
    const entry = [...cardOf(vue).descendants()].find((pose) => pose.dataset.ticket === "30") ?? assert.fail("no entry #30");
    entry.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 30]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("the first opening of a project shows no card: there is no last look to compare with", async () => {
  const folder = mkdtempSync(join(tmpdir(), "last-looked-vue-"));
  try {
    const looks = holdLastLooks(join(folder, "last-looked.json"));
    const vue = await openTheProject(repositoryAround(new Date()), looks);
    assert.notEqual(vue.element("rail").children[0]?.ariaLabel, "Since you last looked");
    assert.ok(looks.get(PARADE) !== undefined, "the opening is the last look now");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("a reading GitHub refuses says why in the card, in one line", async () => {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], sinceYouLastLooked: async () => { throw new Error("Error invoking remote method 'sinceYouLastLooked': Error: GitHub answered HTTP 403"); } } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  for (let i = 0; i < 4; i++) await repos();
  const card = [...vue.element("rail").descendants(), ...vue.element("rail").children].find((pose) => pose.ariaLabel === "Since you last looked") ?? assert.fail("no card");
  assert.match(card.textContent, /What changed since you last looked was not read from GitHub: GitHub answered HTTP 403/);
});
