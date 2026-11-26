// #4349 — the restricted settings never weaken the #3506 guard.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { test, type TestContext } from "node:test";
import type { BacASableLocal } from "../../src/bac-a-sable/local.ts";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import type { GitHub } from "../../src/github.ts";
import { DEPOT, issueGitHub } from "../outils.ts";

const HOME = "/Users/chef";
const WORKTREES = `${HOME}/brigade-wt`;
const ENV_DU_CHEF = { PATH: "/usr/bin:/bin", HOME };
const NUMERO = 4349;
const fluxQuiConclut = `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`;

type Lance = { args: string[]; entree: string; env: NodeJS.ProcessEnv };

// Un cook lancé sur le chemin GitHub seul ; `bac` nul : la machine n'a pas de
// bac à sable utilisable, et le chef a décidé de cuire sans.
function cuisine(t: TestContext, bac: BacASableLocal | null) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-4349-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const lances: Lance[] = [];
  const lancer: Lancer = ({ args, entree, env, flux }) => {
    lances.push({ args, entree: entree ?? "", env });
    writeFileSync(flux, fluxQuiConclut);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const client: Partial<GitHub> = {
    tickets: async () => ({ inchange: false, issues: [{ ...issueGitHub(NUMERO), number: NUMERO, title: "Restricted mode", labels: ["fire", "model:opus", "effort:high"], state: "open", createdAt: "", updatedAt: "", url: "" }], confirmer: () => {} }) as never,
    prDeBranche: async () => null,
    ci: async () => [{ name: "tests", conclusion: "success", outcome: "green", url: null }] as never,
    issue: async (numero) => ({ number: numero, title: "Restricted mode", labels: [], state: "open", createdAt: "", updatedAt: "", url: "", body: "Ticket body." }),
    commentaires: async () => [],
    commenter: async () => {},
    labelliser: async () => {},
    delabelliser: async () => {},
    ouvrirPR: async () => "https://github.com/acme/brigade/pull/1",
    mettreAJour: async () => {},
    merger: async () => ({ merged: true }) as never,
    retraitsDeLabels: async () => [],
    prsOuvertes: async () => [],
  };
  const station = stationDuDepot({
    nom: "macbook/claude",
    places: 1,
    base: "main",
    depotGitHub: DEPOT,
    github: client as GitHub,
    depot: {
      preparer: async (run) => ({ worktree: posix.join(WORKTREES, run), branche: `cook/${run}` }),
      reprendre: async (run) => posix.join(WORKTREES, run),
      connait: () => false,
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => [],
      diff: () => "",
      tete: () => "a".repeat(40),
    },
    prise: () => ({ prendre: async () => ({ prise: true }), lacher: async () => true }),
    claude: "claude",
    env: ENV_DU_CHEF,
    cloison: null,
    bacASable: bac,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: (texte) => {
      if (!/the cook stopped without a delivery/.test(texte)) assert.fail(texte);
    },
  });
  assert.ok(!("refus" in station), "refus" in station ? station.refus : "");
  const servir = async () => {
    if ("refus" in station) return;
    await station.tour();
    await station.calme();
  };
  return { servir, lances };
}

test("without the sandbox, the #3506 guard is attached exactly once, over Write, Edit and Bash, and the push/merge denials still hold", async (t) => {
  const { servir, lances } = cuisine(t, null);
  await servir();

  const [cook] = lances;
  assert.ok(cook);
  // Restricted settings replace the guard-less bypass...
  assert.ok(!cook.args.includes("bypassPermissions"), cook.args.join(" "));
  assert.equal(cook.args.filter((arg) => arg === "--settings").length, 1);
  const reglages = JSON.parse(cook.args[cook.args.indexOf("--settings") + 1] ?? "{}") as { hooks?: { PreToolUse?: Array<{ matcher: string; hooks: Array<{ command: string }> }> } };
  // ...and the guard is in them, untouched.
  const gardes = (reglages.hooks?.PreToolUse ?? []).filter((c) => c.hooks.some((h) => h.command.includes("crochet.ts")));
  assert.equal(gardes.length, 1);
  const [garde] = gardes;
  assert.ok(garde);
  for (const outil of ["Write", "Edit", "Bash"]) assert.ok(garde.matcher.split("|").includes(outil), garde.matcher);
  // The command carries the cook's own worktree and ticket.
  const commande = decodeURIComponent(garde.hooks[0]?.command ?? "");
  assert.ok(commande.includes(`${WORKTREES}/`), commande);
  assert.ok(commande.includes(`"ticket":${NUMERO}`), commande);
  // The tool denials of the guard-less launch are kept.
  const interdits = cook.args[cook.args.indexOf("--disallowedTools") + 1] ?? "";
  assert.match(interdits, /git push/);
  assert.match(interdits, /gh pr merge/);
});
