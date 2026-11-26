// #4349 — the chef decides to continue without the sandbox: the kitchen opens
// on a Mac with no Seatbelt and says it runs in restricted mode.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Sondes } from "../../src/bac-a-sable/detection.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { accepterSansBacASable } from "../../src/onboarding/attente.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { FAUX_CLAUDE, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const DECIDE = {
  BRIGADE_STATIONS: "mac/claude:2:code",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "medium",
};
// A Mac whose Seatbelt is missing.
const MAC_SANS_SEATBELT: Sondes = { plateforme: "darwin", existe: () => false, versionDeClaude: () => "2.1.300 (Claude Code)\n" };

test("on a Mac with no sandbox, once the chef has decided to continue, the kitchen opens and its station line says `restricted mode: no sandbox`", { skip: posixOnly("opens a kitchen with Mac probes; its paths live in the test's temporary directory, a drive path on Windows") }, (t) => {
  const racine = repertoireTemporaire(t);
  const etat = join(racine, "etat");
  const clone = join(racine, "clone");
  const session = join(racine, ".session");
  mkdirSync(clone);
  mkdirSync(session);
  git(clone, "init", "-q");
  mkdirSync(etat);
  const journal = ouvrirJournal(etat);
  for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  accepterSansBacASable({ repertoireEtat: etat, station: "mac" });
  const dits: string[] = [];
  const cuisine = ouvrirCuisine(
    {
      HOME: "/Users/chef",
      BRIGADE_STATE_DIR: etat,
      BRIGADE_PROJECT: "brigade",
      BRIGADE_GITHUB_REPO: "acme/brigade",
      BRIGADE_GH_BIN: join(racine, "gh-absent"),
      BRIGADE_REPO_DIR: clone,
      BRIGADE_BASE_BRANCH: "v2",
      BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
      BRIGADE_SESSION_DIR: session,
      BRIGADE_SANDBOX_CACHES: join(racine, "caches"),
    },
    { dire: (ligne) => void dits.push(ligne), sondes: MAC_SANS_SEATBELT },
  );
  cuisine.arreter("fin du test");
  assert.ok(
    dits.some((ligne) => /restricted mode: no sandbox/.test(ligne)),
    dits.join("\n"),
  );
});

test("3-continue-without-sandbox-opens-the-kitchen-in-restricted-mode.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
