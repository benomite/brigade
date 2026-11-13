// L'API Git de GitHub que l'annulation d'un ticket servi demande (#3274), sur
// le vrai client, contre un faux `gh` : ce qui part, et ce que chaque réponse
// — un refus compris — rend.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirGitHub } from "../../src/github.ts";
import { DEPOT, fauxGh } from "../outils.ts";

function client(t: TestContext) {
  const gh = fauxGh(t);
  return { gh, github: ouvrirGitHub({ depot: DEPOT, bin: gh.bin }) };
}

test("un commit se lit avec son arbre et ses parents dans leur ordre ; inconnu de GitHub, il est nul ; illisible, la lecture lève", async (t) => {
  const { gh, github } = client(t);
  gh.repondre(`repos/${DEPOT}/git/commits/abc`, { corps: { sha: "abc", tree: { sha: "arbre" }, parents: [{ sha: "p1" }, { sha: "p2" }] } });
  assert.deepEqual(await github.commitGit("abc"), { arbre: "arbre", parents: ["p1", "p2"] });

  gh.repondre(`repos/${DEPOT}/git/commits/def`, { statut: 404, corps: { message: "Not Found" } });
  assert.equal(await github.commitGit("def"), null);

  gh.repondre(`repos/${DEPOT}/git/commits/ghi`, { corps: { sha: "ghi" } });
  await assert.rejects(github.commitGit("ghi"), /commit illisible/);
});

test("un commit se crée sur son arbre, fils de ses parents, et rend son sha", async (t) => {
  const { gh, github } = client(t);
  const chemin = `repos/${DEPOT}/git/commits`;
  gh.repondre(chemin, { statut: 201, corps: { sha: "neuf" } });

  assert.equal(await github.creerCommit({ message: "Revert", arbre: "arbre", parents: ["merge"] }), "neuf");
  assert.deepEqual(gh.appels(), [["api", "-i", "-X", "POST", "-f", "message=Revert", "-f", "tree=arbre", "-f", "parents[]=merge", chemin]]);
});

test("une fusion chez GitHub rend son commit ; en conflit (409), elle le dit sans lever ; tout autre refus lève", async (t) => {
  const { gh, github } = client(t);
  const chemin = `repos/${DEPOT}/merges`;
  gh.repondre(chemin, { statut: 201, corps: { sha: "fusion" } });
  assert.deepEqual(await github.fusionnerDansLaBranche("undo/21", "revert", "Undo #21"), { sha: "fusion" });
  assert.deepEqual(gh.appels(), [["api", "-i", "-X", "POST", "-f", "base=undo/21", "-f", "head=revert", "-f", "commit_message=Undo #21", chemin]]);

  gh.repondre(chemin, { statut: 409, corps: { message: "Merge conflict" } });
  assert.deepEqual(await github.fusionnerDansLaBranche("undo/21", "revert", "Undo #21"), { conflit: true });

  gh.repondre(chemin, { statut: 404, corps: { message: "Base does not exist" } });
  await assert.rejects(github.fusionnerDansLaBranche("undo/21", "revert", "Undo #21"), /HTTP 404/);
});

test("une branche se crée sur un commit, se supprime — absente, sans erreur — et une issue se rouvre", async (t) => {
  const { gh, github } = client(t);
  gh.repondre(`repos/${DEPOT}/git/refs`, { statut: 201, corps: { ref: "refs/heads/undo/21" } });
  await github.creerBranche("undo/21", "tete");

  const ref = `repos/${DEPOT}/git/refs/heads/undo/21`;
  gh.repondre(ref, { statut: 204, corps: {} });
  await github.supprimerBranche("undo/21");
  gh.repondre(ref, { statut: 422, corps: { message: "Reference does not exist" } });
  await github.supprimerBranche("undo/21");
  gh.repondre(ref, { statut: 403, corps: { message: "Forbidden" } });
  await assert.rejects(github.supprimerBranche("undo/21"), /HTTP 403/);

  gh.repondre(`repos/${DEPOT}/issues/21`, { corps: { number: 21, state: "open" } });
  await github.rouvrirIssue(21);

  assert.deepEqual(gh.appels(), [
    ["api", "-i", "-X", "POST", "-f", "ref=refs/heads/undo/21", "-f", "sha=tete", `repos/${DEPOT}/git/refs`],
    ["api", "-i", "-X", "DELETE", ref],
    ["api", "-i", "-X", "DELETE", ref],
    ["api", "-i", "-X", "DELETE", ref],
    ["api", "-i", "-X", "PATCH", "-f", "state=open", `repos/${DEPOT}/issues/21`],
  ]);
});

test("la PR qui a fermé une issue porte le commit que son merge a posé sur la base ; sans lui, elle n'en porte pas", async (t) => {
  const { gh, github } = client(t);
  gh.repondre(`repos/${DEPOT}/issues/21/events?per_page=100`, { corps: [{ event: "closed", commit_id: "fermeture" }] });
  gh.repondre(`repos/${DEPOT}/commits/fermeture/pulls`, { corps: [{ number: 121, merged_at: "2026-11-12T10:00:00Z" }] });
  const fiche = { number: 121, html_url: `https://github.com/${DEPOT}/pull/121`, state: "closed", merged: true, base: { ref: "main" }, head: { sha: "tete" }, merged_by: { login: "box" } };
  gh.repondre(`repos/${DEPOT}/pulls/121`, { corps: { ...fiche, merge_commit_sha: "merge" } });
  assert.equal((await github.prQuiFerme(21))?.commitDeMerge, "merge");

  const { gh: gh2, github: sans } = client(t);
  gh2.repondre(`repos/${DEPOT}/issues/21/events?per_page=100`, { corps: [{ event: "closed", commit_id: "fermeture" }] });
  gh2.repondre(`repos/${DEPOT}/commits/fermeture/pulls`, { corps: [{ number: 121, merged_at: "2026-11-12T10:00:00Z" }] });
  gh2.repondre(`repos/${DEPOT}/pulls/121`, { corps: { ...fiche, merge_commit_sha: null } });
  const lue = await sans.prQuiFerme(21);
  assert.equal(lue?.number, 121);
  assert.equal(lue !== null && "commitDeMerge" in lue, false);
});
