import assert from "node:assert/strict";
import { test } from "node:test";
import { publierNotesDeVersion, type Resume } from "../../src/notes-de-version/publier.ts";

const resume: Resume = { project: "brigade", weekStart: "2026-11-02", weekEnd: "2026-11-08", themes: [], waiting: [], markdown: "## Week\n- shipped a thing\n" };

// Un faux GitHub : les tags qui existent, les releases créées, un refus éventuel.
function faux(tags: string[], refus?: Error) {
  const releases = new Map<string, { name: string; body: string }>();
  const appels: string[] = [];
  return {
    releases,
    appels,
    async tagExiste(tag: string) { appels.push(`tag ${tag}`); return tags.includes(tag); },
    async releaseDuTag(tag: string) { return releases.has(tag) ? { url: `https://github.com/o/r/releases/tag/${tag}` } : null; },
    async creerRelease(tag: string, corps: string) {
      appels.push(`create ${tag}`);
      if (refus) throw refus;
      releases.set(tag, { name: tag, body: corps });
      return { url: `https://github.com/o/r/releases/tag/${tag}` };
    },
  };
}

test("publishes one release named after the tag, whose body is the summary's markdown", async () => {
  const github = faux(["v1.2.0"]);
  const resultat = await publierNotesDeVersion(github, resume, "v1.2.0");
  assert.deepEqual(resultat, { statut: "publiee", url: "https://github.com/o/r/releases/tag/v1.2.0" });
  assert.deepEqual([...github.releases], [["v1.2.0", { name: "v1.2.0", body: resume.markdown }]]);
});

test("a second call for the same tag creates no duplicate and says it is already published", async () => {
  const github = faux(["v1.2.0"]);
  await publierNotesDeVersion(github, resume, "v1.2.0");
  const second = await publierNotesDeVersion(github, resume, "v1.2.0");
  assert.equal(second.statut, "deja-publiee");
  assert.equal(github.releases.size, 1);
  assert.equal(github.appels.filter((appel) => appel.startsWith("create")).length, 1);
});

test("a tag that does not exist returns a readable error and publishes nothing", async () => {
  const github = faux([]);
  const resultat = await publierNotesDeVersion(github, resume, "v9.9.9");
  assert.equal(resultat.statut, "refusee");
  assert.match((resultat as { erreur: string }).erreur, /v9\.9\.9 does not exist/);
  assert.equal(github.releases.size, 0);
  assert.deepEqual(github.appels, ["tag v9.9.9"]);
});

test("GitHub rejecting the call returns a readable error and publishes nothing", async () => {
  const github = faux(["v1.2.0"], new Error("gh api repos/o/r/releases : HTTP 422"));
  const resultat = await publierNotesDeVersion(github, resume, "v1.2.0");
  assert.equal(resultat.statut, "refusee");
  assert.match((resultat as { erreur: string }).erreur, /HTTP 422.*Nothing was published/);
  assert.equal(github.releases.size, 0);
});

test("a failing read of the existing release is an error, never a blind creation", async () => {
  const github = { ...faux(["v1.2.0"]), async releaseDuTag(): Promise<null> { throw new Error("gh api : HTTP 500"); } };
  const resultat = await publierNotesDeVersion(github, resume, "v1.2.0");
  assert.equal(resultat.statut, "refusee");
  assert.equal(github.releases.size, 0);
});

test("an empty tag or an empty summary publishes nothing", async () => {
  const github = faux(["v1.2.0"]);
  assert.equal((await publierNotesDeVersion(github, resume, " ")).statut, "refusee");
  assert.equal((await publierNotesDeVersion(github, { markdown: "  " }, "v1.2.0")).statut, "refusee");
  assert.equal(github.appels.length, 0);
});

test("generating a summary alone triggers no GitHub Release: only the explicit call creates one", async () => {
  const github = faux(["v1.2.0"]);
  // Produire le résumé n'est qu'un objet : rien n'est appelé tant que l'action ne l'est pas.
  const genere: Resume = { ...resume, markdown: "## Another week\n" };
  assert.equal(genere.markdown, "## Another week\n");
  assert.equal(github.releases.size, 0);
  assert.deepEqual(github.appels, []);
  await publierNotesDeVersion(github, genere, "v1.2.0");
  assert.equal(github.releases.size, 1);
});

test("the real client reads the tag and the release, and creates the release with the tag as name and the markdown as body", async () => {
  const { ouvrirGitHub } = await import("../../src/github.ts");
  const { ouvrirLimite } = await import("../../src/limite-github.ts");
  const { ouvrirLimitesDuCompte } = await import("../../src/github-limite.ts");
  const vus: string[][] = [];
  const reponse = (statut: string, corps: string) => ({ erreur: null, stderr: "", stdout: `HTTP/2.0 ${statut}\r\nContent-Type: application/json\r\n\r\n${corps}` });
  const client = ouvrirGitHub({
    depot: "o/r",
    bin: "faux-gh-notes",
    limite: ouvrirLimite(),
    limitesDuCompte: ouvrirLimitesDuCompte(),
    transport: async (args) => {
      vus.push(args);
      const chemin = args.at(-1) ?? "";
      if (chemin.endsWith("/releases")) return reponse("201 Created", '{"html_url":"https://github.com/o/r/releases/tag/v1.2.0"}');
      return reponse("404 Not Found", '{"message":"Not Found"}');
    },
  });
  assert.equal(await client.tagExiste("v1.2.0"), false);
  assert.equal(await client.releaseDuTag("v1.2.0"), null);
  assert.deepEqual(await client.creerRelease("v1.2.0", resume.markdown), { url: "https://github.com/o/r/releases/tag/v1.2.0" });
  const creation = vus.at(-1) ?? [];
  assert.ok(creation.includes("tag_name=v1.2.0") && creation.includes("name=v1.2.0") && creation.includes(`body=${resume.markdown}`));
});
