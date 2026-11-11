// Les gates d'un projet neuf tant que son ticket de fondation n'est pas servi
// (#3188) : la règle seule, puis la station de ce runtime qui la tient sur le
// chemin du merge — celui de l'espace (#2456), sans CI sur les PR, où la
// station joue les gates de la tête approuvée.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ditProvisoires, gatesQuiNeJugentPas, LABEL_FONDATION, lanceUneCommande } from "../../src/fondation/fondation.ts";
import { MARQUE_DEJA_SERVI } from "../../src/deja-servi.ts";
import type { GitHub } from "../../src/github.ts";
import { MARQUE_D_ECHEC } from "../../src/qualite-github.ts";
import { CALIBRE, FauxGitHub, fauxClient } from "../faux-github.ts";

// Le `CLAUDE.md` qu'écrit `/brigade:init` sur un projet neuf (`commands/init.md`,
// étape 5), et celui d'un projet dont les gates sont les vraies.
const PROVISOIRES = `# Project\n\n## Équipe multi-agents (plugin brigade)\n\n- **Gates** : \`.claude/brigade/gates.sh <WT>\`\n- **Gates provisoires** : until #1 ("Lay the project's foundation with TypeScript on Node") is merged — \`npm test\` has no test to run yet\n`;
const REELLES = `# Project\n\n## Équipe multi-agents (plugin brigade)\n\n- **Gates** : \`.claude/brigade/gates.sh <WT>\`\n`;
// Le `gates.sh` de `commands/init.md` (étape 6), avec et sans commande de test.
const ENTETE = `#!/usr/bin/env bash\n# Verdict des gates du projet. Le code de sortie EST le verdict : 0 = vert.\n# Usage : gates.sh [<worktree>]\nset -euo pipefail\nWT="\${1:-$(git rev-parse --show-toplevel)}"\ncd "$WT"\n`;
const AVEC_NPM_TEST = `${ENTETE}npm test\n`;
const SANS_COMMANDE = `${ENTETE}\n# The test command comes with the foundation ticket.\n`;

test("a `gates.sh` runs a test command, or runs nothing: comments, `set`, `cd`, assignments, `:`, `true` and an `exit` run nothing; in doubt, a line is a command", () => {
  assert.equal(lanceUneCommande(AVEC_NPM_TEST), true);
  assert.equal(lanceUneCommande(SANS_COMMANDE), false);
  assert.equal(lanceUneCommande("#!/bin/sh\nexit 0\n"), false);
  assert.equal(lanceUneCommande("#!/bin/sh\ntrue\n"), false);
  assert.equal(lanceUneCommande(""), false);
  assert.equal(lanceUneCommande("#!/bin/sh\nexit 0\nnpm test\n"), false, "what follows an exit never runs");
  assert.equal(lanceUneCommande('#!/bin/sh\n: "${DATABASE_URL:?export it}"\nexport CI=1\n'), false);
  assert.equal(lanceUneCommande('#!/bin/sh\ncd "$1" && npm test\n'), true);
  assert.equal(lanceUneCommande("#!/bin/sh\nCI=1 npm test\n"), true);
  assert.equal(lanceUneCommande("#!/bin/sh\ntrue; npm test\n"), true);
  assert.equal(lanceUneCommande("#!/bin/sh\npytest  # the suite\n"), true);
  assert.equal(ditProvisoires(PROVISOIRES), true);
  assert.equal(ditProvisoires(REELLES), false);
});

const worktreeAvec = (t: TestContext, { gates, claudeMd = null }: { gates: string; claudeMd?: string | null }) => {
  const worktree = mkdtempSync(join(tmpdir(), "brigade-fondation-"));
  t.after(() => rmSync(worktree, { recursive: true, force: true }));
  mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
  writeFileSync(join(worktree, ".claude/brigade/gates.sh"), gates);
  if (claudeMd !== null) writeFileSync(join(worktree, "CLAUDE.md"), claudeMd);
  return worktree;
};
const fondation = (state: "open" | "closed") => async () => [{ number: 1, labels: [LABEL_FONDATION, "fire"], state }];
const aucune = async () => [{ number: 2, labels: ["fire"], state: "open" as const }];
const rienALire = () => assert.fail("GitHub is not read on real gates");

test("with no test command and the foundation ticket unserved, an ordinary delivery is judged by nothing: 'the gates run nothing', never green", async (t) => {
  const attendu = /^nothing checked — the gates run nothing until the foundation ticket #1 is merged: no delivery but the `foundation` ticket's is merged on them$/;
  assert.match((await gatesQuiNeJugentPas(worktreeAvec(t, { gates: SANS_COMMANDE }), { labels: ["fire"] }, fondation("open"))) ?? "", attendu);
  // Le projet neuf qu'écrit `/brigade:init` : `npm test` n'a encore rien à jouer, la ligne le dit.
  assert.match((await gatesQuiNeJugentPas(worktreeAvec(t, { gates: AVEC_NPM_TEST, claudeMd: PROVISOIRES }), { labels: ["fire"] }, fondation("open"))) ?? "", attendu);
  // La ligne là, mais aucun ticket de fondation déposé : rien ne les rend réelles.
  assert.match((await gatesQuiNeJugentPas(worktreeAvec(t, { gates: AVEC_NPM_TEST, claudeMd: PROVISOIRES }), { labels: [] }, aucune)) ?? "", /^nothing checked — the gates run nothing until a ticket labelled `foundation` is filed and merged/);
});

test("a gate with no test command never reports success: it reports 'nothing checked', foundation served or not, for every delivery", async (t) => {
  const attendu = "nothing checked — the gates run no test command: `.claude/brigade/gates.sh` runs nothing, and gates that run nothing never pass a delivery";
  assert.equal(await gatesQuiNeJugentPas(worktreeAvec(t, { gates: SANS_COMMANDE }), { labels: ["fire"] }, fondation("closed")), attendu);
  assert.equal(await gatesQuiNeJugentPas(worktreeAvec(t, { gates: "#!/bin/sh\nexit 0\n", claudeMd: REELLES }), { labels: ["fire"] }, aucune), attendu);
  assert.equal(await gatesQuiNeJugentPas(worktreeAvec(t, { gates: SANS_COMMANDE }), { labels: ["fire", LABEL_FONDATION] }, rienALire), attendu, "the foundation must bring its test command");
});

test("the foundation ticket's own delivery is not held by the provisional gates; once it is served, gates with a test command are the real ones", async (t) => {
  assert.equal(await gatesQuiNeJugentPas(worktreeAvec(t, { gates: AVEC_NPM_TEST, claudeMd: PROVISOIRES }), { labels: ["fire", LABEL_FONDATION] }, rienALire), null);
  assert.equal(await gatesQuiNeJugentPas(worktreeAvec(t, { gates: AVEC_NPM_TEST, claudeMd: PROVISOIRES }), { labels: ["fire"] }, fondation("closed")), null, "the binding forgotten after the foundation is merged");
  assert.equal(await gatesQuiNeJugentPas(worktreeAvec(t, { gates: AVEC_NPM_TEST, claudeMd: REELLES }), { labels: ["fire"] }, rienALire), null);
  assert.equal(await gatesQuiNeJugentPas(worktreeAvec(t, { gates: AVEC_NPM_TEST }), { labels: ["fire"] }, rienALire), null);
});

test("an unreadable gates.sh or CLAUDE.md, or foundation tickets GitHub does not return, decide nothing: it is said, and the gates do not judge", async (t) => {
  const sansScript = worktreeAvec(t, { gates: "" });
  rmSync(join(sansScript, ".claude/brigade/gates.sh"));
  mkdirSync(join(sansScript, ".claude/brigade/gates.sh"));
  assert.match((await gatesQuiNeJugentPas(sansScript, { labels: [] }, rienALire)) ?? "", /^the `\.claude\/brigade\/gates\.sh` of the delivery could not be read/);
  const illisible = worktreeAvec(t, { gates: AVEC_NPM_TEST });
  mkdirSync(join(illisible, "CLAUDE.md"));
  assert.match((await gatesQuiNeJugentPas(illisible, { labels: [] }, rienALire)) ?? "", /^the `CLAUDE\.md` of the delivery could not be read/);
  const motif = await gatesQuiNeJugentPas(worktreeAvec(t, { gates: SANS_COMMANDE }), { labels: [] }, async () => {
    throw new Error("HTTP 502");
  });
  assert.equal(motif, "the tickets labelled `foundation` could not be read on GitHub to know whether the gates run anything: HTTP 502");
});

const fluxQuiConclut = (texte: string) => `${JSON.stringify({ type: "result", is_error: false, result: texte })}\n`;

// Le client GitHub du faux, qui rend aussi les issues de toujours, labels compris.
const clientDe = (faux: FauxGitHub) => ({
  ...fauxClient(faux),
  issuesDepuis: async () => [...faux.tickets.values()].map((t) => ({ number: t.number, title: t.title, labels: [...t.labels], state: t.state, createdAt: "", updatedAt: "", url: "", body: t.corps, association: "OWNER" })),
});

// La station de ce runtime sur un projet sans CI sur ses PR : ses worktrees
// portent `claudeMd` et des gates sans commande de test, ou dont la commande
// note où elle tourne, verte ou rouge. Elle cuit, relit et merge `ticket` ;
// rend ce qu'elle a dit et fait.
async function servir(t: TestContext, { faux, ticket, claudeMd = REELLES, gates }: { faux: FauxGitHub; ticket: number; claudeMd?: string; gates: "aucune" | "verte" | "rouge" }) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-fondation-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const lancer: Lancer = ({ args, flux }) => {
    writeFileSync(flux, fluxQuiConclut(args.includes("--tools") ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [] }) : "done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const journal = join(repertoire, "gates.log");
  const worktreeDe = (run: string) => {
    const worktree = join(repertoire, run);
    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    writeFileSync(join(worktree, "CLAUDE.md"), claudeMd);
    const script = join(worktree, ".claude/brigade/gates.sh");
    const commande = `echo "npm test in $1" >> "${journal}"\n${gates === "rouge" ? 'echo "FAIL  adds two numbers"\nexit 1' : 'echo "PASS  adds two numbers"'}\n`;
    writeFileSync(script, gates === "aucune" ? SANS_COMMANDE : `${ENTETE}${commande}`);
    chmodSync(script, 0o755);
    return worktree;
  };
  const avertis: string[] = [];
  const bas = faux.pour("box");
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/neuf",
    github: { ...clientDe(faux), ci: async (sha) => (await bas.ci(sha)).map((check) => ({ ...check, conclusion: "", url: null })), statuts: bas.statuts, poserStatut: bas.poserStatut } as GitHub,
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: worktreeDe(run), branche: `cook/${run}` }),
      reprendre: async (run) => worktreeDe(run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => ["src/app.ts"],
      diff: () => "diff --git a/src/app.ts b/src/app.ts\n+x\n",
      tete: (branche) => faux.prs.findLast((p) => p.branche === branche)?.sha ?? "",
      vue: () => "e5ba5e",
      fichiers: () => ["src/app.ts"],
      lire: () => null,
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
    gates: { delaiMs: 2_000 },
    avertir: (texte) => void avertis.push(texte),
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) throw new Error("inaccessible");
  await station.tour();
  await station.calme();
  const pr = faux.prs.find((p) => p.issue === ticket);
  assert.ok(pr, "the cook's delivery is in the pass");
  faux.sansCI.add(pr.number);
  const statuts = () => (faux.statutsDeCommit.get(pr.sha) ?? []).map(({ state, description }) => [state, description]);
  for (let tour = 0; tour < 4 && faux.mergee(ticket) === undefined && !statuts().some(([state]) => state === "failure"); tour += 1) {
    await station.tour();
    await station.calme();
  }
  return { avertis, statuts: statuts(), gatesJouees: existsSync(journal) ? readFileSync(journal, "utf8") : "" };
}

const nonJouees = (avertis: string[], motif: string) =>
  assert.ok(
    avertis.some((texte) => texte.includes(`the gates of PR #`) && texte.includes(`(#757) are not run on box — ${motif}`)),
    avertis.join("\n"),
  );

test("with no test command and the foundation ticket unserved, an ordinary delivery is not merged, and the station says why — 'the gates run nothing', never a green status", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [LABEL_FONDATION]);
  faux.feu(757, CALIBRE);
  const { avertis, statuts } = await servir(t, { faux, ticket: 757, gates: "aucune" });
  assert.equal(faux.mergee(757), undefined);
  assert.deepEqual(statuts, [], "no status, green least of all, is posted on gates that run nothing");
  nonJouees(avertis, "nothing checked — the gates run nothing until the foundation ticket #1 is merged");
});

test("on the new project `/brigade:init` sets up, whose `npm test` has nothing to run yet, an ordinary delivery is not merged before the foundation ticket is", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [LABEL_FONDATION]);
  faux.feu(757, CALIBRE);
  const { avertis, statuts, gatesJouees } = await servir(t, { faux, ticket: 757, claudeMd: PROVISOIRES, gates: "verte" });
  assert.equal(faux.mergee(757), undefined);
  assert.deepEqual(statuts, []);
  assert.equal(gatesJouees, "", "the test command is not run");
  nonJouees(avertis, "nothing checked — the gates run nothing until the foundation ticket #1 is merged");
});

test("the foundation ticket's own delivery is not blocked by the provisional gates: the gates it brings run on its branch, the review approves, and it is merged", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, LABEL_FONDATION]);
  const { statuts, gatesJouees } = await servir(t, { faux, ticket: 1, claudeMd: PROVISOIRES, gates: "verte" });
  assert.equal(faux.mergee(1)?.mergeePar, "box");
  assert.match(gatesJouees, /^npm test in .*\n$/);
  assert.deepEqual(statuts, [
    ["pending", "Gates running on station box"],
    ["success", "Gates green on station box"],
  ]);
});

test("once the foundation delivery is merged, the gates run the real test command and judge an ordinary delivery: red, it is not merged", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [LABEL_FONDATION]);
  faux.ticket(1).state = "closed";
  faux.feu(757, CALIBRE);
  const { statuts, gatesJouees } = await servir(t, { faux, ticket: 757, claudeMd: PROVISOIRES, gates: "rouge" });
  assert.equal(faux.mergee(757), undefined);
  assert.match(gatesJouees, /^npm test in /);
  assert.deepEqual(statuts, [
    ["pending", "Gates running on station box"],
    ["failure", "Gates red on station box: FAIL  adds two numbers"],
  ]);
});

test("once the foundation delivery is merged, an ordinary delivery whose real gates are green is merged", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [LABEL_FONDATION]);
  faux.ticket(1).state = "closed";
  faux.feu(757, CALIBRE);
  const { gatesJouees } = await servir(t, { faux, ticket: 757, gates: "verte" });
  assert.equal(faux.mergee(757)?.mergeePar, "box");
  assert.match(gatesJouees, /^npm test in /);
});

test("a gate with no test command never reports success on the station: no foundation ticket at all, the delivery is not merged and 'nothing checked' is said", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(757, CALIBRE);
  const { avertis, statuts } = await servir(t, { faux, ticket: 757, gates: "aucune" });
  assert.equal(faux.mergee(757), undefined);
  assert.deepEqual(statuts, []);
  nonJouees(avertis, "nothing checked — the gates run no test command: `.claude/brigade/gates.sh` runs nothing");
});

// Un cook qui affirme son ticket déjà servi sur la base (#3146) : la station
// ne le confirme pas sur des gates qui ne jouent rien.
test("before the foundation ticket is served, a cook's 'already served' claim is not confirmed on gates that run nothing: an ordinary failed attempt, 'nothing checked'", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-fondation-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(1, [LABEL_FONDATION]);
  faux.feu(757, CALIBRE);
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, fluxQuiConclut(`<livrable>\n<deja-servi>Commit ${sha.slice(0, 9)} on main does it.</deja-servi>\n</livrable>`));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/neuf",
    github: clientDe(faux) as GitHub,
    depot: {
      connait: () => false,
      preparer: async (run) => {
        const worktree = join(repertoire, run);
        mkdirSync(join(worktree, ".claude", "brigade"), { recursive: true });
        writeFileSync(join(worktree, "CLAUDE.md"), PROVISOIRES);
        writeFileSync(join(worktree, ".claude", "brigade", "gates.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
        return { worktree, branche: "cook/757-github" };
      },
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 0,
      changes: () => [],
      diff: () => "",
      tete: () => "a".repeat(40),
      lancerGit: async (args) => ({ code: 0, stdout: args[0] === "rev-parse" ? `${sha}\n` : "", stderr: "" }),
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    gates: { delaiMs: 1_500 },
    flux: repertoire,
    lancer,
    avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  const corps = (faux.commentaires.get(757) ?? []).map((c) => c.body);
  assert.equal(corps.filter((c) => c.startsWith(MARQUE_DEJA_SERVI)).length, 0);
  assert.match(corps.find((c) => c.startsWith(MARQUE_D_ECHEC)) ?? "", /nothing checked — the gates run nothing until the foundation ticket #1 is merged/);
  assert.equal(faux.ticket(757).state, "open");
});
