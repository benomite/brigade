// Frozen acceptance test (#4239). Criterion 5: both changes are delivered through the project's normal change path (a pull request, as `proposerLeFichier` of plafonds-duree.ts does), not written silently in place.
// Contract, in `app/src/vue/know-how/know-how-github.ts`:
//   proposerLeChangement(client, depot, branche, { kind: "edit"; line: number; text: string } | { kind: "remove"; line: number }): Promise<{ pr: string; numero: number }>
import assert from "node:assert/strict";
import { test } from "node:test";
import { proposerLeChangement } from "../../src/vue/know-how/know-how-github.ts";
import type { ClientDeLaPriorite } from "../../src/priorite.ts";

// The fixture file (line 0 is the title, line 4 the second Conventions entry).
const SAVOIR = ["# Know-how", "", "## Conventions", "- Tests live next to the code (#101)", "- Identifiers are in French (#102)", "", "## Pitfalls", "- Never run the pass with a dirty tree (#205)", "", "## Tools", "- Use `gh api` for rate limits (#310)", "- A tool nobody ticketed", ""].join("\n");

const CHEMIN = ".brigade/know-how.md";

function github() {
  const branches = new Map<string, string>([["main", SAVOIR]]);
  const demandes: string[] = [];
  const prs: Record<string, unknown>[] = [];
  const client: ClientDeLaPriorite = {
    lire: async (chemin) => {
      demandes.push(`GET ${chemin}`);
      if (chemin.includes("/git/ref/heads/")) return { status: 200, data: { object: { sha: "tete" } } };
      const ref = decodeURIComponent(chemin.split("?ref=")[1] ?? "main");
      const texte = branches.get(ref);
      if (chemin.includes(`/contents/${CHEMIN}`) && texte !== undefined) return { status: 200, data: { type: "file", content: Buffer.from(texte).toString("base64"), sha: `sha-${ref}` } };
      return { status: 404, data: { message: "Not Found" } };
    },
    ecrire: async (methode, chemin, corps) => {
      demandes.push(`${methode} ${chemin}`);
      const recu = (corps ?? {}) as Record<string, unknown>;
      if (methode === "POST" && chemin.endsWith("/git/refs")) {
        branches.set(String(recu.ref).replace("refs/heads/", ""), SAVOIR);
        return { status: 201, data: {} };
      }
      if (methode === "PUT" && chemin.includes(`/contents/${CHEMIN}`)) {
        branches.set(String(recu.branch ?? "main"), Buffer.from(String(recu.content), "base64").toString("utf8"));
        return { status: 200, data: { content: { sha: "neuf" } } };
      }
      if (methode === "POST" && chemin.endsWith("/pulls")) {
        prs.push(recu);
        return { status: 201, data: { number: 77, html_url: "https://github.com/chef/parade/pull/77" } };
      }
      return { status: 404, data: {} };
    },
  };
  return { client, branches, demandes, prs };
}

for (const [nom, changement, attendu] of [
  ["an edit", { kind: "edit", line: 4, text: "Identifiers are in English" }, "- Identifiers are in English (#102)"],
  ["a removal", { kind: "remove", line: 4 }, null],
] as const) {
  test(`${nom} opens a pull request and leaves the base branch untouched`, async () => {
    const { client, branches, demandes, prs } = github();
    const rendu = await proposerLeChangement(client, "chef/parade", "main", changement);
    assert.equal(rendu.numero, 77);
    assert.equal(prs.length, 1);
    assert.equal(prs[0]?.base, "main");
    assert.equal(branches.get("main"), SAVOIR, "main must not be written in place");
    const branche = [...branches.keys()].find((b) => b !== "main");
    assert.ok(branche, "the change lands on a new branch");
    const avant = SAVOIR.split("\n");
    const apres = (branches.get(branche) ?? "").split("\n");
    if (attendu === null) assert.equal(apres.length, avant.length - 1);
    else assert.equal(apres[4], attendu);
    assert.ok(demandes.some((d) => d.startsWith("POST") && d.endsWith("/pulls")));
  });
}
