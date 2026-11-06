// Le setup du worktree d'un cook, joué par la station avant de le lancer
// (#2535). Sans lui, le cook entrait dans un worktree sans dépendances : ses
// premières gates sortaient rouges — « contrôle de types injouable » —, et il
// les rejouait après avoir posé le setup lui-même, en temps de cuisson.
//
// Le cook est simulé (`Lancer`), GitHub aussi ; le setup est un vrai script,
// dans un vrai répertoire.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { SCRIPT_SETUP } from "../../src/gates.ts";
import type { GitHub } from "../../src/github.ts";
import { DEPOT, issueGitHub } from "../outils.ts";

const NUMERO = 2535;
const fluxQuiConclut = `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`;

// Un setup qui pose ses dépendances, note ce qu'il a reçu, et exporte : ce
// que le contrat permet, et ce qu'il ne peut pas faire entrer chez le cook.
const SETUP_VERT = `#!/usr/bin/env bash
set -eu
mkdir -p "$2/node_modules"
printf '%s' "\${ANTHROPIC_API_KEY:-}|\${GH_TOKEN:-}" > "$2/setup-a-recu"
echo "installé" >&2
printf 'export BRIGADE_STATE_DIR=%q\\n' "$2/.brigade-state"
printf 'export BRIGADE_PORT=%q\\n' "$((20000 + $1))"
echo 'export GH_TOKEN=gho_versLeCook'
echo 'export ANTHROPIC_API_KEY=sk-ant-versLeCook'
`;
const SETUP_ROUGE = "#!/usr/bin/env bash\necho 'registre injoignable' >&2\nexit 7\n";

type Lance = { env: NodeJS.ProcessEnv; avecDependances: boolean };

function cuisine(t: TestContext, options: { setup?: string; reglage?: { delaiMs: number } }) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-setup-du-cook-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const worktree = join(repertoire, "wt");
  const lances: Lance[] = [];
  const dits: string[] = [];
  const lancer: Lancer = ({ env, flux }) => {
    lances.push({ env, avecDependances: existsSync(join(worktree, "node_modules")) });
    writeFileSync(flux, fluxQuiConclut);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const client: Partial<GitHub> = {
    tickets: async () => ({ inchange: false, issues: [{ ...issueGitHub(NUMERO), number: NUMERO, title: "Cooks take too long", labels: ["fire", "model:opus", "effort:high"], state: "open", createdAt: "", updatedAt: "", url: "" }], confirmer: () => {} }) as never,
    prDeBranche: async () => null,
    ci: async () => [] as never,
    issue: async (numero) => ({ number: numero, title: "Cooks take too long", labels: [], state: "open", createdAt: "", updatedAt: "", url: "", body: "corps" }),
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
    nom: "box/claude",
    places: 1,
    base: "main",
    depotGitHub: DEPOT,
    graphql: false,
    github: client as GitHub,
    depot: {
      preparer: async (run) => {
        mkdirSync(join(worktree, ".claude", "brigade"), { recursive: true });
        if (options.setup !== undefined) {
          writeFileSync(join(worktree, SCRIPT_SETUP), options.setup);
          chmodSync(join(worktree, SCRIPT_SETUP), 0o755);
        }
        return { worktree, branche: `cook/${run}` };
      },
      reprendre: async () => worktree,
      connait: () => false,
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => [],
      diff: () => "",
    },
    prise: () => ({ prendre: async () => ({ prise: true }), lacher: async () => true }),
    claude: "claude",
    env: { PATH: process.env.PATH, HOME: repertoire, GH_TOKEN: "gho_duChef", ANTHROPIC_API_KEY: "sk-ant-duRuntime" },
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: join(repertoire, "flux"),
    lancer,
    avertir: (texte) => void dits.push(texte),
    ...(options.reglage === undefined ? {} : { setup: options.reglage }),
  });
  assert.ok(!("refus" in station), "refus" in station ? station.refus : "");
  const servir = async () => {
    if ("refus" in station) return;
    await station.tour();
    await station.calme();
  };
  return { servir, lances, dits, worktree };
}

test("the station runs the worktree setup before the cook: the cook starts with its dependencies and the setup's exports", async (t) => {
  const { servir, lances, dits, worktree } = cuisine(t, { setup: SETUP_VERT, reglage: { delaiMs: 2_000 } });
  await servir();

  assert.equal(lances.length, 1, dits.join("\n"));
  const [cook] = lances;
  assert.ok(cook);
  assert.ok(cook.avecDependances, "le worktree est prêt quand le cook y entre");
  // Ce que le setup exporte, tel quel : bash ajoute `/.brigade-state` au chemin du worktree, écrit avec des `\` sous Windows.
  assert.equal(cook.env.BRIGADE_STATE_DIR, `${worktree}/.brigade-state`);
  assert.equal(cook.env.BRIGADE_PORT, String(20000 + NUMERO));
  assert.deepEqual(dits.filter((dit) => dit.includes(SCRIPT_SETUP)), []);
});

test("the setup gets neither the Claude key nor a GitHub token, and cannot hand one to the cook", async (t) => {
  const { servir, lances, worktree } = cuisine(t, { setup: SETUP_VERT, reglage: { delaiMs: 2_000 } });
  await servir();

  assert.equal(readFileSync(join(worktree, "setup-a-recu"), "utf8"), "|");
  const [cook] = lances;
  assert.ok(cook);
  assert.equal(cook.env.GH_TOKEN, undefined);
  assert.equal(cook.env.ANTHROPIC_API_KEY, undefined);
});

test("a failing setup does not hold the cook: it starts in its worktree as is, and the station says why", async (t) => {
  const { servir, lances, dits } = cuisine(t, { setup: SETUP_ROUGE, reglage: { delaiMs: 2_000 } });
  await servir();

  assert.equal(lances.length, 1);
  assert.equal(lances[0]?.env.BRIGADE_STATE_DIR, undefined);
  assert.ok(dits.some((dit) => dit.includes(`#${NUMERO}`) && dit.includes(SCRIPT_SETUP) && dit.includes("exit code 7")), dits.join("\n"));
});

test("a station given no setup setting launches the cook in the worktree as git laid it", async (t) => {
  const { servir, lances } = cuisine(t, { setup: SETUP_VERT });
  await servir();

  assert.equal(lances.length, 1);
  assert.equal(lances[0]?.avecDependances, false);
  assert.equal(lances[0]?.env.BRIGADE_STATE_DIR, undefined);
});
