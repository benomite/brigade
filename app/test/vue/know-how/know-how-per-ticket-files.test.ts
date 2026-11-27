// The know-how tab also lists the lessons of `.brigade/know-how/<n>.md` (#4651), each with its ticket, and a removal goes
// through a pull request on the file the entry lives in — deleting the file when it was its last entry. GitHub is a fake.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ClientOfThePriority } from "../../../src/priority.ts";
import { proposeTheChange, readTheKnowledge } from "../../../src/vue/know-how/know-how-github.ts";

const REPOSITORY = "chef/parade";
const FILES: Record<string, string> = {
  ".brigade/know-how.md": "## Tools\n- Use `gh api` (#310)\n",
  ".brigade/know-how/4700.md": "- A lesson of a cook (#4700)\n",
  ".brigade/know-how/4701.md": "- First lesson (#4701)\n- Second lesson\n",
};

function github() {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const client: ClientOfThePriority = {
    lire: async (path) => {
      if (path.includes("/git/ref/heads/")) return { status: 200, data: { object: { sha: "tete" } } };
      const file = path.replace(`/repos/${REPOSITORY}/contents/`, "").split("?")[0] ?? "";
      if (file === ".brigade/know-how") return { status: 200, data: Object.keys(FILES).filter((f) => f.startsWith(".brigade/know-how/")).map((f) => ({ type: "file", path: f })) };
      const text = FILES[file];
      return text === undefined ? { status: 404, data: {} } : { status: 200, data: { content: Buffer.from(text).toString("base64"), sha: `sha-${file}` } };
    },
    ecrire: async (method, path, body) => {
      calls.push({ method, path, body: (body ?? {}) as Record<string, unknown> });
      if (method === "POST" && path.endsWith("/pulls")) return { status: 201, data: { number: 9, html_url: "https://github.com/chef/parade/pull/9" } };
      return { status: path.endsWith("/git/refs") ? 201 : 200, data: {} };
    },
  };
  return { client, calls };
}

describe("per-ticket know-how files", () => {
  test("a lesson in .brigade/know-how/4700.md is listed with its ticket and its file", async () => {
    const { client } = github();
    const { entries } = await readTheKnowledge(client, REPOSITORY, "main");
    assert.deepEqual(entries.map((e) => [e.file, e.text, e.ticket]), [
      [".brigade/know-how.md", "Use `gh api`", 310],
      [".brigade/know-how/4700.md", "A lesson of a cook", 4700],
      [".brigade/know-how/4701.md", "First lesson", 4701],
      [".brigade/know-how/4701.md", "Second lesson", 4701],
    ]);
  });

  test("removing the only entry of 4700.md opens a PR that deletes that file", async () => {
    const { client, calls } = github();
    const pr = await proposeTheChange(client, REPOSITORY, "main", { kind: "remove", line: 0, file: ".brigade/know-how/4700.md", avant: "A lesson of a cook" });
    assert.equal(pr.numero, 9);
    const deletion = calls.find((c) => c.method === "DELETE" && c.path === `/repos/${REPOSITORY}/contents/.brigade/know-how/4700.md`);
    assert.ok(deletion, "the file is deleted");
    assert.equal(deletion.body.sha, "sha-.brigade/know-how/4700.md");
    assert.equal(calls.some((c) => c.method === "PUT"), false);
  });

  test("removing one of two entries rewrites the file; a foreign path is refused", async () => {
    const { client, calls } = github();
    await proposeTheChange(client, REPOSITORY, "main", { kind: "remove", line: 0, file: ".brigade/know-how/4701.md" });
    const put = calls.find((c) => c.method === "PUT");
    assert.equal(Buffer.from(String(put?.body.content), "base64").toString(), "- Second lesson\n");
    await assert.rejects(proposeTheChange(client, REPOSITORY, "main", { kind: "remove", line: 0, file: "package.json" }), /no know-how file/);
  });
});
