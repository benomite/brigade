// Le client GitHub du tableau de la cuisine, contre un faux `gh` : ce qu'il
// demande à l'API — la liste au label, l'issue, sa création et son corps par
// l'entrée de `gh`, sa réouverture, son épinglage en GraphQL —, et qu'aucun de
// ses appels ne poste de commentaire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirLimite } from "../../../src/limite-github.ts";
import { clientGitHubDuTableau } from "../../../src/tableau/publication/client.ts";
import { DEPOT, fauxGh } from "../../outils.ts";

const AU_LABEL = `repos/${DEPOT}/issues?labels=kitchen-board&state=all&per_page=100`;
const issueBrute = (numero: number, autres: Record<string, unknown> = {}) => ({
  number: numero,
  title: "Kitchen board",
  body: "<!-- brigade:kitchen-board\n{}\n-->",
  state: "open",
  labels: [{ name: "kitchen-board" }, { name: "hors-cuisine" }],
  repository_url: `https://api.github.com/repos/${DEPOT}`,
  ...autres,
});

test("le client lit le tableau au label, ouvert ou fermé, et une issue transférée, supprimée ou une PR n'est pas là", { skip: process.platform === "win32" && "le faux `gh` est un script bash" }, async (t) => {
  const gh = fauxGh(t);
  const client = clientGitHubDuTableau({ depot: DEPOT, bin: gh.bin, limite: ouvrirLimite() });
  gh.repondre(AU_LABEL, { etag: '"l1"', corps: [issueBrute(3, { state: "closed" }), { ...issueBrute(4), pull_request: {} }] });
  assert.deepEqual(await client.auLabel("kitchen-board"), [{ numero: 3, ouverte: false, titre: "Kitchen board", corps: "<!-- brigade:kitchen-board\n{}\n-->", labels: ["kitchen-board", "hors-cuisine"] }]);
  // Relue sous condition : GitHub répond 304, et la liste est celle de la lecture d'avant.
  assert.equal((await client.auLabel("kitchen-board")).length, 1);
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "-H", 'If-None-Match: "l1"', AU_LABEL]);

  gh.repondre(`repos/${DEPOT}/issues/3`, { corps: issueBrute(3) });
  assert.equal((await client.issue(3))?.ouverte, true);
  gh.repondre(`repos/${DEPOT}/issues/5`, { corps: issueBrute(5, { repository_url: "https://api.github.com/repos/benomite/ailleurs" }) });
  assert.equal(await client.issue(5), null, "transférée");
  assert.equal(await client.issue(6), null, "supprimée : GitHub répond 404");
  gh.repondre(`repos/${DEPOT}/issues/7`, { statut: 410, corps: { message: "This issue was deleted" } });
  assert.equal(await client.issue(7), null, "supprimée : GitHub répond 410");
});

test("le client crée, réécrit le corps par l'entrée de `gh`, rouvre et épingle — sans un commentaire", { skip: process.platform === "win32" && "le faux `gh` est un script bash" }, async (t) => {
  const gh = fauxGh(t);
  const client = clientGitHubDuTableau({ depot: DEPOT, bin: gh.bin, limite: ouvrirLimite() });
  gh.repondre(`repos/${DEPOT}/issues`, { statut: 201, corps: { number: 12 } });
  assert.equal(await client.creer({ titre: "Kitchen board", corps: "le corps", labels: ["kitchen-board", "hors-cuisine"] }), 12);
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "--input", "-", "-X", "POST", `repos/${DEPOT}/issues`]);

  gh.repondre(`repos/${DEPOT}/issues/12`, { corps: issueBrute(12) });
  await client.ecrireCorps(12, "un autre corps");
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "--input", "-", "-X", "PATCH", `repos/${DEPOT}/issues/12`]);
  await client.rouvrir(12);
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "-X", "PATCH", "-f", "state=open", `repos/${DEPOT}/issues/12`]);

  // Pas encore épinglée : la lecture le dit, la mutation l'épingle.
  gh.repondre("graphql", { corps: { data: { repository: { issue: { id: "I_12", isPinned: false } }, pinIssue: { issue: { isPinned: true } } } } });
  assert.equal(await client.epingler(12), true);
  const [lecture, mutation] = gh.appels().slice(-2);
  assert.ok(lecture?.includes("-F") && lecture.includes("number=12") && lecture.includes("owner=benomite") && lecture.includes("name=brigade"));
  assert.ok(mutation?.includes("id=I_12") && mutation.some((arg) => arg.includes("pinIssue")));
  // Déjà épinglée : rien ne s'écrit.
  gh.repondre("graphql", { corps: { data: { repository: { issue: { id: "I_12", isPinned: true } } } } });
  const avant = gh.appels().length;
  assert.equal(await client.epingler(12), false);
  assert.equal(gh.appels().length, avant + 1);
  // Une erreur de GraphQL — l'App n'a pas le droit — se lève, en le disant.
  gh.repondre("graphql", { corps: { errors: [{ message: "Resource not accessible by integration" }] } });
  await assert.rejects(client.epingler(12), /Resource not accessible by integration/);

  assert.ok(gh.appels().every((args) => !args.some((arg) => arg.includes("/comments"))), "aucun commentaire");
});
