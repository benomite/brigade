// Le client GitHub des gestes du tableau, contre un faux `gh` : les
// commentaires du tableau, relus sous condition et page après page ; la
// réponse, postée par l'entrée de `gh` ; le compte du chef, demandé une fois
// au `gh` de la machine — jamais sous le jeton d'une App de rôle.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirLimite } from "../../../src/limite-github.ts";
import { clientGitHubDesGestes } from "../../../src/tableau/gestes/client.ts";
import { DEPOT, fauxGh } from "../../outils.ts";

const SANS_BASH = process.platform === "win32" && "le faux `gh` est un script bash";
const COMMENTAIRES = `repos/${DEPOT}/issues/4/comments?per_page=100`;
const brut = (id: number, corps: string, login = "benomite") => ({
  id,
  body: corps,
  created_at: `2026-10-08T10:0${id % 10}:00Z`,
  html_url: `https://github.com/${DEPOT}/issues/4#issuecomment-${id}`,
  user: { login },
});

test("les commentaires du tableau se lisent du plus ancien au plus récent, relus sous condition, et au-delà d'une page", { skip: SANS_BASH }, async (t) => {
  const gh = fauxGh(t);
  const client = clientGitHubDesGestes({ depot: DEPOT, bin: gh.bin, limite: ouvrirLimite(), jeton: async () => "jeton-du-manager" });
  gh.repondre(COMMENTAIRES, { etag: '"c1"', corps: [brut(11, "/brigade merge #30"), { id: "illisible" }, brut(12, "merci", "passant")] });
  const attendus = [
    { id: 11, auteur: "benomite", corps: "/brigade merge #30", le: "2026-10-08T10:01:00Z", url: `https://github.com/${DEPOT}/issues/4#issuecomment-11` },
    { id: 12, auteur: "passant", corps: "merci", le: "2026-10-08T10:02:00Z", url: `https://github.com/${DEPOT}/issues/4#issuecomment-12` },
  ];
  assert.deepEqual(await client.commentaires(4, null), attendus);
  // Relue sous son ETag : GitHub répond 304, et la liste est celle d'avant.
  assert.deepEqual(await client.commentaires(4, null), attendus);
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "-H", 'If-None-Match: "c1"', COMMENTAIRES]);
  assert.deepEqual(gh.jetons(), ["jeton-du-manager", "jeton-du-manager"]);

  // Depuis le dernier geste lu, et sur deux pages : la seconde se suit par son lien.
  const depuis = `${COMMENTAIRES}&since=${encodeURIComponent("2026-10-08T10:01:00Z")}`;
  const suite = `https://api.github.com/repositories/1/issues/4/comments?per_page=100&since=x&page=2`;
  gh.repondre(depuis, { suivant: suite, corps: [brut(11, "/brigade merge #30")] });
  gh.repondre(suite, { corps: [brut(13, "/brigade set-aside #31")] });
  assert.deepEqual((await client.commentaires(4, "2026-10-08T10:01:00Z")).map(({ id }) => id), [11, 13]);
  assert.deepEqual(gh.appels().slice(-2), [["api", "-i", depuis], ["api", "-i", suite]]);
});

test("la réponse part par l'entrée de `gh`, et le compte du chef est celui du `gh` de la machine, demandé une fois", { skip: SANS_BASH }, async (t) => {
  const gh = fauxGh(t);
  const client = clientGitHubDesGestes({ depot: DEPOT, bin: gh.bin, limite: ouvrirLimite(), jeton: async () => "jeton-du-manager" });
  gh.repondre(`repos/${DEPOT}/issues/4/comments`, { statut: 201, corps: { id: 99 } });
  await client.repondre(4, "**Done** — merge #30");
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "--input", "-", "-X", "POST", `repos/${DEPOT}/issues/4/comments`]);

  gh.repondre("user", { corps: { login: "benomite" } });
  assert.equal(await client.compteDuChef(), "benomite");
  assert.equal(await client.compteDuChef(), "benomite");
  assert.deepEqual(gh.appels().slice(1), [["api", "-i", "user"]]);
  assert.deepEqual(gh.jetons(), ["jeton-du-manager", null]);

  // Refusée par GitHub, la réponse lève : la box la reposte au passage suivant.
  gh.repondre(`repos/${DEPOT}/issues/4/comments`, { statut: 403, corps: { message: "Resource not accessible by integration" } });
  await assert.rejects(client.repondre(4, "**Done** — merge #30"), /HTTP 403/);
});
