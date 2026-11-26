// Les cartes de TODO de la personne connectée (#2761) : un humain voit les cartes qui lui sont assignées sur GitHub, et
// seulement elles, et y répond par les gestes mêmes du chef. Celles qui attendent un autre humain — le chef pour une carte
// sans assigné — sont au pied de TODO, sous « Awaiting others », avec qui elles attendent, et jamais hors des colonnes ;
// le chef, lui, y voit celles assignées à un autre (#2985). Joué sur un faux GitHub qui tient ses issues, leurs labels,
// leurs assignés, leurs commentaires et le fichier du projet.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mettreAPart } from "../../src/awaiting.ts";
import { cardLueDuChef } from "../../src/card-todo.ts";
import { comprendre, tableau as tableauDe, type Facts } from "../../src/facts.ts";
import { avecCeQuiAwaitingLeChef } from "../../src/tableau/wait-du-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuRepository } from "../../src/tableau/read.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import type { CardDuChef } from "../../src/tableau/todo-github.ts";
import { repondreSurGithub, type ClientDeLaAnswer } from "../../src/tableau-actions/answer-github.ts";
import { lireLeChef, partageDesCardsAssignees, partagerLesCards, holdLeLogin } from "../../src/vue/cards-assignees/cards-assignees.ts";

const REPOSITORY = "acme/kitchen";
const LU = "2026-11-07T12:00:00.000Z";
const maintenant = () => new Date(LU);
const CHEF = "benomite";

// `labels` : ceux de l'issue — `chef-todo` seul sans eux.
type Issue = { assignes: string[]; question: string; le: string; labels?: string[] };
const question = (texte: string) => `<!-- brigade:todo kind=product-question -->\n${texte}\n- [resume] Yes, go on\n- [drop] No, leave it`;
// Trois cartes `chef-todo` : #20 et #21 assignées à alice, #22 à bob ; #23 sans assigné, celle du chef. #22 est aussi un
// ticket du rail que sa question de produit met de côté (`fire`, `served-elsewhere`) : sur le rail, son mot (`86`) n'est
// d'aucune colonne — retirée de TODO, sa carte tombait sous le rail (#2985).
const MONDE: Record<number, Issue> = {
  20: { assignes: ["alice"], question: "Which colour for the export button?", le: "2026-11-07T08:00:00Z" },
  21: { assignes: ["Alice", "carol"], question: "Keep the old CSV column order?", le: "2026-11-07T09:00:00Z" },
  22: { assignes: ["bob"], question: "Drop the legacy importer?", le: "2026-11-07T10:00:00Z", labels: ["fire", "served-elsewhere", "chef-todo"] },
  23: { assignes: [], question: "Open the beta to everyone?", le: "2026-11-07T11:00:00Z" },
};

// Un faux GitHub : les issues au label `chef-todo`, leurs commentaires, et `projet.json` — `reglages` : son contenu, `null`
// quand le dépôt ne l'a pas.
function github(monde: Record<number, Issue>, settings: Record<string, unknown> | null = { chef: CHEF }, proprietaire = "User"): CallGitHub {
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  return async (chemin) => {
    if (chemin.includes("/contents/.claude/brigade/projet.json")) return settings === null ? { status: 404, data: { message: "Not Found" } } : ok({ content: Buffer.from(JSON.stringify(settings)).toString("base64") });
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(chemin)?.[1];
    if (label !== undefined)
      return ok(
        Object.entries(monde)
          .filter(([, { labels = ["chef-todo"] }]) => labels.includes(label))
          .map(([numero, { assignes, le, labels = ["chef-todo"] }]) => ({
            number: Number(numero),
            title: `Ticket ${numero}`,
            html_url: `https://github.com/${REPOSITORY}/issues/${numero}`,
            created_at: le,
            labels: labels.map((name) => ({ name })),
            assignees: assignes.map((login) => ({ login })),
          })),
      );
    const numero = /\/issues\/(\d+)\/comments/.exec(chemin)?.[1];
    if (numero !== undefined) {
      const issue = monde[Number(numero)];
      return ok(issue === undefined ? [] : [{ body: question(issue.question), created_at: issue.le, author_association: "OWNER" }]);
    }
    if (chemin.includes("/pulls?")) return ok([]);
    if (chemin === `/repos/${REPOSITORY}`) return ok({ owner: { login: REPOSITORY.split("/")[0], type: proprietaire } });
    return ok([]);
  };
}

// La lecture de l'app (main.ts, `lireLeTableau`) pour le compte `login`, puis les cartes de sa colonne Todo, celles
// qu'elle replie sous « Awaiting others », et celles que le rail pose hors des colonnes.
async function todoDe(login: string | null, monde: Record<number, Issue> = MONDE, settings?: Record<string, unknown> | null, proprietaire = "User") {
  const appeler = github(monde, settings, proprietaire);
  const lu = await avecCeQuiAwaitingLeChef(await lireLeTableauDuRepository({ depot: REPOSITORY, appeler, maintenant }), appeler, partageDesCardsAssignees({ appeler, depot: REPOSITORY, login: async () => login }));
  assert.ok(lu.lu, !lu.lu ? lu.raison : "");
  const status = statusDuTableau(lu);
  const montree = mettreAPart({ projet: "kitchen", demande: 0, a: LU, sorties: [{ commande: "status", texte: status }] });
  assert.ok(!("erreur" in montree) && montree.attend !== undefined, "status carries its awaiting block");
  const facts = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in facts), "facts are in shape");
  const { colonnes, hors: outside } = tableauDe(facts as Facts, { bloc: montree.attend, a: LU }, { texte: status, a: LU }).rail;
  const todo = colonnes.find(({ nom: name }) => name === "Awaiting you");
  const chefs = new Map((lu.faits.attend as { ticket: number; chef?: CardDuChef }[]).map(({ ticket, chef }) => [ticket, chef]));
  return {
    tickets: (todo?.cartes ?? []).map(({ ticket }) => ticket),
    compte: todo?.compte,
    autres: todo?.autres,
    hors: outside.map(({ ticket }) => ticket),
    ailleurs: colonnes.filter(({ nom: name }) => name !== "Awaiting you").flatMap(({ cartes: cards }) => cards.map(({ ticket }) => ticket)),
    bloc: montree.attend,
    chefs,
  };
}

describe("un humain voit les cartes qui lui sont assignées, et elles seules", () => {
  test("alice, deux cartes à elle et une à bob : son Todo porte exactement ses deux cartes", async () => {
    const { tickets, bloc } = await todoDe("alice");
    assert.deepEqual(tickets, [20, 21]);
    assert.match(bloc, /#20/);
    assert.doesNotMatch(bloc, /#22|#23/);
  });

  test("le chef voit en propre les cartes sans assigné, et celles assignées à un autre sous « Awaiting others »", async () => {
    const sansFiltre = await todoDe(null);
    assert.deepEqual(sansFiltre.tickets, [20, 21, 22, 23]);
    assert.equal(sansFiltre.autres, undefined);
    for (const chef of [CHEF, "BenOmite"]) {
      const { tickets, autres } = await todoDe(chef);
      assert.deepEqual(tickets, [23]);
      assert.deepEqual(autres?.map(({ ticket, qui }) => [ticket, qui]), [[20, ["alice"]], [21, ["Alice", "carol"]], [22, ["bob"]]]);
    }
  });

  test("un humain sans carte assignée voit l'état vide d'aujourd'hui", async () => {
    const { tickets, bloc } = await todoDe("dave");
    assert.deepEqual(tickets, []);
    assert.match(bloc, /nothing awaits the chef/);
  });

  test("sans `chef` dans projet.json, ni projet.json, le chef est le propriétaire du dépôt", async () => {
    assert.deepEqual((await todoDe("acme", MONDE, {})).tickets, [23]);
    assert.deepEqual((await todoDe("acme", MONDE, null)).tickets, [23]);
    const parBob = await todoDe("bob", MONDE, null);
    assert.deepEqual(parBob.tickets, [22]);
    assert.deepEqual(parBob.autres?.find(({ ticket }) => ticket === 23)?.qui, ["acme"]);
  });

  test("sur un dépôt d'organisation sans `chef`, la carte sans assigné reste au compte connecté, et nul n'attend l'organisation (#3052)", async () => {
    for (const settings of [{}, null]) {
      const parPY = await todoDe("py", MONDE, settings, "Organization");
      assert.ok(parPY.tickets.includes(23));
      assert.ok(!parPY.autres?.some(({ qui }) => qui?.includes("acme")));
    }
    // les cartes assignées à un autre humain se replient toujours sous « Awaiting others »
    const parPYsansChef = await todoDe("py", MONDE, {}, "Organization");
    assert.ok(!parPYsansChef.tickets.includes(22));
    assert.deepEqual(parPYsansChef.autres?.find(({ ticket }) => ticket === 22)?.qui, ["bob"]);
    // un `chef` nommé décide, sur une organisation aussi
    assert.deepEqual((await todoDe("py", MONDE, { chef: "py" }, "Organization")).tickets.includes(23), true);
    const parBob = await todoDe("bob", MONDE, { chef: "py" }, "Organization");
    assert.deepEqual(parBob.autres?.find(({ ticket }) => ticket === 23)?.qui, ["py"]);
  });
});

describe("ce qui attend un autre humain est au pied de TODO, sous « Awaiting others », jamais sous le rail (#2985)", () => {
  test("alice : ses deux cartes, puis les deux autres repliées, chacune avec sa question et qui elle attend", async () => {
    const { tickets, compte: account, autres } = await todoDe("alice");
    assert.deepEqual(tickets, [20, 21]);
    assert.equal(account, "2");
    assert.deepEqual(
      autres?.map(({ ticket, todo, qui }) => ({ ticket, question: todo?.question, qui })),
      [
        { ticket: 22, question: "Drop the legacy importer?", qui: ["bob"] },
        { ticket: 23, question: "Open the beta to everyone?", qui: [CHEF] },
      ],
    );
  });

  test("aucune carte hors des colonnes, ni dans une autre colonne, quel que soit le compte — #22, mise de côté sur le rail, comprise", async () => {
    for (const login of [null, CHEF, "alice", "bob", "dave"]) {
      const { hors: outside, ailleurs } = await todoDe(login);
      assert.deepEqual(outside, [], `${login}: under the rail`);
      assert.equal(ailleurs.includes(22), false, `${login}: #22 in another column`);
    }
    assert.deepEqual((await todoDe("alice")).autres?.map(({ ticket }) => ticket), [22, 23]);
    assert.deepEqual((await todoDe("bob")).tickets, [22]);
  });

  test("rien n'attend un autre humain : pas de « Awaiting others »", async () => {
    assert.equal((await todoDe("alice", { 20: MONDE[20]!, 21: MONDE[21]! })).autres, undefined);
    assert.equal((await todoDe(CHEF, { 23: MONDE[23]! })).autres, undefined);
  });
});

describe("l'humain répond par les gestes du chef", () => {
  // Le chef ne la voit plus en propre (#2985) : c'est la carte que la lecture donne sans partage, celle qu'il voyait.
  test("la carte d'alice est celle que le chef voyait, et sa réponse poste le même commentaire et joue le même geste", async () => {
    const vueParAlice = (await todoDe("alice")).chefs.get(21);
    const vueParLeChef = (await todoDe(null)).chefs.get(21);
    assert.ok(vueParAlice !== undefined);
    assert.deepEqual(vueParAlice, vueParLeChef);
    const repondre = async (chef: CardDuChef) => {
      const ecrits: string[] = [];
      const client: ClientDeLaAnswer = {
        lire: async () => ({ status: 200, data: [] }),
        ecrire: async (methode, chemin, corps) => {
          ecrits.push(`${methode} ${chemin} ${JSON.stringify(corps ?? null)}`);
          return { status: methode === "POST" ? 201 : 200, data: { id: 7 } };
        },
      };
      const rendu = await repondreSurGithub({ depot: REPOSITORY, ticket: 21, chef, reponse: { question: cardLueDuChef(chef)?.question, choix: 1 }, client });
      return { rendu, ecrits };
    };
    const parAlice = await repondre(vueParAlice);
    assert.ok("repondue" in parAlice.rendu, JSON.stringify(parAlice.rendu));
    assert.match(parAlice.ecrits[0] ?? "", /^POST \/repos\/acme\/kitchen\/issues\/21\/comments .*brigade:reponse gesture=resume.*Yes, go on/);
    assert.deepEqual(parAlice, await repondre(vueParLeChef!));
  });
});

describe("la règle, seule", () => {
  test("un compte ou un chef inconnu ne retire rien", () => {
    const cards = [{ ticket: 1, assignes: ["bob"] }, { ticket: 2 }];
    assert.deepEqual(partagerLesCards(cards, { login: null, chef: CHEF }), { siennes: cards, autres: [] });
    assert.deepEqual(partagerLesCards(cards, { login: "alice", chef: null }), { siennes: cards, autres: [] });
    assert.deepEqual(partagerLesCards(cards, { login: "bob", chef: CHEF }), { siennes: [cards[0]], autres: [{ attente: cards[1], qui: [CHEF] }] });
  });

  test("une carte attend ses assignés, ou le chef sans eux ; le compte la voit en propre s'il en est", () => {
    const cards = [{ ticket: 1, assignes: ["bob"] }, { ticket: 2 }, { ticket: 3, assignes: ["Benomite", "bob"] }, { ticket: 4, assignes: [] }];
    assert.deepEqual(partagerLesCards(cards, { login: CHEF, chef: CHEF }), { siennes: [cards[1], cards[2], cards[3]], autres: [{ attente: cards[0], qui: ["bob"] }] });
    assert.deepEqual(partagerLesCards(cards, { login: "alice", chef: CHEF }), {
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
    assert.equal(await lireLeChef(async () => ({ status: 500, data: {} }), REPOSITORY), null);
    assert.equal(await lireLeChef(async () => ({ status: 200, data: { content: Buffer.from("{").toString("base64") } }), REPOSITORY), null);
    assert.equal(await lireLeChef(async () => assert.fail("offline"), REPOSITORY), null);
    assert.equal(await lireLeChef(async (chemin) => (chemin.includes("/contents/") ? { status: 404, data: {} } : { status: 500, data: {} }), REPOSITORY), null);
  });

  test("le compte se relit au plus toutes les cinq minutes, et sur-le-champ après un échec ou une connexion", async () => {
    let lectures = 0;
    let heure = 0;
    let rendu: { login: string } | { nonConnecte: true } = { nonConnecte: true };
    const account = holdLeLogin(async () => (lectures++, rendu), { dureeMs: 1000, maintenant: () => heure });
    assert.equal(await account.login(), null);
    rendu = { login: "alice" };
    assert.equal(await account.login(), "alice");
    assert.equal(await account.login(), "alice");
    assert.equal(lectures, 2);
    heure = 1000;
    await account.login();
    assert.equal(lectures, 3);
    account.oublier();
    rendu = { login: "bob" };
    assert.equal(await account.login(), "bob");
  });
});
