// Le moteur d'une station (#3744) : un ticket cuisiné sur la clé d'API de
// Claude, ou sur Codex, sur une machine où aucune connexion Max n'est ouverte,
// et livré sur le rail — worktree, branche, PR —, son moteur et son coût
// rangés avec la livraison, la clé nulle part.
//
// La station est la vraie (`stationDuDepot`), sur le clone d'un vrai dépôt git,
// et ses cooks sont de vrais process sous le superviseur : seuls le client
// GitHub et les binaires `claude` et `codex` sont faux. Le faux `claude` est
// celui d'une machine sans abonnement : sans `ANTHROPIC_API_KEY`, il répond
// « Not logged in », comme le vrai.
import assert from "node:assert/strict";
import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type StationGitHub } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import type { GitHub } from "../../src/github.ts";
import { depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const SANS_BASH = process.platform === "win32" && "les faux `claude` et `codex` sont des scripts bash";
const TICKET = 7;
// Une clé qui n'a pas la forme `sk-ant-…` : seule sa valeur retenue la masque.
const CLE = "brigade-test-api-key-0f9e8d7c6b5a4f3e2d1c";

// Une machine sans connexion Max : sans clé, `claude` ne parle pas au modèle.
// Avec, le cook commite sa livraison — et cite la clé partout où il le peut,
// hors de ses commits.
const FAUX_CLAUDE = `#!/usr/bin/env bash
cat > /dev/null
if [ "\${1:-}" = auth ]; then echo '{"loggedIn":false}'; exit 0; fi
if [ -z "\${ANTHROPIC_API_KEY:-}" ]; then
  echo '{"type":"assistant","message":{"id":"m1","role":"assistant","content":[{"type":"text","text":"Not logged in · Please run /login"}]},"error":"authentication_failed","parent_tool_use_id":null}'
  echo '{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login"}'
  exit 1
fi
echo "claude: billed to $ANTHROPIC_API_KEY" >&2
printf 'delivered\\n' > livraison.txt
git add livraison.txt && git commit -q -m "livraison" || exit 1
printf '{"type":"assistant","message":{"id":"m2","role":"assistant","content":[{"type":"text","text":"my key is %s"}],"usage":{"input_tokens":3,"output_tokens":7}},"parent_tool_use_id":null}\\n' "$ANTHROPIC_API_KEY"
printf '{"type":"result","subtype":"success","is_error":false,"result":"<livrable>Added livraison.txt (key %s).</livrable>","total_cost_usd":0.0421}\\n' "$ANTHROPIC_API_KEY"
`;

// `codex exec --json` : la consigne sur l'entrée, le flux de Codex en sortie.
// Ses arguments sont notés, un par ligne, dans FAUX_CODEX_ARGS.
const FAUX_CODEX = `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$FAUX_CODEX_ARGS"
[ "\${1:-}" = exec ] || exit 2
cat > /dev/null
while [ $# -gt 0 ]; do [ "$1" = -C ] && cd "$2"; shift; done
printf 'cooked by codex\\n' > codex.txt
git add codex.txt && git commit -q -m "codex" || { echo '{"type":"turn.failed","error":{"message":"commit failed"}}'; exit 1; }
echo '{"type":"thread.started","thread_id":"t-1"}'
echo '{"type":"turn.started"}'
echo '{"type":"item.started","item":{"id":"item_0","type":"command_execution","command":"git commit","status":"in_progress"}}'
echo '{"type":"item.completed","item":{"id":"item_0","type":"command_execution","command":"git commit","exit_code":0,"status":"completed"}}'
echo '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"<livrable>Added codex.txt.</livrable>"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":2,"output_tokens":5}}'
`;

// Une machine où la connexion Max est ouverte : le cook livre sans clé.
const CLAUDE_ABONNE = `#!/usr/bin/env bash
cat > /dev/null
printf 'delivered\\n' > livraison.txt
git add livraison.txt && git commit -q -m "livraison" || exit 1
echo '{"type":"result","subtype":"success","is_error":false,"result":"<livrable>Added livraison.txt.</livrable>","total_cost_usd":0.5}'
`;

// Codex sans connexion : son tour échoue.
const CODEX_DECONNECTE = `#!/usr/bin/env bash
cat > /dev/null
echo '{"type":"thread.started","thread_id":"t-2"}'
echo '{"type":"turn.failed","error":{"message":"401 Unauthorized: not logged in"}}'
exit 1
`;

function script(dossier: string, nom: string, contenu: string): string {
  const chemin = join(dossier, nom);
  writeFileSync(chemin, contenu);
  chmodSync(chemin, 0o755);
  return chemin;
}

type PR = { number: number; branche: string; base: string; titre: string; corps: string };

// Un faux GitHub réduit à ce que le tour d'une station appelle, pour un seul ticket.
class FauxGitHub {
  labels = new Set(["fire", "model:sonnet", "effort:medium"]);
  commentaires: Array<{ id: number; body: string; createdAt: string }> = [];
  prs: PR[] = [];

  client(): GitHub {
    const issue = () => ({ number: TICKET, title: `ticket ${TICKET}`, labels: [...this.labels], state: "open" as const, createdAt: "", updatedAt: "", url: "" });
    const client: Partial<GitHub> = {
      tickets: async () => ({ inchange: false, issues: this.labels.has("fire") && !this.labels.has("in-pass") ? [issue()] : [], confirmer: () => {} }),
      issue: async () => ({ ...issue(), body: "Add a file." }),
      commentaires: async () => this.commentaires.map((c) => ({ ...c, author: "brigade", association: "OWNER" })),
      commenter: async (_numero, body) => {
        this.commentaires.push({ id: this.commentaires.length + 1, body, createdAt: new Date(Date.UTC(2026, 10, 16) + this.commentaires.length * 1000).toISOString() });
      },
      retraitsDeLabels: async () => [],
      labelliser: async (_numero, labels) => void labels.forEach((label) => this.labels.add(label)),
      delabelliser: async (_numero, label) => void this.labels.delete(label),
      ci: async () => [{ name: "tests", conclusion: "success", outcome: "green", url: null }] as never,
      prDeBranche: async (branche) => {
        const pr = this.prs.findLast((p) => p.branche === branche);
        return pr === undefined ? null : { number: pr.number, url: "", base: pr.base, sha: "a".repeat(40), state: "open", merged: false, enRetard: false, mergeePar: null };
      },
      prsOuvertes: async () => this.prs.map(({ number, branche }) => ({ number, branche, fichiers: [] })),
      ouvrirPR: async (pr) => {
        const number = 100 + this.prs.length;
        this.prs.push({ number, ...pr });
        return `https://github.com/acme/shop/pull/${number}`;
      },
      mettreAJour: async () => {},
      merger: async () => ({ fait: false, motif: "left to the pass" }),
      teteDeLaBase: async () => "b".repeat(40),
      issuesDepuis: async () => [],
    };
    return client as GitHub;
  }
}

type Cuisine = { faux: FauxGitHub; dits: string[]; racine: string; clone: string; origine: string; station: StationGitHub | { refus: string } };

// Une station du projet, sur le moteur que règle `env`, et ses cooks lancés
// pour de vrai par le superviseur.
function laStation(t: TestContext, env: Record<string, string>, binaires: { claude: string }): Cuisine {
  const faux = new FauxGitHub();
  const dits: string[] = [];
  const racine = repertoireTemporaire(t);
  const { origine, clone } = depotGit(t);
  const station = stationDuDepot({
    nom: "box/claude",
    places: 1,
    base: "v2",
    depotGitHub: "acme/shop",
    github: faux.client(),
    depot: ouvrirDepot({ clone, base: "v2", worktrees: join(racine, "worktrees"), env: ENV_GIT }),
    prise: priseDeLaStation,
    claude: binaires.claude,
    env: { ...ENV_GIT, ...env },
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: join(racine, "flux"),
    avertir: (ligne) => dits.push(ligne),
  });
  if (!("refus" in station)) t.after(() => station.calme());
  return { faux, dits, racine, clone, origine, station };
}

async function servir(cuisine: Cuisine): Promise<void> {
  if ("refus" in cuisine.station) assert.fail(cuisine.station.refus);
  await cuisine.station.tour();
  await cuisine.station.calme();
}

// Ce que la station a gardé et publié : son état sur le disque, ses lignes au
// journal, et tout ce qu'elle a écrit sur GitHub.
function toutCeQuiEstGardeOuPublie(cuisine: Cuisine): string {
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() ? (entree.name === ".git" ? [] : fichiers(join(dossier, entree.name))) : [join(dossier, entree.name)]));
  return [...fichiers(cuisine.racine).map((chemin) => readFileSync(chemin, "utf8")), ...cuisine.dits, ...cuisine.faux.prs.map((pr) => `${pr.titre}\n${pr.corps}`), ...cuisine.faux.commentaires.map((c) => c.body)].join("\n");
}

const livraisons = (cuisine: Cuisine) => readFileSync(join(cuisine.racine, "flux", "livraisons.jsonl"), "utf8").trim().split("\n").map((ligne) => JSON.parse(ligne));

// La sortie du process de test pendant `faire` : ce qu'un cook ou la station y écrirait.
async function sortieDe(faire: () => Promise<void>): Promise<string> {
  const lue: string[] = [];
  const [ecrireOut, ecrireErr] = [process.stdout.write.bind(process.stdout), process.stderr.write.bind(process.stderr)];
  process.stdout.write = ((morceau: string | Uint8Array, ...reste: unknown[]) => (lue.push(String(morceau)), ecrireOut(morceau, ...(reste as [])))) as typeof process.stdout.write;
  process.stderr.write = ((morceau: string | Uint8Array, ...reste: unknown[]) => (lue.push(String(morceau)), ecrireErr(morceau, ...(reste as [])))) as typeof process.stderr.write;
  try {
    await faire();
  } finally {
    process.stdout.write = ecrireOut;
    process.stderr.write = ecrireErr;
  }
  return lue.join("");
}

function secretsAvecLaCle(t: TestContext): string {
  const fichier = join(repertoireTemporaire(t), "station.env");
  writeFileSync(fichier, `OTHER_SECRET=some-other-value\nANTHROPIC_API_KEY=${CLE}\n`);
  chmodSync(fichier, 0o600);
  return fichier;
}

test("engine claude-api-key, no Claude subscription logged in: the test ticket ends as an open PR on the rail, with its engine and cost recorded, and the key nowhere", { skip: SANS_BASH }, async (t) => {
  const bin = repertoireTemporaire(t);
  const cuisine = laStation(t, { BRIGADE_ENGINE: "claude-api-key", BRIGADE_SECRETS_FILE: secretsAvecLaCle(t) }, { claude: script(bin, "claude", FAUX_CLAUDE) });
  const sortie = await sortieDe(() => servir(cuisine));

  // Le rail : la branche du ticket poussée sur l'origine, sa PR ouverte, le ticket en pass.
  assert.deepEqual(cuisine.faux.prs.map(({ branche, base }) => ({ branche, base })), [{ branche: "cook/7-github", base: "v2" }], cuisine.dits.join("\n"));
  const poussee = readFileSync(join(cuisine.origine, "refs", "heads", "cook", "7-github"), "utf8").trim();
  assert.match(poussee, /^[0-9a-f]{40}$/);
  assert.ok(cuisine.faux.labels.has("in-pass"));
  const [livraison] = livraisons(cuisine);
  assert.deepEqual({ ...livraison, at: undefined }, { at: undefined, ticket: TICKET, branch: "cook/7-github", engine: "claude-api-key", costUsd: 0.0421 });
  t.diagnostic(`claude-api-key: worktree ${join(cuisine.racine, "worktrees")}, branch cook/7-github at ${poussee.slice(0, 7)}, PR #${cuisine.faux.prs[0]?.number} open: ${JSON.stringify(cuisine.faux.prs[0]?.corps)}; delivery ${JSON.stringify(livraison)}`);

  // La clé : ni dans l'état de la station (flux, livraisons), ni à son journal, ni sur GitHub, ni dans la sortie.
  const garde = toutCeQuiEstGardeOuPublie(cuisine);
  assert.ok(garde.includes("my key is [jeton Claude masqué]"), "the cook's stream is kept, its key masked");
  assert.ok(!garde.includes(CLE), "the API key is in what the station keeps or publishes");
  assert.ok(!sortie.includes(CLE), "the API key is in the test's output");
  // Ni dans ce que la station a poussé pour la PR.
  assert.ok(!git(cuisine.origine, "log", "-p", "cook/7-github").includes(CLE));
});

test("engine codex, no Claude subscription logged in: the same test ticket ends as an open PR on the rail, cooked by codex exec in its worktree", { skip: SANS_BASH }, async (t) => {
  const bin = repertoireTemporaire(t);
  const notes = join(bin, "args");
  const cuisine = laStation(t, { BRIGADE_ENGINE: "codex", BRIGADE_CODEX_BIN: script(bin, "codex", FAUX_CODEX), FAUX_CODEX_ARGS: notes }, { claude: script(bin, "claude", FAUX_CLAUDE) });
  await servir(cuisine);

  assert.deepEqual(cuisine.faux.prs.map(({ branche, base }) => ({ branche, base })), [{ branche: "cook/7-github", base: "v2" }], cuisine.dits.join("\n"));
  const poussee = readFileSync(join(cuisine.origine, "refs", "heads", "cook", "7-github"), "utf8").trim();
  assert.match(poussee, /^[0-9a-f]{40}$/);
  assert.ok(cuisine.faux.labels.has("in-pass"));
  const args = readFileSync(notes, "utf8").trim().split("\n");
  assert.deepEqual(args.slice(0, 2), ["exec", "--json"]);
  assert.equal(args[args.indexOf("--sandbox") + 1], "workspace-write");
  // Il écrit dans son worktree, et dans le dépôt commun où ses commits s'écrivent.
  assert.equal(args[args.indexOf("-C") + 1]?.startsWith(join(cuisine.racine, "worktrees")), true);
  assert.equal(args[args.indexOf("--add-dir") + 1], join(cuisine.clone, ".git"));
  assert.equal(args.at(-1), "-");
  const [livraison] = livraisons(cuisine);
  assert.deepEqual({ ...livraison, at: undefined }, { at: undefined, ticket: TICKET, branch: "cook/7-github", engine: "codex" });
  // Son flux est celui d'un cook Claude : son dernier message, sa fin.
  const flux = readFileSync(join(cuisine.racine, "flux", "7-github.flux.jsonl"), "utf8");
  assert.match(flux, /"type":"result","subtype":"success","is_error":false.*Added codex\.txt/);
  t.diagnostic(`codex: branch cook/7-github at ${poussee.slice(0, 7)}, PR #${cuisine.faux.prs[0]?.number} open: ${JSON.stringify(cuisine.faux.prs[0]?.corps)}; delivery ${JSON.stringify(livraison)}`);
});

test("engine codex, codex not logged in: the cook ends disconnected, no PR is opened and no delivery is recorded", { skip: SANS_BASH }, async (t) => {
  const bin = repertoireTemporaire(t);
  const cuisine = laStation(t, { BRIGADE_ENGINE: "codex", BRIGADE_CODEX_BIN: script(bin, "codex", CODEX_DECONNECTE) }, { claude: script(bin, "claude", FAUX_CLAUDE) });
  await servir(cuisine);
  assert.deepEqual(cuisine.faux.prs, []);
  assert.equal(existsSync(join(cuisine.racine, "flux", "livraisons.jsonl")), false);
  const flux = readFileSync(join(cuisine.racine, "flux", "7-github.flux.jsonl"), "utf8");
  assert.match(flux, /"error":"authentication_failed"/);
  assert.match(flux, /"type":"result","subtype":"error_during_execution","is_error":true/);
});

test("an unknown engine, or claude-api-key without a key in the station's secrets, refuses to open the station — without the key's value", (t) => {
  const bin = repertoireTemporaire(t);
  const claude = join(bin, "claude");
  const inconnu = laStation(t, { BRIGADE_ENGINE: "gpt" }, { claude }).station;
  assert.ok("refus" in inconnu && /BRIGADE_ENGINE “gpt” is not an engine: expected one of claude-subscription, claude-api-key, codex/.test(inconnu.refus), JSON.stringify(inconnu));
  const sansFichier = laStation(t, { BRIGADE_ENGINE: "claude-api-key" }, { claude }).station;
  assert.ok("refus" in sansFichier && /BRIGADE_SECRETS_FILE is not set/.test(sansFichier.refus), JSON.stringify(sansFichier));
  const fichier = join(bin, "station.env");
  writeFileSync(fichier, `OTHER_SECRET=${CLE}\n`);
  chmodSync(fichier, 0o600);
  const sansCle = laStation(t, { BRIGADE_ENGINE: "claude-api-key", BRIGADE_SECRETS_FILE: fichier }, { claude }).station;
  assert.ok("refus" in sansCle && /no `ANTHROPIC_API_KEY` line/.test(sansCle.refus) && !sansCle.refus.includes(CLE), JSON.stringify(sansCle));
});

test("claude-api-key whose key can no longer be read at launch: no cook starts, the ticket is given back without counting, no PR", { skip: SANS_BASH }, async (t) => {
  const bin = repertoireTemporaire(t);
  const secrets = secretsAvecLaCle(t);
  const cuisine = laStation(t, { BRIGADE_ENGINE: "claude-api-key", BRIGADE_SECRETS_FILE: secrets }, { claude: script(bin, "claude", FAUX_CLAUDE) });
  rmSync(secrets);
  await servir(cuisine);
  assert.deepEqual(cuisine.faux.prs, []);
  assert.equal(existsSync(join(cuisine.racine, "flux", "7-github.flux.jsonl")), false, "no cook was launched");
  assert.ok(cuisine.dits.some((ligne) => /the API key of the claude-api-key engine could not be read/.test(ligne)), cuisine.dits.join("\n"));
});

test("claude-api-key whose stream says no cost: the delivery records costUsd null, never an invented cost", { skip: SANS_BASH }, async (t) => {
  const bin = repertoireTemporaire(t);
  const sansCout = FAUX_CLAUDE.replace(',"total_cost_usd":0.0421', "");
  const cuisine = laStation(t, { BRIGADE_ENGINE: "claude-api-key", BRIGADE_SECRETS_FILE: secretsAvecLaCle(t) }, { claude: script(bin, "claude", sansCout) });
  await servir(cuisine);
  assert.equal(cuisine.faux.prs.length, 1, cuisine.dits.join("\n"));
  assert.deepEqual(livraisons(cuisine).map(({ engine, costUsd }) => ({ engine, costUsd })), [{ engine: "claude-api-key", costUsd: null }]);
});

test("engine unset: the delivery records the claude-subscription engine, and no cost", { skip: SANS_BASH }, async (t) => {
  const bin = repertoireTemporaire(t);
  const cuisine = laStation(t, {}, { claude: script(bin, "claude", CLAUDE_ABONNE) });
  await servir(cuisine);
  assert.equal(cuisine.faux.prs.length, 1, cuisine.dits.join("\n"));
  assert.deepEqual(livraisons(cuisine).map(({ engine, costUsd }) => ({ engine, costUsd })), [{ engine: "claude-subscription", costUsd: undefined }]);
});

test("claude-api-key whose cook commits the key: nothing is pushed, no PR is opened, and the branch leaves the station's clone", { skip: SANS_BASH }, async (t) => {
  const bin = repertoireTemporaire(t);
  const bavard = FAUX_CLAUDE.replace('printf \'delivered\\n\' > livraison.txt', 'printf "$ANTHROPIC_API_KEY\\n" > livraison.txt');
  assert.notEqual(bavard, FAUX_CLAUDE);
  const cuisine = laStation(t, { BRIGADE_ENGINE: "claude-api-key", BRIGADE_SECRETS_FILE: secretsAvecLaCle(t) }, { claude: script(bin, "claude", bavard) });
  await servir(cuisine);
  assert.deepEqual(cuisine.faux.prs, []);
  assert.equal(existsSync(join(cuisine.origine, "refs", "heads", "cook", "7-github")), false, "the branch was pushed");
  assert.equal(git(cuisine.clone, "branch", "--list", "cook/7-github"), "");
  assert.ok(cuisine.faux.commentaires.some((c) => c.body.includes("the cook committed the station's API key")), cuisine.faux.commentaires.map((c) => c.body).join("\n---\n"));
  assert.ok(!toutCeQuiEstGardeOuPublie(cuisine).includes(CLE));
});
