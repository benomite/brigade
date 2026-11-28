// Les cartes de TODO de la personne connectée (#2761) : un humain voit les cartes qui lui sont assignées sur GitHub, et
// seulement elles, et y répond par les gestes mêmes du chef. Celles qui attendent un autre humain — le chef pour une carte
// sans assigné — sont au pied de TODO, sous « Awaiting others », avec qui elles attendent, et jamais hors des colonnes ;
// le chef, lui, y voit celles assignées à un autre (#2985). Joué sur un faux GitHub qui tient ses issues, leurs labels,
// leurs assignés, leurs commentaires et le fichier du projet. Une carte est un ticket que la cuisine parque pour le chef
// (`parked:chef`, #4474) : sa question est le commentaire de la cuisine qui dit pourquoi.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { putAside } from "../../src/awaiting.ts";
import { cardReadOfChef } from "../../src/card-todo.ts";
import { understand, board as boardOf, type Facts } from "../../src/facts.ts";
import { withWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { readTheBoardOfRepository } from "../../src/board/read.ts";
import { statusOfBoard } from "../../src/board/rail.ts";
import type { CardOfChef } from "../../src/board/todo-github.ts";
import { answerOnGithub, type ClientOfTheAnswer } from "../../src/board-actions/answer-github.ts";
import { readTheChef, shareOfCardsAssigned, shareTheCards, holdTheLogin } from "../../src/vue/cards-assigned/cards-assigned.ts";

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

// La lecture de l'app (main.ts, `lireLeTableau`) pour le compte `login`, puis les cartes de sa colonne Todo, celles
// qu'elle replie sous « Awaiting others », et celles que le rail pose hors des colonnes.
async function todoOf(login: string | null, world: Record<number, Issue> = WORLD, settings?: Record<string, unknown> | null, owner = "User") {
  const call = github(world, settings, owner);
  const readOne = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: now }), call, shareOfCardsAssigned({ appeler: call, depot: REPOSITORY, login: async () => login }));
  assert.ok(readOne.lu, !readOne.lu ? readOne.raison : "");
  const status = statusOfBoard(readOne);
  const shownOne = putAside({ projet: "kitchen", demande: 0, a: READ, sorties: [{ commande: "status", texte: status }] });
  assert.ok(!("erreur" in shownOne) && shownOne.attend !== undefined, "status carries its awaiting block");
  const facts = understand(JSON.stringify(readOne.faits));
  assert.ok(!("informe" in facts), "facts are in shape");
  const { colonnes: columns, hors: outside } = boardOf(facts as Facts, { bloc: shownOne.attend, a: READ }, { texte: status, a: READ }).rail;
  const todo = columns.find(({ nom: name }) => name === "Awaiting you");
  const chefs = new Map((readOne.faits.attend as { ticket: number; chef?: CardOfChef }[]).map(({ ticket, chef }) => [ticket, chef]));
  return {
    tickets: (todo?.cartes ?? []).map(({ ticket }) => ticket),
    compte: todo?.compte,
    autres: todo?.autres,
    hors: outside.map(({ ticket }) => ticket),
    ailleurs: columns.filter(({ nom: name }) => name !== "Awaiting you").flatMap(({ cartes: cards }) => cards.map(({ ticket }) => ticket)),
    bloc: shownOne.attend,
    chefs,
  };
}

describe("un humain voit les cartes qui lui sont assignées, et elles seules", () => {
  test("alice, deux cartes à elle et une à bob : son Todo porte exactement ses deux cartes", async () => {
    const { tickets, bloc: block } = await todoOf("alice");
    assert.deepEqual(tickets, [20, 21]);
    assert.match(block, /#20/);
    assert.doesNotMatch(block, /#22|#23/);
  });

  test("le chef voit en propre les cartes sans assigné, et celles assignées à un autre sous « Awaiting others »", async () => {
    const withoutFilter = await todoOf(null);
    assert.deepEqual(withoutFilter.tickets, [20, 21, 22, 23]);
    assert.equal(withoutFilter.autres, undefined);
    for (const chef of [CHEF, "BenOmite"]) {
      const { tickets, autres: others } = await todoOf(chef);
      assert.deepEqual(tickets, [23]);
      assert.deepEqual(others?.map(({ ticket, qui: who }) => [ticket, who]), [[20, ["alice"]], [21, ["Alice", "carol"]], [22, ["bob"]]]);
    }
  });

  test("un humain sans carte assignée voit l'état vide d'aujourd'hui", async () => {
    const { tickets, bloc: block } = await todoOf("dave");
    assert.deepEqual(tickets, []);
    assert.match(block, /nothing awaits the chef/);
  });

  test("sans `chef` dans projet.json, ni projet.json, le chef est le propriétaire du dépôt", async () => {
    assert.deepEqual((await todoOf("acme", WORLD, {})).tickets, [23]);
    assert.deepEqual((await todoOf("acme", WORLD, null)).tickets, [23]);
    const byBob = await todoOf("bob", WORLD, null);
    assert.deepEqual(byBob.tickets, [22]);
    assert.deepEqual(byBob.autres?.find(({ ticket }) => ticket === 23)?.qui, ["acme"]);
  });

  test("sur un dépôt d'organisation sans `chef`, la carte sans assigné reste au compte connecté, et nul n'attend l'organisation (#3052)", async () => {
    for (const settings of [{}, null]) {
      const byPY = await todoOf("py", WORLD, settings, "Organization");
      assert.ok(byPY.tickets.includes(23));
      assert.ok(!byPY.autres?.some(({ qui: who }) => who?.includes("acme")));
    }
    // les cartes assignées à un autre humain se replient toujours sous « Awaiting others »
    const byPYsansChef = await todoOf("py", WORLD, {}, "Organization");
    assert.ok(!byPYsansChef.tickets.includes(22));
    assert.deepEqual(byPYsansChef.autres?.find(({ ticket }) => ticket === 22)?.qui, ["bob"]);
    // un `chef` nommé décide, sur une organisation aussi
    assert.deepEqual((await todoOf("py", WORLD, { chef: "py" }, "Organization")).tickets.includes(23), true);
    const byBob = await todoOf("bob", WORLD, { chef: "py" }, "Organization");
    assert.deepEqual(byBob.autres?.find(({ ticket }) => ticket === 23)?.qui, ["py"]);
  });
});

describe("ce qui attend un autre humain est au pied de TODO, sous « Awaiting others », jamais sous le rail (#2985)", () => {
  test("alice : ses deux cartes, puis les deux autres repliées, chacune avec sa question et qui elle attend", async () => {
    const { tickets, compte: account, autres: others } = await todoOf("alice");
    assert.deepEqual(tickets, [20, 21]);
    assert.equal(account, "2");
    assert.deepEqual(
      others?.map(({ ticket, todo, qui: who }) => ({ ticket, question: todo?.question, qui: who })),
      [
        { ticket: 22, question: parkedFor("Drop the legacy importer?"), qui: ["bob"] },
        { ticket: 23, question: parkedFor("Open the beta to everyone?"), qui: [CHEF] },
      ],
    );
  });

  test("aucune carte hors des colonnes, ni dans une autre colonne, quel que soit le compte", async () => {
    for (const login of [null, CHEF, "alice", "bob", "dave"]) {
      const { hors: outside, ailleurs: elsewhere } = await todoOf(login);
      assert.deepEqual(outside, [], `${login}: under the rail`);
      assert.deepEqual(elsewhere, [], `${login}: in another column`);
    }
    assert.deepEqual((await todoOf("alice")).autres?.map(({ ticket }) => ticket), [22, 23]);
    assert.deepEqual((await todoOf("bob")).tickets, [22]);
  });

  test("rien n'attend un autre humain : pas de « Awaiting others »", async () => {
    assert.equal((await todoOf("alice", { 20: WORLD[20]!, 21: WORLD[21]! })).autres, undefined);
    assert.equal((await todoOf(CHEF, { 23: WORLD[23]! })).autres, undefined);
  });
});

describe("l'humain répond par les gestes du chef", () => {
  // Le chef ne la voit plus en propre (#2985) : c'est la carte que la lecture donne sans partage, celle qu'il voyait.
  test("la carte d'alice est celle que le chef voyait, et sa réponse poste le même commentaire et joue le même geste", async () => {
    const vueByAlice = (await todoOf("alice")).chefs.get(21);
    const vueByTheChef = (await todoOf(null)).chefs.get(21);
    assert.ok(vueByAlice !== undefined);
    assert.deepEqual(vueByAlice, vueByTheChef);
    const reply = async (chef: CardOfChef) => {
      const writtenOnes: string[] = [];
      const client: ClientOfTheAnswer = {
        lire: async () => ({ status: 200, data: [] }),
        ecrire: async (method, path, body) => {
          writtenOnes.push(`${method} ${path} ${JSON.stringify(body ?? null)}`);
          return { status: method === "POST" ? 201 : 200, data: { id: 7 } };
        },
      };
      // La carte d'un ticket parqué pour le chef n'a que sa réponse libre, Answer.
      const rendered = await answerOnGithub({ depot: REPOSITORY, ticket: 21, chef, reponse: { question: cardReadOfChef(chef)?.question, texte: "Yes, go on" }, client });
      return { rendu: rendered, ecrits: writtenOnes };
    };
    const byAlice = await reply(vueByAlice);
    assert.ok("repondue" in byAlice.rendu, JSON.stringify(byAlice.rendu));
    assert.match(byAlice.ecrits[0] ?? "", /^POST \/repos\/acme\/kitchen\/issues\/21\/comments .*brigade:reponse gesture=resume.*Yes, go on/);
    assert.deepEqual(byAlice.ecrits.slice(1), ["DELETE /repos/acme/kitchen/issues/21/labels/parked%3Achef null"]);
    assert.deepEqual(byAlice, await reply(vueByTheChef!));
  });
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
