// #3914, critère 6, par le vrai GitHub du superviseur : chaque tour écrit UN commentaire sur chaque ticket sur lequel il a
// agi — sa trace, avec ce qu'il a vu et ce qu'il a fait —, quel que soit le geste. Les gestes ne changent qu'un état ; la
// marque d'une carte ou d'une attente, que l'app relit, est en tête de cette trace.
import assert from "node:assert/strict";
import { test } from "node:test";
import { githubDuSuperviseur, type ClientDuSuperviseur } from "../../src/superviseur/github.ts";
import { tourDuSuperviseur } from "../../src/superviseur/tour.ts";

// Un client du tour en mémoire, qui note chaque commentaire et chaque fermeture.
function client() {
  const commentaires: { numero: number; corps: string }[] = [];
  const fermees: number[] = [];
  const c: ClientDuSuperviseur = {
    checksDeLaBase: async () => [],
    etatDuRun: async () => ({ tentative: 1, termine: true }),
    relancerLesEchecs: async () => {},
    issue: async (numero) => ({ number: numero, title: "t", labels: ["waiting"], state: "open", createdAt: "", updatedAt: "", url: "" }),
    commentaires: async () => [],
    commenter: async (numero, corps) => void commentaires.push({ numero, corps }),
    labelliser: async () => {},
    delabelliser: async () => {},
    creerIssue: async () => 77,
    issuesDepuis: async () => [],
    fermerIssue: async (numero) => void fermees.push(numero),
  };
  return { c, commentaires, fermees };
}

const GESTES = [
  { geste: "remettre-sur-le-rail", ticket: 12, note: "lint is fixed upstream" },
  { geste: "mettre-en-attente", ticket: 12, tiers: "the bank" },
  { geste: "fermer-un-doublon", ticket: 12, doublonDe: 4 },
  { geste: "poser-une-carte-todo", nature: "produit", ticket: 12, question: "Which price do we show?" },
] as const;

for (const action of GESTES) {
  test(`a run that plays ${action.geste} writes one comment on #12, with what it saw and what it did`, async () => {
    const f = client();
    await tourDuSuperviseur({ github: githubDuSuperviseur({ client: f.c }), declenchement: { cause: "prises-sans-livraison", ticket: 12 }, vu: "taken 3 times, lint red each time", actions: [action] });
    assert.equal(f.commentaires.length, 1, JSON.stringify(f.commentaires));
    assert.equal(f.commentaires[0]?.numero, 12);
    assert.match(f.commentaires[0]?.corps ?? "", /\*\*What it saw:\*\*[\s\S]*taken 3 times, lint red each time[\s\S]*\*\*What it did:\*\*\n\n- (TODO card posted on )?#12 /);
  });
}

test("the note for the next cook, the third party, the card's question are in the run's one comment", async () => {
  const dits: string[] = [];
  for (const action of GESTES) {
    const f = client();
    await tourDuSuperviseur({ github: githubDuSuperviseur({ client: f.c }), declenchement: { cause: "rien-livre" }, vu: "nothing merged", actions: [action] });
    dits.push(f.commentaires.map(({ corps }) => corps).join("\n---\n"));
  }
  assert.match(dits[0] ?? "", /Note for the next cook: lint is fixed upstream/);
  assert.match(dits[1] ?? "", /^<!-- brigade:waiting \{[^\n]*"who":"the bank"/);
  assert.match(dits[2] ?? "", /#12 closed as a duplicate of #4/);
  assert.match(dits[3] ?? "", /^<!-- brigade:todo kind=product-question -->\nThe kitchen has a product question on #12:\n\n> Which price do we show\?/);
});

test("two gestures on two tickets: one comment on each, the same trace; the duplicate is closed before its trace says so", async () => {
  const f = client();
  await tourDuSuperviseur({
    github: githubDuSuperviseur({ client: f.c }),
    declenchement: { cause: "rien-livre" },
    vu: "#3 duplicates #4; #5 waits for the bank",
    actions: [{ geste: "fermer-un-doublon", ticket: 3, doublonDe: 4 }, { geste: "mettre-en-attente", ticket: 5, tiers: "the bank" }],
  });
  assert.deepEqual(f.commentaires.map(({ numero }) => numero), [3, 5]);
  assert.deepEqual(f.fermees, [3]);
  assert.ok(f.commentaires[1]?.corps.endsWith(f.commentaires[0]?.corps ?? "?"), "the wait's mark heads the same trace");
});
