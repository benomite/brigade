// Les gestes d'une carte mise de côté (ticket 3147) : « Relaunch » retire `served-elsewhere` de l'issue, « Close as already
// done » la ferme comme terminée. Rien ne part sans lecture du rail, ni pour un ticket que la lecture ne montre pas mis de
// côté. Joué contre un GitHub en mémoire, qui note chaque demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { jouerLeRefus } from "../src/gestes-refus.ts";
import type { ClientDeLaPriorite } from "../src/priorite.ts";
import type { ReponseGitHub } from "../src/tableau/client.ts";
import type { TableauLu } from "../src/tableau/lecture.ts";

const DEPOT = "chef/parade";
const LU: TableauLu = {
  lu: true,
  depot: DEPOT,
  luLe: "2026-11-10T10:00:00.000Z",
  cuisine: { rubriques: [] },
  faits: { rail: [{ ticket: 22, etat: "86" }, { ticket: 23, etat: "pris" }], attend: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

function github(repondre: (methode: string, chemin: string) => ReponseGitHub = () => ({ status: 200, data: {} })) {
  const demandes: string[] = [];
  const client: ClientDeLaPriorite = {
    lire: async () => assert.fail("rien ne se lit"),
    ecrire: async (methode, chemin, corps) => (demandes.push(`${methode} ${chemin}${corps === undefined ? "" : ` ${JSON.stringify(corps)}`}`), repondre(methode, chemin)),
  };
  return { client, demandes };
}

describe("les gestes d'une carte mise de côté", () => {
  test("« Relaunch » retire `served-elsewhere` de l'issue — déjà retiré, c'est fait", async () => {
    const { client, demandes } = github();
    const rendu = await jouerLeRefus(LU, "relancer", 22, client);
    assert.deepEqual(demandes, ["DELETE /repos/chef/parade/issues/22/labels/served-elsewhere"]);
    assert.ok("fait" in rendu && rendu.fait.includes("no longer carries `served-elsewhere`"));
    const deja = github(() => ({ status: 404, data: {} }));
    assert.ok("fait" in (await jouerLeRefus(LU, "relancer", 22, deja.client)));
  });

  test("« Close as already done » ferme l'issue comme terminée", async () => {
    const { client, demandes } = github();
    const rendu = await jouerLeRefus(LU, "clore", 22, client);
    assert.deepEqual(demandes, ['PATCH /repos/chef/parade/issues/22 {"state":"closed","state_reason":"completed"}']);
    assert.deepEqual(rendu, { fait: "closed as completed on GitHub: #22 leaves the rail", detail: "https://github.com/chef/parade/issues/22" });
  });

  test("GitHub refuse : rien n'a changé, et la phrase le dit — pour l'un comme pour l'autre", async () => {
    const refuse = github(() => ({ status: 403, data: { message: "Resource not accessible by integration" } }));
    for (const [id, dit] of [["relancer", "GitHub did not remove `served-elsewhere` from #22"], ["clore", "GitHub did not close #22"]] as const) {
      const rendu = await jouerLeRefus(LU, id, 22, refuse.client);
      assert.ok("refus" in rendu && rendu.refus.includes(dit), JSON.stringify(rendu));
    }
    const leve = github(() => {
      throw new Error("network down");
    });
    const rendu = await jouerLeRefus(LU, "clore", 22, leve.client);
    assert.ok("refus" in rendu && rendu.detail.includes("network down"));
  });

  test("rien ne part sans lecture, sans ticket, pour un ticket qui n'est pas mis de côté, ni pour un geste inconnu", async () => {
    const { client, demandes } = github();
    for (const [lu, id, ticket] of [
      [undefined, "relancer", 22],
      [LU, "relancer", "22"],
      [LU, "clore", 23],
      [LU, "clore", 99],
      [LU, "supprimer", 22],
    ] as const) {
      const rendu = await jouerLeRefus(lu, id, ticket, client);
      assert.ok("refus" in rendu, `${String(id)} ${String(ticket)}`);
    }
    assert.deepEqual(demandes, []);
  });
});
