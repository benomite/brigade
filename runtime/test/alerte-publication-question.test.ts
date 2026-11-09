// L'alerte d'une publication ratée n'arrive au chef que si la cuisine ne sait
// pas la réparer, et alors en question (#3090) : le cas de #3084,
// « publier-app: app-v1.0.185 was not published, a build failed ».
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, test, type TestContext } from "node:test";
import { etiquetteDeLAlerte, publieeDansLeClone, publieeParLesTags, questionDeLAlerte } from "../src/alerte-publication-question.ts";
import { attentesDuChef, direAttenteEn } from "../src/attend.ts";
import { carteDuTicket } from "../src/carte-todo/cartes.ts";
import type { Fait } from "../src/evenements.ts";
import { ENCORE_ROUGE } from "../src/events/pass.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { ouvrirRail } from "./aides/rail-du-journal.ts";
import { montre } from "./aides/cuisine.ts";
import { aArreter, DEPOT, ENV_GIT, repertoireTemporaire } from "./outils.ts";

// La carte que lit l'app passe par la lecture du clone par défaut : aucun clone
// de la machine ne s'en mêle ici.
delete process.env.BRIGADE_REPO_DIR;

const PROJET = "brigade";
const STATION = "box/claude";
const N = 3084;
const TITRE = "publier-app: app-v1.0.185 was not published, a build failed";
const ETIQUETTE = "app-v1.0.185";

describe("the decision, without I/O", () => {
  test("the tag of an alert is read from its title, and nothing else is an alert", () => {
    assert.equal(etiquetteDeLAlerte(TITRE), ETIQUETTE);
    assert.equal(etiquetteDeLAlerte("publier-app: app-v1.0.186 was not published, GitHub retired a runner image"), "app-v1.0.186");
    assert.equal(etiquetteDeLAlerte("Switch brigade to GitHub-only state"), null);
    assert.equal(etiquetteDeLAlerte(null), null);
  });

  test("an alert the kitchen can still work on: nothing for the chef", () => {
    assert.deepEqual(questionDeLAlerte({ etiquette: ETIQUETTE, essais: "at-work", publiee: false }), { pour: "kitchen", pourquoi: "the kitchen is still working on app-v1.0.185" });
    assert.equal(questionDeLAlerte({ etiquette: ETIQUETTE, essais: "at-work", publiee: null }).pour, "kitchen");
  });

  test("an alert whose release is already published: nothing for the chef, even if the kitchen gave up", () => {
    assert.deepEqual(questionDeLAlerte({ etiquette: ETIQUETTE, essais: "gave-up", publiee: true }), { pour: "kitchen", pourquoi: "app-v1.0.185 is already published" });
  });

  test("an alert the kitchen gave up on, release not published or unknown: one question naming the release, with its ways forward", () => {
    for (const publiee of [false, null]) {
      const suite = questionDeLAlerte({ etiquette: ETIQUETTE, essais: "gave-up", publiee });
      assert.equal(suite.pour, "chef");
      if (suite.pour !== "chef") return;
      assert.equal(suite.question, "How should app-v1.0.185 reach users?");
      assert.deepEqual(suite.choix, [
        { texte: "Let the kitchen try to publish app-v1.0.185 again", suite: "resume" },
        { texte: "I fix the publication of app-v1.0.185 myself", suite: "drop" },
        { texte: "Skip app-v1.0.185: the next release carries its changes", suite: "close" },
      ]);
    }
  });

  test("published: its own tag, or a later one of the same series", () => {
    assert.equal(publieeParLesTags(ETIQUETTE, ["app-v1.0.184", "app-v1.0.185"]), true);
    assert.equal(publieeParLesTags(ETIQUETTE, ["app-v1.0.184", "app-v1.0.186"]), true);
    assert.equal(publieeParLesTags(ETIQUETTE, ["app-v1.1.0"]), true);
    assert.equal(publieeParLesTags(ETIQUETTE, ["app-v1.0.184", "station-9.9.9", "app-v1.0.185-rc"]), false);
    assert.equal(publieeParLesTags(ETIQUETTE, []), false);
  });
});

describe("the tags of the station's clone", () => {
  test("a tag in the clone says published; an absent one, not; no clone or an unreadable one, unknown", (t: TestContext) => {
    const clone = repertoireTemporaire(t);
    const git = (...args: string[]) => execFileSync("git", ["-C", clone, ...args], { env: ENV_GIT, stdio: "ignore" });
    git("init", "--quiet");
    git("commit", "--quiet", "--allow-empty", "-m", "base");
    git("tag", "app-v1.0.184");
    assert.equal(publieeDansLeClone(clone)(ETIQUETTE), false);
    git("tag", ETIQUETTE);
    assert.equal(publieeDansLeClone(clone)(ETIQUETTE), true);
    assert.equal(publieeDansLeClone(undefined)(ETIQUETTE), null);
    assert.equal(publieeDansLeClone(repertoireTemporaire(t))(ETIQUETTE), null);
  });
});

function atelier(t: TestContext) {
  const heure = montre("2026-11-09T15:00:00.000Z");
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: heure.maintenant });
  aArreter(t, () => journal.fermer());
  const rail = ouvrirRail(journal, { projet: PROJET, dureeBailMs: 600_000, maintenant: heure.maintenant });
  const noter = (fait: Fait, author = "runtime") => journal.ajouter({ project: PROJET, ticket: N, author, ...fait });
  // L'alerte sur le rail, prise, livrée rouge, puis remontée pour `cause`.
  const remonter = (cause: string) => {
    noter({ type: "ticket.arrived", payload: { title: TITRE, priority: 0, createdAt: "2026-11-09T09:00:00Z", url: `https://github.com/${DEPOT}/issues/${N}`, model: "opus", effort: "medium", card: null } }, "github");
    rail.prendre(STATION);
    noter({ type: "cook.launched", payload: { run: "cook-3084", limits: { durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/cook-3084.jsonl", station: STATION, branch: "cook/3084-x", worktree: "worktrees/3084-x" } }, `station:${STATION}`);
    rail.envoyerEnPass(N, STATION);
    noter({ type: "pass.started", payload: { run: "cook-3084", pr: `https://github.com/${DEPOT}/pull/3100`, number: 3100, sha: "abc123" } }, "pass");
    noter({ type: "pass.escalated", payload: { reason: ENCORE_ROUGE, cause } }, "pass");
    rail.quatreVingtSix(N, { motif: `pass:${ENCORE_ROUGE}` });
  };
  // La cuisine renonce : elle sort l'alerte du rail, et le sondage voit `fire` retiré.
  const abandonner = () => {
    remonter("returns-exhausted");
    heure.avancer(60_000);
    noter({ type: "pass.kitchen-took-over", payload: { cause: "returns-exhausted", move: "drop", reason: "nothing more could be tried" } }, "pass");
    noter({ type: "ticket.left", payload: { reason: "unfired" } }, "github");
  };
  const enTodo = (publiee: (etiquette: string) => boolean | null) => attentesDuChef(journal.base, lireRail(journal.base), heure.maintenant(), publiee).filter((attente) => attente.ticket === N);
  return { journal, remonter, abandonner, enTodo };
}

describe("the chef's TODO", () => {
  test("an alert the kitchen can still work on — red, taken back by the kitchen — puts nothing in the chef's TODO", (t) => {
    const c = atelier(t);
    c.remonter("returns-exhausted");
    assert.deepEqual(c.enTodo(() => false), []);
    assert.equal(carteDuTicket(c.journal.base, N), null);
  });

  test("an alert the kitchen judged it cannot fix puts exactly one item in the chef's TODO: a question, with the ways forward", (t) => {
    const c = atelier(t);
    c.abandonner();
    const attentes = c.enTodo(() => false);
    assert.equal(attentes.length, 1);
    assert.equal(direAttenteEn(attentes[0]!), "How should app-v1.0.185 reach users? Let the kitchen try to publish app-v1.0.185 again; or I fix the publication of app-v1.0.185 myself; or Skip app-v1.0.185: the next release carries its changes");

    // Ce que l'app montre dans TODO : la carte du ticket, dans la forme unique.
    const lue = carteDuTicket(c.journal.base, N);
    assert.equal(lue?.attentes.length, 1);
    assert.equal(lue?.carte.question, "How should app-v1.0.185 reach users?");
    assert.equal(lue?.carte.resume, "The release app-v1.0.185 was not published, and the kitchen could not fix it. No user gets this version until a run publishes it.");
    assert.deepEqual(lue?.carte.choix.map(({ texte, suite }) => [texte, suite]), [
      ["Let the kitchen try to publish app-v1.0.185 again", "resume"],
      ["I fix the publication of app-v1.0.185 myself", "drop"],
      ["Skip app-v1.0.185: the next release carries its changes", "close"],
    ]);
  });

  test("a cook that declared itself blocked on the alert is the kitchen giving up too: the same single question", (t) => {
    const c = atelier(t);
    c.remonter("cook-blocked");
    const attentes = c.enTodo(() => null);
    assert.equal(attentes.length, 1);
    assert.equal(attentes[0]?.quoi, "remontee");
    assert.match(direAttenteEn(attentes[0]!), /^How should app-v1\.0\.185 reach users\? /);
  });

  test("an alert whose release is already published puts nothing in the chef's TODO, abandoned or escalated", (t) => {
    const c = atelier(t);
    c.abandonner();
    assert.deepEqual(c.enTodo((etiquette) => etiquette === ETIQUETTE), []);
    const d = atelier(t);
    d.remonter("cook-blocked");
    assert.deepEqual(d.enTodo(() => true), []);
  });
});
