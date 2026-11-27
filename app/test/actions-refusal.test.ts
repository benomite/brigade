// Les gestes d'une carte mise de côté (ticket 3147) : « Relaunch » retire `served-elsewhere` de l'issue, « Close as already
// done » la ferme comme terminée. Rien ne part sans lecture du rail, ni pour un ticket que la lecture ne montre pas mis de
// côté. Joué contre un GitHub en mémoire, qui note chaque demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { playTheRefusal } from "../src/actions-refusal.ts";
import type { ClientOfThePriority } from "../src/priority.ts";
import type { AnswerGitHub } from "../src/board/client.ts";
import type { BoardRead } from "../src/board/read.ts";

const REPOSITORY = "chef/parade";
const READ: BoardRead = {
  lu: true,
  depot: REPOSITORY,
  luLe: "2026-11-10T10:00:00.000Z",
  cuisine: { rubriques: [] },
  faits: { rail: [{ ticket: 22, etat: "86", attente: { raison: "x", colonne: "en attente", retour: null, label: "served-elsewhere" } }, { ticket: 23, etat: "pris" }, { ticket: 24, etat: "86", attente: { raison: "attend : quota du compte épuisé", colonne: "en attente", retour: null } }], attend: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

function github(reply: (methode: string, path: string) => AnswerGitHub = () => ({ status: 200, data: {} })) {
  const requests: string[] = [];
  const client: ClientOfThePriority = {
    lire: async () => assert.fail("rien ne se lit"),
    ecrire: async (methode, path, body) => (requests.push(`${methode} ${path}${body === undefined ? "" : ` ${JSON.stringify(body)}`}`), reply(methode, path)),
  };
  return { client, demandes: requests };
}

describe("les gestes d'une carte mise de côté", () => {
  test("« Relaunch » retire `served-elsewhere` de l'issue — déjà retiré, c'est fait", async () => {
    const { client, demandes: requests } = github();
    const rendered = await playTheRefusal(READ, "relancer", 22, client);
    assert.deepEqual(requests, ["DELETE /repos/chef/parade/issues/22/labels/served-elsewhere"]);
    assert.ok("fait" in rendered && rendered.fait.includes("no longer carries `served-elsewhere`"));
    const already = github(() => ({ status: 404, data: {} }));
    already.client.lire = async () => ({ status: 200, data: { labels: [{ name: "prio:1" }] } });
    assert.ok("fait" in (await playTheRefusal(READ, "relancer", 22, already.client)));
  });

  test("« Relaunch » : un 404 sur une issue introuvable, ou qui porte encore le label, n'est pas un succès", async () => {
    for (const readEntry of [{ status: 404, data: {} }, { status: 200, data: { labels: [{ name: "served-elsewhere" }] } }]) {
      const { client } = github(() => ({ status: 404, data: {} }));
      client.lire = async () => readEntry;
      const rendered = await playTheRefusal(READ, "relancer", 22, client);
      assert.ok("refus" in rendered && rendered.refus.includes("nothing was changed"), JSON.stringify(rendered));
    }
  });

  test("« Close as already done » ferme l'issue comme terminée", async () => {
    const { client, demandes: requests } = github();
    const rendered = await playTheRefusal(READ, "clore", 22, client);
    assert.deepEqual(requests, ['PATCH /repos/chef/parade/issues/22 {"state":"closed","state_reason":"completed"}']);
    assert.deepEqual(rendered, { fait: "closed as completed on GitHub: #22 leaves the rail", detail: "https://github.com/chef/parade/issues/22" });
  });

  test("GitHub refuse : rien n'a changé, et la phrase le dit — pour l'un comme pour l'autre", async () => {
    const refuses = github(() => ({ status: 403, data: { message: "Resource not accessible by integration" } }));
    for (const [id, said] of [["relancer", "GitHub did not remove `served-elsewhere` from #22"], ["clore", "GitHub did not close #22"]] as const) {
      const rendered = await playTheRefusal(READ, id, 22, refuses.client);
      assert.ok("refus" in rendered && rendered.refus.includes(said), JSON.stringify(rendered));
    }
    const lifted = github(() => {
      throw new Error("network down");
    });
    const rendered = await playTheRefusal(READ, "clore", 22, lifted.client);
    assert.ok("refus" in rendered && rendered.detail.includes("network down"));
  });

  test("rien ne part sans lecture, sans ticket, pour un ticket qui n'est pas mis de côté, ni pour un geste inconnu", async () => {
    const { client, demandes: requests } = github();
    for (const [readOne, id, ticket] of [
      [undefined, "relancer", 22],
      [READ, "relancer", "22"],
      [READ, "clore", 23],
      [READ, "clore", 99],
      [READ, "relancer", 24],
      [READ, "supprimer", 22],
    ] as const) {
      const rendered = await playTheRefusal(readOne, id, ticket, client);
      assert.ok("refus" in rendered, `${String(id)} ${String(ticket)}`);
    }
    assert.deepEqual(requests, []);
  });
});
