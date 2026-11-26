// #4349 — a cook launched without the sandbox runs in restricted mode.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { test, type TestContext } from "node:test";
import { LECTURES_INTERDITES } from "../../src/bac-a-sable/configuration.ts";
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

const reglagesDe = (lance: Lance) => {
  const place = lance.args.indexOf("--settings");
  assert.notEqual(place, -1, `no --settings in: ${lance.args.join(" ")}`);
  return JSON.parse(lance.args[place + 1] ?? "{}");
};

test("without the sandbox, the cook's arguments have no bypassPermissions and carry --settings: every forbidden read denied, network held to the host list, the guard hook attached", async (t) => {
  const { servir, lances } = cuisine(t, null);
  await servir();

  assert.equal(lances.length, 1);
  const [cook] = lances;
  assert.ok(cook);
  assert.ok(!cook.args.includes("bypassPermissions"), cook.args.join(" "));
  const reglages = reglagesDe(cook);
  const texte = JSON.stringify(reglages);
  // Every entry of the forbidden-read list is named.
  for (const entree of LECTURES_INTERDITES) assert.ok(texte.includes(`${HOME}/${entree}`), `${entree} is not denied: ${texte}`);
  // Network: dontAsk refuses what no rule allows; a host outside the list is not allowed, and no blanket WebFetch/WebSearch is.
  assert.ok(cook.args[cook.args.indexOf("--permission-mode") + 1] === "dontAsk" || reglages.permissions?.defaultMode === "dontAsk");
  const permises: string[] = reglages.permissions?.allow ?? [];
  assert.ok(!permises.includes("WebFetch") && !permises.includes("WebSearch"), permises.join(", "));
  assert.ok(!permises.some((regle) => regle.includes("evil.example")));
  // The guard hook is in the settings.
  const crochets: Array<{ hooks: Array<{ command: string }> }> = reglages.hooks?.PreToolUse ?? [];
  assert.ok(
    crochets.some((c) => c.hooks.some((h) => h.command.includes("crochet.ts"))),
    texte,
  );
});
