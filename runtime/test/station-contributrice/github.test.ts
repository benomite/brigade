// Ce que le client GitHub du runtime dit à la station contributrice (#2935) :
// le compte de la machine et s'il écrit sur le dépôt, et sa fourche. Par le
// vrai client, sous un faux transport.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirGitHub, type Transport } from "../../src/github.ts";
import { ouvrirLimitesDuCompte } from "../../src/github-limite.ts";
import { ouvrirLimite } from "../../src/limite-github.ts";

const DEPOT = "acme/shop";
const reponse = (statut: number, corps: unknown) => ({ erreur: statut < 300 ? null : new Error(`HTTP ${statut}`), stdout: `HTTP/2.0 ${statut} X\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(corps)}`, stderr: "" });

let rang = 0;
function client(repondre: (chemin: string, args: string[]) => ReturnType<typeof reponse>, identite?: () => Promise<string>) {
  const appels: string[][] = [];
  const transport: Transport = async (args) => {
    appels.push(args);
    return repondre(args.at(-1) as string, args);
  };
  const github = ouvrirGitHub({ depot: DEPOT, bin: `faux-gh-2935-${rang++}`, transport, limite: ouvrirLimite(), limitesDuCompte: ouvrirLimitesDuCompte(), ...(identite === undefined ? {} : { identite }) });
  return { github, appels };
}

test("rights: the machine's account and whether GitHub gives it push on the repository", async () => {
  for (const push of [false, true]) {
    const { github } = client((chemin) => (chemin === "user" ? reponse(200, { login: "outsider" }) : chemin === `repos/${DEPOT}` ? reponse(200, { full_name: DEPOT, permissions: { admin: false, push, pull: true } }) : reponse(404, {})));
    assert.deepEqual(await github.droits(), { login: "outsider", ecriture: push });
  }
});

test("rights that GitHub does not give are an error, never a guess", async () => {
  const sansPermissions = client((chemin) => (chemin === "user" ? reponse(200, { login: "outsider" }) : reponse(200, { full_name: DEPOT })));
  await assert.rejects(sansPermissions.github.droits(), /no permissions/);
  const sansCompte = client(() => reponse(502, { message: "Bad Gateway" }));
  await assert.rejects(sansCompte.github.droits(), /HTTP 502/);
});

test("under a role identity, an App installed on the repository, the station writes: nothing is read", async () => {
  const { github, appels } = client(() => reponse(404, {}), async () => "brigade-pass[bot]");
  assert.deepEqual(await github.droits(), { login: "brigade-pass[bot]", ecriture: true });
  assert.deepEqual(appels, []);
});

test("the fork: created or found by GitHub, with its owner and the address to push to", async () => {
  const { github, appels } = client((chemin) => (chemin === `repos/${DEPOT}/forks` ? reponse(202, { full_name: "outsider/shop", owner: { login: "outsider" }, clone_url: "https://github.com/outsider/shop.git" }) : reponse(404, {})));
  assert.deepEqual(await github.fourcher(), { proprietaire: "outsider", url: "https://github.com/outsider/shop.git" });
  assert.deepEqual(appels.at(-1)?.slice(-3), ["-X", "POST", `repos/${DEPOT}/forks`]);
  const refusee = client(() => reponse(403, { message: "forking is disabled" }));
  await assert.rejects(refusee.github.fourcher(), /HTTP 403/);
  const illisible = client(() => reponse(202, { full_name: "outsider/shop" }));
  await assert.rejects(illisible.github.fourcher(), /fork without owner/);
});
