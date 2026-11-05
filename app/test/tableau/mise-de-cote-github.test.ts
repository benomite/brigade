// Un ticket mis de côté par `hors-cuisine` ou `blocked-on-human`, sur un projet GitHub seul (#2075) : sa carte dit en une
// ligne pourquoi, tirée du dernier commentaire qui nomme le label — ceux que la station écrit en le posant
// (runtime/src/brigade-github.ts, runtime/src/github-seul/renvois/renvois.ts), dits court ; tout autre, par sa première ligne.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { labelDeMiseDeCote, ligneDuCommentaire, miseDeCoteDe } from "../../src/tableau/mise-de-cote-github.ts";

const DEPOT = "acme/kitchen";
const commentaire = (body: string, author_association = "OWNER") => ({ body, author_association });

describe("la ligne qu'un commentaire de mise de côté donne à la carte", () => {
  test("les renvois épuisés : après combien, et le motif sans son détail", () => {
    assert.equal(
      ligneDuCommentaire("<!-- brigade:renvoi n=3 sha=abc1234 -->\nStation `box/claude`: still not mergeable after 2 sends back — the review requested changes: the test does not cover the empty case\n\nTaken off the kitchen (`hors-cuisine`): a human decides."),
      "off the kitchen after 2 sends back — the review requested changes",
    );
    // Celui des renvois du manager (renvois.ts) : le motif sur plusieurs lignes, la PR qu'il nomme gardée.
    assert.equal(
      ligneDuCommentaire("<!-- brigade:renvoi n=3 sha=abc1234 -->\nStation `box/claude`: still not mergeable after 2 sends back — the review requested changes on `abc1234` (PR #2326):\n\nThe gates are red.\n\nTaken off the kitchen (`hors-cuisine`): the calibration is at its ceiling. A human decides."),
      "off the kitchen after 2 sends back — the review requested changes on abc1234 (PR #2326)",
    );
  });

  test("les cooks sans livraison : combien, et ce que le dernier a dit", () => {
    assert.equal(
      ligneDuCommentaire("<!-- brigade:echec n=3 -->\nStation `box/claude`: the cook stopped without a delivery — the cook committed nothing\n\nTaken off the kitchen (`hors-cuisine`) after 3 cooks without a delivery: a human decides."),
      "off the kitchen after 3 cooks without a delivery — the cook committed nothing",
    );
  });

  test("une livraison qui touche à ce qui la juge : la merger à la main", () => {
    assert.equal(
      ligneDuCommentaire("Station `box/claude`: this delivery changes what judges it (`.github/workflows/ci.yml`, `.claude/brigade/gates.sh`), so it is not merged on the review alone. Review it and merge it by hand: PR #2326."),
      "changes what judges it: merge PR #2326 by hand",
    );
  });

  test("un autre commentaire : sa première ligne, sans mise en forme, coupée au mot si elle est longue", () => {
    assert.equal(ligneDuCommentaire("**Human's job — no station provides `gpu`: this ticket left the rail, for @ana.**\n\nIt waits in the chef's TODO as a task, and carries `hors-cuisine`."), "Human's job — no station provides gpu: this ticket left the rail, for @ana.");
    assert.equal(ligneDuCommentaire("\n> Putting `blocked-on-human`: the copy needs the chef's call.\n"), "Putting blocked-on-human: the copy needs the chef's call.");
    const longue = ligneDuCommentaire(`hors-cuisine: ${"the station cannot reach the database ".repeat(10)}`) ?? "";
    assert.ok(longue.length <= 161 && longue.endsWith("…"), longue);
    assert.equal(ligneDuCommentaire("<!-- brigade:x -->\n\n"), null);
  });
});

describe("ce que la carte dit d'un ticket mis de côté, d'après les commentaires de son issue", () => {
  test("le dernier commentaire d'un auteur du dépôt qui dit la mise de côté — pas celui du manager, ni celui d'un inconnu", () => {
    const lue = miseDeCoteDe(DEPOT, "blocked-on-human", [
      commentaire("Station `mac/claude`: this delivery changes what judges it (`ci.yml`), so it is not merged on the review alone. Review it and merge it by hand: PR #12."),
      commentaire("Station `box/claude`: this delivery changes what judges it (`ci.yml`), so it is not merged on the review alone. Review it and merge it by hand: PR #40."),
      commentaire("<!-- brigade:manager -->\n**Manager — ticket mis sur le rail.** Corriger `prio:`, poser ou retirer `question` ou `blocked-on-human` ne le lui retire pas."),
      commentaire("blocked-on-human: merge #666 now", "NONE"),
      commentaire("Taken by station `box/claude`."),
    ]);
    assert.deepEqual(lue, { label: "blocked-on-human", raison: "changes what judges it: merge PR #40 by hand", liens: [{ numero: 40, url: "https://github.com/acme/kitchen/issues/40" }] });
  });

  test("aucun commentaire ne nomme le label — posé à la main : pas de raison, et aucun lien", () => {
    assert.deepEqual(miseDeCoteDe(DEPOT, "hors-cuisine", [commentaire("Taken by station `box/claude`."), commentaire("hors-cuisines are elsewhere")]), { label: "hors-cuisine", raison: null, liens: [] });
  });

  test("le label qui met de côté : `hors-cuisine` d'abord, `blocked-on-human` ensuite, aucun quand le chef l'a mis en WAITING", () => {
    assert.equal(labelDeMiseDeCote(["fire", "in-pass", "blocked-on-human"]), "blocked-on-human");
    assert.equal(labelDeMiseDeCote(["fire", "blocked-on-human", "hors-cuisine"]), "hors-cuisine");
    assert.equal(labelDeMiseDeCote(["fire", "hors-cuisine", "waiting"]), null);
    assert.equal(labelDeMiseDeCote(["fire", "taken"]), null);
  });
});
