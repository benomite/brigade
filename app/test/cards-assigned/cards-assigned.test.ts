// Les cartes de TODO de la personne connectée (#2761) : un humain voit les cartes qui lui sont assignées sur GitHub, et
// seulement elles, et y répond par les gestes mêmes du chef. Celles qui attendent un autre humain — le chef pour une carte
// sans assigné — sont au pied de TODO, sous « Awaiting others », avec qui elles attendent, et jamais hors des colonnes ;
// le chef, lui, y voit celles assignées à un autre (#2985). Joué sur un faux GitHub qui tient ses issues, leurs labels,
// leurs assignés, leurs commentaires et le fichier du projet. Une carte est un ticket que la cuisine parque pour le chef
// (`parked:chef`, #4474) : sa question est le commentaire de la cuisine qui dit pourquoi.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { readTheChef, shareTheCards, holdTheLogin } from "../../src/vue/cards-assigned/cards-assigned.ts";

const REPOSITORY = "acme/kitchen";
const READ = "2026-11-07T12:00:00.000Z";
const now = () => new Date(READ);
const CHEF = "benomite";

type Issue = { assignes: string[]; question: string; le: string };
// Le commentaire de la cuisine qui parque le ticket pour le chef : sa première ligne est la question de la carte.
const parkedFor = (text: string) => `Parked for the chef: ${text}`;
// Quatre tickets parqués pour le chef : #20 et #21 assignés à alice, #22 à bob ; #23 sans assigné, celui du chef.
const WORLD: Record<number, Issue> = {
  20: { assignes: ["alice"], question: "Which colour for the export button?", le: "2026-11-07T08:00:00Z" },
  21: { assignes: ["Alice", "carol"], question: "Keep the old CSV column order?", le: "2026-11-07T09:00:00Z" },
  22: { assignes: ["bob"], question: "Drop the legacy importer?", le: "2026-11-07T10:00:00Z" },
  23: { assignes: [], question: "Open the beta to everyone?", le: "2026-11-07T11:00:00Z" },
};

// Un faux GitHub : le kanban de la cuisine — ses issues ouvertes, chacune `fire` et `parked:chef` avec ses assignés, et
// aucune PR —, leurs commentaires, et `projet.json` — `reglages` : son contenu, `null` quand le dépôt ne l'a pas.
function github(world: Record<number, Issue>, settings: Record<string, unknown> | null = { chef: CHEF }, owner = "User"): CallGitHub {
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  return async (path) => {
    if (path.includes("/contents/.claude/brigade/projet.json")) return settings === null ? { status: 404, data: { message: "Not Found" } } : ok({ content: Buffer.from(JSON.stringify(settings)).toString("base64") });
    if (path.startsWith(`/repos/${REPOSITORY}/issues?`))
      return ok(
        /[?&]page=1(&|$)/.test(path)
          ? Object.entries(world).map(([number, { assignes, le: the }]) => ({
              number: Number(number),
              title: `Ticket ${number}`,
              html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
              created_at: the,
              labels: ["fire", "parked:chef"].map((name) => ({ name })),
              assignees: assignes.map((login) => ({ login })),
            }))
          : [],
      );
    const number = /\/issues\/(\d+)\/comments/.exec(path)?.[1];
    if (number !== undefined) {
      const issue = world[Number(number)];
      return ok(issue === undefined || /[?&]page=[2-9]/.test(path) ? [] : [{ body: parkedFor(issue.question), created_at: issue.le, author_association: "OWNER" }]);
    }
    if (path.includes("/pulls?")) return ok([]);
    if (path === `/repos/${REPOSITORY}`) return ok({ owner: { login: REPOSITORY.split("/")[0], type: owner } });
    return ok([]);
  };
}


describe("un humain voit les cartes qui lui sont assignées, et elles seules", () => {




});

describe("ce qui attend un autre humain est au pied de TODO, sous « Awaiting others », jamais sous le rail (#2985)", () => {


});

describe("l'humain répond par les gestes du chef", () => {
});

describe("la règle, seule", () => {
  test("un compte ou un chef inconnu ne retire rien", () => {
    const cards = [{ ticket: 1, assignes: ["bob"] }, { ticket: 2 }];
    assert.deepEqual(shareTheCards(cards, { login: null, chef: CHEF }), { siennes: cards, autres: [] });
    assert.deepEqual(shareTheCards(cards, { login: "alice", chef: null }), { siennes: cards, autres: [] });
    assert.deepEqual(shareTheCards(cards, { login: "bob", chef: CHEF }), { siennes: [cards[0]], autres: [{ attente: cards[1], qui: [CHEF] }] });
  });

  test("une carte attend ses assignés, ou le chef sans eux ; le compte la voit en propre s'il en est", () => {
    const cards = [{ ticket: 1, assignes: ["bob"] }, { ticket: 2 }, { ticket: 3, assignes: ["Benomite", "bob"] }, { ticket: 4, assignes: [] }];
    assert.deepEqual(shareTheCards(cards, { login: CHEF, chef: CHEF }), { siennes: [cards[1], cards[2], cards[3]], autres: [{ attente: cards[0], qui: ["bob"] }] });
    assert.deepEqual(shareTheCards(cards, { login: "alice", chef: CHEF }), {
      siennes: [],
      autres: [
        { attente: cards[0], qui: ["bob"] },
        { attente: cards[1], qui: [CHEF] },
        { attente: cards[2], qui: ["Benomite", "bob"] },
        { attente: cards[3], qui: [CHEF] },
      ],
    });
  });

  test("projet.json illisible : pas de chef, rien ne se retire", async () => {
    assert.equal(await readTheChef(async () => ({ status: 500, data: {} }), REPOSITORY), null);
    assert.equal(await readTheChef(async () => ({ status: 200, data: { content: Buffer.from("{").toString("base64") } }), REPOSITORY), null);
    assert.equal(await readTheChef(async () => assert.fail("offline"), REPOSITORY), null);
    assert.equal(await readTheChef(async (path) => (path.includes("/contents/") ? { status: 404, data: {} } : { status: 500, data: {} }), REPOSITORY), null);
  });

  test("le compte se relit au plus toutes les cinq minutes, et sur-le-champ après un échec ou une connexion", async () => {
    let readings = 0;
    let hour = 0;
    let rendered: { login: string } | { nonConnecte: true } = { nonConnecte: true };
    const account = holdTheLogin(async () => (readings++, rendered), { dureeMs: 1000, maintenant: () => hour });
    assert.equal(await account.login(), null);
    rendered = { login: "alice" };
    assert.equal(await account.login(), "alice");
    assert.equal(await account.login(), "alice");
    assert.equal(readings, 2);
    hour = 1000;
    await account.login();
    assert.equal(readings, 3);
    account.oublier();
    rendered = { login: "bob" };
    assert.equal(await account.login(), "bob");
  });
});
