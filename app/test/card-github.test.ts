// L'histoire et la discussion d'une carte du rail, lues de GitHub par le `gh` du poste (#1735) : jamais d'autre commande que `gh`.
// Contre un faux `gh` en shell, un par test : ni réseau, ni GitHub, ni box.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { discussionOfGitHub } from "../src/card-github.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

// Un faux `gh` : il note ses arguments, rend `reponses[<sous-commande>-<numéro>]` (`issue-12`, `pr-40`), ou échoue avec `erreur`.
function trial(t: TestContext, answers: Record<string, string>, error?: string) {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-fiche-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(answers)) writeFileSync(join(root, name), body);
  const gh = join(root, "gh");
  writeFileSync(gh, ["#!/bin/sh", `D='${root}'`, 'echo "$*" >> "$D/appels"', error === undefined ? 'cat "$D/$1-$3"' : `echo '${error}' >&2; exit 1`].join("\n"));
  chmodSync(gh, 0o755);
  return { reglages: { gh, delaiMs: 60_000 }, appels: () => readFileSync(join(root, "appels"), "utf8").split("\n").filter(Boolean) };
}

const ISSUE = JSON.stringify({
  title: "Read the history from GitHub",
  state: "CLOSED",
  body: "Le corps, avec https://example.com/un.",
  author: { login: "benomite" },
  createdAt: "2026-10-14T08:00:00Z",
  closedAt: "2026-10-14T11:00:00Z",
  closedByPullRequestsReferences: [{ number: 40 }],
  comments: [{ author: { login: "brigade" }, createdAt: "2026-10-14T09:00:00Z", body: "<!-- brigade:manager -->\nUn commentaire" }],
});

describe("la discussion d'une carte, lue de GitHub", () => {
  test("le corps puis les commentaires, du plus ancien au plus récent, par `gh issue view` sur le dépôt du projet", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, appels: calls } = trial(t, { "issue-12": ISSUE });
    const readEntry = await discussionOfGitHub(settings, "acme/kitchen", 12);
    assert.ok(!("sans" in readEntry));
    assert.equal(readEntry.titre, "Read the history from GitHub");
    assert.equal(readEntry.ouverte, false);
    assert.deepEqual(readEntry.messages.map(({ auteur: author, at, corps: body }) => [author, at, body === true]), [
      ["benomite", "2026-10-14 08:00 UTC", true],
      ["brigade", "2026-10-14 09:00 UTC", false],
    ]);
    assert.deepEqual(calls(), ["issue view 12 --repo acme/kitchen --json title,state,body,author,createdAt,comments"]);
  });

  test("une issue absente de GitHub se dit en une phrase ; une panne ou une forme inattendue ne sont pas « rien à lire »", { skip: WITHOUT_POSIX }, async (t) => {
    const absent = await discussionOfGitHub(trial(t, {}, "GraphQL: Could not resolve to an issue or pull request with the number of 12.").reglages, "acme/kitchen", 12);
    assert.deepEqual(absent, { sans: "no issue to read: acme/kitchen#12 is not on GitHub: there is nothing to read" });
    const outage = await discussionOfGitHub(trial(t, {}, "network is down").reglages, "acme/kitchen", 12);
    assert.ok("sans" in outage && outage.sans.startsWith("not read:") && outage.sans.includes("network is down"));
    const unreadable = await discussionOfGitHub(trial(t, { "issue-12": "{}" }).reglages, "acme/kitchen", 12);
    assert.ok("sans" in unreadable && unreadable.sans.startsWith("not read:"));
    assert.deepEqual(await discussionOfGitHub(trial(t, {}).reglages, "acme/kitchen", "x"), { sans: "not read: the sheet names no ticket" });
  });
});
