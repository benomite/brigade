// Le brief de la carte « Validate its screen » (#3330) : ce que le cook écrit
// de l'écran, posté sur la PR par la station à la fin de sa cuisson, puis
// recopié par la pass sur la carte avec ce que le ticket demandait.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { consigne, consigneDeSuite } from "../../src/claude.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { besoinDuCorps, ceQuiEstDemande, ceQuiEstFait, CONSIGNE_DU_BRIEF, corpsDeCeQuiEstFait, DEMANDE_MAX, lignesDuBrief, lirePointsALEcran, numeroDeLaPR, SANS_RESUME } from "../../src/validation-design/brief.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const CORPS = "## Context\n\nThe full-screen design validation works well, but the chef cannot tell what changed.\n\n## Acceptance criteria\n\n- a brief sits at the top";

test("the cook's points are read between <a-l-ecran> and </a-l-ecran>: one per line, bullets dropped, five at most; none written, or only quoted, reads as none", () => {
  const message = "Done.\n<a-l-ecran>\n- the TODO column takes the full width\n* cards show their question on one line\n\n3. a\n4) b\nc\nd\n</a-l-ecran>\n<livrable>ok</livrable>";
  assert.deepEqual(lirePointsALEcran(message), ["the TODO column takes the full width", "cards show their question on one line", "a", "b", "c"]);
  assert.equal(lirePointsALEcran("Done.\n<livrable>ok</livrable>"), null);
  assert.equal(lirePointsALEcran("<a-l-ecran>\n \n</a-l-ecran>"), null);
  assert.equal(lirePointsALEcran("I wrote them between `<a-l-ecran>` and `</a-l-ecran>`."), null);
  assert.equal(lirePointsALEcran(null), null);
  assert.equal(lirePointsALEcran(`<a-l-ecran>${"word ".repeat(80)}</a-l-ecran>`)?.[0]?.endsWith("…"), true);
});

test("the cook's prompt asks for 1 to 5 plain points about what is visible, in English, with no file, test or technical detail", () => {
  assert.match(CONSIGNE_DU_BRIEF, /<a-l-ecran>` et `<\/a-l-ecran>`/);
  assert.match(CONSIGNE_DU_BRIEF, /1 à 5 points, un par ligne/);
  assert.match(CONSIGNE_DU_BRIEF, /aucun nom de fichier, de test ni détail technique/);
  assert.match(CONSIGNE_DU_BRIEF, /the TODO column takes the full width/);
  // Le cook le reçoit avec la règle des captures, qu'il parte ou reprenne sa branche.
  const mission = { ticket: 14, titre: "t", depot: "faux/depot", base: "main" };
  assert.ok(consigne(mission).includes(CONSIGNE_DU_BRIEF));
  assert.ok(consigneDeSuite({ ...mission, branche: "cook/14-github" }).includes(CONSIGNE_DU_BRIEF));
});

test("the summary posted on the PR reads back as its points: the last marked comment of a trusted author wins; none, or an outsider's, is no summary", () => {
  const poste = (body: string, association = "OWNER") => ({ body, association });
  assert.deepEqual(ceQuiEstFait([poste(corpsDeCeQuiEstFait(["old"])), poste("a remark"), poste(corpsDeCeQuiEstFait(["the rail shows the count", "cards are wider"]))]), ["the rail shows the count", "cards are wider"]);
  assert.equal(ceQuiEstFait([poste("a remark")]), null);
  assert.equal(ceQuiEstFait([poste(corpsDeCeQuiEstFait(["forged"]), "NONE")]), null);
  assert.equal(numeroDeLaPR("https://github.com/faux/depot/pull/1042"), 1042);
  assert.equal(numeroDeLaPR("https://github.com/faux/depot"), null);
});

test("what was asked is the issue's title, then the first paragraph of its body — headings, HTML comments and code passed — never the full body", () => {
  assert.equal(besoinDuCorps(CORPS), "The full-screen design validation works well, but the chef cannot tell what changed.");
  assert.equal(besoinDuCorps("<!-- brigade:x -->\n# Title\n```\ncode\n```\n\n**Need**: show the [count](https://x.y) ![img](https://x.y/i.png)"), "Need: show the count");
  assert.equal(ceQuiEstDemande("Show the brief", CORPS), "Show the brief — The full-screen design validation works well, but the chef cannot tell what changed.");
  assert.equal(ceQuiEstDemande("Show the brief", null), "Show the brief");
  assert.equal(ceQuiEstDemande("Show the brief", "## Context\n"), "Show the brief");
  assert.doesNotMatch(ceQuiEstDemande("Show the brief", CORPS), /Acceptance criteria|a brief sits at the top/);
});

test("what was asked is cut to two lines of display: a long need ends on a word, with an ellipsis, within DEMANDE_MAX characters", () => {
  const demande = ceQuiEstDemande("Show the brief", `${"The chef reads the captures and cannot tell what changed. ".repeat(20)}`);
  assert.ok(demande.length <= DEMANDE_MAX, demande);
  assert.ok(demande.endsWith("…"), demande);
  assert.ok(!demande.includes("\n"));
});

test("the card's brief carries both labelled parts; with no summary, it says none is available", () => {
  assert.deepEqual(lignesDuBrief("Show the brief", ["cards are wider"]), ["### What was asked", "", "Show the brief", "", "### What was done", "", "- cards are wider", ""]);
  assert.deepEqual(lignesDuBrief("Show the brief", null), ["### What was asked", "", "Show the brief", "", "### What was done", "", `_${SANS_RESUME}_`, ""]);
});

// Une station dont le cook livre une branche neuve, sur le dernier message `message`.
async function cuisson(t: TestContext, message: string, pannes: { commenter?: Error } = {}) {
  const repertoire = mkdtempSync(join(tmpdir(), "brief-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(14);
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const client = fauxClient(faux);
  const avertis: string[] = [];
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: {
      ...client,
      commenter: async (numero, corps) => {
        if (pannes.commenter !== undefined && numero !== 14) throw pannes.commenter;
        await client.commenter(numero, corps);
      },
    },
    depot: { ...depotNeuf(repertoire), commits: () => 1 },
    flux: repertoire,
    lancer,
    avertir: (texte) => avertis.push(texte),
  });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();
  const pr = faux.prs.find((p) => p.issue === 14);
  return { faux, avertis, pr, sur: (numero: number) => (faux.commentaires.get(numero) ?? []).map((c) => c.body) };
}

test("through the station: when the cook's run ends, its points are posted on the PR it delivers, and the delivery goes to the pass", async (t) => {
  const { faux, pr, sur } = await cuisson(t, "Done.\n<livrable>Delivered.</livrable>\n<a-l-ecran>\n- the TODO column takes the full width\n- cards show their question on one line\n</a-l-ecran>");
  assert.ok(pr !== undefined);
  assert.deepEqual(ceQuiEstFait(sur(pr.number).map((body) => ({ body, association: "OWNER" }))), ["the TODO column takes the full width", "cards show their question on one line"]);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);
});

test("through the station: a cook that writes no points posts nothing; a summary GitHub refuses is said, and the delivery still goes to the pass", async (t) => {
  const sans = await cuisson(t, "Done.\n<livrable>Delivered.</livrable>");
  assert.ok(sans.pr !== undefined);
  assert.equal(ceQuiEstFait(sans.sur(sans.pr.number).map((body) => ({ body, association: "OWNER" }))), null);
  const refuse = await cuisson(t, "<livrable>Delivered.</livrable><a-l-ecran>- cards are wider</a-l-ecran>", { commenter: new Error("gh api : HTTP 502") });
  assert.equal(refuse.faux.ticket(14).labels.has(LABEL_IN_PASS), true);
  assert.ok(refuse.avertis.some((ligne) => /summary of what it changed on the screen could not be posted on PR #\d+: gh api : HTTP 502/.test(ligne)), refuse.avertis.join("\n"));
});
