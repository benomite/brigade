// La garde posée par la station elle-même (#3506) : le cook qu'elle lance
// reçoit, dans ses réglages, le crochet qui garde ses appels d'outil — sur
// son worktree, son ticket, son dépôt, sa branche —, et part toujours sans
// demande de permission.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";
import { ENV_ENFANT, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

type Reglages = { hooks?: { PreToolUse?: Array<{ matcher: string; hooks: Array<{ command: string }> }> } };

const repondre = (commande: string, entree: string) =>
  new Promise<string>((resoudre, rejeter) => {
    const enfant = spawn("/bin/sh", ["-c", commande], { stdio: ["pipe", "pipe", "pipe"], env: ENV_ENFANT });
    let sortie = "";
    enfant.stdout.setEncoding("utf8").on("data", (morceau: string) => (sortie += morceau));
    enfant.on("error", rejeter).on("close", () => resoudre(sortie));
    enfant.stdin.end(entree);
  });

test("le cook que la station lance part sans demande de permission, gardé : une écriture hors de son worktree, ou un `gh` sur un autre ticket, est refusé ; dans son worktree, son issue, cela passe", { skip: posixOnly("the hook command is read by /bin/sh") }, async (t) => {
  const repertoire = repertoireTemporaire(t);
  const faux = new FauxGitHub();
  faux.feu(11, ["fire", "model:opus", "effort:high"]);
  const lancements: Array<{ args: string[]; cwd: string }> = [];
  const lancer: Lancer = ({ args, cwd, flux }) => {
    lancements.push({ args, cwd });
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => {
        mkdirSync(join(repertoire, run));
        return { worktree: join(repertoire, run), branche: `cook/${run}` };
      },
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => ["a.ts"],
      diff: () => "diff --git a/a.ts b/a.ts\n+x\n",
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: (texte) => assert.fail(texte),
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  const cook = lancements.find(({ cwd }) => cwd === join(repertoire, "11-github"));
  assert.ok(cook, JSON.stringify(lancements));
  // Aucune demande de permission ajoutée : le mode reste celui d'avant.
  assert.equal(cook.args[cook.args.indexOf("--permission-mode") + 1], "bypassPermissions");
  assert.equal(cook.args.filter((arg) => arg === "--settings").length, 1);
  const reglages = JSON.parse(cook.args[cook.args.indexOf("--settings") + 1] ?? "{}") as Reglages;
  const [crochet] = reglages.hooks?.PreToolUse ?? [];
  assert.equal(crochet?.matcher, "Write|Edit|MultiEdit|NotebookEdit|Bash");
  const commande = crochet?.hooks[0]?.command ?? "";
  const appel = (tool_name: string, tool_input: object) => JSON.stringify({ hook_event_name: "PreToolUse", tool_name, tool_input, cwd: cook.cwd });
  const [dedans, dehors, sonIssue, autreTicket] = await Promise.all([
    repondre(commande, appel("Write", { file_path: join(cook.cwd, "a.ts"), content: "" })),
    repondre(commande, appel("Write", { file_path: "/etc/brigade-garde-test", content: "" })),
    repondre(commande, appel("Bash", { command: "gh issue comment 11 --body ok" })),
    repondre(commande, appel("Bash", { command: "gh pr edit cook/12-github --add-label fire" })),
  ]);
  assert.deepEqual([dedans, sonIssue], ["", ""]);
  const refus = (sortie: string) => (JSON.parse(sortie) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } }).hookSpecificOutput;
  assert.equal(refus(dehors).permissionDecision, "deny");
  assert.match(refus(dehors).permissionDecisionReason, new RegExp(`hors de ton worktree \\(${cook.cwd.replaceAll("/", "\\/")}\\)`));
  assert.equal(refus(autreTicket).permissionDecision, "deny");
  assert.match(refus(autreTicket).permissionDecisionReason, /PR d'une autre branche : un cook n'écrit que sur la sienne, cook\/11-github/);
});

test("station.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
