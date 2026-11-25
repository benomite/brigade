// La liste des tickets qui attendent un cook humain (#4276) : `npm run human-cooks` la lit sur GitHub — les issues
// ouvertes marquées `human-cook`, chacune avec son assignee —, et dit l'adresse de la même liste sur GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { principal } from "../../src/cook-humain/commande.ts";
import { adresseDeLaListe, direLaListe } from "../../src/cook-humain/liste.ts";
import { ouvrirGitHub } from "../../src/github.ts";
import { appeler, DEPOT, fauxGh, issueGitHub, repertoireTemporaire } from "../outils.ts";

const ADRESSE = "https://github.com/acme/brigade/issues?q=is%3Aissue%20is%3Aopen%20label%3Ahuman-cook";
const CHEMIN = `repos/${DEPOT}/issues?state=open&labels=human-cook&per_page=100`;

test("the list says one line per ticket and who holds it, then its address on GitHub", () => {
  assert.equal(adresseDeLaListe(DEPOT), ADRESSE);
  assert.equal(direLaListe([{ ticket: 10, assignee: "alice" }, { ticket: 12, assignee: "" }], DEPOT), `#10  alice\n#12  (no one assigned yet)\n${ADRESSE}`);
  assert.equal(direLaListe([], DEPOT), `no ticket waits on a human cook\n${ADRESSE}`);
});

test("human-cooks reads the open issues marked human-cook on GitHub, pull requests left out, with their assignees", async (t) => {
  const gh = fauxGh(t);
  gh.repondre(CHEMIN, {
    corps: [
      { ...issueGitHub(12, { labels: ["fire", "human-cook"] }), assignees: [{ login: "bob" }] },
      { ...issueGitHub(10, { labels: ["human-cook"] }), assignees: [{ login: "alice" }, { login: "carol" }] },
      { ...issueGitHub(11, { labels: ["human-cook"], pull_request: {} }), assignees: [] },
      { ...issueGitHub(13, { labels: ["human-cook"] }), assignees: null },
    ],
  });
  const env = { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin, BRIGADE_STATE_DIR: repertoireTemporaire(t) };

  const lu = appeler(principal, [], env);

  assert.equal(await lu.fin, 0, lu.sortie());
  assert.equal(lu.sortie(), `#10  alice\n#10  carol\n#12  bob\n#13  (no one assigned yet)\n${ADRESSE}\n`);
});

test("human-cooks says when GitHub cannot be read, and refuses an argument", async (t) => {
  const gh = fauxGh(t);
  const env = { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin, BRIGADE_STATE_DIR: repertoireTemporaire(t) };

  const illisible = appeler(principal, [], env);
  assert.equal(await illisible.fin, 1);
  assert.match(illisible.sortie(), /^brigade: the tickets waiting on a human cook are not read on GitHub — /);

  const deTrop = appeler(principal, ["all"], env);
  assert.equal(await deTrop.fin, 2);
  assert.match(deTrop.sortie(), /“all” is not a human-cooks command/);
  const sansDepot = appeler(principal, [], { BRIGADE_GH_BIN: gh.bin });
  assert.equal(await sansDepot.fin, 2);
});

test("a ticket marked again for someone else loses its previous assignee on GitHub", async (t) => {
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}/issues/23/assignees`, { corps: {} });
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin });
  t.after(() => github.fermer());

  await github.desassigner(23, ["alice"]);

  assert.deepEqual(gh.appels().at(-1)?.slice(-5), ["-X", "DELETE", "-f", "assignees[]=alice", `repos/${DEPOT}/issues/23/assignees`]);
});
