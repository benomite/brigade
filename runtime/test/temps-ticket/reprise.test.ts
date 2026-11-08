// Ce que la station n'a pas vu d'un ticket avant de le merger — un cook tué par
// son redémarrage, une prise d'une autre station, un renvoi —, lu sur les
// commentaires de l'issue au merge (#2954). BOBL-tech/calculus-workspace#694 et
// #696, livrés du premier coup, comptaient 31 et 35 min de renvois : le cook
// tué par la mise à jour de la station, et l'attente de sa reprise.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { clientDuTour } from "../../src/brigade-github.ts";
import { corpsDeLacher, corpsDePrise } from "../../src/github-etat/prise.ts";
import type { GitHub } from "../../src/github.ts";
import { chronometre, type DepotDuTicket, type Etape } from "../../src/temps-ticket/mesure.ts";

type Commentaire = { body: string; association: string; createdAt: string };

// Le client du tour, sur une issue déposée à `deposeAt`, mise sur le rail à `fireAt`, qui porte `commentaires`.
const depotLu = (deposeAt: string, fireAt: string, commentaires: Commentaire[]): Promise<DepotDuTicket | null> => {
  const github = {
    mettreAJour: async () => assert.fail("no branch update"),
    prsOuvertes: async () => [],
    retraitsDeLabels: async () => [],
    issue: async () => ({ number: 694, title: "t", body: "", labels: [], state: "closed", createdAt: deposeAt }),
    posesDeFire: async () => [fireAt],
    commentaires: async () => commentaires.map((c, rang) => ({ id: rang + 1, author: "brigade", ...c })),
  } as unknown as GitHub;
  const lire = clientDuTour(github, "main").depotDuTicket;
  assert.ok(lire !== undefined);
  return lire(694);
};

// La station sert le ticket après n'en avoir vu que `vues`, mergé à `mergedAt`.
const servi = (vues: [Etape, string][], mergedAt: string, depot: DepotDuTicket) => {
  let maintenant = 0;
  const chrono = chronometre(() => new Date(maintenant));
  for (const [etape, at] of vues) {
    maintenant = Date.parse(at);
    if (etape === "cuisson") chrono.prendre(694);
    else chrono.marquer(694, etape);
  }
  maintenant = Date.parse(mergedAt);
  return chrono.servir(694, depot);
};

const STATION = "box/claude";
const prise = (createdAt: string): Commentaire => ({ body: corpsDePrise(STATION), association: "OWNER", createdAt });
const lacher = (createdAt: string): Commentaire => ({ body: corpsDeLacher(STATION), association: "OWNER", createdAt });

describe("what the station did not see of a ticket is read on its issue at the merge (#2954)", () => {
  test("a cook killed by its station's restart, then claimed again, is a failed cook and a claim wait, not a send-back", async () => {
    // calculus-workspace#694 : pris à 20:03:32, le cook meurt avec sa station, rendu à 20:10,
    // repris à 20:34:30 par la station relancée, qui n'a vu que la reprise.
    const depot = await depotLu("2026-11-08T20:03:25Z", "2026-11-08T20:03:27Z", [
      prise("2026-11-08T20:03:32Z"),
      { body: "Station `box/claude`: the cook stopped with its station — station restarted", association: "OWNER", createdAt: "2026-11-08T20:10:00Z" },
      lacher("2026-11-08T20:10:00Z"),
      prise("2026-11-08T20:34:30Z"),
    ]);
    assert.ok(depot !== null);
    assert.equal(depot.priseAt, "2026-11-08T20:03:32.000Z");
    const temps = servi(
      [
        ["cuisson", "2026-11-08T20:34:31Z"],
        ["attentePasse", "2026-11-08T20:37:00Z"],
        ["ci", "2026-11-08T20:37:30Z"],
      ],
      "2026-11-08T20:38:06Z",
      depot,
    );
    // Mesurée, pas rejetée : l'attente de la reprise n'est pas celle d'avant la première prise.
    assert.ok(temps !== null);
    assert.deepEqual(temps.perdu, { attente: 2 + 5 + 1470, ratees: 388, renvois: 0 });
    assert.deepEqual(temps.phases, [
      { nom: "qualification wait", minutes: 0 },
      { nom: "claim wait", minutes: 0.1 },
      { nom: "failed cook", minutes: 6.5 },
      { nom: "claim wait", minutes: 24.5 },
      { nom: "cooking", minutes: 2.5 },
      { nom: "pass wait", minutes: 0.5 },
      { nom: "CI", minutes: 0.6 },
    ]);
  });

  test("calculus-workspace#696: a cook released by its station's restart is a failed cook, not 35 min of send-backs", async () => {
    // Pris à 20:03:46, le cook meurt avec sa station, qui rend le ticket à 20:09:30 ;
    // la station relancée le reprend à 20:39:00 et le livre du premier coup.
    const depot = await depotLu("2026-11-08T20:03:30Z", "2026-11-08T20:03:32Z", [prise("2026-11-08T20:03:46Z"), lacher("2026-11-08T20:09:30Z"), prise("2026-11-08T20:39:00Z")]);
    assert.ok(depot !== null);
    const temps = servi(
      [
        ["cuisson", "2026-11-08T20:39:02Z"],
        ["attentePasse", "2026-11-08T20:42:00Z"],
      ],
      "2026-11-08T20:43:28Z",
      depot,
    );
    assert.ok(temps !== null);
    assert.deepEqual(temps.perdu, { attente: 2 + 14 + 1770, ratees: 344, renvois: 0 });
    assert.equal(temps.cuisson, 180);
  });

  test("a cook that died with its station without a release, then claimed again, is a failed cook, not the delivering cooking", async () => {
    // Rien n'a rendu le ticket entre les deux prises : la station tuée net n'a rien posté.
    const depot = await depotLu("2026-11-08T20:03:30Z", "2026-11-08T20:03:32Z", [prise("2026-11-08T20:03:46Z"), prise("2026-11-08T20:39:00Z")]);
    assert.ok(depot !== null);
    const temps = servi(
      [
        ["cuisson", "2026-11-08T20:39:02Z"],
        ["attentePasse", "2026-11-08T20:42:00Z"],
      ],
      "2026-11-08T20:43:28Z",
      depot,
    );
    assert.ok(temps !== null);
    assert.deepEqual(temps.perdu, { attente: 2 + 14, ratees: 2114, renvois: 0 });
    assert.equal(temps.cuisson, 180);
    assert.deepEqual(
      temps.phases?.map((p) => p.nom),
      ["qualification wait", "claim wait", "failed cook", "cooking", "pass wait"],
    );
  });

  test("the claim the station posted itself, a few seconds before its own mark, is the same cooking: no send-back", async () => {
    // calculus-workspace#697 : 0,1 min de renvoi entre la prise postée et la marque de la station.
    const depot = await depotLu("2026-11-08T20:03:33Z", "2026-11-08T20:03:34Z", [prise("2026-11-08T20:31:39Z")]);
    assert.ok(depot !== null);
    const temps = servi(
      [
        ["cuisson", "2026-11-08T20:31:45Z"],
        ["attentePasse", "2026-11-08T20:37:00Z"],
      ],
      "2026-11-08T20:38:03Z",
      depot,
    );
    assert.ok(temps !== null);
    assert.deepEqual(temps.perdu, { attente: 1 + 1685, ratees: 0, renvois: 0 });
    assert.equal(temps.cuisson, 321);
    assert.deepEqual(
      temps.phases?.map((p) => p.nom),
      ["qualification wait", "claim wait", "cooking", "pass wait"],
    );
  });

  test("a delivery sent back before the station saw the ticket stays a send-back", async () => {
    const depot = await depotLu("2026-11-08T10:00:00Z", "2026-11-08T10:00:00Z", [
      prise("2026-11-08T10:05:00Z"),
      { body: "<!-- brigade:renvoi n=1 sha=abc -->\nSent back: tests red", association: "OWNER", createdAt: "2026-11-08T10:20:00Z" },
      prise("2026-11-08T10:25:00Z"),
    ]);
    assert.ok(depot !== null);
    const temps = servi(
      [
        ["cuisson", "2026-11-08T10:25:05Z"],
        ["attentePasse", "2026-11-08T10:30:00Z"],
      ],
      "2026-11-08T10:35:00Z",
      depot,
    );
    assert.ok(temps !== null);
    assert.deepEqual(temps.perdu, { attente: 300, ratees: 0, renvois: 1200 });
  });

  test("a release posted by someone outside the repository is not read", async () => {
    const depot = await depotLu("2026-11-08T10:00:00Z", "2026-11-08T10:00:00Z", [prise("2026-11-08T10:05:00Z"), { ...lacher("2026-11-08T10:10:00Z"), association: "NONE" }]);
    assert.ok(depot !== null);
    assert.deepEqual(depot.faits, [{ quoi: "prise", at: "2026-11-08T10:05:00Z" }]);
    const temps = servi([["attentePasse", "2026-11-08T10:30:00Z"]], "2026-11-08T10:35:00Z", depot);
    assert.deepEqual(temps?.perdu, { attente: 300, ratees: 0, renvois: 0 });
  });
});
