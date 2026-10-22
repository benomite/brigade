// La correction proposée pour une cause qui revient : un faux `claude` répond
// par un diff, la garde de portée le juge contre un vrai dépôt, et ce qui en
// sort est posé au journal — puis porté par `facts`, s'il est proposé.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "../support/posix.ts";
import type { Plafonds } from "../../src/events/guardrails.ts";
import { principal as facts } from "../../src/faits.ts";
import { brancherGardeFous, type Reglages } from "../../src/garde-fous.ts";
import { demarrer } from "../../src/runtime.ts";
import { cartesDeCorrection } from "../../src/correctif/cartes.ts";
import { detecter } from "../../src/correctif/detecter.ts";
import { lireDiff, verifierDiff } from "../../src/correctif/portee.ts";
import { lireReponse, proposer } from "../../src/correctif/proposer.ts";
import { lireReglagesDuCorrectif } from "../../src/correctif/reglages.ts";
import type { Journal } from "../../src/journal.ts";
import { appeler, BASE, depotGit, ENV_ENFANT, ENV_GIT, git, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const PROJET = "brigade";
const DEPOT = "benomite/brigade";
const PLAFONDS: Plafonds = { turns: 100, durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 };
const REGLAGES: Reglages = { plafonds: PLAFONDS, seuilDisjoncteur: 3, graceMs: 2000 };

// Les fichiers du projet à sa base : ses consignes, et ce qui n'en est pas.
const FICHIERS: Record<string, string> = {
  "CLAUDE.md": ["# Projet", "", "## Équipe multi-agents (plugin brigade)", "", "- **Gates** : `.claude/brigade/gates.sh <WT>`", ""].join("\n"),
  "docs/equipe.md": ["# L'équipe", "", "Un ticket se lit en entier.", ""].join("\n"),
  ".claude/brigade/gates.sh": ["#!/bin/sh", "npm test", ""].join("\n"),
  "runtime/src/rail.ts": "export const rail = 1;\n",
  "agents/dev.md": "# Le dev\n",
};

const DIFFS = {
  claude: [
    "diff --git a/CLAUDE.md b/CLAUDE.md",
    "--- a/CLAUDE.md",
    "+++ b/CLAUDE.md",
    "@@ -3,3 +3,4 @@",
    " ## Équipe multi-agents (plugin brigade)",
    " ",
    " - **Gates** : `.claude/brigade/gates.sh <WT>`",
    "+- **Critères** : un ticket incomplet se dit dans le compte-rendu, il ne se devine pas.",
  ],
  equipe: ["--- a/docs/equipe.md", "+++ b/docs/equipe.md", "@@ -1,3 +1,4 @@", " # L'équipe", " ", " Un ticket se lit en entier.", "+Ses critères aussi, avant d'écrire."],
  neuve: ["diff --git a/docs/criteres.md b/docs/criteres.md", "new file mode 100644", "--- /dev/null", "+++ b/docs/criteres.md", "@@ -0,0 +1,2 @@", "+# Les critères", "+Un critère contradictoire se signale."],
  gates: ["--- a/.claude/brigade/gates.sh", "+++ b/.claude/brigade/gates.sh", "@@ -1,2 +1,3 @@", " #!/bin/sh", "+set -e", " npm test"],
  runtime: ["--- a/runtime/src/rail.ts", "+++ b/runtime/src/rail.ts", "@@ -1 +1 @@", "-export const rail = 1;", "+export const rail = 2;"],
  agents: ["--- a/agents/dev.md", "+++ b/agents/dev.md", "@@ -1 +1,2 @@", " # Le dev", "+Lis le CLAUDE.md."],
};
// Le fichier que chacun touche.
const TOUCHE = { claude: "CLAUDE.md", equipe: "docs/equipe.md", neuve: "docs/criteres.md", gates: ".claude/brigade/gates.sh", runtime: "runtime/src/rail.ts", agents: "agents/dev.md" };
const diff = (...noms: Array<keyof typeof DIFFS>) => `${noms.flatMap((nom) => DIFFS[nom]).join("\n")}\n`;

// Le dépôt du projet : la base porte ses fichiers, que le clone a rapatriés.
function projet(t: TestContext) {
  const { clone } = depotGit(t);
  for (const [chemin, texte] of Object.entries(FICHIERS)) {
    mkdirSync(join(clone, chemin, ".."), { recursive: true });
    writeFileSync(join(clone, chemin), texte);
  }
  chmodSync(join(clone, ".claude/brigade/gates.sh"), 0o755);
  git(clone, "add", ".");
  git(clone, "commit", "-q", "-m", "les consignes");
  git(clone, "update-ref", `refs/remotes/origin/${BASE}`, "HEAD");
  return { clone, lieu: { clone, base: BASE, env: ENV_GIT }, sha: git(clone, "rev-parse", "HEAD") };
}

// Ce que le faux `claude` dit : deux messages, dont l'un livré en deux lignes
// qui répètent son usage, et la réponse. Les lectures de cache ne comptent pas.
const USAGES = [
  { input_tokens: 1200, output_tokens: 40, cache_creation_input_tokens: 300, cache_read_input_tokens: 90_000 },
  { input_tokens: 20, output_tokens: 400, cache_read_input_tokens: 5000 },
];
const TOKENS_DEPENSES = 1200 + 40 + 300 + 20 + 400;

function fluxDe(reponse: string): string {
  return [
    { type: "system", subtype: "init", session_id: "s-1" },
    { type: "assistant", message: { id: "m-1", role: "assistant", usage: USAGES[0] } },
    { type: "assistant", message: { id: "m-2", role: "assistant", usage: USAGES[1], content: [{ type: "text", text: "Je relis." }] } },
    { type: "assistant", message: { id: "m-2", role: "assistant", usage: USAGES[1], content: [{ type: "text", text: reponse }] } },
    { type: "result", subtype: "success", is_error: false, num_turns: 2, result: reponse },
  ]
    .map((ligne) => JSON.stringify(ligne))
    .join("\n");
}

const repondre = (motif: string, corps: string) => `${motif}\n\n\`\`\`diff\n${corps}\`\`\`\n`;

let runs = 0;
// Un essai raté de `ticket` pour un ticket incomplet, comme le journal le dit.
function rater(journal: Journal, ticket: number): void {
  const noter = (fait: object) => journal.ajouter({ project: PROJET, ticket, author: "runtime", ...fait } as never);
  if (!journal.duTicket(ticket).some((e) => e.type === "ticket.taken")) noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: JOUR_HORLOGE } });
  const run = `run-${++runs}`;
  noter({ type: "cook.launched", payload: { run, limits: PLAFONDS, stream: `runs/${run}.jsonl`, station: "box/claude" } });
  noter({ type: "cook.reported", payload: { run, ending: "failed", reason: `ticket incomplet : le critère ${ticket} contredit le précédent`, summary: null, branch: "x", pr: null } });
  noter({ type: "cook.exited", payload: { run, outcome: "failed", code: 1, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
}

// Une cuisine aux garde-fous branchés, un projet, une candidate sur #11, #12,
// #13 ; et un faux `claude` qui rejoue le flux qu'on lui donne, et garde la
// consigne qu'il a reçue.
function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous(REGLAGES, demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  const { journal } = runtime;
  for (const ticket of [11, 12, 13]) rater(journal, ticket);
  const [candidat] = detecter(journal, PROJET, lireReglagesDuCorrectif({}));
  assert.ok(candidat);

  const aides = repertoireTemporaire(t);
  const [bin, flux, consigne] = [join(aides, "claude"), join(aides, "flux.jsonl"), join(aides, "consigne.txt")];
  writeFileSync(bin, `#!/bin/sh\nprintf '%s' "$2" >"${consigne}"\ncat "${flux}"\n`, { mode: 0o755 });
  const { clone, lieu, sha } = projet(t);
  const options = { journal, projet: PROJET, depot: DEPOT, lieu, repertoireEtat: repertoire, lancer: runtime.lancer, bin, calibrage: { model: "sonnet", effort: "medium" }, env: ENV_ENFANT };
  const proposerAvec = (reponse: string) => {
    writeFileSync(flux, fluxDe(reponse));
    return proposer(options, candidat);
  };
  const lireFacts = async () => {
    const appel = appeler(facts, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT });
    assert.equal(await appel.fin, 0, appel.sortie());
    return JSON.parse(appel.sortie()) as Record<string, unknown>;
  };
  const sortie = (run: string) => journal.duType("cook.exited", Number.MAX_SAFE_INTEGER).find((e) => e.payload.run === run);
  return { repertoire, journal, candidat, clone, sha, proposerAvec, consigne: () => readFileSync(consigne, "utf8"), lireFacts, sortie };
}

test("une candidate donne une proposition : la cause, ses tickets, un diff des consignes et ce qu'il a coûté — et la carte la porte", async (t) => {
  const { journal, candidat, sha, proposerAvec, consigne, lireFacts, sortie } = cuisine(t);
  const reponse = repondre("Les cooks devinaient un ticket incomplet au lieu de le dire.", diff("claude", "equipe"));

  const pose = await proposerAvec(reponse);
  assert.equal(pose?.type, "correction.proposed");
  assert.equal(pose?.ticket, null);
  const { run, ...payload } = pose?.payload ?? ({} as never);
  assert.deepEqual(payload, {
    candidate: candidat.seq,
    cause: "criteres",
    title: "contradictory criteria or incomplete ticket",
    tickets: [11, 12, 13],
    tokens: TOKENS_DEPENSES,
    reason: "Les cooks devinaient un ticket incomplet au lieu de le dire.",
    diff: diff("claude", "equipe"),
    files: ["CLAUDE.md", "docs/equipe.md"],
    base: sha,
  });
  assert.match(run, new RegExp(`^correctif-${candidat.seq}-[0-9a-f]{8}$`));
  // Le coût est celui du lancement, compté comme celui d'un cook.
  assert.equal(sortie(run)?.payload.tokens, TOKENS_DEPENSES);

  // La consigne montre la cause, ce que les tickets en ont dit, et les consignes telles que la base les porte.
  assert.match(consigne(), /contradictory criteria or incomplete ticket \(`criteres`\) : 3 essai\(s\) raté\(s\) sur 3 tickets — #11, #12, #13/);
  assert.match(consigne(), /ticket incomplet : le critère 12 contredit le précédent/);
  assert.match(consigne(), /<fichier chemin="CLAUDE.md">\n# Projet/);
  assert.match(consigne(), /<fichier chemin="\.claude\/brigade\/gates\.sh">/);
  assert.match(consigne(), /<fichier chemin="docs\/equipe\.md">/);
  assert.doesNotMatch(consigne(), /runtime\/src\/rail\.ts|agents\/dev\.md/);

  const [carte] = cartesDeCorrection(journal, DEPOT);
  assert.deepEqual(carte, {
    proposition: pose?.seq,
    cause: "criteres",
    titre: "contradictory criteria or incomplete ticket",
    tickets: [11, 12, 13].map((ticket) => ({ ticket, url: `https://github.com/${DEPOT}/issues/${ticket}` })),
    motif: "Les cooks devinaient un ticket incomplet au lieu de le dire.",
    diff: diff("claude", "equipe"),
    fichiers: ["CLAUDE.md", "docs/equipe.md"],
    base: sha,
    cout: { tokens: TOKENS_DEPENSES },
    proposee: pose?.at,
  });
  // `facts` la porte, telle quelle.
  assert.deepEqual((await lireFacts()).corrections, [carte]);
});

test("le diff proposé s'applique tel quel aux fichiers du projet : `git apply --check`, puis appliqué", async (t) => {
  const { clone, proposerAvec } = cuisine(t);
  const pose = await proposerAvec(repondre("", diff("claude", "neuve", "gates")));
  assert.equal(pose?.type, "correction.proposed");
  assert.equal(pose?.type === "correction.proposed" ? pose.payload.reason : "", null);
  const patch = join(clone, "..", "correction.patch");
  writeFileSync(patch, pose?.type === "correction.proposed" ? pose.payload.diff : "");

  git(clone, "apply", "--check", patch);
  git(clone, "apply", patch);
  assert.match(readFileSync(join(clone, "CLAUDE.md"), "utf8"), /- \*\*Critères\*\* : un ticket incomplet se dit/);
  assert.equal(readFileSync(join(clone, "docs/criteres.md"), "utf8"), "# Les critères\nUn critère contradictoire se signale.\n");
  assert.equal(readFileSync(join(clone, ".claude/brigade/gates.sh"), "utf8"), "#!/bin/sh\nset -e\nnpm test\n");
});

for (const [cas, noms] of [
  ["le code du projet (`runtime/src/`)", ["runtime"]],
  ["un fichier d'`agents/`", ["agents"]],
  ["les consignes et, avec elles, le code", ["claude", "runtime"]],
] as const) {
  test(`une proposition qui touche ${cas} est écartée, sans diff gardé, et aucune carte ne la porte`, async (t) => {
    const { journal, candidat, proposerAvec, lireFacts, sortie } = cuisine(t);

    const pose = await proposerAvec(repondre("Corrigeons le code.", diff(...noms)));
    assert.equal(pose?.type, "correction.discarded");
    const { run, reason, ...payload } = pose?.payload ?? ({} as never);
    assert.match(reason, /^hors des consignes du projet : (runtime\/src\/rail\.ts|agents\/dev\.md)$/);
    assert.deepEqual(payload, { candidate: candidat.seq, cause: "criteres", tickets: [11, 12, 13], tokens: TOKENS_DEPENSES, files: noms.map((nom) => TOUCHE[nom]) });
    assert.equal(sortie(run)?.payload.tokens, TOKENS_DEPENSES);
    assert.doesNotMatch(JSON.stringify(journal.tout()), /export const rail = 2|Lis le CLAUDE\.md/);
    assert.deepEqual(cartesDeCorrection(journal, DEPOT), []);
    assert.equal("corrections" in (await lireFacts()), false);
  });
}

test("une réponse sans bloc diff est écartée et dit pourquoi ; son coût est posé quand même", async (t) => {
  const { proposerAvec, journal } = cuisine(t);
  const pose = await proposerAvec("Je ne vois rien à corriger dans les consignes.");
  assert.equal(pose?.type, "correction.discarded");
  assert.deepEqual([pose?.payload.reason, pose?.payload.files, pose?.payload.tokens], ["aucun bloc ```diff dans la réponse", [], TOKENS_DEPENSES]);
  assert.deepEqual(cartesDeCorrection(journal), []);
});

test("une candidate n'est proposée qu'une fois : la seconde demande rend la conclusion posée, sans relancer `claude`", async (t) => {
  const { journal, proposerAvec } = cuisine(t);
  const premiere = await proposerAvec(repondre("Une ligne.", diff("equipe")));
  const lances = () => journal.tout().filter((e) => e.type === "cook.launched" && String(e.payload.run).startsWith("correctif-")).length;
  assert.equal(lances(), 1);
  const seconde = await proposerAvec(repondre("Une autre.", diff("claude")));
  assert.equal(seconde?.seq, premiere?.seq);
  assert.equal(lances(), 1);
  assert.equal(journal.duType("correction.proposed", 10).length, 1);
});

test("la garde lit le diff elle-même : CLAUDE.md, la doc d'équipe et les gates passent ; tout le reste, et ce qui ne se lit pas, est refusé", (t) => {
  const { lieu, sha } = projet(t);
  for (const noms of [["claude"], ["equipe"], ["neuve"], ["gates"], ["claude", "equipe", "neuve", "gates"]] as const) {
    const verifie = verifierDiff(diff(...noms), lieu);
    assert.ok(!("refus" in verifie), `${noms.join(", ")} : ${JSON.stringify(verifie)}`);
    assert.equal(verifie.base, sha);
  }

  const refus = (texte: string) => {
    const lu = verifierDiff(texte, lieu);
    return "refus" in lu ? lu.refus : null;
  };
  assert.match(refus(diff("runtime")) ?? "", /hors des consignes du projet : runtime\/src\/rail\.ts/);
  assert.match(refus(diff("agents")) ?? "", /hors des consignes du projet : agents\/dev\.md/);
  // Un CLAUDE.md qui n'est pas celui de la racine, un dossier qui ressemble à `docs/`.
  assert.match(refus(diff("claude").replaceAll("CLAUDE.md", "agents/CLAUDE.md")) ?? "", /hors des consignes/);
  assert.match(refus(diff("equipe").replaceAll("docs/", "docs2/")) ?? "", /hors des consignes/);
  assert.match(refus(diff("equipe").replaceAll("docs/equipe.md", "docs/../agents/dev.md")) ?? "", /n'est pas un chemin du dépôt/);
  // Renommer, supprimer, changer un mode, du binaire : rien de cela n'est une correction de consignes.
  assert.match(refus(["diff --git a/docs/equipe.md b/docs/autre.md", "similarity index 100%", "rename from docs/equipe.md", "rename to docs/autre.md", ""].join("\n")) ?? "", /en-tête illisible/);
  assert.match(refus(["diff --git a/docs/equipe.md b/docs/equipe.md", "deleted file mode 100644", "--- a/docs/equipe.md", "+++ /dev/null", ""].join("\n")) ?? "", /en-tête refusé : deleted file mode/);
  assert.match(refus(["diff --git a/.claude/brigade/gates.sh b/.claude/brigade/gates.sh", "old mode 100755", "new mode 100644", ""].join("\n")) ?? "", /en-tête refusé : old mode/);
  assert.match(refus(["diff --git a/docs/image.png b/docs/image.png", "new file mode 100644", "GIT binary patch", ""].join("\n")) ?? "", /en-tête refusé : GIT binary patch/);
  // Un diff qui ne s'applique pas à la base, un bloc mal compté, un diff vide.
  assert.match(refus(diff("equipe").replace(" Un ticket se lit en entier.", " Un ticket se lit à moitié.")) ?? "", /ne s'applique pas à origin\/v2/);
  assert.match(refus(diff("equipe").replace("@@ -1,3 +1,4 @@", "@@ -1,3 +1,9 @@")) ?? "", /bloc tronqué/);
  assert.equal(refus(""), "le diff est vide");
  // La garde pure, sans git : la même réponse sur ce qu'elle lit.
  assert.deepEqual(lireDiff(diff("claude", "neuve")), { fichiers: [{ chemin: "CLAUDE.md", nouveau: false }, { chemin: "docs/criteres.md", nouveau: true }] });
});

test("la réponse se lit : le motif avant le bloc, le bloc jusqu'à sa ligne de fin, même s'il cite un bloc de code", () => {
  const corps = ["--- a/docs/equipe.md", "+++ b/docs/equipe.md", "@@ -1 +1,4 @@", " # L'équipe", "+```bash", "+npm test", "+```", ""].join("\n");
  assert.deepEqual(lireReponse(`Pourquoi.\n\n\`\`\`diff\n${corps}\`\`\`\n`), { motif: "Pourquoi.", diff: corps });
  assert.deepEqual(lireReponse("```diff\n--- a/x\n"), { illisible: "le bloc ```diff ne se ferme pas" });
  assert.deepEqual(lireReponse(""), { illisible: "aucune réponse" });
});
