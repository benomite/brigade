// Changer la priorité d'un ticket du rail depuis sa fiche (#1739) : l'app remplace le label `prio:` de son issue sur
// GitHub — l'ancien retiré, le nouveau posé —, sans box ; le rail montre la nouvelle priorité tant que le tableau de la
// cuisine montre l'ancienne. Un échec de GitHub ne change rien au rail, et se dit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mettreAPart } from "../src/attend.ts";
import { tenirFaits, type Carte, type Faits } from "../src/faits.ts";
import { changerLaPriorite, clientDeLaPriorite, envoyerParFetch, prioriteDesLabels, PRIORITES, tenirPrioritesEcrites, type ClientDeLaPriorite } from "../src/priorite.ts";
import type { ReponseGitHub } from "../src/tableau/client.ts";

const DEPOT = "chef/parade";
const ISSUE = `/repos/${DEPOT}/issues/22`;

// Un GitHub en mémoire : l'issue #22 et ses labels, chaque demande notée — et, pour une demande nommée, la réponse
// qu'il rend à la place (un refus, ou rien : il lève).
function github(labels: string[], refus: Record<string, ReponseGitHub | "rien"> = {}) {
  const demandes: string[] = [];
  const porte = [...labels];
  const repondre = (demande: string, sinon: () => ReponseGitHub): ReponseGitHub => {
    demandes.push(demande);
    const force = refus[demande];
    if (force === "rien") throw new Error("GitHub gave no answer within 30 s");
    return force ?? sinon();
  };
  const client: ClientDeLaPriorite = {
    lire: async (chemin) => repondre(`GET ${chemin}`, () => ({ status: 200, data: { number: 22, labels: porte.map((name) => ({ name })) } })),
    ecrire: async (methode, chemin, corps) =>
      repondre(`${methode} ${chemin}${corps === undefined ? "" : ` ${JSON.stringify(corps)}`}`, () => {
        if (methode === "POST") porte.push(...(corps as { labels: string[] }).labels);
        else {
          const nom = decodeURIComponent(chemin.slice(chemin.lastIndexOf("/") + 1));
          if (!porte.includes(nom)) return { status: 404, data: { message: "Label does not exist" } };
          porte.splice(porte.indexOf(nom), 1);
        }
        return { status: 200, data: porte.map((name) => ({ name })) };
      }),
  };
  return { client, demandes, porte };
}

describe("le label `prio:` de l'issue, remplacé sur GitHub", () => {
  test("la nouvelle priorité est posée, l'ancienne retirée, les autres labels laissés — et la fiche dit ce qui est fait", async () => {
    const { client, demandes, porte } = github(["fire", "prio:3", "model:sonnet"]);

    const rendu = await changerLaPriorite({ depot: DEPOT, ticket: 22, valeur: "1", client });

    assert.deepEqual(demandes, [`GET ${ISSUE}`, `POST ${ISSUE}/labels {"labels":["prio:1"]}`, `DELETE ${ISSUE}/labels/prio%3A3`]);
    assert.deepEqual(porte.sort(), ["fire", "model:sonnet", "prio:1"]);
    assert.deepEqual(rendu, {
      fait: "priority changed on GitHub: #22 now carries `prio:1` — the box reorders the rail when it reads it",
      detail: "https://github.com/chef/parade/issues/22",
      niveau: 1,
      avant: 3,
    });
  });

  test("`none` retire tous les `prio:` sans en poser ; une issue sans priorité en reçoit une ; la même priorité ne demande rien de plus", async () => {
    const sans = github(["fire", "prio:2", "prio:5"]);
    assert.deepEqual(await changerLaPriorite({ depot: DEPOT, ticket: 22, valeur: "none", client: sans.client }), {
      fait: "priority changed on GitHub: #22 now carries no `prio:` label — the box reorders the rail when it reads it",
      detail: "https://github.com/chef/parade/issues/22",
      niveau: null,
      avant: 2,
    });
    assert.deepEqual(sans.demandes, [`GET ${ISSUE}`, `DELETE ${ISSUE}/labels/prio%3A2`, `DELETE ${ISSUE}/labels/prio%3A5`]);
    assert.deepEqual(sans.porte, ["fire"]);

    const nue = github(["fire"]);
    assert.equal(((await changerLaPriorite({ depot: DEPOT, ticket: 22, valeur: "9", client: nue.client })) as { avant: unknown }).avant, null);
    assert.deepEqual(nue.porte, ["fire", "prio:9"]);

    const meme = github(["fire", "prio:4"]);
    assert.ok("fait" in (await changerLaPriorite({ depot: DEPOT, ticket: 22, valeur: "4", client: meme.client })));
    assert.deepEqual(meme.demandes, [`GET ${ISSUE}`]);
  });

  test("une priorité hors de la liste, ou un ticket qui n'en est pas un : rien n'est demandé à GitHub", async () => {
    const { client, demandes } = github(["prio:2"]);
    for (const valeur of ["0", "10", "1.5", "", 3, undefined, null]) {
      const rendu = await changerLaPriorite({ depot: DEPOT, ticket: 22, valeur, client });
      assert.match((rendu as { refus: string }).refus, /^nothing was changed: the priority .* is not one of 1, 2, 3, 4, 5, 6, 7, 8, 9, none$/, String(valeur));
    }
    for (const ticket of ["22", 0, 2.5, undefined]) {
      assert.deepEqual(await changerLaPriorite({ depot: DEPOT, ticket, valeur: "1", client }), { refus: "nothing was changed: the action names no ticket", detail: "" }, String(ticket));
    }
    assert.deepEqual(demandes, []);
    assert.deepEqual(PRIORITES, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "none"]);
  });

  test("GitHub en échec — l'issue illisible, le label refusé, ou pas de réponse : rien n'a changé, la raison en une ligne et son détail au survol", async () => {
    const illisible = github(["prio:3"], { [`GET ${ISSUE}`]: { status: 404, data: { message: "Not Found" } } });
    assert.deepEqual(await changerLaPriorite({ depot: DEPOT, ticket: 22, valeur: "1", client: illisible.client }), {
      refus: "nothing was changed: issue #22 was not read on GitHub",
      detail: "GitHub refused the reading of issue #22 (HTTP 404): Not Found",
    });
    assert.deepEqual(illisible.demandes, [`GET ${ISSUE}`]);

    const refuse = github(["prio:3"], { [`POST ${ISSUE}/labels {"labels":["prio:1"]}`]: { status: 403, data: { message: "Resource not accessible by integration." } } });
    assert.deepEqual(await changerLaPriorite({ depot: DEPOT, ticket: 22, valeur: "1", client: refuse.client }), {
      refus: "nothing was changed: GitHub did not put `prio:1` on #22",
      detail: "GitHub refused the label `prio:1` (HTTP 403): Resource not accessible by integration",
    });
    assert.deepEqual(refuse.porte, ["prio:3"], "l'ancienne priorité n'est pas retirée");
    assert.equal(refuse.demandes.length, 2);

    const muet = github(["prio:3"], { [`GET ${ISSUE}`]: "rien" });
    assert.deepEqual(await changerLaPriorite({ depot: DEPOT, ticket: 22, valeur: "1", client: muet.client }), { refus: "nothing was changed: issue #22 was not read on GitHub", detail: "GitHub gave no answer within 30 s" });

    const sansJeton = github(["prio:3"], { [`GET ${ISSUE}`]: { status: 401, data: { message: "Bad credentials" } } });
    assert.match(((await changerLaPriorite({ depot: DEPOT, ticket: 22, valeur: "1", client: sansJeton.client })) as { detail: string }).detail, /sign in to GitHub again$/);
  });

  test("l'ancien label que GitHub refuse de retirer : la priorité n'a pas changé, et la ligne dit ce que l'issue porte", async () => {
    const { client, porte } = github(["fire", "prio:3"], { [`DELETE ${ISSUE}/labels/prio%3A3`]: { status: 403, data: { message: "Must have admin rights to Repository." } } });
    assert.deepEqual(await changerLaPriorite({ depot: DEPOT, ticket: 22, valeur: "1", client }), {
      refus: "the priority did not change: GitHub did not remove `prio:3` from #22 — its issue carries `prio:3`, `prio:1`",
      detail: "GitHub refused the removal of `prio:3` (HTTP 403): Must have admin rights to Repository",
    });
    assert.deepEqual(porte, ["fire", "prio:3", "prio:1"]);
  });

  test("la priorité que des labels portent est celle que la box lit : la plus forte, nulle sans aucune", () => {
    assert.equal(prioriteDesLabels(["fire", "prio:3", "prio:1"]), 1);
    assert.equal(prioriteDesLabels(["fire", "prio:x", "prio:10"]), null);
  });
});

describe("les demandes, telles qu'elles partent", () => {
  test("un `POST` porte le jeton et son corps en JSON ; un `DELETE` n'a pas de corps ; la lecture est le `GET` du tableau", async () => {
    const envois: { adresse: string; init: RequestInit }[] = [];
    const faux = (async (adresse: string, init: RequestInit) => (envois.push({ adresse, init }), new Response(JSON.stringify([]), { status: 200 }))) as unknown as typeof fetch;
    const lus: string[] = [];
    const client = clientDeLaPriorite({ jeton: async () => "gho_jeton", appeler: async (chemin) => (lus.push(chemin), { status: 200, data: { labels: [] } }), envoyer: envoyerParFetch({ fetch: faux }) });

    await client.ecrire("POST", `${ISSUE}/labels`, { labels: ["prio:1"] });
    await client.ecrire("DELETE", `${ISSUE}/labels/prio%3A3`);
    await client.lire(ISSUE);

    assert.deepEqual(
      envois.map(({ adresse, init }) => [adresse, init.method, init.body, (init.headers as Record<string, string>).Authorization, (init.headers as Record<string, string>)["Content-Type"]]),
      [
        [`https://api.github.com${ISSUE}/labels`, "POST", '{"labels":["prio:1"]}', "Bearer gho_jeton", "application/json"],
        [`https://api.github.com${ISSUE}/labels/prio%3A3`, "DELETE", undefined, "Bearer gho_jeton", undefined],
      ],
    );
    assert.deepEqual(lus, [ISSUE]);
  });
});

describe("le rail montre la priorité écrite", () => {
  const A = "2026-10-13T10:04:12.000Z";
  const FAITS: Faits = {
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
  function cuisine() {
    const ecrites = tenirPrioritesEcrites();
    const faits = tenirFaits(undefined, (projet) => ecrites.de(projet));
    faits.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
    const montre = (dessine: unknown): Pick<Carte, "prio"> & { fiche: unknown } => {
      const tableau = (dessine as { tableau: { rail: { colonnes: { cartes: Carte[] }[] } } }).tableau;
      const carte = tableau.rail.colonnes.flatMap(({ cartes }) => cartes).find(({ ticket }) => ticket === 22);
      assert.ok(carte !== undefined);
      return { prio: carte.prio, fiche: carte.fiche.priorite };
    };
    const lire = (prio: string) => montre(faits.attendre(mettreAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: status(prio) }] })));
    return { ecrites, lire, redessiner: () => montre(faits.redessiner("parade")) };
  }

  test("écrite, la nouvelle priorité est sur la carte et la fiche aussitôt, et tant que le tableau montre l'ancienne — box injoignable comprise", () => {
    const { ecrites, lire, redessiner } = cuisine();
    assert.deepEqual(lire("prio:3"), { prio: "prio:3", fiche: { valeur: "prio:3", exact: true } });

    ecrites.ecrite("parade", 22, 1, 3);
    assert.deepEqual(redessiner(), { prio: "prio:1", fiche: { valeur: "prio:1", exact: true } });
    // Le tableau, que la box ne republie pas, montre encore `prio:3` : le rail garde `prio:1`.
    assert.deepEqual(lire("prio:3"), { prio: "prio:1", fiche: { valeur: "prio:1", exact: true } });
    // La box l'a lue : le tableau la montre, et c'est lui qui la dit désormais.
    assert.deepEqual(lire("prio:1"), { prio: "prio:1", fiche: { valeur: "prio:1", exact: true } });
    assert.deepEqual(lire("prio:2"), { prio: "prio:2", fiche: { valeur: "prio:2", exact: true } });
    // Oubliée : un tableau qui reviendrait à `prio:3` dit `prio:3`.
    assert.deepEqual(lire("prio:3"), { prio: "prio:3", fiche: { valeur: "prio:3", exact: true } });
  });

  test("la priorité retirée se dit `no prio` sur la carte ; un autre projet n'en est pas touché", () => {
    const { ecrites, lire } = cuisine();
    ecrites.ecrite("parade", 22, null, 3);
    ecrites.ecrite("cantine", 22, 7, 3);
    assert.deepEqual(lire("prio:3"), { prio: "no prio", fiche: { valeur: "none — its issue carries no `prio:` label" } });
  });

  test("GitHub en échec, rien n'est écrit : le rail garde l'ancienne priorité", async () => {
    const { lire, ecrites } = cuisine();
    const { client } = github(["prio:3"], { [`POST ${ISSUE}/labels {"labels":["prio:1"]}`]: { status: 502, data: "" } });
    const rendu = await changerLaPriorite({ depot: DEPOT, ticket: 22, valeur: "1", client });
    // Un refus : main.ts ne retient que ce qui est fait, et ne redessine rien.
    assert.ok("refus" in rendu && !("niveau" in rendu));
    assert.equal(ecrites.de("parade")(22, 3), undefined);
    assert.deepEqual(lire("prio:3"), { prio: "prio:3", fiche: { valeur: "prio:3", exact: true } });
  });
});
