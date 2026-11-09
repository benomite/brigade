// Les cartes de TODO de la personne connectée (#2761) : un humain voit les cartes qui lui sont assignées sur GitHub, et
// seulement elles, et y répond par les gestes mêmes du chef. Celles qui attendent un autre humain — le chef pour une carte
// sans assigné — sont au pied de TODO, sous « Awaiting others », avec qui elles attendent, et jamais hors des colonnes ;
// le chef, lui, y voit celles assignées à un autre (#2985). Joué sur un faux GitHub qui tient ses issues, leurs labels,
// leurs assignés, leurs commentaires et le fichier du projet.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mettreAPart } from "../../src/attend.ts";
import { carteLueDuChef } from "../../src/carte-todo.ts";
import { comprendre, tableau as tableauDe, type Faits } from "../../src/faits.ts";
import { avecCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import type { CarteDuChef } from "../../src/tableau/todo-github.ts";
import { repondreSurGithub, type ClientDeLaReponse } from "../../src/tableau-gestes/reponse-github.ts";
import { lireLeChef, partageDesCartesAssignees, partagerLesCartes, tenirLeLogin } from "../../src/vue/cartes-assignees/cartes-assignees.ts";

const DEPOT = "acme/kitchen";
const LU = "2026-11-07T12:00:00.000Z";
const maintenant = () => new Date(LU);
const CHEF = "benomite";

// `labels` : ceux de l'issue — `chef-todo` seul sans eux.
type Issue = { assignes: string[]; question: string; le: string; labels?: string[] };
const question = (texte: string) => `<!-- brigade:todo kind=product-question -->\n${texte}\n- [resume] Yes, go on\n- [drop] No, leave it`;
// Trois cartes `chef-todo` : #20 et #21 assignées à alice, #22 à bob ; #23 sans assigné, celle du chef. #22 est aussi un
// ticket du rail que sa question de produit met de côté (`fire`, `hors-cuisine`) : sur le rail, son mot (`86`) n'est
// d'aucune colonne — retirée de TODO, sa carte tombait sous le rail (#2985).
const MONDE: Record<number, Issue> = {
  20: { assignes: ["alice"], question: "Which colour for the export button?", le: "2026-11-07T08:00:00Z" },
  21: { assignes: ["Alice", "carol"], question: "Keep the old CSV column order?", le: "2026-11-07T09:00:00Z" },
  22: { assignes: ["bob"], question: "Drop the legacy importer?", le: "2026-11-07T10:00:00Z", labels: ["fire", "hors-cuisine", "chef-todo"] },
  23: { assignes: [], question: "Open the beta to everyone?", le: "2026-11-07T11:00:00Z" },
};

// Un faux GitHub : les issues au label `chef-todo`, leurs commentaires, et `projet.json` — `reglages` : son contenu, `null`
// quand le dépôt ne l'a pas.
function github(monde: Record<number, Issue>, reglages: Record<string, unknown> | null = { chef: CHEF }): AppelGitHub {
  const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
  return async (chemin) => {
    if (chemin.includes("/contents/.claude/brigade/projet.json")) return reglages === null ? { status: 404, data: { message: "Not Found" } } : ok({ content: Buffer.from(JSON.stringify(reglages)).toString("base64") });
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(chemin)?.[1];
    if (label !== undefined)
      return ok(
        Object.entries(monde)
          .filter(([, { labels = ["chef-todo"] }]) => labels.includes(label))
          .map(([numero, { assignes, le, labels = ["chef-todo"] }]) => ({
            number: Number(numero),
            title: `Ticket ${numero}`,
            html_url: `https://github.com/${DEPOT}/issues/${numero}`,
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
    return ok([]);
  };
}

// La lecture de l'app (main.ts, `lireLeTableau`) pour le compte `login`, puis les cartes de sa colonne Todo, celles
// qu'elle replie sous « Awaiting others », et celles que le rail pose hors des colonnes.
async function todoDe(login: string | null, monde: Record<number, Issue> = MONDE, reglages?: Record<string, unknown> | null) {
  const appeler = github(monde, reglages);
  const lu = await avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant }), appeler, partageDesCartesAssignees({ appeler, depot: DEPOT, login: async () => login }));
  assert.ok(lu.lu, !lu.lu ? lu.raison : "");
  const status = statusDuTableau(lu);
  const montree = mettreAPart({ projet: "kitchen", demande: 0, a: LU, sorties: [{ commande: "status", texte: status }] });
  assert.ok(!("erreur" in montree) && montree.attend !== undefined, "status carries its awaiting block");
  const faits = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in faits), "facts are in shape");
  const { colonnes, hors } = tableauDe(faits as Faits, { bloc: montree.attend, a: LU }, { texte: status, a: LU }).rail;
  const todo = colonnes.find(({ nom }) => nom === "Awaiting you");
  const chefs = new Map((lu.faits.attend as { ticket: number; chef?: CarteDuChef }[]).map(({ ticket, chef }) => [ticket, chef]));
  return {
    tickets: (todo?.cartes ?? []).map(({ ticket }) => ticket),
    compte: todo?.compte,
    autres: todo?.autres,
    hors: hors.map(({ ticket }) => ticket),
    ailleurs: colonnes.filter(({ nom }) => nom !== "Awaiting you").flatMap(({ cartes }) => cartes.map(({ ticket }) => ticket)),
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
});

describe("ce qui attend un autre humain est au pied de TODO, sous « Awaiting others », jamais sous le rail (#2985)", () => {
  test("alice : ses deux cartes, puis les deux autres repliées, chacune avec sa question et qui elle attend", async () => {
    const { tickets, compte, autres } = await todoDe("alice");
    assert.deepEqual(tickets, [20, 21]);
    assert.equal(compte, "2");
    assert.deepEqual(autres, [
      { ticket: 22, titre: "Ticket 22", question: "Drop the legacy importer?", qui: ["bob"] },
      { ticket: 23, titre: "Ticket 23", question: "Open the beta to everyone?", qui: [CHEF] },
    ]);
  });

  test("aucune carte hors des colonnes, ni dans une autre colonne, quel que soit le compte — #22, mise de côté sur le rail, comprise", async () => {
    for (const login of [null, CHEF, "alice", "bob", "dave"]) {
      const { hors, ailleurs } = await todoDe(login);
      assert.deepEqual(hors, [], `${login}: under the rail`);
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
    const repondre = async (chef: CarteDuChef) => {
      const ecrits: string[] = [];
      const client: ClientDeLaReponse = {
        lire: async () => ({ status: 200, data: [] }),
        ecrire: async (methode, chemin, corps) => {
          ecrits.push(`${methode} ${chemin} ${JSON.stringify(corps ?? null)}`);
          return { status: methode === "POST" ? 201 : 200, data: { id: 7 } };
        },
      };
      const rendu = await repondreSurGithub({ depot: DEPOT, ticket: 21, chef, reponse: { question: carteLueDuChef(chef)?.question, choix: 1 }, client });
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
    const cartes = [{ ticket: 1, assignes: ["bob"] }, { ticket: 2 }];
    assert.deepEqual(partagerLesCartes(cartes, { login: null, chef: CHEF }), { siennes: cartes, autres: [] });
    assert.deepEqual(partagerLesCartes(cartes, { login: "alice", chef: null }), { siennes: cartes, autres: [] });
    assert.deepEqual(partagerLesCartes(cartes, { login: "bob", chef: CHEF }), { siennes: [cartes[0]], autres: [{ attente: cartes[1], qui: [CHEF] }] });
  });

  test("une carte attend ses assignés, ou le chef sans eux ; le compte la voit en propre s'il en est", () => {
    const cartes = [{ ticket: 1, assignes: ["bob"] }, { ticket: 2 }, { ticket: 3, assignes: ["Benomite", "bob"] }, { ticket: 4, assignes: [] }];
    assert.deepEqual(partagerLesCartes(cartes, { login: CHEF, chef: CHEF }), { siennes: [cartes[1], cartes[2], cartes[3]], autres: [{ attente: cartes[0], qui: ["bob"] }] });
    assert.deepEqual(partagerLesCartes(cartes, { login: "alice", chef: CHEF }), {
      siennes: [],
      autres: [
        { attente: cartes[0], qui: ["bob"] },
        { attente: cartes[1], qui: [CHEF] },
        { attente: cartes[2], qui: ["Benomite", "bob"] },
        { attente: cartes[3], qui: [CHEF] },
      ],
    });
  });

  test("projet.json illisible : pas de chef, rien ne se retire", async () => {
    assert.equal(await lireLeChef(async () => ({ status: 500, data: {} }), DEPOT), null);
    assert.equal(await lireLeChef(async () => ({ status: 200, data: { content: Buffer.from("{").toString("base64") } }), DEPOT), null);
    assert.equal(await lireLeChef(async () => assert.fail("offline"), DEPOT), null);
  });

  test("le compte se relit au plus toutes les cinq minutes, et sur-le-champ après un échec ou une connexion", async () => {
    let lectures = 0;
    let heure = 0;
    let rendu: { login: string } | { nonConnecte: true } = { nonConnecte: true };
    const compte = tenirLeLogin(async () => (lectures++, rendu), { dureeMs: 1000, maintenant: () => heure });
    assert.equal(await compte.login(), null);
    rendu = { login: "alice" };
    assert.equal(await compte.login(), "alice");
    assert.equal(await compte.login(), "alice");
    assert.equal(lectures, 2);
    heure = 1000;
    await compte.login();
    assert.equal(lectures, 3);
    compte.oublier();
    rendu = { login: "bob" };
    assert.equal(await compte.login(), "bob");
  });
});
