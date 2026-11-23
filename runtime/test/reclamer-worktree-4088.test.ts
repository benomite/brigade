// #4088 : un cook fini ne laisse pas son worktree (node_modules, caches de
// build) sur le disque d'une erreur qui a coupé le tour avant son rangement ;
// le worktree d'un cook en vol n'est pas touché.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { priseDeLaStation, stationDuDepot } from "../src/brigade-github.ts";
import { ouvrirDepot } from "../src/depot.ts";
import type { GitHub } from "../src/github.ts";
import { depotGit, ENV_GIT, git, repertoireTemporaire } from "./outils.ts";

const SANS_BASH = process.platform === "win32" && "le faux `claude` est un script bash";
const TICKET = 7;

const CLAUDE = `#!/usr/bin/env bash
cat > /dev/null
mkdir -p node_modules/lourd && printf 'x\\n' > node_modules/lourd/index.js
printf 'delivered\\n' > livraison.txt
git add livraison.txt && git commit -q -m "livraison" || exit 1
echo '{"type":"result","subtype":"success","is_error":false,"result":"<livrable>Added livraison.txt.</livrable>","total_cost_usd":0.5}'
`;

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


test("a cook that ended on an error leaves no worktree behind, and the worktree of a cook in flight is untouched", { skip: SANS_BASH }, async (t) => {
  const faux = new FauxGitHub();
  const racine = repertoireTemporaire(t);
  const { clone } = depotGit(t);
  const worktrees = join(racine, "worktrees");
  const claude = join(racine, "claude");
  writeFileSync(claude, CLAUDE);
  chmodSync(claude, 0o755);
  // Le worktree d'un autre cook, en vol : ni lui ni ce qu'il porte ne bougent.
  const enVol = join(worktrees, "99-github-vivant");
  mkdirSync(join(enVol, "node_modules"), { recursive: true });
  writeFileSync(join(enVol, "node_modules", "dep.js"), "vivant");
  const vrai = ouvrirDepot({ clone, base: "v2", worktrees, env: ENV_GIT });
  const dits: string[] = [];
  // Le tour casse après le cook, avant que le worktree ne soit rangé.
  const depot = { ...vrai, commits: () => { throw new Error("boom after the cook"); } };
  const station = stationDuDepot({
    nom: "box/claude", places: 1, base: "v2", depotGitHub: "acme/shop", github: faux.client(), depot, prise: priseDeLaStation, claude,
    env: ENV_GIT, cloison: null, plafonds: { durationMs: 60_000, tokens: 1_000_000, idleMs: 60_000 }, graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" }, flux: join(racine, "flux"), avertir: (ligne) => dits.push(ligne),
  });
  if ("refus" in station) assert.fail(station.refus);
  t.after(() => station.calme());
  await station.tour();
  await station.calme();
  assert.ok(dits.some((ligne) => ligne.includes("boom after the cook")), dits.join("\n"));
  assert.equal(existsSync(join(worktrees, `${TICKET}-github`)), false, "the ended cook's worktree is still on disk");
  assert.equal(existsSync(join(worktrees, `${TICKET}-github`, "node_modules")), false);
  assert.ok(existsSync(join(enVol, "node_modules", "dep.js")), "a cook in flight lost its worktree");
  assert.ok(git(clone, "branch", "--list", "cook/7-github") !== "", "the work was not kept on its branch");
});
