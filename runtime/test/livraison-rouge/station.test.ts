// La livraison qui a rendu la base rouge est nommée par le tour de la station
// (#3817), depuis `stationDuDepot` : une fois, sur le ticket de la PR mergée ;
// une lecture qui échoue est dite et le tour suivant réessaie.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot } from "../../src/brigade-github.ts";
import type { GitHub } from "../../src/github.ts";
import { depotNeuf, FauxGitHub, fauxClient, STATION_DU_DEPOT } from "../faux-github.ts";
import { jusqua } from "../outils.ts";

const MERGE = "c".repeat(40);
const RUN = "https://ci.example/builds/7";

function stationRouge(t: TestContext, { pannes = 0 } = {}) {
  const repertoire = mkdtempSync(join(tmpdir(), "livraison-rouge-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.teteDeLaBase = MERGE;
  let restantes = pannes;
  const github: GitHub = {
    ...fauxClient(faux),
    ci: async (sha: string) => (sha === "main" || sha === MERGE ? [{ name: "tests", outcome: "red", conclusion: "failure", url: RUN }] : [{ name: "tests", outcome: "green", conclusion: "success", url: null }]) as never,
    commitGit: async () => ({ arbre: "t", parents: ["a".repeat(40)] }),
    lireGraphql: async (requete: string, variables: Record<string, string | number>) => {
      if (requete.includes("associatedPullRequests")) {
        if (restantes > 0) {
          restantes -= 1;
          throw new Error("gh api graphql : HTTP 502");
        }
        return { repository: { object: { associatedPullRequests: { nodes: [{ number: 42, merged: true, mergeCommit: { oid: variables.sha } }] } } } };
      }
      if (requete.includes("closingIssuesReferences")) return { repository: { pullRequest: { headRefName: "cook/57-github", body: "Closes #57", closingIssuesReferences: { nodes: [{ number: 57 }] } } } };
      // L'instantané du tour : sans GraphQL, le tour lit en REST.
      throw new Error("not served by this fake");
    },
  };
  const avertis: string[] = [];
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github, depot: depotNeuf(repertoire), flux: repertoire, avertir: (texte) => void avertis.push(texte) });
  if ("refus" in station) throw new Error(station.refus);
  const nommes = () => (faux.commentaires.get(57) ?? []).filter((c) => c.body.includes("brigade:livraison-rouge"));
  return { faux, station, avertis, nommes };
}

test("a station's turn on a red base names the merged PR, its merge commit and the failing check run on its ticket, once over several turns", async (t) => {
  const { faux, station, nommes } = stationRouge(t);
  for (let i = 0; i < 3; i += 1) {
    await station.tour();
    await station.calme();
    await jusqua(() => nommes().length > 0);
  }
  assert.equal(nommes().length, 1);
  const [nomme] = nommes();
  assert.match(nomme?.body ?? "", /PR #42\b/);
  assert.ok(nomme?.body.includes(MERGE));
  assert.ok(nomme?.body.includes(`\`tests\`: ${RUN}`));
  assert.deepEqual([...faux.commentaires.keys()].filter((numero) => (faux.commentaires.get(numero) ?? []).some((c) => c.body.includes("brigade:livraison-rouge"))), [57]);
});

test("a GitHub read that fails while naming the delivery is said once, stops nothing, and the next turn names it", async (t) => {
  const { station, avertis, nommes } = stationRouge(t, { pannes: 2 });
  const dits = () => avertis.filter((texte) => texte.includes("could not be named"));
  await station.tour();
  await station.calme();
  await jusqua(() => dits().length > 0);
  await station.tour();
  await station.calme();
  assert.equal(nommes().length, 0);
  assert.deepEqual(dits(), ["brigade : main is red, but the delivery that turned it red could not be named on its ticket — gh api graphql : HTTP 502; retried next turn"]);
  await station.tour();
  await station.calme();
  await jusqua(() => nommes().length > 0);
  assert.equal(nommes().length, 1);
});
