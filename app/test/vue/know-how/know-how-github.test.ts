// The project know-how read and changed on GitHub (#4239, vue/know-how/know-how-github.ts): `.brigade/know-how.md` read
// on the integration branch — a missing or empty file is the empty state —, and an entry edited or removed proposed by a
// pull request, the integration branch left as it is. GitHub is an in-memory stand-in with branches and pull requests.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ClientDeLaPriority } from "../../../src/priority.ts";
import { PROPOSE } from "../../../src/settings-du-project.ts";
import { changerLeSavoir, lireLeSavoir, lireLeSavoirDuProject, proposerLeChangement } from "../../../src/vue/know-how/know-how-github.ts";

const REPOSITORY = "chef/parade";
const CHEMIN = ".brigade/know-how.md";
const SAVOIR = [
  "# Know-how",
  "",
  "## Conventions",
  "- Tests live next to the code (#101)",
  "- Identifiers are in French (#102)",
  "",
  "## Pitfalls",
  "- Never run the pass with a dirty tree (#205)",
  "",
  "## Tools",
  "- Use `gh api` for rate limits (#310)",
  "- A tool nobody ticketed",
  "",
].join("\n");

// GitHub with the branches of the repository and the pull requests opened; `lu` answers the reading of the file instead.
function github(texte: string | null = SAVOIR, { lu }: { lu?: { status: number; data: unknown } } = {}) {
  const branches = new Map<string, string | null>([["main", texte]]);
  const demandes: string[] = [];
  const prs: Record<string, unknown>[] = [];
  const ecrits: Record<string, unknown>[] = [];
  const client: ClientDeLaPriority = {
    lire: async (chemin) => {
      demandes.push(`GET ${chemin}`);
      if (chemin.includes("/git/ref/heads/")) return { status: 200, data: { object: { sha: "tete" } } };
      if (lu !== undefined) return lu;
      const ref = decodeURIComponent(chemin.split("?ref=")[1] ?? "main");
      const fichier = branches.get(ref);
      if (chemin === `/repos/${REPOSITORY}/contents/${CHEMIN}?ref=${ref}` && typeof fichier === "string") return { status: 200, data: { type: "file", content: Buffer.from(fichier).toString("base64"), sha: `sha-${ref}` } };
      return { status: 404, data: { message: "Not Found" } };
    },
    ecrire: async (methode, chemin, corps) => {
      demandes.push(`${methode} ${chemin}`);
      const recu = (corps ?? {}) as Record<string, unknown>;
      if (methode === "POST" && chemin === `/repos/${REPOSITORY}/git/refs`) {
        branches.set(String(recu.ref).replace("refs/heads/", ""), branches.get("main") ?? null);
        return { status: 201, data: {} };
      }
      if (methode === "PUT" && chemin === `/repos/${REPOSITORY}/contents/${CHEMIN}`) {
        ecrits.push(recu);
        branches.set(String(recu.branch), Buffer.from(String(recu.content), "base64").toString("utf8"));
        return { status: 200, data: { content: { sha: "neuf" } } };
      }
      if (methode === "POST" && chemin === `/repos/${REPOSITORY}/pulls`) {
        prs.push(recu);
        return { status: 201, data: { number: 77, html_url: `https://github.com/${REPOSITORY}/pull/77` } };
      }
      if (methode === "DELETE") return { status: 204, data: {} };
      return { status: 404, data: {} };
    },
  };
  const proposee = () => [...branches.entries()].find(([name]) => name !== "main")?.[1] ?? assert.fail("no branch proposed");
  return { client, branches, demandes, prs, ecrits, proposee };
}
// The project as the main process knows it: its repository and its integration branch found from it.
const project = (client: ClientDeLaPriority, branch: string | null = "main") => ({ nom: "parade", projet: { nom: "parade" }, depotDe: async () => REPOSITORY, brancheDe: () => branch, client });
const linesChangees = (avant: string, apres: string) => {
  const a = avant.split("\n");
  return apres.split("\n").flatMap((line, i) => (line === a[i] ? [] : [i]));
};

describe("reading the know-how file", () => {
  test("every entry, with its section, its source ticket and its line, read on the integration branch", async () => {
    const { client, demandes } = github();
    const lu = await lireLeSavoir(client, REPOSITORY, "main");
    assert.equal(lu.vide, false);
    assert.deepEqual(
      lu.entries.map((e) => [e.section, e.text, e.ticket, e.line]),
      [
        ["Conventions", "Tests live next to the code", 101, 3],
        ["Conventions", "Identifiers are in French", 102, 4],
        ["Pitfalls", "Never run the pass with a dirty tree", 205, 7],
        ["Tools", "Use `gh api` for rate limits", 310, 10],
        ["Tools", "A tool nobody ticketed", null, 11],
      ],
    );
    assert.deepEqual(demandes, [`GET /repos/${REPOSITORY}/contents/${CHEMIN}?ref=main`]);
  });

  test("no integration branch known: the repository's default one is read", async () => {
    const { client, demandes } = github();
    await lireLeSavoir(client, REPOSITORY, null).catch(() => undefined);
    assert.deepEqual(demandes, [`GET /repos/${REPOSITORY}/contents/${CHEMIN}`]);
  });

  test("a missing file, an empty one, or one with its headings only is the empty state", async () => {
    for (const texte of [null, "", "## Conventions\n\n## Pitfalls\n\n## Tools\n"]) {
      const lu = await lireLeSavoir(github(texte).client, REPOSITORY, "main");
      assert.deepEqual(lu, { entries: [], vide: true }, String(texte));
    }
  });

  test("a refused reading is not an empty state: the screen says the file was not read", async () => {
    const { client } = github(SAVOIR, { lu: { status: 500, data: { message: "Server Error" } } });
    await assert.rejects(lireLeSavoir(client, REPOSITORY, "main"), /GitHub refused the reading of \.brigade\/know-how\.md \(HTTP 500\)/);
    assert.deepEqual(await lireLeSavoirDuProject(project(client)), { sans: "The project know-how not reached.", detail: "GitHub refused the reading of .brigade/know-how.md (HTTP 500): Server Error" });
  });

  test("a project no longer in the projects file reads nothing and proposes nothing", async () => {
    const { client, demandes } = github();
    const parti = { ...project(client), nom: "fanfare", projet: undefined };
    assert.deepEqual(await lireLeSavoirDuProject(parti), { sans: "fanfare is no longer in the projects file" });
    assert.deepEqual(await changerLeSavoir({ ...parti, changement: { kind: "remove", line: 3 } }), { refus: "nothing was done: “fanfare” is no longer in the projects file" });
    assert.deepEqual(demandes, []);
  });

  test("a repository that cannot be found is a reading that failed", async () => {
    const lu = await lireLeSavoirDuProject({
      ...project(github().client),
      depotDe: async () => {
        throw new Error("no origin");
      },
    });
    assert.deepEqual(lu, { sans: "The project know-how not reached.", detail: "no origin" });
  });

  test("the screen's reading says where it read", async () => {
    const lu = await lireLeSavoirDuProject(project(github().client));
    assert.ok(!("sans" in lu));
    assert.equal(lu.depot, REPOSITORY);
    assert.equal(lu.branche, "main");
    assert.equal(lu.entries.length, 5);
    const { client, demandes } = github();
    const parDefaut = await lireLeSavoirDuProject(project(client, null));
    assert.ok(!("sans" in parDefaut));
    assert.equal(parDefaut.branche, null);
    assert.deepEqual(demandes, [`GET /repos/${REPOSITORY}/contents/${CHEMIN}`]);
  });
});

describe("changing an entry by a pull request", () => {
  test("an edit changes exactly that line on a new branch, keeps its ticket, and opens a pull request towards main", async () => {
    const { client, branches, prs, ecrits, proposee } = github();
    const rendu = await proposerLeChangement(client, REPOSITORY, "main", { kind: "edit", line: 7, text: "Never run the pass on a dirty worktree", avant: "Never run the pass with a dirty tree" });
    assert.deepEqual(rendu, { kind: "edit", pr: `https://github.com/${REPOSITORY}/pull/77`, numero: 77 });
    assert.equal(branches.get("main"), SAVOIR, "main is not written in place");
    assert.deepEqual(linesChangees(SAVOIR, proposee()), [7]);
    assert.equal(proposee().split("\n")[7], "- Never run the pass on a dirty worktree (#205)");
    assert.equal(ecrits[0]?.sha, "sha-main");
    assert.equal(prs.length, 1);
    assert.equal(prs[0]?.base, "main");
    assert.equal(prs[0]?.title, "brigade: edit a know-how entry (#205)");
    assert.equal(ecrits[0]?.message, "brigade: edit a know-how entry (#205) (from the app, Settings > Project know-how)");
    assert.match(String(prs[0]?.body), /^Proposed from the app \(Settings > Project know-how\): edit a know-how entry \(#205\) in `\.brigade\/know-how\.md`\./);
  });

  test("a removal deletes exactly that line on a new branch, and opens a pull request", async () => {
    const { client, branches, prs, proposee } = github();
    await proposerLeChangement(client, REPOSITORY, "main", { kind: "remove", line: 11 });
    assert.equal(branches.get("main"), SAVOIR);
    const attendu = SAVOIR.split("\n");
    attendu.splice(11, 1);
    assert.equal(proposee(), attendu.join("\n"));
    assert.equal(prs[0]?.title, "brigade: remove a know-how entry");
  });

  test("a file saved with CRLF line endings: an edit and a removal change that one line, every other line and its CRLF kept", async () => {
    const crlf = SAVOIR.replaceAll("\n", "\r\n");
    const edite = github(crlf);
    await proposerLeChangement(edite.client, REPOSITORY, "main", { kind: "edit", line: 7, text: "Never push a dirty tree", avant: "Never run the pass with a dirty tree" });
    const lines = crlf.split("\n");
    lines[7] = "- Never push a dirty tree (#205)\r";
    assert.equal(edite.proposee(), lines.join("\n"));
    const retire = github(crlf);
    await proposerLeChangement(retire.client, REPOSITORY, "main", { kind: "remove", line: 3, avant: "Tests live next to the code" });
    const sans = crlf.split("\n");
    sans.splice(3, 1);
    assert.equal(retire.proposee(), sans.join("\n"));
  });

  test("the screen's change says the pull request it opened, and what kind of change it proposes", async () => {
    assert.deepEqual(await changerLeSavoir({ ...project(github().client), changement: { kind: "remove", line: 3 } }), {
      propose: PROPOSE,
      kind: "remove",
      pr: `https://github.com/${REPOSITORY}/pull/77`,
      numero: 77,
    });
    const { client, prs } = github();
    const edit = await changerLeSavoir({ ...project(client), changement: { kind: "edit", line: 3, text: "Tests live beside the code" } });
    assert.ok("kind" in edit && edit.kind === "edit");
    assert.equal(prs[0]?.base, "main");
  });

  for (const [name, changement, raison] of [
    ["a line that is not an entry", { kind: "remove", line: 2 }, /changed since it was read/],
    ["an entry whose text moved since it was read", { kind: "remove", line: 4, avant: "Tests live next to the code" }, /changed since it was read/],
    ["an edit to the same text", { kind: "edit", line: 4, text: " Identifiers are in French " }, /already says so/],
    ["an edit to no text", { kind: "edit", line: 4, text: "  " }, /needs a text/],
    ["an edit on two lines", { kind: "edit", line: 4, text: "one\ntwo" }, /one line/],
    ["a change of no kind", { kind: "rename", line: 4 }, /neither an edit nor a removal/],
    ["a change naming no line", { kind: "remove", line: "4" }, /names no entry/],
    ["no change at all", null, /names no entry/],
  ] as const) {
    test(`${name} is refused, and nothing is written`, async () => {
      const { client, demandes } = github();
      await assert.rejects(proposerLeChangement(client, REPOSITORY, "main", changement), raison);
      assert.deepEqual(
        demandes.filter((d) => !d.startsWith("GET")),
        [],
      );
      const rendu = await changerLeSavoir({ ...project(client), changement });
      assert.ok("refus" in rendu);
      assert.match(rendu.refus, /^nothing was proposed: /);
      assert.match(rendu.refus, raison);
    });
  }

  test("the text the screen showed guards the change: a stale one is refused, the shown one is proposed", async () => {
    const perime = github();
    await assert.rejects(proposerLeChangement(perime.client, REPOSITORY, "main", { kind: "remove", line: 4, avant: "Tests live next to the code" }), /changed since it was read/);
    assert.equal(perime.prs.length, 0);
    const vu = github();
    await proposerLeChangement(vu.client, REPOSITORY, "main", { kind: "remove", line: 4, avant: "Identifiers are in French" });
    assert.equal(vu.prs.length, 1);
  });

  test("an edit to the text the entry already has is refused; a removal of that entry is proposed", async () => {
    const meme = github();
    await assert.rejects(proposerLeChangement(meme.client, REPOSITORY, "main", { kind: "edit", line: 4, text: "Identifiers are in French" }), /already says so/);
    assert.equal(meme.prs.length, 0);
    const retrait = github();
    await proposerLeChangement(retrait.client, REPOSITORY, "main", { kind: "remove", line: 4, avant: "Identifiers are in French" });
    assert.equal(retrait.prs[0]?.title, "brigade: remove a know-how entry (#102)");
  });

  test("a file gone since the reading is refused", async () => {
    const { client, demandes } = github(null);
    await assert.rejects(proposerLeChangement(client, REPOSITORY, "main", { kind: "remove", line: 3 }), /chef\/parade has no \.brigade\/know-how\.md any more/);
    assert.equal(demandes.filter((d) => !d.startsWith("GET")).length, 0);
  });

  test("a pull request GitHub refuses says so, and its branch is removed", async () => {
    const { client, demandes } = github();
    const refuse: ClientDeLaPriority = { lire: client.lire, ecrire: (methode, chemin, corps) => (chemin.endsWith("/pulls") ? Promise.resolve({ status: 422, data: { message: "Validation Failed" } }) : client.ecrire(methode, chemin, corps)) };
    const rendu = await changerLeSavoir({ ...project(refuse), changement: { kind: "remove", line: 3 } });
    assert.ok("refus" in rendu);
    assert.match(rendu.refus, /^nothing was proposed: GitHub refused the pull request of brigade\/setting-remove-a-know-how-entry-101-/);
    assert.ok(demandes.some((d) => d.startsWith(`DELETE /repos/${REPOSITORY}/git/refs/heads/brigade/setting-remove-a-know-how-entry-101-`)));
  });
});
