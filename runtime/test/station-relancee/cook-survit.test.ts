// Un cook survit à la relance de sa station (#4401) : chaque cook part par un
// relais, la station qui s'arrête le laisse tourner, et celle qui la relance le
// suit jusqu'à sa fin et finit son ticket — gates, push, PR — comme si rien ne
// s'était arrêté. Rien n'est commité sur sa branche par la relance.
//
// La station est la vraie (`stationDuDepot`), sur le clone d'un vrai dépôt
// git, et ses cooks de vrais process sous leur relais : seuls le client GitHub
// et `claude` sont faux. Le faux `claude` attend un fichier pour livrer : le
// test arrête la station pendant qu'il attend.
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type StationGitHub } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import type { GitHub } from "../../src/github.ts";
import { depotGit, ENV_GIT, git, jusqua, repertoireTemporaire } from "../outils.ts";

const SANS_BASH = process.platform === "win32" && "the fake `claude` is a bash script";
const TICKET = 7;

// Un cook qui dit qu'il travaille, attend `feu`, puis commite sa livraison.
const fauxClaude = (feu: string) => `#!/usr/bin/env bash
cat > /dev/null
echo '{"type":"assistant","message":{"id":"m1","role":"assistant","content":[{"type":"text","text":"working"}],"usage":{"input_tokens":3,"output_tokens":7}},"parent_tool_use_id":null}'
until [ -e '${feu}' ]; do sleep 0.05; done
printf 'delivered\\n' > livraison.txt
git add livraison.txt && git commit -q -m "livraison" || exit 1
echo '{"type":"result","subtype":"success","is_error":false,"result":"<livrable>Added livraison.txt.</livrable>"}'
`;

type PR = { number: number; branche: string; base: string };

// Un faux GitHub réduit à ce que le tour d'une station appelle, pour un seul
// ticket ; il survit aux stations, comme GitHub.
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
        this.commentaires.push({ id: this.commentaires.length + 1, body, createdAt: new Date(Date.UTC(2026, 10, 26) + this.commentaires.length * 1000).toISOString() });
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
        this.prs.push({ number, branche: pr.branche, base: pr.base });
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

type Cuisine = { faux: FauxGitHub; dits: string[]; racine: string; origine: string; clone: string; claude: string; feu: string };

function laCuisine(t: TestContext): Cuisine {
  const racine = repertoireTemporaire(t);
  const feu = join(racine, "feu");
  const claude = join(racine, "claude");
  writeFileSync(claude, fauxClaude(feu));
  chmodSync(claude, 0o755);
  return { faux: new FauxGitHub(), dits: [], racine, ...depotGit(t), claude, feu };
}

// Une vie de la station, sur l'état, le clone et le GitHub de la cuisine.
function uneStation(t: TestContext, cuisine: Cuisine): StationGitHub {
  const station = stationDuDepot({
    nom: "box/claude",
    places: 1,
    base: "v2",
    depotGitHub: "acme/shop",
    github: cuisine.faux.client(),
    depot: ouvrirDepot({ clone: cuisine.clone, base: "v2", worktrees: join(cuisine.racine, "worktrees"), env: ENV_GIT }),
    prise: priseDeLaStation,
    claude: cuisine.claude,
    env: { ...ENV_GIT },
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: join(cuisine.racine, "flux"),
    avertir: (ligne) => cuisine.dits.push(ligne),
  });
  if ("refus" in station) assert.fail(station.refus);
  // Le cook ne doit pas survivre au test.
  t.after(() => writeFileSync(cuisine.feu, ""));
  return station;
}

const relais = (cuisine: Cuisine) => join(cuisine.racine, "flux", `${TICKET}-github.flux.relais.json`);
const fin = (cuisine: Cuisine) => join(cuisine.racine, "flux", `${TICKET}-github.flux.fin.json`);
const commitsPousses = (cuisine: Cuisine) => git(cuisine.origine, "log", "--format=%s", "v2..cook/7-github").trim().split("\n");

// La station prend le ticket, son cook part par son relais, puis elle s'arrête pendant qu'il cuit.
async function arreteePendantLeCook(t: TestContext, cuisine: Cuisine): Promise<StationGitHub> {
  const premiere = uneStation(t, cuisine);
  await premiere.tour();
  await jusqua(() => existsSync(relais(cuisine)));
  premiere.arreter?.();
  return premiere;
}

test("a station stopped while its cook runs leaves it running: the restarted station follows it to its end and opens its PR, and the restart commits nothing on its branch (#4401)", { skip: SANS_BASH }, async (t) => {
  const cuisine = laCuisine(t);
  const premiere = await arreteePendantLeCook(t, cuisine);
  // Le ticket reste pris pour la station relancée : ni rendu, ni commenté.
  assert.ok(cuisine.faux.labels.has("taken"));
  assert.deepEqual(cuisine.faux.commentaires.map((c) => c.body.split("\n")[0]), ["<!-- brigade:prise station=box/claude -->"]);

  const relancee = uneStation(t, cuisine);
  await relancee.tour();
  assert.deepEqual(relancee.enCuisine(), [TICKET]);
  // Le cook d'avant la relance livre, et le même : aucun autre n'est lancé.
  writeFileSync(cuisine.feu, "");
  await relancee.calme();
  await premiere.calme();

  assert.deepEqual(cuisine.faux.prs.map(({ branche, base }) => ({ branche, base })), [{ branche: "cook/7-github", base: "v2" }], cuisine.dits.join("\n"));
  assert.ok(cuisine.faux.labels.has("in-pass"));
  assert.deepEqual(commitsPousses(cuisine), ["livraison"]);
  assert.ok(cuisine.dits.some((ligne) => ligne.includes("its cook outlived the station's restart")), cuisine.dits.join("\n"));
  // Ce que la relance laisse au disque est repris par la station relancée, une fois le ticket fini (#4104).
  assert.equal(existsSync(relais(cuisine)), false);
});

test("a cook whose relay ended while no station ran is delivered by the station's next start (#4401)", { skip: SANS_BASH }, async (t) => {
  const cuisine = laCuisine(t);
  const premiere = await arreteePendantLeCook(t, cuisine);
  writeFileSync(cuisine.feu, "");
  await premiere.calme();
  await jusqua(() => existsSync(fin(cuisine)));
  assert.deepEqual(cuisine.faux.prs, []);

  const relancee = uneStation(t, cuisine);
  await relancee.tour();
  await relancee.calme();

  assert.deepEqual(cuisine.faux.prs.map(({ branche }) => branche), ["cook/7-github"], cuisine.dits.join("\n"));
  assert.deepEqual(commitsPousses(cuisine), ["livraison"]);
  assert.equal(JSON.parse(readFileSync(join(cuisine.racine, "flux", "livraisons.jsonl"), "utf8").trim()).ticket, TICKET);
});
