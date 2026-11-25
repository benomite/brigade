// Le geste d'une idée en réserve, depuis la liste du Backlog (ticket 3589) : « Drop » ferme l'issue comme non prévue ;
// aucun geste ne la met sur le rail (ticket 4223). Rien ne part sans lecture, ni pour une issue que la lecture ne montre
// pas en idée. Joué contre un GitHub en mémoire, qui note chaque demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { jouerLIdee } from "../src/gestes-idee.ts";
import type { ClientDeLaPriorite } from "../src/priorite.ts";
import type { ReponseGitHub } from "../src/tableau/client.ts";
import type { TableauLu } from "../src/tableau/lecture.ts";

const DEPOT = "chef/parade";
const LU: TableauLu = {
  lu: true,
  depot: DEPOT,
  luLe: "2026-11-15T10:00:00.000Z",
  cuisine: { rubriques: [] },
  faits: { rail: [], attend: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
  avantLeRail: {
    lu: "2026-11-15T10:00:00.000Z",
    issues: [
      { ticket: 30, titre: "Un programme de fidélité", priorite: null, etat: "idee", dit: "it carries `idea`: an idea in reserve, not a request" },
      { ticket: 31, titre: "Le stock", priorite: 2, etat: "non-lue", dit: "not calibrated yet" },
    ],
  },
} as unknown as TableauLu;

function github(repondre: (methode: string, chemin: string) => ReponseGitHub = () => ({ status: 200, data: {} })) {
  const demandes: string[] = [];
  const client: ClientDeLaPriorite = {
    lire: async () => assert.fail("rien ne se lit"),
    ecrire: async (methode, chemin, corps) => (demandes.push(`${methode} ${chemin}${corps === undefined ? "" : ` ${JSON.stringify(corps)}`}`), repondre(methode, chemin)),
  };
  return { client, demandes };
}

describe("les gestes d'une idée en réserve", () => {
  test("aucun geste ne met une idée sur le rail : `rail` est refusé, et rien ne part sur GitHub (ticket 4223)", async () => {
    const { client, demandes } = github();
    const rendu = await jouerLIdee(LU, "rail", 30, client);
    assert.deepEqual(rendu, { refus: "nothing was sent: this is not a gesture of an idea", detail: "“rail” is not one" });
    assert.deepEqual(demandes, []);
    // « Drop » reste, seul geste d'une idée : il ferme l'issue, et un refus de GitHub se dit.
    assert.ok("fait" in (await jouerLIdee(LU, "abandonner", 30, client)));
    assert.ok("refus" in (await jouerLIdee(LU, "abandonner", 30, github(() => ({ status: 403, data: {} })).client)));
  });

  test("« Drop » ferme l'issue comme non prévue", async () => {
    const { client, demandes } = github();
    const rendu = await jouerLIdee(LU, "abandonner", 30, client);
    assert.deepEqual(demandes, ['PATCH /repos/chef/parade/issues/30 {"state":"closed","state_reason":"not_planned"}']);
    assert.deepEqual(rendu, { fait: "dropped on GitHub: #30 is closed as not planned", detail: "https://github.com/chef/parade/issues/30" });
    // GitHub refuse : rien n'a changé, et la phrase le dit.
    const ferme = await jouerLIdee(LU, "abandonner", 30, github(() => ({ status: 403, data: { message: "Must have admin rights" } })).client);
    assert.ok("refus" in ferme && ferme.refus === "nothing was changed: GitHub did not close #30" && ferme.detail.includes("403"), JSON.stringify(ferme));
    const jete = await jouerLIdee(LU, "abandonner", 30, { lire: async () => assert.fail("rien ne se lit"), ecrire: async () => Promise.reject(new Error("socket hang up")) });
    assert.deepEqual(jete, { refus: "nothing was changed: GitHub did not close #30", detail: "socket hang up" });
  });

  test("rien ne part sans lecture, pour une issue qui n'est pas une idée, ni pour un autre geste", async () => {
    const { client, demandes } = github();
    assert.ok("refus" in (await jouerLIdee(undefined, "abandonner", 30, client)));
    assert.ok("refus" in (await jouerLIdee({ ...LU, avantLeRail: undefined }, "abandonner", 30, client)));
    const pasIdee = await jouerLIdee(LU, "abandonner", 31, client);
    assert.ok("refus" in pasIdee && pasIdee.refus.includes("#31 is not an idea in reserve"));
    assert.ok("refus" in (await jouerLIdee(LU, "abandonner", 99, client)));
    assert.ok("refus" in (await jouerLIdee(LU, "abandonner", "30", client)));
    assert.ok("refus" in (await jouerLIdee(LU, "clore", 30, client)));
    assert.deepEqual(demandes, []);
  });
});
