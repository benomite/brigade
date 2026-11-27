// The project know-how read and changed on GitHub (#4239, vue/know-how/know-how-github.ts): `.brigade/know-how.md` read
// on the integration branch — a missing or empty file is the empty state —, and an entry edited or removed proposed by a
// pull request, the integration branch left as it is. GitHub is an in-memory stand-in with branches and pull requests.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ClientOfThePriority } from "../../../src/priority.ts";
import { PROPOSES } from "../../../src/settings-of-project.ts";
import { changeTheSavoir, readTheSavoir, readTheSavoirOfProject, proposeTheChange } from "../../../src/vue/know-how/know-how-github.ts";

const REPOSITORY = "chef/parade";
const PATH = ".brigade/know-how.md";
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
function github(text: string | null = SAVOIR, { lu: readOne }: { lu?: { status: number; data: unknown } } = {}) {
  const branches = new Map<string, string | null>([["main", text]]);
  const requests: string[] = [];
  const prs: Record<string, unknown>[] = [];
  const writtenOnes: Record<string, unknown>[] = [];
  const client: ClientOfThePriority = {
    lire: async (path) => {
      requests.push(`GET ${path}`);
      if (path.includes("/git/ref/heads/")) return { status: 200, data: { object: { sha: "tete" } } };
      if (readOne !== undefined) return readOne;
      const ref = decodeURIComponent(path.split("?ref=")[1] ?? "main");
      const file = branches.get(ref);
      if (path === `/repos/${REPOSITORY}/contents/${PATH}?ref=${ref}` && typeof file === "string") return { status: 200, data: { type: "file", content: Buffer.from(file).toString("base64"), sha: `sha-${ref}` } };
      return { status: 404, data: { message: "Not Found" } };
    },
    ecrire: async (methode, path, body) => {
      requests.push(`${methode} ${path}`);
      const received = (body ?? {}) as Record<string, unknown>;
      if (methode === "POST" && path === `/repos/${REPOSITORY}/git/refs`) {
        branches.set(String(received.ref).replace("refs/heads/", ""), branches.get("main") ?? null);
        return { status: 201, data: {} };
      }
      if (methode === "PUT" && path === `/repos/${REPOSITORY}/contents/${PATH}`) {
        writtenOnes.push(received);
        branches.set(String(received.branch), Buffer.from(String(received.content), "base64").toString("utf8"));
        return { status: 200, data: { content: { sha: "neuf" } } };
      }
      if (methode === "POST" && path === `/repos/${REPOSITORY}/pulls`) {
        prs.push(received);
        return { status: 201, data: { number: 77, html_url: `https://github.com/${REPOSITORY}/pull/77` } };
      }
      if (methode === "DELETE") return { status: 204, data: {} };
      return { status: 404, data: {} };
    },
  };
  const proposed = () => [...branches.entries()].find(([name]) => name !== "main")?.[1] ?? assert.fail("no branch proposed");
  return { client, branches, demandes: requests, prs, ecrits: writtenOnes, proposee: proposed };
}
// The project as the main process knows it: its repository and its integration branch found from it.
const project = (client: ClientOfThePriority, branch: string | null = "main") => ({ nom: "parade", projet: { nom: "parade" }, depotDe: async () => REPOSITORY, brancheDe: () => branch, client });
const linesChanged = (before: string, after: string) => {
  const a = before.split("\n");
  return after.split("\n").flatMap((line, i) => (line === a[i] ? [] : [i]));
};

describe("reading the know-how file", () => {
  test("every entry, with its section, its source ticket and its line, read on the integration branch", async () => {
    const { client, demandes: requests } = github();
    const readOne = await readTheSavoir(client, REPOSITORY, "main");
    assert.equal(readOne.vide, false);
    assert.deepEqual(
      readOne.entries.map((e) => [e.section, e.text, e.ticket, e.line]),
      [
        ["Conventions", "Tests live next to the code", 101, 3],
        ["Conventions", "Identifiers are in French", 102, 4],
        ["Pitfalls", "Never run the pass with a dirty tree", 205, 7],
        ["Tools", "Use `gh api` for rate limits", 310, 10],
        ["Tools", "A tool nobody ticketed", null, 11],
      ],
    );
    assert.deepEqual(requests, [`GET /repos/${REPOSITORY}/contents/${PATH}?ref=main`]);
  });

  test("no integration branch known: the repository's default one is read", async () => {
    const { client, demandes: requests } = github();
    await readTheSavoir(client, REPOSITORY, null).catch(() => undefined);
    assert.deepEqual(requests, [`GET /repos/${REPOSITORY}/contents/${PATH}`]);
  });

  test("a missing file, an empty one, or one with its headings only is the empty state", async () => {
    for (const text of [null, "", "## Conventions\n\n## Pitfalls\n\n## Tools\n"]) {
      const readOne = await readTheSavoir(github(text).client, REPOSITORY, "main");
      assert.deepEqual(readOne, { entries: [], vide: true }, String(text));
    }
  });

  test("a refused reading is not an empty state: the screen says the file was not read", async () => {
    const { client } = github(SAVOIR, { lu: { status: 500, data: { message: "Server Error" } } });
    await assert.rejects(readTheSavoir(client, REPOSITORY, "main"), /GitHub refused the reading of \.brigade\/know-how\.md \(HTTP 500\)/);
    assert.deepEqual(await readTheSavoirOfProject(project(client)), { sans: "The project know-how not reached.", detail: "GitHub refused the reading of .brigade/know-how.md (HTTP 500): Server Error" });
  });

  test("a project no longer in the projects file reads nothing and proposes nothing", async () => {
    const { client, demandes: requests } = github();
    const gone = { ...project(client), nom: "fanfare", projet: undefined };
    assert.deepEqual(await readTheSavoirOfProject(gone), { sans: "fanfare is no longer in the projects file" });
    assert.deepEqual(await changeTheSavoir({ ...gone, changement: { kind: "remove", line: 3 } }), { refus: "nothing was done: “fanfare” is no longer in the projects file" });
    assert.deepEqual(requests, []);
  });

  test("a repository that cannot be found is a reading that failed", async () => {
    const readOne = await readTheSavoirOfProject({
      ...project(github().client),
      depotDe: async () => {
        throw new Error("no origin");
      },
    });
    assert.deepEqual(readOne, { sans: "The project know-how not reached.", detail: "no origin" });
  });

  test("the screen's reading says where it read", async () => {
    const readOne = await readTheSavoirOfProject(project(github().client));
    assert.ok(!("sans" in readOne));
    assert.equal(readOne.depot, REPOSITORY);
    assert.equal(readOne.branche, "main");
    assert.equal(readOne.entries.length, 5);
    const { client, demandes: requests } = github();
    const parDefault = await readTheSavoirOfProject(project(client, null));
    assert.ok(!("sans" in parDefault));
    assert.equal(parDefault.branche, null);
    assert.deepEqual(requests, [`GET /repos/${REPOSITORY}/contents/${PATH}`]);
  });
});

describe("changing an entry by a pull request", () => {
  test("an edit changes exactly that line on a new branch, keeps its ticket, and opens a pull request towards main", async () => {
    const { client, branches, prs, ecrits: writtenOnes, proposee: proposed } = github();
    const rendered = await proposeTheChange(client, REPOSITORY, "main", { kind: "edit", line: 7, text: "Never run the pass on a dirty worktree", avant: "Never run the pass with a dirty tree" });
    assert.deepEqual(rendered, { kind: "edit", pr: `https://github.com/${REPOSITORY}/pull/77`, numero: 77 });
    assert.equal(branches.get("main"), SAVOIR, "main is not written in place");
    assert.deepEqual(linesChanged(SAVOIR, proposed()), [7]);
    assert.equal(proposed().split("\n")[7], "- Never run the pass on a dirty worktree (#205)");
    assert.equal(writtenOnes[0]?.sha, "sha-main");
    assert.equal(prs.length, 1);
    assert.equal(prs[0]?.base, "main");
    assert.equal(prs[0]?.title, "brigade: edit a know-how entry (#205)");
    assert.equal(writtenOnes[0]?.message, "brigade: edit a know-how entry (#205) (from the app, Settings > Project know-how)");
    assert.match(String(prs[0]?.body), /^Proposed from the app \(Settings > Project know-how\): edit a know-how entry \(#205\) in `\.brigade\/know-how\.md`\./);
  });

  test("a removal deletes exactly that line on a new branch, and opens a pull request", async () => {
    const { client, branches, prs, proposee: proposed } = github();
    await proposeTheChange(client, REPOSITORY, "main", { kind: "remove", line: 11 });
    assert.equal(branches.get("main"), SAVOIR);
    const expected = SAVOIR.split("\n");
    expected.splice(11, 1);
    assert.equal(proposed(), expected.join("\n"));
    assert.equal(prs[0]?.title, "brigade: remove a know-how entry");
  });

  test("a file saved with CRLF line endings: an edit and a removal change that one line, every other line and its CRLF kept", async () => {
    const crlf = SAVOIR.replaceAll("\n", "\r\n");
    const edits = github(crlf);
    await proposeTheChange(edits.client, REPOSITORY, "main", { kind: "edit", line: 7, text: "Never push a dirty tree", avant: "Never run the pass with a dirty tree" });
    const lines = crlf.split("\n");
    lines[7] = "- Never push a dirty tree (#205)\r";
    assert.equal(edits.proposee(), lines.join("\n"));
    const removed = github(crlf);
    await proposeTheChange(removed.client, REPOSITORY, "main", { kind: "remove", line: 3, avant: "Tests live next to the code" });
    const without = crlf.split("\n");
    without.splice(3, 1);
    assert.equal(removed.proposee(), without.join("\n"));
  });

  test("the screen's change says the pull request it opened, and what kind of change it proposes", async () => {
    assert.deepEqual(await changeTheSavoir({ ...project(github().client), changement: { kind: "remove", line: 3 } }), {
      propose: PROPOSES,
      kind: "remove",
      pr: `https://github.com/${REPOSITORY}/pull/77`,
      numero: 77,
    });
    const { client, prs } = github();
    const edit = await changeTheSavoir({ ...project(client), changement: { kind: "edit", line: 3, text: "Tests live beside the code" } });
    assert.ok("kind" in edit && edit.kind === "edit");
    assert.equal(prs[0]?.base, "main");
  });

  for (const [name, change, reason] of [
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
      const { client, demandes: requests } = github();
      await assert.rejects(proposeTheChange(client, REPOSITORY, "main", change), reason);
      assert.deepEqual(
        requests.filter((d) => !d.startsWith("GET")),
        [],
      );
      const rendered = await changeTheSavoir({ ...project(client), changement: change });
      assert.ok("refus" in rendered);
      assert.match(rendered.refus, /^nothing was proposed: /);
      assert.match(rendered.refus, reason);
    });
  }

  test("the text the screen showed guards the change: a stale one is refused, the shown one is proposed", async () => {
    const stale = github();
    await assert.rejects(proposeTheChange(stale.client, REPOSITORY, "main", { kind: "remove", line: 4, avant: "Tests live next to the code" }), /changed since it was read/);
    assert.equal(stale.prs.length, 0);
    const seenOne = github();
    await proposeTheChange(seenOne.client, REPOSITORY, "main", { kind: "remove", line: 4, avant: "Identifiers are in French" });
    assert.equal(seenOne.prs.length, 1);
  });

  test("an edit to the text the entry already has is refused; a removal of that entry is proposed", async () => {
    const same = github();
    await assert.rejects(proposeTheChange(same.client, REPOSITORY, "main", { kind: "edit", line: 4, text: "Identifiers are in French" }), /already says so/);
    assert.equal(same.prs.length, 0);
    const removal = github();
    await proposeTheChange(removal.client, REPOSITORY, "main", { kind: "remove", line: 4, avant: "Identifiers are in French" });
    assert.equal(removal.prs[0]?.title, "brigade: remove a know-how entry (#102)");
  });

  test("a file gone since the reading is refused", async () => {
    const { client, demandes: requests } = github(null);
    await assert.rejects(proposeTheChange(client, REPOSITORY, "main", { kind: "remove", line: 3 }), /chef\/parade has no \.brigade\/know-how\.md any more/);
    assert.equal(requests.filter((d) => !d.startsWith("GET")).length, 0);
  });

  test("a pull request GitHub refuses says so, and its branch is removed", async () => {
    const { client, demandes: requests } = github();
    const refuses: ClientOfThePriority = { lire: client.lire, ecrire: (methode, path, body) => (path.endsWith("/pulls") ? Promise.resolve({ status: 422, data: { message: "Validation Failed" } }) : client.ecrire(methode, path, body)) };
    const rendered = await changeTheSavoir({ ...project(refuses), changement: { kind: "remove", line: 3 } });
    assert.ok("refus" in rendered);
    assert.match(rendered.refus, /^nothing was proposed: GitHub refused the pull request of brigade\/setting-remove-a-know-how-entry-101-/);
    assert.ok(requests.some((d) => d.startsWith(`DELETE /repos/${REPOSITORY}/git/refs/heads/brigade/setting-remove-a-know-how-entry-101-`)));
  });
});
