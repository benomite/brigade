// Un ticket mis de côté par `served-elsewhere` ou `out-of-kitchen`, sur un projet GitHub seul (#2075) : sa carte dit en une
// ligne pourquoi, tirée du dernier commentaire qui nomme le label — ceux que la station écrit en le posant
// (the old station, now deleted), dits court ; tout autre, par sa première ligne.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { labelOfSetAside, lineOfComment, setAsideOf } from "../../src/board/set-aside-github.ts";

// The waiting labels from before `parked` (#4260), copied from the old runtime's github-etat/etats.ts (deleted, #4775).
const LABELS_BEFORE_PARKED: readonly string[] = ["waiting", "set-aside:failures", "blocked-on-human", "decision", "question", "product-question"];

const REPOSITORY = "acme/kitchen";
const comment = (body: string, author_association = "OWNER") => ({ body, author_association });

describe("la ligne qu'un commentaire de mise de côté donne à la carte", () => {
  test("les renvois épuisés : après combien, et le motif sans son détail", () => {
    assert.equal(
      lineOfComment("<!-- brigade:renvoi n=3 sha=abc1234 -->\nStation `box/claude`: still not mergeable after 2 sends back — the review requested changes: the test does not cover the empty case\n\nTaken off the kitchen (`served-elsewhere`): a human decides.", 7),
      "off the kitchen after 2 sends back — the review requested changes",
    );
    // Celui des renvois du manager (renvois.ts) : le motif sur plusieurs lignes, la PR qu'il nomme gardée.
    assert.equal(
      lineOfComment("<!-- brigade:renvoi n=3 sha=abc1234 -->\nStation `box/claude`: still not mergeable after 2 sends back — the review requested changes on `abc1234` (PR #2326):\n\nThe gates are red.\n\nTaken off the kitchen (`served-elsewhere`): the calibration is at its ceiling. A human decides.", 7),
      "off the kitchen after 2 sends back — the review requested changes on abc1234 (the PR of #7)",
    );
  });

  test("les cooks sans livraison : combien, et ce que le dernier a dit", () => {
    assert.equal(
      lineOfComment("<!-- brigade:echec n=3 -->\nStation `box/claude`: the cook stopped without a delivery — the cook committed nothing\n\nTaken off the kitchen (`served-elsewhere`) after 3 cooks without a delivery: a human decides.", 7),
      "off the kitchen after 3 cooks without a delivery — the cook committed nothing",
    );
  });

  test("un autre commentaire : sa première ligne, sans mise en forme, coupée au mot si elle est longue", () => {
    assert.equal(lineOfComment("**Human's job — no station provides `gpu`: this ticket left the rail, for @ana.**\n\nIt waits in the chef's TODO as a task, and carries `served-elsewhere`.", 7), "Human's job — no station provides gpu: this ticket left the rail, for @ana.");
    assert.equal(lineOfComment("\n> Putting `served-elsewhere`: the copy needs the chef's call.\n", 7), "Putting served-elsewhere: the copy needs the chef's call.");
    const long = lineOfComment(`served-elsewhere: ${"the station cannot reach the database ".repeat(10)}`, 7) ?? "";
    assert.ok(long.length <= 161 && long.endsWith("…"), long);
    assert.equal(lineOfComment("<!-- brigade:x -->\n\n", 7), null);
  });

  // Ce que la ligne suppose (ticket 3716) : un commentaire de mise de côté ne parle que de la livraison de son ticket. Toute
  // PR qu'il nomme — même sous un autre numéro — y est dite comme la PR du ticket.
  test("toute PR que la ligne nomme est dite comme celle du ticket, quel que soit son numéro", () => {
    assert.equal(lineOfComment("Putting `served-elsewhere`: PR #2326 needs the chef's call, and pull request #2400 too.", 7), "Putting served-elsewhere: the PR of #7 needs the chef's call, and the PR of #7 too.");
  });
});

describe("ce que la carte dit d'un ticket mis de côté, d'après les commentaires de son issue", () => {
  test("le dernier commentaire d'un auteur du dépôt qui dit la mise de côté — pas celui du manager, ni celui d'un inconnu", () => {
    const readEntry = setAsideOf(REPOSITORY, "served-elsewhere", [
      comment("Station `mac/claude`: served-elsewhere — the box of #12 serves it."),
      comment("Station `box/claude`: served-elsewhere — the box of #40 serves it."),
      comment("<!-- brigade:manager -->\n**Manager — ticket mis sur le rail.** Corriger `prio:`, poser ou retirer `served-elsewhere` ne le lui retire pas."),
      comment("served-elsewhere: merge #666 now", "NONE"),
      comment("Taken by station `box/claude`."),
    ], 8);
    assert.deepEqual(readEntry, { label: "served-elsewhere", raison: "served-elsewhere — the box of #40 serves it.", complete: "served-elsewhere — the box of #40 serves it.", liens: [{ numero: 40, url: "https://github.com/acme/kitchen/issues/40" }], auChef: false });
  });

  test("aucun commentaire ne nomme le label — posé à la main : pas de raison, et aucun lien", () => {
    assert.deepEqual(setAsideOf(REPOSITORY, "served-elsewhere", [comment("Taken by station `box/claude`."), comment("served-elsewheres are elsewhere")], 8), { label: "served-elsewhere", raison: null, liens: [], auChef: false });
  });

  test("le label qui met de côté : `served-elsewhere` d'abord, `out-of-kitchen` ensuite ; aucun quand il est parqué — `parked`, ou un label d'attente d'avant parked (#4260)", () => {
    assert.equal(labelOfSetAside(["fire", "in-pass", "out-of-kitchen"]), "out-of-kitchen");
    assert.equal(labelOfSetAside(["fire", "out-of-kitchen", "served-elsewhere"]), "served-elsewhere");
    assert.equal(labelOfSetAside(["fire", "served-elsewhere", "parked"]), null);
    // `parked` attend toujours un autre que le chef (ticket 4129), même sur une carte qui garde `chef-todo` : aucun.
    assert.equal(labelOfSetAside(["fire", "served-elsewhere", "parked", "chef-todo"]), null);
    assert.equal(labelOfSetAside(["fire", "taken"]), null);
    // Un label d'attente d'avant parked parque le ticket : jamais une mise de côté (list copied above).
    for (const old of LABELS_BEFORE_PARKED) assert.equal(labelOfSetAside(["fire", old]), null, old);
    // Mis de côté, il ne va au chef que pour une question de produit marquée : `out-of-kitchen` dit sa raison, et rien ne
    // lui est demandé ; plus de carte « lift the hold » ni de merge à la main.
    assert.deepEqual(setAsideOf(REPOSITORY, "out-of-kitchen", [comment("Station `box/claude`: out-of-kitchen — no station here has a GPU.")], 8), { label: "out-of-kitchen", raison: "out-of-kitchen — no station here has a GPU.", liens: [], auChef: false });
    const question = comment("<!-- brigade:todo kind=product-question -->\nKeep the old column order?\n- [resume] Yes\n- [close] No");
    assert.deepEqual(setAsideOf(REPOSITORY, "served-elsewhere", [question], 8).chef, { sorte: "product-question", texte: "Keep the old column order?\n- [resume] Yes\n- [close] No" });
  });

  test("une question de produit que suit une réponse du chef (#2434) n'attend plus rien de lui : le ticket ne va plus au chef", () => {
    const question = comment("<!-- brigade:todo kind=product-question -->\nKeep the old column order?\n- [resume] Yes\n- [close] No");
    assert.equal(setAsideOf(REPOSITORY, "served-elsewhere", [question], 8).auChef, true);
    const answeredOne = setAsideOf(REPOSITORY, "served-elsewhere", [question, comment("<!-- brigade:reponse gesture=resume -->\nYes")], 8);
    assert.equal(answeredOne.auChef, false);
    assert.equal(answeredOne.chef, undefined);
    // Une nouvelle question, posée après la réponse, est de nouveau la sienne ; une réponse d'un inconnu ne compte pas.
    assert.equal(setAsideOf(REPOSITORY, "served-elsewhere", [question, comment("<!-- brigade:reponse gesture=resume -->\nYes"), question], 8).auChef, true);
    assert.equal(setAsideOf(REPOSITORY, "served-elsewhere", [question, comment("<!-- brigade:reponse gesture=close -->\nNo", "NONE")], 8).auChef, true);
  });
});

describe("#2061, 2026-11-05 : mis de côté par la station, sans question pour le chef (#2455)", () => {
  test("trois marqueurs `echec`, `served-elsewhere`, aucune question de produit : pas de carte dans TODO", () => {
    const failure = (n: number) => comment(`<!-- brigade:echec n=${n} -->\nStation \`box/claude\`: the cook stopped without a delivery — a stale conflicting branch${n === 3 ? "\n\nTaken off the kitchen (`served-elsewhere`) after 3 cooks without a delivery: a human decides." : ""}`);
    const readEntry = setAsideOf(REPOSITORY, "served-elsewhere", [failure(1), failure(2), failure(3)], 8);
    assert.equal(readEntry.auChef, false);
    assert.equal(readEntry.chef, undefined);
    assert.equal(readEntry.raison, "off the kitchen after 3 cooks without a delivery — a stale conflicting branch");
  });
});
