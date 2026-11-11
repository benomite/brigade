// Le geste `release-notes` : le seul chemin vers la publication, et ce qu'il fait de ce que GitHub répond.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test, type TestContext } from "node:test";
import { principal } from "../../src/release-notes-cli.ts";
import { appeler, DEPOT, fauxGh, repertoireTemporaire } from "../outils.ts";

const TAG = "v1.2.0";
const MARKDOWN = "## Week\n- shipped a thing\n";
const RELEASE = { html_url: `https://github.com/${DEPOT}/releases/tag/${TAG}` };
const NON_TROUVE = { statut: 404, corps: { message: "Not Found" } };

function cuisine(t: TestContext) {
  const gh = fauxGh(t);
  const fichier = join(repertoireTemporaire(t), "summary.json");
  writeFileSync(fichier, JSON.stringify({ project: "brigade", weekStart: "2026-11-02", weekEnd: "2026-11-08", themes: [], waiting: [], markdown: MARKDOWN }));
  const jouer = (args: string[] = [TAG, fichier]) => appeler(principal, args, { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
  const creations = () => gh.appels().filter((args) => args.includes("POST"));
  return { gh, fichier, jouer, creations };
}

test("`release-notes <tag> <summary>` creates the release of the tag with the summary's markdown as body, and says where", async (t) => {
  const { gh, jouer, creations } = cuisine(t);
  gh.repondre(`repos/${DEPOT}/releases/tags/${TAG}`, NON_TROUVE);
  gh.repondre(`repos/${DEPOT}/git/ref/tags/${TAG}`, { corps: { ref: `refs/tags/${TAG}` } });
  gh.repondre(`repos/${DEPOT}/releases`, { statut: 201, corps: RELEASE });
  const commande = jouer();
  assert.equal(await commande.fin, 0, commande.sortie());
  assert.match(commande.sortie(), new RegExp(`release ${TAG} published: ${RELEASE.html_url}`));
  const [creation, ...autres] = creations();
  assert.equal(autres.length, 0);
  assert.ok(creation?.includes(`tag_name=${TAG}`) && creation.includes(`name=${TAG}`) && creation.includes(`body=${MARKDOWN}`));
});

test("a tag already published is said so, and nothing is created", async (t) => {
  const { gh, jouer, creations } = cuisine(t);
  gh.repondre(`repos/${DEPOT}/releases/tags/${TAG}`, { corps: RELEASE });
  const commande = jouer();
  assert.equal(await commande.fin, 0);
  assert.match(commande.sortie(), /already published/);
  assert.deepEqual(creations(), []);
});

test("a tag missing on the repository, a rejection by GitHub, an unreadable summary: a readable error, exit 1, nothing created", async (t) => {
  const { gh, fichier, jouer, creations } = cuisine(t);
  gh.repondre(`repos/${DEPOT}/releases/tags/${TAG}`, NON_TROUVE);
  gh.repondre(`repos/${DEPOT}/git/ref/tags/${TAG}`, NON_TROUVE);
  const sansTag = jouer();
  assert.equal(await sansTag.fin, 1);
  assert.match(sansTag.sortie(), /does not exist on the repository: nothing was published/);

  gh.repondre(`repos/${DEPOT}/git/ref/tags/${TAG}`, { corps: {} });
  gh.repondre(`repos/${DEPOT}/releases`, { statut: 422, corps: { message: "Validation Failed" } });
  const refusee = jouer();
  assert.equal(await refusee.fin, 1);
  assert.match(refusee.sortie(), /GitHub refused the release of v1\.2\.0.*Nothing was published/);

  writeFileSync(fichier, "pas du JSON");
  const illisible = jouer();
  assert.equal(await illisible.fin, 1);
  assert.match(illisible.sortie(), /cannot be read.*Nothing was published/);
  writeFileSync(fichier, "{}");
  const sansMarkdown = jouer();
  assert.equal(await sansMarkdown.fin, 1);
  assert.match(sansMarkdown.sortie(), /has no markdown/);
  // Le seul appel de création est celui que GitHub a refusé.
  assert.equal(creations().length, 1);
});

test("without its two arguments or its repository, the gesture refuses with its usage (2) and calls nothing", async (t) => {
  const { gh } = cuisine(t);
  const sansArgs = appeler(principal, [TAG], { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
  assert.equal(await sansArgs.fin, 2);
  assert.match(sansArgs.sortie(), /run release-notes\b/);
  const sansDepot = appeler(principal, [TAG, "x.json"], {});
  assert.equal(await sansDepot.fin, 2);
  assert.deepEqual(gh.appels(), []);
});

test("nothing but the gesture publishes: no other module of the runtime reaches the action, so building a summary never creates a release", () => {
  const SRC = join(import.meta.dirname, "../../src");
  const sources = (dossier: string): string[] => readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dossier, e.name)) : e.name.endsWith(".ts") ? [join(dossier, e.name)] : []));
  const appelants = sources(SRC).filter((f) => /notes-de-version\/publier|publierNotesDeVersion|creerRelease/.test(readFileSync(f, "utf8"))).map((f) => relative(SRC, f).split(sep).join("/"));
  assert.deepEqual(appelants.sort(), ["github.ts", "notes-de-version/publier.ts", "release-notes-cli.ts"]);
});
