// Un cook qui prouve que le ticket est déjà satisfait sur la base l'a servi
// (#3146) : le ticket est fermé avec le commit, sans échec compté — si la
// station confirme l'affirmation. Sinon, un essai raté comme avant.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { MARQUE_DEJA_SERVI, verifierDejaServi } from "../src/deja-servi.ts";
import { HORS_CUISINE } from "../src/github.ts";
import type { LanceurGit, SortieGit } from "../src/integration-base.ts";
import { lireDejaServi } from "../src/livrable.ts";
import { MARQUE_D_ECHEC } from "../src/qualite-github.ts";
import { FauxGitHub, fauxClient } from "./faux-github.ts";

const TICKET = 3146;
const SHA = "0123456789abcdef0123456789abcdef01234567";
const CORPS = "## Context\n\nThe alert is wrong.\n\n## Acceptance criteria\n\n- The alert no longer fires on waiting tickets.";
const AFFIRMATION = `The fix is already on main: commit ${SHA.slice(0, 9)} (PR #3100) does it.`;
const ok = (stdout = ""): SortieGit => ({ code: 0, stdout, stderr: "" });
const ko = (stderr = "no"): SortieGit => ({ code: 1, stdout: "", stderr });

// Un git qui répond selon le premier mot de chaque commande, et se souvient des commandes.
function git(reponses: Record<string, SortieGit | ((args: string[]) => SortieGit)>) {
  const vues: string[][] = [];
  const lanceur: LanceurGit = async (args) => {
    vues.push(args);
    const reponse = reponses[args[0] === "merge-base" || args[0] === "rev-parse" ? args[0] : (args[0] ?? "")] ?? ok();
    return typeof reponse === "function" ? reponse(args) : reponse;
  };
  return { lanceur, vues };
}
const vert = async () => ({ vert: true, resume: "", detail: "" });

test("the cook's delimited statement is read like a block: last closed delimitation, empty or unclosed says nothing (#3146)", () => {
  assert.equal(lireDejaServi(`avant <deja-servi>${AFFIRMATION}</deja-servi> après`), AFFIRMATION);
  assert.equal(lireDejaServi("<deja-servi></deja-servi>"), null);
  assert.equal(lireDejaServi("<deja-servi>jamais fermé"), null);
  assert.equal(lireDejaServi("rien"), null);
});

test("a commit on the integration branch with green gates is confirmed, and the gates play on the base (#3146)", async () => {
  const { lanceur, vues } = git({ "rev-parse": ok(`${SHA}\n`), log: ok("Merge pull request #3100\n") });
  const verdict = await verifierDejaServi({ git: lanceur, worktree: "/w", base: "main", affirmation: AFFIRMATION, gates: vert });
  assert.deepEqual(verdict, { servi: { sha: SHA, sujet: "Merge pull request #3100" } });
  const ordre = vues.map((args) => args[0]);
  assert.ok(ordre.indexOf("merge") > ordre.indexOf("merge-base"), "the worktree is brought to the base after the commit is found on it");
});

test("a claim that does not hold is refused: no commit named, commit not on the base, base unreachable, dirty worktree, red or unrun gates (#3146)", async () => {
  const refus = async (reponses: Parameters<typeof git>[0], affirmation = AFFIRMATION, gates: Parameters<typeof verifierDejaServi>[0]["gates"] = vert) => {
    const verdict = await verifierDejaServi({ git: git({ "rev-parse": ok(`${SHA}\n`), ...reponses }).lanceur, worktree: "/w", base: "main", affirmation, gates });
    assert.ok("refus" in verdict, JSON.stringify(verdict));
    return verdict.refus;
  };
  assert.match(await refus({}, "It is already done, trust me."), /names no commit/);
  assert.match(await refus({ "merge-base": ko() }), /is on `origin\/main`/);
  assert.match(await refus({ "rev-parse": ko("unknown revision") }), /is on `origin\/main`/);
  assert.match(await refus({ fetch: ko("network down") }), /network down/);
  assert.match(await refus({ status: ok(" M a.ts\n") }), /left changes/);
  assert.match(await refus({ merge: ko("not possible to fast-forward") }), /fast-forward/);
  assert.match(await refus({}, AFFIRMATION, async () => ({ vert: false, resume: "FAIL tests", detail: "" })), /gates are red.*FAIL tests/);
  assert.match(await refus({}, AFFIRMATION, async () => null), /gates could not be run/);
});

test("a git that cannot even be launched refuses the claim instead of failing the round (#3146)", async () => {
  const verdict = await verifierDejaServi({ git: async () => { throw new Error("spawn git ENOENT"); }, worktree: "/w", base: "main", affirmation: AFFIRMATION, gates: vert });
  assert.ok("refus" in verdict);
});

// Une station dont le cook ne commite rien et finit sur `message`.
async function cookSansCommit(t: TestContext, message: string, { git: reponses, gates }: { git: Parameters<typeof git>[0]; gates: number }) {
  const repertoire = mkdtempSync(join(tmpdir(), "deja-servi-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:sonnet", "effort:medium"], CORPS);
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const { lanceur } = git(reponses);
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => {
        const worktree = join(repertoire, run);
        mkdirSync(join(worktree, ".claude", "brigade"), { recursive: true });
        writeFileSync(join(worktree, ".claude", "brigade", "gates.sh"), `#!/bin/sh\nexit ${gates}\n`, { mode: 0o755 });
        return { worktree, branche: `cook/${TICKET}-github` };
      },
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 0,
      changes: () => [],
      diff: () => "",
      tete: () => "a".repeat(40),
      lancerGit: (args, cwd) => lanceur(args, cwd),
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    gates: { delaiMs: 30_000 },
    flux: repertoire,
    lancer,
    maintenant: () => new Date("2026-11-09T03:43:00Z"),
    avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) throw new Error(String(station.refus));
  await station.tour();
  await station.calme();
  return { faux, corps: (faux.commentaires.get(TICKET) ?? []).map((c) => c.body) };
}

const DELIMITE = `Checked the history.\n\n<livrable>\n<deja-servi>${AFFIRMATION}</deja-servi>\n</livrable>\n\n<retro></retro>`;

test("replay: the first cook finds the fix already on main, the station confirms it, the issue is closed with the commit and nothing is counted (#3146)", async (t) => {
  const { faux, corps } = await cookSansCommit(t, DELIMITE, { git: { "rev-parse": ok(`${SHA}\n`), log: ok("Merge pull request #3100\n") }, gates: 0 });
  const servi = corps.filter((c) => c.startsWith(MARQUE_DEJA_SERVI));
  assert.equal(servi.length, 1);
  assert.ok(servi[0]?.includes(SHA));
  assert.ok(servi[0]?.includes("Merge pull request #3100"));
  assert.equal(corps.filter((c) => c.startsWith(MARQUE_D_ECHEC)).length, 0);
  assert.equal(faux.ticket(TICKET).labels.has(HORS_CUISINE), false);
  assert.equal(faux.ticket(TICKET).state, "closed");
});

test("the same statement with red gates on the base is an ordinary failed attempt, the ticket stays open (#3146)", async (t) => {
  const { faux, corps } = await cookSansCommit(t, DELIMITE, { git: { "rev-parse": ok(`${SHA}\n`) }, gates: 1 });
  assert.equal(corps.filter((c) => c.startsWith(MARQUE_DEJA_SERVI)).length, 0);
  const echecs = corps.filter((c) => c.startsWith(MARQUE_D_ECHEC));
  assert.equal(echecs.length, 1);
  assert.match(echecs[0] ?? "", /could not confirm it: the gates are red/);
  assert.equal(faux.ticket(TICKET).state, "open");
});

test("the same statement naming a commit absent from the base is an ordinary failed attempt (#3146)", async (t) => {
  const { faux, corps } = await cookSansCommit(t, DELIMITE, { git: { "rev-parse": ok(`${SHA}\n`), "merge-base": ko() }, gates: 0 });
  assert.equal(corps.filter((c) => c.startsWith(MARQUE_DEJA_SERVI)).length, 0);
  assert.equal(corps.filter((c) => c.startsWith(MARQUE_D_ECHEC)).length, 1);
  assert.equal(faux.ticket(TICKET).state, "open");
});
