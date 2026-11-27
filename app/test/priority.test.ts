// Changer la priorité d'un ticket du rail depuis sa fiche (#1739) : l'app remplace le label `prio:` de son issue sur
// GitHub — l'ancien retiré, le nouveau posé —, sans box ; le rail montre la nouvelle priorité tant que le tableau de la
// cuisine montre l'ancienne. Un échec de GitHub ne change rien au rail, et se dit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { putAside } from "../src/awaiting.ts";
import { holdFacts, type Card, type Facts } from "../src/facts.ts";
import { changeThePriority, clientOfThePriority, sendByFetch, priorityOfLabels, PRIORITIES, holdPrioritiesWritten, type ClientOfThePriority } from "../src/priority.ts";
import type { AnswerGitHub } from "../src/board/client.ts";

const REPOSITORY = "chef/parade";
const ISSUE = `/repos/${REPOSITORY}/issues/22`;

// Un GitHub en mémoire : l'issue #22 et ses labels, chaque demande notée — et, pour une demande nommée, la réponse
// qu'il rend à la place (un refus, ou rien : il lève).
function github(labels: string[], refusal: Record<string, AnswerGitHub | "rien"> = {}) {
  const requests: string[] = [];
  const door = [...labels];
  const reply = (request: string, sinon: () => AnswerGitHub): AnswerGitHub => {
    requests.push(request);
    const force = refusal[request];
    if (force === "rien") throw new Error("GitHub gave no answer within 30 s");
    return force ?? sinon();
  };
  const client: ClientOfThePriority = {
    lire: async (path) => reply(`GET ${path}`, () => ({ status: 200, data: { number: 22, labels: door.map((name) => ({ name })) } })),
    ecrire: async (method, path, body) =>
      reply(`${method} ${path}${body === undefined ? "" : ` ${JSON.stringify(body)}`}`, () => {
        if (method === "POST") door.push(...(body as { labels: string[] }).labels);
        else {
          const name = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
          if (!door.includes(name)) return { status: 404, data: { message: "Label does not exist" } };
          door.splice(door.indexOf(name), 1);
        }
        return { status: 200, data: door.map((name) => ({ name })) };
      }),
  };
  return { client, demandes: requests, porte: door };
}

describe("le label `prio:` de l'issue, remplacé sur GitHub", () => {
  test("la nouvelle priorité est posée, l'ancienne retirée, les autres labels laissés — et la fiche dit ce qui est fait", async () => {
    const { client, demandes: requests, porte: door } = github(["fire", "prio:3", "model:sonnet"]);

    const rendered = await changeThePriority({ depot: REPOSITORY, ticket: 22, valeur: "1", client });

    assert.deepEqual(requests, [`GET ${ISSUE}`, `POST ${ISSUE}/labels {"labels":["prio:1"]}`, `DELETE ${ISSUE}/labels/prio%3A3`]);
    assert.deepEqual(door.sort(), ["fire", "model:sonnet", "prio:1"]);
    assert.deepEqual(rendered, {
      fait: "priority changed on GitHub: #22 now carries `prio:1` — the box reorders the rail when it reads it",
      detail: "https://github.com/chef/parade/issues/22",
      niveau: 1,
      avant: 3,
    });
  });

  test("`none` retire tous les `prio:` sans en poser ; une issue sans priorité en reçoit une ; la même priorité ne demande rien de plus", async () => {
    const without = github(["fire", "prio:2", "prio:5"]);
    assert.deepEqual(await changeThePriority({ depot: REPOSITORY, ticket: 22, valeur: "none", client: without.client }), {
      fait: "priority changed on GitHub: #22 now carries no `prio:` label — the box reorders the rail when it reads it",
      detail: "https://github.com/chef/parade/issues/22",
      niveau: null,
      avant: 2,
    });
    assert.deepEqual(without.demandes, [`GET ${ISSUE}`, `DELETE ${ISSUE}/labels/prio%3A2`, `DELETE ${ISSUE}/labels/prio%3A5`]);
    assert.deepEqual(without.porte, ["fire"]);

    const bare = github(["fire"]);
    assert.equal(((await changeThePriority({ depot: REPOSITORY, ticket: 22, valeur: "9", client: bare.client })) as { avant: unknown }).avant, null);
    assert.deepEqual(bare.porte, ["fire", "prio:9"]);

    const same = github(["fire", "prio:4"]);
    assert.ok("fait" in (await changeThePriority({ depot: REPOSITORY, ticket: 22, valeur: "4", client: same.client })));
    assert.deepEqual(same.demandes, [`GET ${ISSUE}`]);
  });

  test("une priorité hors de la liste, ou un ticket qui n'en est pas un : rien n'est demandé à GitHub", async () => {
    const { client, demandes: requests } = github(["prio:2"]);
    for (const value of ["0", "10", "1.5", "", 3, undefined, null]) {
      const rendered = await changeThePriority({ depot: REPOSITORY, ticket: 22, valeur: value, client });
      assert.match((rendered as { refus: string }).refus, /^nothing was changed: the priority .* is not one of 1, 2, 3, 4, 5, 6, 7, 8, 9, none$/, String(value));
    }
    for (const ticket of ["22", 0, 2.5, undefined]) {
      assert.deepEqual(await changeThePriority({ depot: REPOSITORY, ticket, valeur: "1", client }), { refus: "nothing was changed: the action names no ticket", detail: "" }, String(ticket));
    }
    assert.deepEqual(requests, []);
    assert.deepEqual(PRIORITIES, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "none"]);
  });

  test("GitHub en échec — l'issue illisible, le label refusé, ou pas de réponse : rien n'a changé, la raison en une ligne et son détail au survol", async () => {
    const unreadable = github(["prio:3"], { [`GET ${ISSUE}`]: { status: 404, data: { message: "Not Found" } } });
    assert.deepEqual(await changeThePriority({ depot: REPOSITORY, ticket: 22, valeur: "1", client: unreadable.client }), {
      refus: "nothing was changed: issue #22 was not read on GitHub",
      detail: "GitHub refused the reading of issue #22 (HTTP 404): Not Found",
    });
    assert.deepEqual(unreadable.demandes, [`GET ${ISSUE}`]);

    const refuses = github(["prio:3"], { [`POST ${ISSUE}/labels {"labels":["prio:1"]}`]: { status: 403, data: { message: "Resource not accessible by integration." } } });
    assert.deepEqual(await changeThePriority({ depot: REPOSITORY, ticket: 22, valeur: "1", client: refuses.client }), {
      refus: "nothing was changed: GitHub did not put `prio:1` on #22",
      detail: "GitHub refused the label `prio:1` (HTTP 403): Resource not accessible by integration",
    });
    assert.deepEqual(refuses.porte, ["prio:3"], "l'ancienne priorité n'est pas retirée");
    assert.equal(refuses.demandes.length, 2);

    const silent = github(["prio:3"], { [`GET ${ISSUE}`]: "rien" });
    assert.deepEqual(await changeThePriority({ depot: REPOSITORY, ticket: 22, valeur: "1", client: silent.client }), { refus: "nothing was changed: issue #22 was not read on GitHub", detail: "GitHub gave no answer within 30 s" });

    const withoutToken = github(["prio:3"], { [`GET ${ISSUE}`]: { status: 401, data: { message: "Bad credentials" } } });
    assert.match(((await changeThePriority({ depot: REPOSITORY, ticket: 22, valeur: "1", client: withoutToken.client })) as { detail: string }).detail, /sign in to GitHub again$/);
  });

  test("l'ancien label que GitHub refuse de retirer : la priorité n'a pas changé, et la ligne dit ce que l'issue porte", async () => {
    const { client, porte: door } = github(["fire", "prio:3"], { [`DELETE ${ISSUE}/labels/prio%3A3`]: { status: 403, data: { message: "Must have admin rights to Repository." } } });
    assert.deepEqual(await changeThePriority({ depot: REPOSITORY, ticket: 22, valeur: "1", client }), {
      refus: "the priority did not change: GitHub did not remove `prio:3` from #22 — its issue carries `prio:3`, `prio:1`",
      detail: "GitHub refused the removal of `prio:3` (HTTP 403): Must have admin rights to Repository",
    });
    assert.deepEqual(door, ["fire", "prio:3", "prio:1"]);
  });

  test("la priorité que des labels portent est celle que la box lit : la plus forte, nulle sans aucune", () => {
    assert.equal(priorityOfLabels(["fire", "prio:3", "prio:1"]), 1);
    assert.equal(priorityOfLabels(["fire", "prio:x", "prio:10"]), null);
  });
});

describe("les demandes, telles qu'elles partent", () => {
  test("un `POST` porte le jeton et son corps en JSON ; un `DELETE` n'a pas de corps ; la lecture est le `GET` du tableau", async () => {
    const sends: { adresse: string; init: RequestInit }[] = [];
    const fake = (async (address: string, init: RequestInit) => (sends.push({ adresse: address, init }), new Response(JSON.stringify([]), { status: 200 }))) as unknown as typeof fetch;
    const readOnes: string[] = [];
    const client = clientOfThePriority({ jeton: async () => "gho_jeton", appeler: async (path) => (readOnes.push(path), { status: 200, data: { labels: [] } }), envoyer: sendByFetch({ fetch: fake }) });

    await client.ecrire("POST", `${ISSUE}/labels`, { labels: ["prio:1"] });
    await client.ecrire("DELETE", `${ISSUE}/labels/prio%3A3`);
    await client.lire(ISSUE);

    assert.deepEqual(
      sends.map(({ adresse: address, init }) => [address, init.method, init.body, (init.headers as Record<string, string>).Authorization, (init.headers as Record<string, string>)["Content-Type"]]),
      [
        [`https://api.github.com${ISSUE}/labels`, "POST", '{"labels":["prio:1"]}', "Bearer gho_jeton", "application/json"],
        [`https://api.github.com${ISSUE}/labels/prio%3A3`, "DELETE", undefined, "Bearer gho_jeton", undefined],
      ],
    );
    assert.deepEqual(readOnes, [ISSUE]);
  });
});

describe("le rail montre la priorité écrite", () => {
  const A = "2026-10-13T10:04:12.000Z";
  const FACTS: Facts = {
    etat: "ouverte",
    lu: "2026-10-13T10:04:11.000Z",
    dernierTick: null,
    compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
    dernierEvenement: null,
    rail: [{ ticket: 22, etat: "en attente", titre: "Un ticket libre", url: "https://github.com/chef/parade/issues/22" }],
  };
  // Le `status` que le tableau porte : la ligne du ticket, avec la priorité que la box lui connaît.
  const status = (prio: string) => ["project    parade", "", `rail       1 queued`, `  #22  queued  ${prio}  since 3 min  Un ticket libre`, ""].join("\n");

  // Une cuisine dont le tableau est lu — `facts`, puis `status` — avec cette priorité ; ce que le rail montre de #22.
  function kitchen() {
    const writtenEntries = holdPrioritiesWritten();
    const facts = holdFacts(undefined, (project) => writtenEntries.de(project));
    facts.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    const shows = (draws: unknown): Pick<Card, "prio"> & { fiche: unknown } => {
      const board = (draws as { tableau: { rail: { colonnes: { cartes: Card[] }[] } } }).tableau;
      const card = board.rail.colonnes.flatMap(({ cartes: cards }) => cards).find(({ ticket }) => ticket === 22);
      assert.ok(card !== undefined);
      return { prio: card.prio, fiche: card.fiche.priorite };
    };
    const read = (prio: string) => shows(facts.attendre(putAside({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: status(prio) }] })));
    return { ecrites: writtenEntries, lire: read, redessiner: () => shows(facts.redessiner("parade")) };
  }

  test("écrite, la nouvelle priorité est sur la carte et la fiche aussitôt, et tant que le tableau montre l'ancienne — box injoignable comprise", () => {
    const { ecrites: writtenEntries, lire: read, redessiner: redraw } = kitchen();
    assert.deepEqual(read("prio:3"), { prio: "prio:3", fiche: { valeur: "prio:3", exact: true } });

    writtenEntries.ecrite("parade", 22, 1, 3);
    assert.deepEqual(redraw(), { prio: "prio:1", fiche: { valeur: "prio:1", exact: true } });
    // Le tableau, que la box ne republie pas, montre encore `prio:3` : le rail garde `prio:1`.
    assert.deepEqual(read("prio:3"), { prio: "prio:1", fiche: { valeur: "prio:1", exact: true } });
    // La box l'a lue : le tableau la montre, et c'est lui qui la dit désormais.
    assert.deepEqual(read("prio:1"), { prio: "prio:1", fiche: { valeur: "prio:1", exact: true } });
    assert.deepEqual(read("prio:2"), { prio: "prio:2", fiche: { valeur: "prio:2", exact: true } });
    // Oubliée : un tableau qui reviendrait à `prio:3` dit `prio:3`.
    assert.deepEqual(read("prio:3"), { prio: "prio:3", fiche: { valeur: "prio:3", exact: true } });
  });

  test("la priorité retirée se dit `no prio` sur la carte ; un autre projet n'en est pas touché", () => {
    const { ecrites: writtenEntries, lire: read } = kitchen();
    writtenEntries.ecrite("parade", 22, null, 3);
    writtenEntries.ecrite("cantine", 22, 7, 3);
    assert.deepEqual(read("prio:3"), { prio: "no prio", fiche: { valeur: "none — its issue carries no `prio:` label" } });
  });

  test("GitHub en échec, rien n'est écrit : le rail garde l'ancienne priorité", async () => {
    const { lire: read, ecrites: writtenEntries } = kitchen();
    const { client } = github(["prio:3"], { [`POST ${ISSUE}/labels {"labels":["prio:1"]}`]: { status: 502, data: "" } });
    const rendered = await changeThePriority({ depot: REPOSITORY, ticket: 22, valeur: "1", client });
    // Un refus : main.ts ne retient que ce qui est fait, et ne redessine rien.
    assert.ok("refus" in rendered && !("niveau" in rendered));
    assert.equal(writtenEntries.de("parade")(22, 3), undefined);
    assert.deepEqual(read("prio:3"), { prio: "prio:3", fiche: { valeur: "prio:3", exact: true } });
  });
});
