// A project's autonomy figures (#3222), computed from GitHub fixtures only —
// issue events and comments as GitHub's REST API returns them, and the merged
// pull requests as the app reads them: no file, no log, no state directory.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BLOCKED_ON_HUMAN, CHEF_TODO, chiffresDAutonomie, FIRE, MARQUE_DE_CARTE, MARQUE_DE_RENVOI, premiereLigne, type DonneesDuDepot, type Servi } from "../../../src/autonomie/chiffres/chiffres.ts";
import { A_LA_MAIN } from "../../../src/brigade-github.ts";
import { CHEF_TODO as CHEF_TODO_DES_CARTES, corpsDeCarte, SORTES } from "../../../src/github-seul/carte-todo/carte-todo.ts";
import { LABEL } from "../../../src/github.ts";
import { MARQUE_DE_RENVOI as MARQUE_DE_LA_STATION } from "../../../src/qualite-github.ts";

const MAINTENANT = new Date("2026-11-11T12:00:00.000Z");
const JOUR = 24 * 3600 * 1000;
const HEURE = 3600 * 1000;
const il = (ms: number) => new Date(MAINTENANT.getTime() - ms).toISOString();

// GitHub's shapes: an issue event, an issue comment by the repository's owner.
const pose = (label: string, le: string) => ({ event: "labeled", label: { name: label }, created_at: le });
const commentaire = (body: string, le: string, author_association = "OWNER") => ({ body, created_at: le, author_association });

// A ticket fired `depuis` before now and merged `merge` before now, with its other events and comments.
type Ticket = { numero: number; fire?: number; merge: number; evenements?: object[]; commentaires?: object[] };
function depot(tickets: Ticket[], nom = "chef/parade"): DonneesDuDepot {
  const servis: Servi[] = tickets.map(({ numero, merge }) => ({ ticket: numero, titre: `ticket ${numero}`, url: `https://github.com/${nom}/issues/${numero}`, livre: il(merge) }));
  const issues = Object.fromEntries(
    tickets.map(({ numero, fire, evenements = [], commentaires = [] }) => [numero, { evenements: [...(fire === undefined ? [] : [pose(FIRE, il(fire))]), ...evenements], commentaires }]),
  );
  return { depot: nom, servis, issues };
}

describe("autonomy figures from GitHub", () => {
  test("the marks are the ones the stations write", () => {
    assert.equal(FIRE, LABEL);
    assert.equal(BLOCKED_ON_HUMAN, A_LA_MAIN);
    assert.equal(CHEF_TODO, CHEF_TODO_DES_CARTES);
    assert.equal(MARQUE_DE_RENVOI, MARQUE_DE_LA_STATION);
    for (const sorte of SORTES) assert.match(corpsDeCarte({ sorte, texte: "x" }), MARQUE_DE_CARTE);
  });

  test("a TODO card or `blocked-on-human` makes a ticket served with a human, with the question it asked; neither, served without", () => {
    const chiffres = chiffresDAutonomie(
      [
        depot([
          { numero: 1, fire: 3 * HEURE, merge: HEURE },
          {
            numero: 2,
            fire: 3 * HEURE,
            merge: HEURE,
            evenements: [pose(CHEF_TODO, il(2 * HEURE))],
            commentaires: [commentaire(corpsDeCarte({ sorte: "product-question", texte: "**Which colour for the badge?**\n\n- [resume] go on" }), il(2 * HEURE))],
          },
          {
            numero: 3,
            fire: 3 * HEURE,
            merge: HEURE,
            evenements: [pose(BLOCKED_ON_HUMAN, il(2 * HEURE))],
            commentaires: [commentaire("<!-- brigade:prise station=box -->\ntaken", il(2.8 * HEURE)), commentaire("**Question for the chef (product):** keep the old route?\n\nStation `box`: …", il(2 * HEURE + 1000))],
          },
        ]),
      ],
      7,
      MAINTENANT,
    );
    assert.equal(chiffres.tickets, 3);
    assert.equal(chiffres.sansHumain, 1);
    assert.equal(chiffres.partSansHumain, 1 / 3);
    assert.deepEqual(
      chiffres.avecHumain.map(({ ticket, questions, url }) => ({ ticket, questions, url })).sort((a, b) => a.ticket - b.ticket),
      [
        { ticket: 2, questions: ["Which colour for the badge?"], url: "https://github.com/chef/parade/issues/2" },
        { ticket: 3, questions: ["Question for the chef (product): keep the old route?"], url: "https://github.com/chef/parade/issues/3" },
      ],
    );
  });

  test("a design held for the chef's validation is a question; a card set by hand, with no text, is one whose text is not on the ticket", () => {
    const chiffres = chiffresDAutonomie(
      [
        depot([
          { numero: 4, fire: 3 * HEURE, merge: HEURE, commentaires: [commentaire("<!-- brigade:validation-design-carte carte=90 pr=12 sha=abc -->\nStation `box`: the delivery is green — held for the chef's validation of its screen, card #90.", il(2 * HEURE))] },
          { numero: 5, fire: 3 * HEURE, merge: HEURE, evenements: [pose(CHEF_TODO, il(2 * HEURE))] },
        ]),
      ],
      7,
      MAINTENANT,
    );
    assert.deepEqual(
      chiffres.avecHumain.map(({ ticket, questions }) => ({ ticket, questions })).sort((a, b) => a.ticket - b.ticket),
      [
        { ticket: 4, questions: ["Station `box`: the delivery is green — held for the chef's validation of its screen, card #90."] },
        { ticket: 5, questions: [null] },
      ],
    );
    assert.equal(chiffres.partSansHumain, 0);
  });

  test("only what was asked between `fire` and the merge counts, and only from whoever has a hand on the repository", () => {
    const chiffres = chiffresDAutonomie(
      [
        depot([
          // Blocked before this `fire`, and a card mark written by a stranger: served without a human.
          { numero: 6, fire: 3 * HEURE, merge: HEURE, evenements: [pose(BLOCKED_ON_HUMAN, il(5 * HEURE))], commentaires: [commentaire(corpsDeCarte({ sorte: "blocked", texte: "fake" }), il(2 * HEURE), "NONE")] },
        ]),
      ],
      7,
      MAINTENANT,
    );
    assert.equal(chiffres.sansHumain, 1);
    assert.deepEqual(chiffres.avecHumain, []);
  });

  test("the lead time is the median from `fire` to merge, on an odd and on an even number of tickets", () => {
    const impair = depot([
      { numero: 1, fire: 2 * HEURE, merge: HEURE },
      { numero: 2, fire: 5 * HEURE, merge: HEURE },
      { numero: 3, fire: 11 * HEURE, merge: HEURE },
    ]);
    assert.equal(chiffresDAutonomie([impair], 7, MAINTENANT).delaiMedianMs, 4 * HEURE);
    const pair = depot([...[1, 2, 3].map((numero) => ({ numero, fire: [2, 5, 11][numero - 1]! * HEURE, merge: HEURE })), { numero: 4, fire: 21 * HEURE, merge: HEURE }]);
    assert.equal(chiffresDAutonomie([pair], 7, MAINTENANT).delaiMedianMs, ((4 + 10) / 2) * HEURE);
  });

  test("a delivery sent back twice counts once in the send-back rate", () => {
    const renvoi = (n: number, le: string) => commentaire(`${MARQUE_DE_RENVOI} n=${n} sha=abc -->\nStation \`box\`: sent back to a cook (${n}/2) — the CI is red on tests`, le);
    const chiffres = chiffresDAutonomie(
      [
        depot([
          { numero: 1, fire: 5 * HEURE, merge: HEURE, commentaires: [renvoi(1, il(4 * HEURE)), renvoi(2, il(3 * HEURE))] },
          { numero: 2, fire: 5 * HEURE, merge: HEURE },
        ]),
      ],
      7,
      MAINTENANT,
    );
    assert.equal(chiffres.renvoyes, 1);
    assert.equal(chiffres.partRenvoyee, 0.5);
    // Sent back, never asked the chef: served without a human.
    assert.equal(chiffres.partSansHumain, 1);
  });

  test("a ticket merged outside the period is left out; changing the period changes the figures", () => {
    const donnees = depot([
      { numero: 1, fire: 2 * JOUR + HEURE, merge: 2 * JOUR },
      { numero: 2, fire: 20 * JOUR + 5 * HEURE, merge: 20 * JOUR, evenements: [pose(BLOCKED_ON_HUMAN, il(20 * JOUR + 2 * HEURE))] },
      { numero: 3, fire: 40 * JOUR, merge: 35 * JOUR },
    ]);
    const semaine = chiffresDAutonomie([donnees], 7, MAINTENANT);
    assert.deepEqual([semaine.tickets, semaine.partSansHumain, semaine.delaiMedianMs], [1, 1, HEURE]);
    const mois = chiffresDAutonomie([donnees], 30, MAINTENANT);
    assert.deepEqual([mois.tickets, mois.partSansHumain, mois.delaiMedianMs, mois.avecHumain.map(({ ticket }) => ticket)], [2, 0.5, 3 * HEURE, [2]]);
    assert.equal(mois.debut, il(30 * JOUR));
  });

  test("a ticket merged with no `fire` before its merge was not served by the kitchen: left out", () => {
    const chiffres = chiffresDAutonomie([depot([{ numero: 1, merge: HEURE }, { numero: 2, fire: 2 * HEURE, merge: HEURE }])], 7, MAINTENANT);
    assert.equal(chiffres.tickets, 1);
  });

  test("a period with no merged ticket gives null figures, never NaN", () => {
    const chiffres = chiffresDAutonomie([depot([{ numero: 1, fire: 40 * JOUR, merge: 35 * JOUR }]), depot([], "chef/cantine")], 7, MAINTENANT);
    assert.deepEqual(
      { tickets: chiffres.tickets, partSansHumain: chiffres.partSansHumain, delaiMedianMs: chiffres.delaiMedianMs, partRenvoyee: chiffres.partRenvoyee, avecHumain: chiffres.avecHumain },
      { tickets: 0, partSansHumain: null, delaiMedianMs: null, partRenvoyee: null, avecHumain: [] },
    );
  });

  test("all projects pool their tickets, each served with a human named with its repository", () => {
    const parade = depot([{ numero: 1, fire: 2 * HEURE, merge: HEURE }]);
    const cantine = depot([{ numero: 1, fire: 3 * HEURE, merge: HEURE, evenements: [pose(BLOCKED_ON_HUMAN, il(2 * HEURE))] }], "chef/cantine");
    const chiffres = chiffresDAutonomie([parade, cantine], 7, MAINTENANT);
    assert.deepEqual([chiffres.tickets, chiffres.partSansHumain, chiffres.delaiMedianMs], [2, 0.5, 1.5 * HEURE]);
    assert.deepEqual(chiffres.avecHumain.map(({ depot, ticket, questions }) => ({ depot, ticket, questions })), [{ depot: "chef/cantine", ticket: 1, questions: [null] }]);
  });

  test("the first line of a comment, its marks and emphasis removed", () => {
    assert.equal(premiereLigne("<!-- brigade:todo kind=blocked -->\n\n## **Pick one**\nmore"), "Pick one");
    assert.equal(premiereLigne("<!-- brigade:x -->\n  \n"), null);
  });
});
