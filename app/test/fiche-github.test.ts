// L'histoire et la discussion d'une carte du rail, lues de GitHub par le `gh` du poste (#1735) : jamais de `ssh`.
// Contre un faux `gh` en shell, un par test : ni réseau, ni GitHub, ni box.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { discussionDeGitHub, histoireDeGitHub } from "../src/fiche-github.ts";
import { SANS_POSIX } from "./aides/posix.ts";

// Un faux `gh` : il note ses arguments, rend `reponses[<sous-commande>-<numéro>]` (`issue-12`, `pr-40`), ou échoue avec `erreur`.
function essai(t: TestContext, reponses: Record<string, string>, erreur?: string) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-fiche-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  for (const [nom, corps] of Object.entries(reponses)) writeFileSync(join(racine, nom), corps);
  const gh = join(racine, "gh");
  writeFileSync(gh, ["#!/bin/sh", `D='${racine}'`, 'echo "$*" >> "$D/appels"', erreur === undefined ? 'cat "$D/$1-$3"' : `echo '${erreur}' >&2; exit 1`].join("\n"));
  chmodSync(gh, 0o755);
  return { reglages: { gh, delaiMs: 60_000 }, appels: () => readFileSync(join(racine, "appels"), "utf8").split("\n").filter(Boolean) };
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
  test("le corps puis les commentaires, du plus ancien au plus récent, par `gh issue view` sur le dépôt du projet", { skip: SANS_POSIX }, async (t) => {
    const { reglages, appels } = essai(t, { "issue-12": ISSUE });
    const lue = await discussionDeGitHub(reglages, "acme/kitchen", 12);
    assert.ok(!("sans" in lue));
    assert.equal(lue.titre, "Read the history from GitHub");
    assert.equal(lue.ouverte, false);
    assert.deepEqual(lue.messages.map(({ auteur, at, corps }) => [auteur, at, corps === true]), [
      ["benomite", "2026-10-14 08:00 UTC", true],
      ["brigade", "2026-10-14 09:00 UTC", false],
    ]);
    assert.deepEqual(lue.liens, ["https://example.com/un"]);
    assert.deepEqual(appels(), ["issue view 12 --repo acme/kitchen --json title,state,body,author,createdAt,comments"]);
  });

  test("une issue absente de GitHub se dit en une phrase ; une panne ou une forme inattendue ne sont pas « rien à lire »", { skip: SANS_POSIX }, async (t) => {
    const absente = await discussionDeGitHub(essai(t, {}, "GraphQL: Could not resolve to an issue or pull request with the number of 12.").reglages, "acme/kitchen", 12);
    assert.deepEqual(absente, { sans: "no issue to read: acme/kitchen#12 is not on GitHub: there is nothing to read" });
    const panne = await discussionDeGitHub(essai(t, {}, "network is down").reglages, "acme/kitchen", 12);
    assert.ok("sans" in panne && panne.sans.startsWith("not read:") && panne.sans.includes("network is down"));
    const illisible = await discussionDeGitHub(essai(t, { "issue-12": "{}" }).reglages, "acme/kitchen", 12);
    assert.ok("sans" in illisible && illisible.sans.startsWith("not read:"));
    assert.deepEqual(await discussionDeGitHub(essai(t, {}).reglages, "acme/kitchen", "x"), { sans: "not read: the sheet names no ticket" });
  });
});

describe("l'histoire d'une carte, lue de GitHub", () => {
  test("arrivée, livraison et merge de sa PR, dans l'ordre ; le coût et la rétro, que GitHub ne porte pas, sont dits non communiqués", { skip: SANS_POSIX }, async (t) => {
    const { reglages, appels } = essai(t, { "issue-12": ISSUE, "pr-40": PR });
    const histoire = await histoireDeGitHub(reglages, "acme/kitchen", 12);
    assert.ok("etapes" in histoire);
    assert.deepEqual(histoire.etapes, [
      { libelle: "arrived", at: "2026-10-14 08:00 UTC" },
      { libelle: "delivered (PR #40)", at: "2026-10-14 09:30 UTC" },
      { libelle: "merged (PR #40)", at: "2026-10-14 10:30 UTC" },
    ]);
    assert.deepEqual(histoire.cout, { tokens: "not communicated", duree: "not communicated", essais: "not communicated", minimum: false });
    assert.ok("sans" in histoire.retro);
    assert.equal(appels().length, 2);
  });

  test("une issue fermée sans PR mergée le dit ; une issue absente de GitHub, en une phrase", { skip: SANS_POSIX }, async (t) => {
    const ferme = JSON.stringify({ createdAt: "2026-10-14T08:00:00Z", closedAt: "2026-10-14T11:00:00Z", state: "CLOSED", closedByPullRequestsReferences: [] });
    const histoire = await histoireDeGitHub(essai(t, { "issue-12": ferme }).reglages, "acme/kitchen", 12);
    assert.ok("etapes" in histoire);
    assert.deepEqual(histoire.etapes.map(({ libelle }) => libelle), ["arrived", "closed without a merge"]);
    const absente = await histoireDeGitHub(essai(t, {}, "HTTP 404: Not Found").reglages, "acme/kitchen", 12);
    assert.ok("sans" in absente && absente.sans.includes("is not on GitHub"));
  });
});
