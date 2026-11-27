// Le récapitulatif sur l'accueil, dans la vue entière (#3581) : à l'ouverture de l'app, chaque projet dit ce que sa cuisine
// a fait depuis que le chef a regardé — ses tickets servis et le lien de leur PR, ses renvois et refus avec leur raison,
// ses arrêts de garde-fous —, puis ce qui attend dans TODO ; rien depuis, il le dit. Montré, le runtime du projet en est
// averti ; à la réouverture de l'app — et d'un runtime neuf —, seul ce qui est plus neuf revient. Le pont est le faux de
// la vue ; derrière lui, le process principal tel qu'il est (recap-box.ts), et la commande `recap` du runtime jouée sur un
// répertoire d'état et un faux GitHub (world.ts).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { withWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import { readTheBoardOfRepository } from "../../src/board/read.ts";
import { readTheRecap, markTheRecap } from "../../src/vue/recap/recap-box.ts";
import { setTheRecap } from "../../src/vue/recap/recap.js";
import { KEY_OF_THE_LAST_OPENING, CLOSE } from "../../src/vue/absence/absence.js";
import { Fake, FakeStorage, playTheVue, repos } from "../helpers/false-vue.ts";
import { callOfTheApp, boxOf, closedOne, issue, stationOfRecap, type World } from "./world.ts";

const PROJECTS: Project[] = [
  { nom: "parade", dossier: "/tmp/parade", depot: "chef/parade" },
  { nom: "cantine", dossier: "/tmp/cantine", depot: "chef/cantine" },
];
// Ce que l'accueil en dit (recap/recap.js), et le marqueur dans le répertoire d'état du projet (runtime/src/recap/marqueur.ts).
const TITLE = "Since you last looked";
const NOTHING = "Nothing happened since you last looked.";
const FILE_OF_RECAP = "recap.json";
const REPOSITORIES: Record<string, string> = { parade: "chef/parade", cantine: "chef/cantine" };
const sendBack = (reason: string, the: string) => ({ id: 7, body: `<!-- brigade:renvoi n=1 sha=7579211 -->\nStation \`box/claude\`: sent back to a cook (1/2) — ${reason}\n\nThe next cook takes up the branch of PR #50.`, author_association: "OWNER", created_at: the });
// Une livraison que la cuisine parque pour le chef (`parked:chef`, #4474) : son commentaire dit pourquoi.
const judge = (ticket: number) => ({ id: 8, body: `Parked for the chef: merge the PR of #${ticket} by hand? It changes what judges it.`, author_association: "OWNER", created_at: "2026-11-10T01:00:00Z" });

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: PROJECTS }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

function kitchen(t: TestContext) {
  let now = "2026-11-10T10:00:00.000Z";
  const worlds: Record<string, World> = {
    parade: {
      issues: [issue("chef/parade", 2408, ["in-pass", "parked:chef"])],
      commentaires: { 2408: [judge(2408)], 20: [sendBack("the CI is red on `7579211` (PR #50):", "2026-11-10T03:00:00Z")] },
      fermees: [closedOne("chef/parade", 12, 41, "2026-11-10T09:00:00Z"), closedOne("chef/parade", 11, 40, "2026-11-09T08:00:00Z")],
    },
    cantine: { issues: [], commentaires: {}, fermees: [] },
  };
  const station = stationOfRecap(t, { parade: { depot: "chef/parade", monde: () => worlds.parade! }, cantine: { depot: "chef/cantine", monde: () => worlds.cantine! } }, () => now);
  station.journaliser("parade", "2026-11-10T05:00:00.000Z", 14, "guard.tripped", { run: "14-a", reason: "duration", limit: 1, observed: 2 });
  const openEntries: string[] = [];
  const open = () =>
    playTheVue({
      demarrage: startup,
      espace: () => [],
      lireLeRecap: (name) => readTheRecap(name, boxOf(name), REPOSITORIES[name] ?? "", station.lancer),
      marquerLeRecap: (name, until) => markTheRecap(name, boxOf(name), REPOSITORIES[name] ?? "", until, station.lancer),
      ouvrirLaPRDuRecap: async (url) => (openEntries.push(url), true),
    });
  return { station, mondes: worlds, ouvertes: openEntries, ouvrir: open, avancer: (instant: string) => void (now = instant) };
}

const section = (vue: Awaited<ReturnType<typeof playTheVue>>, project: string): Fake => vue.element("recap-de-l-accueil").dessous("section").find(({ dataset }) => dataset.projet === project) ?? assert.fail(`no recap for ${project}`);
const lines = (block: Fake, classe: string) => (block.dessous("ul").find(({ className }) => className === classe)?.dessous("li") ?? []).map((li) => li.textContent);

describe("the recap on the home screen (#3581)", () => {
  test("on opening, each project shows its own recap: served tickets with their pull request, send-backs with their reason, guardrail stops; nothing happened says so", async (t: TestContext) => {
    const { ouvrir: open, ouvertes: openEntries } = kitchen(t);
    const vue = await open();
    await repos();
    assert.match(vue.element("recap-de-l-accueil").textContent, new RegExp(TITLE));
    const parade = section(vue, "parade");
    assert.deepEqual(lines(parade, "servis"), ["#12 Ticket 12PR of #12", "#11 Ticket 11PR of #11"]);
    assert.deepEqual(lines(parade, "renvoyes"), ["#20 sent back to a cook: the CI is red on 7579211 (the PR of #20)"]);
    assert.deepEqual(lines(parade, "arrets"), ["The cook of #14 was stopped by the duration cap."]);
    assert.doesNotMatch(parade.textContent, new RegExp(NOTHING));
    // Le lien de la PR d'un ticket servi : là où se voient ses gates, sa CI et sa relecture.
    const pr = parade.dessous("button").find(({ textContent }) => textContent === "PR of #12") ?? assert.fail("no link to the PR of #12");
    assert.match(pr.title, /gates, CI and review/);
    pr.click();
    assert.deepEqual(openEntries, ["https://github.com/chef/parade/pull/41"]);
    // Deux projets, deux récapitulatifs : cantine n'a rien fait, et le dit.
    const cantine = section(vue, "cantine");
    assert.match(cantine.textContent, new RegExp(NOTHING));
    assert.deepEqual([lines(cantine, "servis"), lines(cantine, "renvoyes"), lines(cantine, "arrets")], [[], [], []]);
  });

  test("shown once, the runtime marks it seen; reopened later — app and runtime restarted — only what is newer comes back", async (t: TestContext) => {
    const { ouvrir: open, mondes: worlds, station, avancer: advance } = kitchen(t);
    const first = await open();
    await repos();
    assert.deepEqual(first.appels.filter(({ geste: action }) => action === "marquerLeRecap").map(({ args }) => args).sort(), [["cantine", "2026-11-10T10:00:00.000Z"], ["parade", "2026-11-10T10:00:00.000Z"]]);
    for (const name of ["parade", "cantine"]) assert.deepEqual(JSON.parse(readFileSync(join(station.etats[name] ?? "", FILE_OF_RECAP), "utf8")), { seenUntil: "2026-11-10T10:00:00.000Z" });
    // Deux heures plus tard : #13 servi, #21 renvoyé ; rien de neuf pour cantine.
    advance("2026-11-10T12:00:00.000Z");
    worlds.parade!.fermees.unshift(closedOne("chef/parade", 13, 42, "2026-11-10T11:00:00Z"));
    worlds.parade!.commentaires[21] = [sendBack("the review requested changes", "2026-11-10T11:30:00Z")];
    const reopened = await open();
    await repos();
    const parade = section(reopened, "parade");
    assert.deepEqual(lines(parade, "servis"), ["#13 Ticket 13PR of #13"]);
    assert.deepEqual(lines(parade, "renvoyes"), ["#21 sent back to a cook: the review requested changes"]);
    assert.deepEqual(lines(parade, "arrets"), []);
    assert.match(section(reopened, "cantine").textContent, new RegExp(NOTHING));
  });

  test("not shown — another screen covers the home — nothing is marked: it is, once the home is shown", async (t: TestContext) => {
    const { station } = kitchen(t);
    const storage = new FakeStorage();
    storage.setItem(KEY_OF_THE_LAST_OPENING, "2026-11-01T00:00:00.000Z");
    const without = { sans: "weekly summaries unavailable" };
    const vue = await playTheVue(
      {
        demarrage: startup,
        espace: () => [],
        lireLesResumesHebdomadaires: (name) => ({ projet: name, jour: without, resumes: without }),
        lireLeRecap: (name) => readTheRecap(name, boxOf(name), REPOSITORIES[name] ?? "", station.lancer),
        marquerLeRecap: (name, until) => markTheRecap(name, boxOf(name), REPOSITORIES[name] ?? "", until, station.lancer),
      },
      { stockage: storage },
    );
    await repos();
    assert.equal(vue.element("absence").hidden, false, "« since you were away » covers the home");
    assert.equal(vue.appels.filter(({ geste: action }) => action === "marquerLeRecap").length, 0);
    assert.equal(existsSync(join(station.etats.parade ?? "", FILE_OF_RECAP)), false);
    (vue.element("absence").dessous("button").find(({ textContent }) => textContent === CLOSE) ?? assert.fail("no close")).click();
    await repos();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "marquerLeRecap").map(({ args }) => args[0]).sort(), ["cantine", "parade"]);
  });

  test("what awaits in TODO is the list TODO shows, from the same GitHub reading", async (t: TestContext) => {
    const { ouvrir: open, mondes: worlds } = kitchen(t);
    const vue = await open();
    await repos();
    assert.match(section(vue, "parade").textContent, /Reading TODO…/);
    const call = callOfTheApp("chef/parade", () => worlds.parade!);
    const readOne = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: "chef/parade", appeler: call, maintenant: () => new Date("2026-11-10T10:00:00Z") }), call);
    assert.ok(readOne.lu);
    const receivedOne = holdFacts().recevoir({ projet: "parade", demande: 0, a: "2026-11-10T10:00:00.000Z", sorties: [{ commande: "facts", texte: JSON.stringify(readOne.faits) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await repos();
    const parade = section(vue, "parade");
    assert.match(parade.textContent, /Waiting for you in TODO \(1\)/);
    assert.deepEqual(lines(parade, "dans-todo"), ["#2408 Parked for the chef: merge the PR of #2408 by hand? It changes what judges it."]);
    assert.match(section(vue, "cantine").textContent, /Reading TODO…/);
  });

  test("a recap that does not read says so in one line, its detail on hover, and is never marked seen", async () => {
    const vue = await playTheVue({ demarrage: startup, espace: () => [], lireLeRecap: () => ({ sans: "recap unavailable", detail: "gh api … HTTP 502" }) });
    await repos();
    assert.match(section(vue, "parade").textContent, /Recap not reached\./);
    assert.doesNotMatch(section(vue, "parade").textContent, new RegExp(NOTHING));
    assert.equal(vue.appels.filter(({ geste: action }) => action === "marquerLeRecap").length, 0);
  });

  test("a bridge that gives no recap (the phone, an older app) lays no recap block on the home screen", async () => {
    const vue = await playTheVue({ demarrage: startup, espace: () => [] });
    await repos();
    assert.throws(() => vue.element("recap-de-l-accueil"));
    assert.equal(vue.element("tous").children[1]?.id, "accueil-bloc-projets");
  });
});

// Ticket 3716 : GitHub numérote issues et PR d'une seule suite — la PR 3710 de #3709 se lirait comme un ticket. L'accueil dit
// la PR d'un ticket servi, et celle que nomme la raison d'un renvoi, par son ticket ; le lien ouvre toujours la PR.
describe("l'accueil dit la PR d'un ticket par son ticket (ticket 3716)", () => {
  test("#3709 servi par sa PR 3710, puis renvoyé : « PR of #3709 », jamais « #3710 » ; le lien ouvre la PR", () => {
    const doc = { createElement: (balise: string) => new Fake(balise) };
    const PR_URL = "https://github.com/chef/parade/pull/3710";
    const recap = {
      since: "2026-11-10T00:00:00Z",
      served: [{ ticket: 3709, title: "The station keeps the update", url: "https://github.com/chef/parade/issues/3709", pr: 3710, prUrl: PR_URL, servedAt: "2026-11-10T02:00:00Z" }],
      sentBack: [{ ticket: 3709, url: "https://github.com/chef/parade/issues/3709", kind: "sent-back" as const, reason: "the CI is red on `7579211` (PR #3710):", at: "2026-11-10T01:00:00Z" }],
      stops: [],
    };
    const openOnes: string[] = [];
    const pose = setTheRecap(doc as never, [{ projet: "parade", lecture: { recap } as never, todo: [] }], { ouvrir: (url) => void openOnes.push(url) }) as unknown as Fake;
    assert.match(pose.textContent, /PR of #3709/);
    assert.match(pose.textContent, /the CI is red on 7579211 \(the PR of #3709\)/);
    assert.doesNotMatch(pose.textContent, /#3710/);
    const link = pose.dessous("button").find(({ textContent }) => textContent === "PR of #3709") ?? assert.fail("no link to the PR of #3709");
    link.click();
    assert.deepEqual(openOnes, [PR_URL]);
  });
});
