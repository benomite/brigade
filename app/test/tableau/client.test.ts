// L'accès des apps à l'API de GitHub (app/src/tableau/client.ts) et le jeton du desktop (app/src/tableau/jeton-gh.ts) :
// la demande composée avec le jeton quand il y en a un, et sans quand il n'y en a pas — le `fetch` et le `gh` sont des
// doublures, rien ne sort sur le réseau.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { API_GITHUB, clientGitHub, parFetch, type Envoi } from "../../src/tableau/client.ts";
import { jetonDeGh } from "../../src/tableau/jeton-gh.ts";

// Un envoi qui retient chaque demande et rend une liste vide.
function envoi(): { envoyer: Envoi; demandes: Array<{ adresse: string; entetes: Record<string, string> }> } {
  const demandes: Array<{ adresse: string; entetes: Record<string, string> }> = [];
  return {
    demandes,
    envoyer: async (adresse, entetes) => {
      demandes.push({ adresse, entetes });
      return { status: 200, data: [] };
    },
  };
}

test("la demande part vers l'API de GitHub, avec le jeton de l'app quand elle en a un", async () => {
  const { envoyer, demandes } = envoi();
  const reponse = await clientGitHub({ jeton: async () => "gho_secret", envoyer })("/repos/chef/parade/issues?labels=kitchen-board");
  assert.deepEqual(reponse, { status: 200, data: [] });
  assert.equal(demandes[0]?.adresse, `${API_GITHUB}/repos/chef/parade/issues?labels=kitchen-board`);
  assert.equal(demandes[0]?.entetes.Authorization, "Bearer gho_secret");
  assert.equal(demandes[0]?.entetes.Accept, "application/vnd.github+json");
});

test("sans jeton, ou quand il ne se lit pas, la demande part sans : GitHub dit ce qu'il en refuse", async () => {
  const { envoyer, demandes } = envoi();
  await clientGitHub({ jeton: async () => null, envoyer })("/repos/chef/parade/issues");
  await clientGitHub({ jeton: () => Promise.reject(new Error("the vault is locked")), envoyer })("/repos/chef/parade/issues");
  assert.equal(demandes.length, 2);
  for (const { entetes } of demandes) assert.equal(entetes.Authorization, undefined);
});

test("par `fetch`, la réponse rend son code et son corps — en JSON quand il en est, en texte sinon", async () => {
  const appels: Array<{ adresse: string; init: RequestInit | undefined }> = [];
  const faux = (corps: string, status: number): typeof fetch =>
    (async (adresse: string | URL | Request, init?: RequestInit) => {
      appels.push({ adresse: String(adresse), init });
      return new Response(corps, { status });
    }) as typeof fetch;
  assert.deepEqual(await parFetch({ fetch: faux('[{"number":7}]', 200) })(`${API_GITHUB}/x`, { Accept: "a" }), { status: 200, data: [{ number: 7 }] });
  assert.deepEqual(await parFetch({ fetch: faux("<html>Bad gateway</html>", 502) })(`${API_GITHUB}/x`, {}), { status: 502, data: "<html>Bad gateway</html>" });
  assert.equal(appels[0]?.adresse, `${API_GITHUB}/x`);
  assert.deepEqual(appels[0]?.init?.headers, { Accept: "a" });
});

test("par `fetch`, une demande sans réponse est abandonnée passé le délai, et le dit", async () => {
  // Un GitHub qui ne répond jamais : seule l'abandon de la demande le fait rendre la main.
  const muet = ((_adresse: string | URL | Request, init?: RequestInit) =>
    new Promise((_resoudre, rejeter) => init?.signal?.addEventListener("abort", () => rejeter(new Error("aborted"))))) as typeof fetch;
  await assert.rejects(parFetch({ fetch: muet, delaiMs: 20 })(`${API_GITHUB}/x`, {}), /GitHub gave no answer within 0 s/);
  const enPanne = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  await assert.rejects(parFetch({ fetch: enPanne })(`${API_GITHUB}/x`, {}), /fetch failed/);
});

// Un `gh` de test : un script qui écrit ce qu'on lui donne et sort avec ce code.
function faux(t: TestContext, sortie: string, code: number): string {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-app-jeton-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const gh = join(dossier, "gh");
  writeFileSync(gh, `#!/bin/sh\n[ "$1 $2" = "auth token" ] || exit 9\nprintf '%s' '${sortie}'\nexit ${code}\n`);
  chmodSync(gh, 0o755);
  return gh;
}
const SANS_SH = process.platform === "win32" ? "le faux `gh` est un script sh, que Windows ne lance pas" : false;

test("le jeton du desktop est celui que `gh auth token` dit", { skip: SANS_SH }, async (t) => {
  assert.equal(await jetonDeGh({ gh: faux(t, "gho_abc123\n", 0), delaiMs: 60_000 })(), "gho_abc123");
});

test("`gh` sans compte, ou absent : pas de jeton, et la lecture partira sans", { skip: SANS_SH }, async (t) => {
  assert.equal(await jetonDeGh({ gh: faux(t, "no oauth token found for github.com", 1), delaiMs: 60_000 })(), null);
  assert.equal(await jetonDeGh({ gh: join(tmpdir(), "brigade-pas-de-gh-ici"), delaiMs: 60_000 })(), null);
});
