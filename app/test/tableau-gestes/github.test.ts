// Les gestes du tableau sur l'API REST de GitHub (app/src/tableau-gestes/github.ts, #1590) : le commentaire posté sur
// l'issue du tableau avec les en-têtes et le jeton de la lecture, le `POST` du desktop par `fetch`, et le geste posté. GitHub est une
// doublure : aucun réseau.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReponseGitHub } from "../../src/tableau/client.ts";
import { gestesDuTableau, type ClientDesGestes, type DecisionDuChef } from "../../src/tableau-gestes/gestes.ts";
import { clientDesGestesGitHub, posterParFetch, type Poste } from "../../src/tableau-gestes/github.ts";
import { CORPS } from "../tableau/fixture.ts";

type Poste_ = { adresse: string; entetes: Record<string, string>; corps: unknown };
function github(reponse: ReponseGitHub | Error, lecture: ReponseGitHub = { status: 200, data: { body: CORPS } }) {
  const postes: Poste_[] = [];
  const lus: string[] = [];
  const poster: Poste = async (adresse, entetes, corps) => {
    postes.push({ adresse, entetes, corps });
    if (reponse instanceof Error) throw reponse;
    return reponse;
  };
  const client = clientDesGestesGitHub({ jeton: async () => "gho_du_poste", poster, appeler: async (chemin) => (lus.push(chemin), lecture) });
  return { client, postes, lus };
}
const envoyer = (decision: DecisionDuChef, client: ClientDesGestes) => gestesDuTableau({ depot: "chef/parade", tableau: 7, client }).envoyer(decision);

test("une décision part en commentaire sur l'issue du tableau, avec le jeton et les en-têtes de la lecture", async () => {
  const { client, postes } = github({ status: 201, data: { id: 4242, html_url: "https://github.com/chef/parade/issues/7#issuecomment-4242" } });
  const etat = await envoyer({ geste: "send-back", ticket: 18, raison: "the header row is missing" }, client);
  assert.deepEqual(etat, { etat: "pending", commentaire: { id: 4242, url: "https://github.com/chef/parade/issues/7#issuecomment-4242" } });
  assert.equal(postes.length, 1);
  assert.equal(postes[0]?.adresse, "https://api.github.com/repos/chef/parade/issues/7/comments");
  assert.deepEqual(postes[0]?.corps, { body: "/brigade send-back #18 the header row is missing" });
  assert.equal(postes[0]?.entetes.Authorization, "Bearer gho_du_poste");
  assert.equal(postes[0]?.entetes["Content-Type"], "application/json");
  assert.equal(postes[0]?.entetes.Accept, "application/vnd.github+json");
});

test("GitHub qui refuse, ou qui ne répond pas : un échec en une phrase, et ce qu'il a dit", async () => {
  const sansDroit = await envoyer({ geste: "merge", ticket: 18 }, github({ status: 403, data: { message: "Resource not accessible by integration. See the docs." } }).client);
  assert.deepEqual(sansDroit, { etat: "failed", raison: "The gesture could not be posted on the Kitchen board of chef/parade: GitHub refused the comment (HTTP 403): Resource not accessible by integration." });
  const deconnecte = await envoyer({ geste: "merge", ticket: 18 }, github({ status: 401, data: { message: "Bad credentials" } }).client);
  assert.match(deconnecte.etat === "failed" ? deconnecte.raison : "", /GitHub refused the app's GitHub sign-in \(HTTP 401\): Bad credentials — sign in to GitHub again\.$/);
  const muet = await envoyer({ geste: "merge", ticket: 18 }, github(new Error("getaddrinfo ENOTFOUND api.github.com")).client);
  assert.deepEqual(muet, { etat: "failed", raison: "The gesture could not be posted on the Kitchen board of chef/parade: getaddrinfo ENOTFOUND api.github.com." });
  const sansId = await envoyer({ geste: "merge", ticket: 18 }, github({ status: 201, data: "created" }).client);
  assert.match(sansId.etat === "failed" ? sansId.raison : "", /GitHub's answer does not name the comment it wrote/);
});

test("les gestes que le bloc du tableau porte se relisent par un GET de son issue", async () => {
  const { client, lus } = github({ status: 201, data: { id: 1 } });
  assert.deepEqual(await client.gestesDuTableau("chef/parade", 7), []);
  assert.deepEqual(lus, ["/repos/chef/parade/issues/7"]);
  await assert.rejects(github({ status: 201, data: {} }, { status: 404, data: { message: "Not Found" } }).client.gestesDuTableau("chef/parade", 7), /GitHub refused the reading of the Kitchen board \(HTTP 404\): Not Found/);
});

test("le POST du desktop : `fetch`, son corps en JSON ; abandonné quand GitHub ne répond pas", async () => {
  const appels: Array<{ adresse: string; init: RequestInit | undefined }> = [];
  const poster = posterParFetch({
    fetch: (async (adresse: string, init?: RequestInit) => {
      appels.push({ adresse, init });
      return new Response(JSON.stringify({ id: 7 }), { status: 201 });
    }) as typeof fetch,
  });
  assert.deepEqual(await poster("https://api.github.com/x", { Accept: "a" }, { body: "/brigade merge #18" }), { status: 201, data: { id: 7 } });
  assert.equal(appels[0]?.init?.method, "POST");
  assert.equal(appels[0]?.init?.body, '{"body":"/brigade merge #18"}');
  const lent = posterParFetch({
    delaiMs: 20,
    fetch: ((_adresse: string, init?: RequestInit) => new Promise((_, rejeter) => init?.signal?.addEventListener("abort", () => rejeter(new Error("aborted"))))) as typeof fetch,
  });
  await assert.rejects(lent("https://api.github.com/x", {}, {}), /GitHub gave no answer within 0 s/);
});
