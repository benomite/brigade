// Ce qu'un geste du chef coûte en appels GitHub est borné, et la borne est dite
// à côté du code (`PLAFOND_D_UN_GESTE_DU_RAIL`, #3682) : un bouton de la fiche
// n'en fait jamais plus, et l'appel de trop est refusé sans partir.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { entrerDansTodo, type Proposition } from "../../src/carte-todo.ts";
import { ouvrirGitHubDuGeste, PLAFOND_D_UN_GESTE_DU_RAIL } from "../../src/gestes/github-du-geste.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as montrerRail } from "../../src/montrer-rail.ts";
import { aArreter, appeler, DEPOT, fauxGh, issueGitHub, repertoireTemporaire } from "../outils.ts";

const CARTE: Proposition = {
  type: "product",
  raison: "product-choice",
  resume: "The ticket adds an export. Its format decides what the user downloads.",
  enonce: "Export CSV ou export JSON ?",
  choix: [{ texte: "L'export CSV." }, { texte: "L'export JSON." }, { texte: "Garder la livraison telle quelle.", suite: "merge" }],
};

// Le ticket 18 sur le rail, le 30 dans TODO avec sa carte ; GitHub répond à tout ce qu'un geste du rail peut demander.
function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  aArreter(t, () => journal.fermer());
  for (const ticket of [18, 30]) {
    journal.ajouter({ project: "brigade", ticket, author: "github", type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: 1, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}` } });
  }
  entrerDansTodo(journal, "brigade", 30, CARTE, "manager");
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}/issues/*`, { corps: issueGitHub(30) });
  gh.repondre(`repos/${DEPOT}/issues/30/comments`, { statut: 201, corps: {} });
  gh.repondre(`repos/${DEPOT}/issues/18/labels/fire`, { corps: [] });
  const jouer = async (args: string[]) => {
    const cli = appeler(montrerRail, args, { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
    assert.equal(await cli.fin, 0, cli.sortie());
  };
  return { gh, jouer };
}

for (const geste of [["remove", "18"], ["choose", "30", "1"], ["answer", "30", "Un", "export", "Excel."]]) {
  test(`\`rail ${geste[0]}\`, un bouton de la fiche, fait au plus ${PLAFOND_D_UN_GESTE_DU_RAIL} appels GitHub`, async (t) => {
    const { gh, jouer } = cuisine(t);

    await jouer(geste);

    assert.ok(gh.appels().length >= 1);
    assert.ok(gh.appels().length <= PLAFOND_D_UN_GESTE_DU_RAIL, gh.appels().map((args) => args.join(" ")).join("\n"));
  });
}

test("un geste qui demanderait un appel de plus que son plafond le voit refusé, sans qu'il parte", async (t) => {
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}/issues/*`, { corps: issueGitHub(1) });
  const github = ouvrirGitHubDuGeste({ depot: DEPOT, bin: gh.bin, env: {}, plafond: 2 });
  aArreter(t, () => github.fermer());

  await github.issue(1);
  await github.issue(2);
  await assert.rejects(github.issue(3), /this gesture has made its 2 GitHub calls, the most it may make — nothing more is sent/);

  assert.equal(gh.appels().length, 2);
});
