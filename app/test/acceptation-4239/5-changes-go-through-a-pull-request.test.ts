// Frozen acceptance test (#4239). Criterion 5: both changes are delivered through the project's normal change path (a pull request, as `proposerLeFichier` of caps-duration.ts does), not written silently in place.
// Contract, in `app/src/vue/know-how/know-how-github.ts`:
//   proposerLeChangement(client, depot, branche, { kind: "edit"; line: number; text: string } | { kind: "remove"; line: number }): Promise<{ pr: string; numero: number }>
import assert from "node:assert/strict";
import { test } from "node:test";
import { proposeTheChange } from "../../src/vue/know-how/know-how-github.ts";
import type { ClientOfThePriority } from "../../src/priority.ts";

// The fixture file (line 0 is the title, line 4 the second Conventions entry).
const SAVOIR = ["# Know-how", "", "## Conventions", "- Tests live next to the code (#101)", "- Identifiers are in French (#102)", "", "## Pitfalls", "- Never run the pass with a dirty tree (#205)", "", "## Tools", "- Use `gh api` for rate limits (#310)", "- A tool nobody ticketed", ""].join("\n");

const PATH = ".brigade/know-how.md";

function github() {
  const branches = new Map<string, string>([["main", SAVOIR]]);
  const requests: string[] = [];
  const prs: Record<string, unknown>[] = [];
  const client: ClientOfThePriority = {
    lire: async (path) => {
      requests.push(`GET ${path}`);
      if (path.includes("/git/ref/heads/")) return { status: 200, data: { object: { sha: "tete" } } };
      const ref = decodeURIComponent(path.split("?ref=")[1] ?? "main");
      const text = branches.get(ref);
      if (path.includes(`/contents/${PATH}`) && text !== undefined) return { status: 200, data: { type: "file", content: Buffer.from(text).toString("base64"), sha: `sha-${ref}` } };
      return { status: 404, data: { message: "Not Found" } };
    },
    ecrire: async (methode, path, body) => {
      requests.push(`${methode} ${path}`);
      const received = (body ?? {}) as Record<string, unknown>;
      if (methode === "POST" && path.endsWith("/git/refs")) {
        branches.set(String(received.ref).replace("refs/heads/", ""), SAVOIR);
        return { status: 201, data: {} };
      }
      if (methode === "PUT" && path.includes(`/contents/${PATH}`)) {
        branches.set(String(received.branch ?? "main"), Buffer.from(String(received.content), "base64").toString("utf8"));
        return { status: 200, data: { content: { sha: "neuf" } } };
      }
      if (methode === "POST" && path.endsWith("/pulls")) {
        prs.push(received);
        return { status: 201, data: { number: 77, html_url: "https://github.com/chef/parade/pull/77" } };
      }
      return { status: 404, data: {} };
    },
  };
  return { client, branches, demandes: requests, prs };
}

for (const [name, change, expected] of [
  ["an edit", { kind: "edit", line: 4, text: "Identifiers are in English" }, "- Identifiers are in English (#102)"],
  ["a removal", { kind: "remove", line: 4 }, null],
] as const) {
  test(`${name} opens a pull request and leaves the base branch untouched`, async () => {
    const { client, branches, demandes: requests, prs } = github();
    const rendered = await proposeTheChange(client, "chef/parade", "main", change);
    assert.equal(rendered.numero, 77);
    assert.equal(prs.length, 1);
    assert.equal(prs[0]?.base, "main");
    assert.equal(branches.get("main"), SAVOIR, "main must not be written in place");
    const branch = [...branches.keys()].find((b) => b !== "main");
    assert.ok(branch, "the change lands on a new branch");
    const before = SAVOIR.split("\n");
    const after = (branches.get(branch) ?? "").split("\n");
    if (expected === null) assert.equal(after.length, before.length - 1);
    else assert.equal(after[4], expected);
    assert.ok(requests.some((d) => d.startsWith("POST") && d.endsWith("/pulls")));
  });
}
