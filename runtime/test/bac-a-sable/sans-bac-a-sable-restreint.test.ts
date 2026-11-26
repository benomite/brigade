// Un cook lancé sans bac à sable (Seatbelt inutilisable, le chef a accepté de
// continuer sans) part en mode restreint : plus de `bypassPermissions`, des
// réglages `--settings` qui refusent les lectures interdites et le réseau hors
// liste, et le crochet de la garde (#3506).
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { LECTURES_INTERDITES } from "../../src/bac-a-sable/configuration.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";
import { repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

async function cookSansBacASable(t: Parameters<typeof repertoireTemporaire>[0]) {
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
    avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) throw new Error("station refusée");
  await station.tour();
  await station.calme();
  const cook = lancements.find(({ cwd }) => cwd === join(repertoire, "11-github"));
  assert.ok(cook, JSON.stringify(lancements));
  return cook;
}

test("un cook sans bac à sable part sans `bypassPermissions`, avec des réglages `--settings` : chaque lecture interdite refusée, le réseau hors liste refusé, le crochet de la garde posé", async (t) => {
  const cook = await cookSansBacASable(t);
  assert.ok(!cook.args.includes("bypassPermissions"), cook.args.join(" "));
  assert.equal(cook.args.filter((arg) => arg === "--settings").length, 1);
  const reglages = JSON.parse(cook.args[cook.args.indexOf("--settings") + 1] ?? "{}") as {
    permissions?: { defaultMode?: string; deny?: string[]; allow?: string[] };
    hooks?: { PreToolUse?: Array<{ hooks: Array<{ command: string }> }> };
  };
  assert.equal(cook.args[cook.args.indexOf("--permission-mode") + 1] ?? reglages.permissions?.defaultMode, "dontAsk");
  const refus = (reglages.permissions?.deny ?? []).join("\n");
  for (const relatif of LECTURES_INTERDITES) assert.ok(refus.includes(relatif), `${relatif} absent des refus : ${refus}`);
  // Le réseau : aucun accès ouvert à tout hôte, et un hôte hors liste n'est pas permis.
  const permis = reglages.permissions?.allow ?? [];
  assert.ok(!permis.some((regle) => regle === "WebFetch" || regle === "WebSearch"), permis.join("\n"));
  assert.ok(!JSON.stringify(permis).includes("evil.example.com"));
  assert.ok(!permis.some((regle) => /^WebFetch\(domain:\*\)$/.test(regle)), permis.join("\n"));
  // Le crochet de la garde, comme aujourd'hui.
  const crochet = reglages.hooks?.PreToolUse?.[0];
  assert.equal(crochet?.hooks[0]?.command.includes("crochet.ts"), true);
});

test("sans-bac-a-sable-restreint.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
