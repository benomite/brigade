// Les lignes de changement d'une livraison design (#3617) : lues sous
// `## Changes`, demandées au cook, et posées par la station dans le corps de
// la PR, d'où la pass les recopie sur la carte du chef.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancheDuTicket, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { consigne, consigneDeSuite } from "../../src/claude.ts";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { avecChangements, CONSIGNE_DES_CHANGEMENTS, lignesDesChangements, lireChangements } from "../../src/validation-design/changements.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const CORPS = ["Closes #14", "", "Cooked by station `box`.", "", "## Changes", "", "- footer of the home page: 'Last served: 2 days ago' -> 'Last served: 3 hours ago'", "* top bar: 'Rail' -> 'The rail'", "", "## Notes", "- not a change"].join("\n");

test("the change lines are the bullets under `## Changes`, one per bullet, up to the next heading; no section, or no bullet, is no lines", () => {
  assert.deepEqual(lireChangements(CORPS), ["footer of the home page: 'Last served: 2 days ago' -> 'Last served: 3 hours ago'", "top bar: 'Rail' -> 'The rail'"]);
  assert.deepEqual(lireChangements("intro\r\n## changes\r\n-   card title:   'a' -> 'b'  \r\ntext that is no bullet\r\n"), ["card title: 'a' -> 'b'"]);
  assert.equal(lireChangements("Closes #14\n\n### Changes\n- a level-3 heading is not the section"), null);
  assert.equal(lireChangements("Closes #14\n\n## Changes\n\nnothing listed\n"), null);
  assert.equal(lireChangements("Closes #14"), null);
  assert.equal(lireChangements(null), null);
  assert.equal(lireChangements(undefined), null);
});

test("the card lists the lines above its captures, one per bullet; no lines, nothing", () => {
  assert.deepEqual(lignesDesChangements(["top bar: 'Rail' -> 'The rail'", "footer: 'a' -> 'b'"]), ["### Changes", "", "- top bar: 'Rail' -> 'The rail'", "- footer: 'a' -> 'b'", ""]);
  assert.deepEqual(lignesDesChangements(null), []);
});

test("the PR body takes the lines under `## Changes` at its end, replacing the section it had; none removes it; none and no section leaves it as it is", () => {
  const ouvert = "Closes #14\n\nCooked by station `box`.";
  assert.equal(avecChangements(ouvert, ["top bar: 'Rail' -> 'The rail'"]), `${ouvert}\n\n## Changes\n\n- top bar: 'Rail' -> 'The rail'`);
  const remplace = avecChangements(CORPS, ["card: 'x' -> 'y'"]);
  assert.deepEqual(lireChangements(remplace), ["card: 'x' -> 'y'"]);
  assert.ok(remplace.includes("## Notes\n- not a change"), remplace);
  assert.ok(!remplace.includes("Last served"), remplace);
  const retire = avecChangements(CORPS, null);
  assert.equal(lireChangements(retire), null);
  assert.ok(retire.startsWith(ouvert) && retire.includes("## Notes"), retire);
  assert.equal(avecChangements(`${ouvert}\n`, null), `${ouvert}\n`);
});

test("the cook's prompt asks, with the captures rule, for one bullet per visible change under `## Changes`, in the card's format", () => {
  assert.match(CONSIGNE_DES_CHANGEMENTS, /`## Changes`/);
  assert.match(CONSIGNE_DES_CHANGEMENTS, /`- <place on the screen>: '<before>' -> '<after>'`/);
  const mission = { ticket: 14, titre: "t", depot: "faux/depot", base: "main" };
  assert.ok(consigne(mission).includes(CONSIGNE_DES_CHANGEMENTS));
  assert.ok(consigneDeSuite({ ...mission, branche: "cook/14-github" }).includes(CONSIGNE_DES_CHANGEMENTS));
});

// Une station dont le cook livre, sur le dernier message `message` ; `ouverte`,
// le corps de la PR déjà ouverte qu'un renvoi a rendue au cook.
async function cuisson(t: TestContext, message: string, { ouverte, ecrireCorps }: { ouverte?: string; ecrireCorps?: Error } = {}) {
  const repertoire = mkdtempSync(join(tmpdir(), "changements-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(14);
  const corps = new Map<number, string>();
  if (ouverte !== undefined) {
    faux.prs.push({ number: 1014, issue: 14, branche: brancheDuTicket(14), sha: faux.sha(), state: "open", merged: false, enRetard: false, mergeePar: null, fichiers: [] });
    corps.set(1014, ouverte);
  }
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const client = fauxClient(faux);
  const ouvertes: string[] = [];
  const avertis: string[] = [];
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github: {
      ...client,
      ouvrirPR: async (pr) => {
        ouvertes.push(pr.corps);
        return client.ouvrirPR(pr);
      },
      issue: async (numero) => (corps.has(numero) ? { number: numero, title: "PR", labels: [], state: "open", createdAt: "", updatedAt: "", url: "", body: corps.get(numero) ?? "" } : client.issue(numero)),
      ecrireCorps: async (numero, texte) => {
        if (ecrireCorps !== undefined) throw ecrireCorps;
        corps.set(numero, texte);
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
  return { faux, ouvertes, corps, avertis };
}

const LIVRAISON = "Done.\n<livrable>Delivered.</livrable>\n\n## Changes\n- footer of the home page: 'Last served: 2 days ago' -> 'Last served: 3 hours ago'\n";

test("through the station: the change lines of the cook's last message go in the body of the PR it opens; a cook that writes none opens it as before", async (t) => {
  const { faux, ouvertes } = await cuisson(t, LIVRAISON);
  assert.equal(ouvertes.length, 1);
  assert.ok(ouvertes[0]?.startsWith("Closes #14\n\nCooked by station `box`."), String(ouvertes[0]));
  assert.deepEqual(lireChangements(ouvertes[0]), ["footer of the home page: 'Last served: 2 days ago' -> 'Last served: 3 hours ago'"]);
  assert.equal(faux.ticket(14).labels.has(LABEL_IN_PASS), true);

  const sans = await cuisson(t, "Done.\n<livrable>Delivered.</livrable>");
  assert.deepEqual(sans.ouvertes, ["Closes #14\n\nCooked by station `box`."]);
});

test("through the station: a new delivery on the PR still open replaces its change lines, or removes them when the cook wrote none; a body GitHub refuses to write is said, and the delivery still goes to the pass", async (t) => {
  const avant = "Closes #14\n\nCooked by station `box`.\n\n## Changes\n\n- top bar: 'Rail' -> 'The rail'";
  const remplace = await cuisson(t, LIVRAISON, { ouverte: avant });
  assert.deepEqual(remplace.ouvertes, []);
  assert.deepEqual(lireChangements(remplace.corps.get(1014)), ["footer of the home page: 'Last served: 2 days ago' -> 'Last served: 3 hours ago'"]);

  const retire = await cuisson(t, "Done.\n<livrable>Delivered.</livrable>", { ouverte: avant });
  assert.equal(retire.corps.get(1014), "Closes #14\n\nCooked by station `box`.");

  const refuse = await cuisson(t, LIVRAISON, { ouverte: avant, ecrireCorps: new Error("gh api : HTTP 502") });
  assert.equal(refuse.faux.ticket(14).labels.has(LABEL_IN_PASS), true);
  assert.ok(refuse.avertis.some((ligne) => /change lines could not be written in the body of PR #1014: gh api : HTTP 502/.test(ligne)), refuse.avertis.join("\n"));
});
