// L'accès des apps à l'API de GitHub (app/src/board/client.ts) et le jeton du desktop (app/src/board/token-gh.ts) :
// la demande composée avec le jeton quand il y en a un, et sans quand il n'y en a pas — le `fetch` et le `gh` sont des
// doublures, rien ne sort sur le réseau.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { API_GITHUB, clientGitHub, parFetch, type Send } from "../../src/board/client.ts";
import { tokenOfGh } from "../../src/board/token-gh.ts";

// Un envoi qui retient chaque demande et rend une liste vide.
function sending(): { envoyer: Send; demandes: Array<{ adresse: string; entetes: Record<string, string> }> } {
  const requests: Array<{ adresse: string; entetes: Record<string, string> }> = [];
  return {
    demandes: requests,
    envoyer: async (address, headers) => {
      requests.push({ adresse: address, entetes: headers });
      return { status: 200, data: [] };
    },
  };
}

test("la demande part vers l'API de GitHub, avec le jeton de l'app quand elle en a un", async () => {
  const { envoyer: send, demandes: requests } = sending();
  const answer = await clientGitHub({ jeton: async () => "gho_secret", envoyer: send })("/repos/chef/parade/issues?labels=kitchen-board");
  assert.deepEqual(answer, { status: 200, data: [] });
  assert.equal(requests[0]?.adresse, `${API_GITHUB}/repos/chef/parade/issues?labels=kitchen-board`);
  assert.equal(requests[0]?.entetes.Authorization, "Bearer gho_secret");
  assert.equal(requests[0]?.entetes.Accept, "application/vnd.github+json");
});

test("sans jeton, ou quand il ne se lit pas, la demande part sans : GitHub dit ce qu'il en refuse", async () => {
  const { envoyer: send, demandes: requests } = sending();
  await clientGitHub({ jeton: async () => null, envoyer: send })("/repos/chef/parade/issues");
  await clientGitHub({ jeton: () => Promise.reject(new Error("the vault is locked")), envoyer: send })("/repos/chef/parade/issues");
  assert.equal(requests.length, 2);
  for (const { entetes: headers } of requests) assert.equal(headers.Authorization, undefined);
});

test("par `fetch`, la réponse rend son code et son corps — en JSON quand il en est, en texte sinon", async () => {
  const calls: Array<{ adresse: string; init: RequestInit | undefined }> = [];
  const fake = (body: string, status: number): typeof fetch =>
    (async (address: string | URL | Request, init?: RequestInit) => {
      calls.push({ adresse: String(address), init });
      return new Response(body, { status });
    }) as typeof fetch;
  assert.deepEqual(await parFetch({ fetch: fake('[{"number":7}]', 200) })(`${API_GITHUB}/x`, { Accept: "a" }), { status: 200, data: [{ number: 7 }] });
  assert.deepEqual(await parFetch({ fetch: fake("<html>Bad gateway</html>", 502) })(`${API_GITHUB}/x`, {}), { status: 502, data: "<html>Bad gateway</html>" });
  assert.equal(calls[0]?.adresse, `${API_GITHUB}/x`);
  assert.deepEqual(calls[0]?.init?.headers, { Accept: "a" });
});

test("par `fetch`, une demande sans réponse est abandonnée passé le délai, et le dit", async () => {
  // Un GitHub qui ne répond jamais : seule l'abandon de la demande le fait rendre la main.
  const silent = ((_address: string | URL | Request, init?: RequestInit) =>
    new Promise((_resolve, rejeter) => init?.signal?.addEventListener("abort", () => rejeter(new Error("aborted"))))) as typeof fetch;
  await assert.rejects(parFetch({ fetch: silent, delaiMs: 20 })(`${API_GITHUB}/x`, {}), /GitHub gave no answer within 0 s/);
  const enOutage = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  await assert.rejects(parFetch({ fetch: enOutage })(`${API_GITHUB}/x`, {}), /fetch failed/);
});

// Un `gh` de test : un script qui écrit ce qu'on lui donne et sort avec ce code.
function fake(t: TestContext, output: string, code: number): string {
  const folder = mkdtempSync(join(tmpdir(), "brigade-app-jeton-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const gh = join(folder, "gh");
  writeFileSync(gh, `#!/bin/sh\n[ "$1 $2" = "auth token" ] || exit 9\nprintf '%s' '${output}'\nexit ${code}\n`);
  chmodSync(gh, 0o755);
  return gh;
}
const WITHOUT_SH = process.platform === "win32" ? "le faux `gh` est un script sh, que Windows ne lance pas" : false;

test("le jeton du desktop est celui que `gh auth token` dit", { skip: WITHOUT_SH }, async (t) => {
  assert.equal(await tokenOfGh({ gh: fake(t, "gho_abc123\n", 0), delaiMs: 60_000 })(), "gho_abc123");
});

test("`gh` sans compte, ou absent : pas de jeton, et la lecture partira sans", { skip: WITHOUT_SH }, async (t) => {
  assert.equal(await tokenOfGh({ gh: fake(t, "no oauth token found for github.com", 1), delaiMs: 60_000 })(), null);
  assert.equal(await tokenOfGh({ gh: join(tmpdir(), "brigade-pas-de-gh-ici"), delaiMs: 60_000 })(), null);
});
