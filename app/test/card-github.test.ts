// L'histoire et la discussion d'une carte du rail, lues de GitHub par le `gh` du poste (#1735) : jamais d'autre commande que `gh`.
// Contre un faux `gh` en shell, un par test : ni réseau, ni GitHub, ni box.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { discussionOfGitHub, storyOfGitHub } from "../src/card-github.ts";
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
const PR = JSON.stringify({ createdAt: "2026-10-14T09:30:00Z", mergedAt: "2026-10-14T10:30:00Z" });

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
    assert.deepEqual(readEntry.liens, ["https://example.com/un"]);
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

describe("l'histoire d'une carte, lue de GitHub", () => {
  test("arrivée, livraison et merge de sa PR, dans l'ordre ; le coût et la rétro, que GitHub ne porte pas, sont dits non communiqués", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, appels: calls } = trial(t, { "issue-12": ISSUE, "pr-40": PR });
    const story = await storyOfGitHub(settings, "acme/kitchen", 12);
    assert.ok("etapes" in story);
    assert.deepEqual(story.etapes, [
      { libelle: "arrived", at: "2026-10-14 08:00 UTC" },
      { libelle: "delivered (PR of #12)", at: "2026-10-14 09:30 UTC" },
      { libelle: "merged (PR of #12)", at: "2026-10-14 10:30 UTC" },
    ]);
    assert.deepEqual(story.cout, { tokens: "not communicated", duree: "not communicated", essais: "not communicated", minimum: false });
    assert.ok("sans" in story.retro);
    assert.equal(calls().length, 2);
  });

  test("une issue fermée sans PR mergée le dit ; une issue absente de GitHub, en une phrase", { skip: WITHOUT_POSIX }, async (t) => {
    const closes = JSON.stringify({ createdAt: "2026-10-14T08:00:00Z", closedAt: "2026-10-14T11:00:00Z", state: "CLOSED", closedByPullRequestsReferences: [] });
    const story = await storyOfGitHub(trial(t, { "issue-12": closes }).reglages, "acme/kitchen", 12);
    assert.ok("etapes" in story);
    assert.deepEqual(story.etapes.map(({ libelle: wording }) => wording), ["arrived", "closed without a merge"]);
    const absent = await storyOfGitHub(trial(t, {}, "HTTP 404: Not Found").reglages, "acme/kitchen", 12);
    assert.ok("sans" in absent && absent.sans.includes("is not on GitHub"));
  });

  // Ticket 3716 : GitHub numérote issues et PR d'une seule suite — la PR #40 de #12 se lirait comme un ticket.
  test("la livraison et le merge disent la PR par son ticket : « PR of #12 », jamais « #40 » (ticket 3716)", { skip: WITHOUT_POSIX }, async (t) => {
    const story = await storyOfGitHub(trial(t, { "issue-12": ISSUE, "pr-40": PR }).reglages, "acme/kitchen", 12);
    assert.ok("etapes" in story);
    const wordings = story.etapes.map(({ libelle: wording }) => wording);
    assert.deepEqual(wordings.filter((wording) => wording.includes("PR")), ["delivered (PR of #12)", "merged (PR of #12)"]);
    assert.ok(wordings.every((wording) => !wording.includes("#40")), wordings.join(" | "));
  });
});
