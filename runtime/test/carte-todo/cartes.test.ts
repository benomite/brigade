// Toute carte de TODO a la forme unique (épique #1764) : chaque sorte de ticket
// qui attend le chef — une livraison verte à merger à la main, un rouge remonté
// par le manager, la question du manager avant de découper une épique, une
// question produit entrée par la porte, et toutes les autres — se montre avec
// ce qui se passe en deux phrases au plus, sa question et ses choix qui jouent
// chacun leur geste, la réponse libre, et « ask the second » à part. Une carte
// à un seul geste montre ce bouton et ne demande rien. Une carte qui ne tient
// pas la règle n'entre pas : elle est refusée, avec sa raison.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { AttenteDeTicket } from "../../src/attend.ts";
import { cartesEnTodo, entrerDansTodo, RESUME_D_AVANT } from "../../src/carte-todo.ts";
import { carteDeLAttente, type CarteDuTicket } from "../../src/carte-todo/cartes.ts";
import { CarteRefusee, carteValide, DEMANDER_AU_SECOND, GESTES, validerCarte } from "../../src/carte-todo/forme.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

const DEPUIS = "2026-10-27T08:00:00.000Z";
const ticket = (n: number) => ({ ticket: n, title: `Ticket ${n}`, since: DEPUIS });
const pr = (n: number) => `https://github.com/benomite/brigade/pull/${n}`;

// Chaque sorte d'attente d'un ticket, et chacun des motifs qui changent sa
// carte. Le `satisfies` en garde la liste complète : une sorte ajoutée sans
// exemple ne compile pas.
const EXEMPLES = {
  merge: [
    { ...ticket(1), quoi: "merge", reason: "no-grant", cause: null, pr: pr(1), expired: null },
    { ...ticket(2), quoi: "merge", reason: "no-grant", cause: null, pr: pr(2), expired: "2026-10-26T07:00:00.000Z" },
    { ...ticket(3), quoi: "merge", reason: "review-required", cause: "declaration-modified: .claude/brigade/reseau", pr: pr(3), expired: null },
    { ...ticket(4), quoi: "merge", reason: "merge-refused", cause: "branch protection", pr: pr(4), expired: null },
    { ...ticket(5), quoi: "merge", reason: "unknown-reason", cause: null, pr: null, expired: null },
  ],
  remontee: [
    { ...ticket(6), quoi: "remontee", reason: "still-red", cause: "manager-escalated", pr: pr(6) },
    { ...ticket(7), quoi: "remontee", reason: "still-red", cause: "returns-exhausted", pr: null },
    { ...ticket(8), quoi: "remontee", reason: "unjudged", cause: "no-verdict", pr: pr(8) },
    { ...ticket(9), quoi: "remontee", reason: "unjudged", cause: "unstable-test: runtime/test/lectures-sous-condition.test.ts", pr: pr(9) },
    { ...ticket(10), quoi: "remontee", reason: "still-red", cause: null, pr: pr(10), why: "the rename touches `src/a.ts`. Twice.", nonVu: "2026-10-26" },
    { ...ticket(11), quoi: "remontee", reason: "unknown-reason", cause: null, pr: null },
  ],
  fermee: [{ ...ticket(12), quoi: "fermee", reason: "held", cause: null, pr: pr(12) }],
  "86": [
    { ...ticket(13), quoi: "86", reason: "no-calibration" },
    { ...ticket(14), quoi: "86", reason: "unreadable-card" },
    { ...ticket(15), quoi: "86", reason: "refused" },
  ],
  capacite: [
    { ...ticket(16), quoi: "capacite", manque: { capacites: ["gpu"], ensemble: false } },
    { ...ticket(17), quoi: "capacite", manque: { capacites: ["gpu", "macos"], ensemble: true } },
  ],
  absente: [
    { ...ticket(18), quoi: "absente", stations: ["mac/claude"] },
    { ...ticket(19), quoi: "absente", stations: ["mac/claude", "pc/codex"] },
  ],
  bloque: [
    {
      ...ticket(20),
      quoi: "bloque",
      abandonnes: [
        { ticket: 30, reason: "closed" },
        { ticket: 31, reason: "unfired" },
      ],
    },
  ],
  ecartee: [
    { ...ticket(21), quoi: "ecartee", reason: "question" },
    { ...ticket(22), quoi: "ecartee", reason: "decision" },
    { ...ticket(23), quoi: "ecartee", reason: "blocked-on-human" },
  ],
  illisible: [
    { ...ticket(24), quoi: "illisible", epique: true },
    { ...ticket(25), quoi: "illisible", epique: false },
  ],
  question: [{ ...ticket(26), quoi: "question" }],
  repris: [
    { ...ticket(27), quoi: "repris", attendait: { what: "the **design** review. Then more.", who: "the designer" } },
    { ...ticket(28), quoi: "repris", attendait: null },
  ],
  carte: [
    {
      ...ticket(29),
      quoi: "carte",
      carte: {
        type: "product",
        resume: "The ticket adds a saved list. It can be kept per project or shared by all of them.",
        question: "One list per project, or one for all projects?",
        choix: [
          { texte: "One list per project.", suite: "resume" },
          { texte: "One for all.", suite: "resume" },
        ],
        captures: null,
      },
    },
  ],
} satisfies { [Q in AttenteDeTicket["quoi"]]: Array<Extract<AttenteDeTicket, { quoi: Q }>> };

const TOUTES: AttenteDeTicket[] = Object.values(EXEMPLES).flat();
const exemple = (n: number) => TOUTES.find((attente) => attente.ticket === n) as AttenteDeTicket;

// La carte telle que la règle la rend : la carte d'une attente la tient déjà,
// et la règle n'y change rien.
function tenueParLaRegle(carte: CarteDuTicket) {
  const { type, ...forme } = carte;
  assert.ok(type !== "");
  const validation = validerCarte(forme);
  assert.equal(validation.valide, true, validation.valide ? "" : validation.raison);
  assert.deepEqual((validation as { carte: unknown }).carte, forme);
}

describe("every kind of TODO card is built with the single shape", () => {
  for (const attente of TOUTES) {
    test(`#${attente.ticket} (${attente.quoi}${"reason" in attente ? `, ${attente.reason}` : ""}) passes the rule`, () => {
      const carte = carteDeLAttente(attente);
      tenueParLaRegle(carte);
      assert.equal(carte.secondaire, DEMANDER_AU_SECOND);
      assert.ok(carte.choix.every(({ suite }) => (GESTES as readonly string[]).includes(suite)));
      assert.ok(!carte.choix.some(({ texte }) => texte === DEMANDER_AU_SECOND.texte));
      if (carte.choix.length === 1) assert.equal(carte.question, null);
      else {
        // Toute carte qui n'a pas un seul geste pose sa question, offre au moins deux choix, et la réponse libre.
        assert.ok(carte.question !== null && carte.question.endsWith("?"));
        assert.ok(carte.choix.length >= 2);
        assert.equal(carte.reponseLibre, true);
      }
    });
  }

  test("its kind is that of the gate card, or of what the ticket waits for", () => {
    assert.equal(carteDeLAttente(exemple(29)).type, "product");
    assert.equal(carteDeLAttente(exemple(1)).type, "merge");
    assert.equal(carteDeLAttente(exemple(6)).type, "remontee");
  });

  test("a free text of the kitchen — a cause, a reason, what a ticket waited for — never makes a summary fail", () => {
    for (const n of [3, 9, 10, 27]) assert.doesNotMatch(carteDeLAttente(exemple(n)).resume, /`|\*\*|Twice/);
  });
});

describe("the four kinds the chef named", () => {
  test("merging a green PR by hand: exactly one gesture, the merge, and no question", () => {
    for (const n of [1, 2]) {
      const carte = carteDeLAttente(exemple(n));
      assert.equal(carte.question, null);
      assert.deepEqual(carte.choix, [{ texte: `Merge ${pr(n)}`, suite: "merge" }]);
      assert.equal(carte.reponseLibre, true);
    }
    assert.equal(carteDeLAttente(exemple(1)).resume, "The delivery of #1 is green, but the pass does not merge it without a merge grant.");
  });

  test("a red ticket escalated by the manager: a question, and its choices — back to a cook, merge its PR as it is, or off the rail", () => {
    const carte = carteDeLAttente(exemple(6));
    assert.equal(carte.resume, "The manager escalated #6: its delivery is still red after its returns.");
    assert.equal(carte.question, "What does the kitchen do with #6?");
    assert.deepEqual(carte.choix, [
      { texte: "Send it back to a cook", suite: "resume" },
      { texte: `Merge ${pr(6)} as it is`, suite: "merge" },
      { texte: "Take it off the rail", suite: "drop" },
    ]);
    // Sans PR, rien à merger : il reste deux choix.
    assert.deepEqual(
      carteDeLAttente(exemple(7)).choix.map(({ suite }) => suite),
      ["resume", "drop"],
    );
  });

  test("the manager's question before splitting an epic: a question, two ways to answer, and the free answer", () => {
    const carte = carteDeLAttente(exemple(26));
    assert.equal(carte.question, "How does the manager split #26?");
    assert.equal(carte.choix.length, 2);
    assert.ok(carte.choix.every(({ suite }) => suite === "resume"));
    assert.equal(carte.reponseLibre, true);
  });

  test("a product question entered by the gate: its own summary, question and choices", () => {
    const carte = carteDeLAttente(exemple(29));
    const { carte: entree } = exemple(29) as Extract<AttenteDeTicket, { quoi: "carte" }>;
    assert.equal(carte.resume, entree.resume);
    assert.equal(carte.question, entree.question);
    assert.deepEqual(carte.choix, entree.choix);
  });

  test("a gate card entered before the single shape with one choice: that one gesture, its question said as what the card says", () => {
    const avant = (question: string) =>
      carteDeLAttente({ ...ticket(32), quoi: "carte", carte: { type: "design", resume: RESUME_D_AVANT, question, choix: [{ texte: "Yes, merge it.", suite: "merge" }], captures: null } });
    const carte = avant("Is the empty rail screen right?");
    tenueParLaRegle(carte);
    assert.equal(carte.question, null);
    assert.equal(carte.resume, "Is the empty rail screen right?");
    assert.deepEqual(carte.choix, [{ texte: "Yes, merge it.", suite: "merge" }]);
    // Une question qui ne se lit pas en phrases simples laisse le résumé d'avant.
    assert.equal(avant("Is the `rail` screen right?").resume, RESUME_D_AVANT);
  });
});

describe("a card that fails the rule does not enter TODO", () => {
  function journal(t: TestContext) {
    const ouvert = ouvrirJournal(repertoireTemporaire(t));
    aArreter(t, () => ouvert.fermer());
    return ouvert;
  }
  const PRODUIT = {
    type: "product",
    resume: "The ticket adds an export. Its format decides what the user downloads.",
    enonce: "CSV or JSON?",
    choix: [{ texte: "CSV." }, { texte: "JSON." }],
  };

  test("at the gate: refused with its reason, written to the log, and not added to TODO", (t) => {
    const j = journal(t);
    for (const [proposition, raison] of [
      [{ ...PRODUIT, resume: null }, /^no summary/],
      [{ ...PRODUIT, resume: "One. Two. Three." }, /^summary of 3 sentences/],
      [{ ...PRODUIT, choix: [{ texte: "CSV." }] }, /^a single gesture with a question/],
      [{ ...PRODUIT, choix: [{ texte: "CSV." }, { texte: "ask the second", suite: "resume" }] }, /asks the second/],
    ] as const) {
      const entree = entrerDansTodo(j, "brigade", 40, proposition, "manager");
      assert.equal(entree.porte, "triage");
      assert.match((entree as { raison: string }).raison, raison);
      assert.match(String(j.duTicket(40).findLast((e) => e.type === "todo.refused")?.payload.reason), raison);
    }
    assert.deepEqual(cartesEnTodo(j.base), []);
    assert.equal(j.duTicket(40).filter((e) => e.type === "todo.entered").length, 0);

    // La même carte, entière, entre — avec son résumé.
    const entree = entrerDansTodo(j, "brigade", 40, PRODUIT, "manager");
    assert.equal(entree.porte, "todo");
    assert.equal(cartesEnTodo(j.base)[0]?.resume, PRODUIT.resume);
    assert.equal(j.duTicket(40).findLast((e) => e.type === "todo.entered")?.payload.summary, PRODUIT.resume);
  });

  test("from a producer that builds its card itself: an error, never a card shown half-built", () => {
    assert.throws(() => carteValide({ resume: "Something happens.", choix: [] }), CarteRefusee);
    assert.throws(() => carteValide({ resume: "Something happens.", choix: [{ texte: "Do it", suite: "fly" }] }), /TODO card refused: choice 1 .* plays an unknown gesture/);
    const cassee = { ...exemple(29), carte: { ...(exemple(29) as Extract<AttenteDeTicket, { quoi: "carte" }>).carte, resume: "" } } as AttenteDeTicket;
    assert.throws(() => carteDeLAttente(cassee), /TODO card refused: no summary/);
  });
});
