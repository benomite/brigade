// Rejoue #2551 (PR #2552, le verrou des gates sous le bac à sable) : un
// changement technique des gates, CI verte, qui a fini en carte « merge by
// hand ». Avec le second juge, il se merge dès que celui-ci l'approuve, sans
// carte de TODO ni `blocked-on-human` ; s'il refuse, la livraison repart chez
// un cook avec ses raisons, et rien n'est mergé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHEF_TODO } from "../src/github-seul/carte-todo/carte-todo.ts";
import { corpsDApprobation, verifierLeSecondJuge, type CommentaireDePR } from "../src/github-seul/second-juge/second-juge.ts";
import { renvoyerLaLivraison, type CommentaireLu } from "../src/github-seul/renvois/renvois.ts";
import { corpsDeVerdict, fusionner, type GitHubDeLaFusion, type PRAFusionner } from "../src/github-etat/fusion.ts";

const TICKET = 2551;
const PR_NUMERO = 2552;
const TETE = "abc1234def";
const FICHIERS = [".claude/brigade/gates.sh", ".github/workflows/tests.yml", "runtime/src/gates-verrou.ts"];

// Une cuisine d'un seul ticket : l'issue #2551, sa PR, leurs commentaires et
// labels, la CI verte de la tête, et tout ce qui s'écrit ou se merge.
function cuisine() {
  const commentairesPR: CommentaireDePR[] = [{ body: corpsDeVerdict("s1", TETE, { verdict: "approve", motif: "" }), association: "OWNER", createdAt: "2026-11-04T00:00:00Z" }];
  const commentairesIssue: CommentaireLu[] = [];
  const labels = new Set<string>(["in-pass"]);
  const issuesCreees: unknown[] = [];
  const merges: string[] = [];
  const pr: PRAFusionner = { number: PR_NUMERO, sha: TETE, state: "open", merged: false, enRetard: false, enConflit: false };
  const lus = () => commentairesPR.map((c, i) => ({ id: i + 1, ...c }));
  const github: GitHubDeLaFusion = {
    commentaires: async () => lus(),
    commenter: async (_, corps) => void commentairesPR.push({ body: corps, association: "OWNER", createdAt: "2026-11-04T00:00:01Z" }),
    mettreAJour: async () => {},
    merger: async (_, sha) => (merges.push(sha), { fait: true }) as never,
    ci: async () => [{ name: "tests", outcome: "green" }],
  };
  const secondJuge = {
    fichiers: async () => FICHIERS,
    commentaires: async () => [...commentairesPR],
    commenter: github.commenter as (pr: number, corps: string) => Promise<void>,
  };
  const renvois = {
    commentaires: async (n: number) => (n === TICKET ? [...commentairesIssue] : lus()),
    commenter: async (n: number, corps: string) => void (n === TICKET ? commentairesIssue.push({ id: commentairesIssue.length + 1, body: corps, association: "OWNER", createdAt: "2026-11-04T00:00:02Z" }) : commentairesPR.push({ body: corps, association: "OWNER", createdAt: "2026-11-04T00:00:02Z" })),
    labelliser: async (_: number, ls: string[]) => ls.forEach((l) => labels.add(l)),
    delabelliser: async (_: number, l: string) => void labels.delete(l),
    ci: github.ci,
    corpsDuTicket: async () => "Gates lock under the sandbox.",
  };
  const manager = { creerIssue: async (i: unknown) => (issuesCreees.push(i), 9999) };

  // L'étape de merge de la station : le second juge d'abord, puis la fusion.
  async function passer() {
    const decision = await verifierLeSecondJuge(PR_NUMERO, secondJuge);
    if (!decision.bloque) return { decision, fusion: await fusionner(pr, github) };
    // Refusée par le second juge : le motif se lit comme celui d'une relecture qui demande des changements.
    await github.commenter(PR_NUMERO, corpsDeVerdict("s1", TETE, { verdict: "request-changes", motif: `Second judge: ${decision.raison}.` }));
    const coup = await renvoyerLaLivraison({ number: TICKET, title: "Lock the gates under the sandbox", labels: [...labels] }, { genre: "relecture", pr: PR_NUMERO, sha: TETE }, { github: renvois, manager, station: "s1" });
    return { decision, fusion: null, coup };
  }
  return { passer, commentairesPR, commentairesIssue, labels, merges, issuesCreees };
}

test("#2551 rejoué : un changement des gates, CI verte, approuvé par le second juge, est mergé — sans carte de TODO ni blocked-on-human", async () => {
  const k = cuisine();
  k.commentairesPR.push({ body: corpsDApprobation("not-weakened"), association: "OWNER", createdAt: "2026-11-04T00:00:00Z" });
  const { decision, fusion } = await k.passer();
  assert.deepEqual(decision, { bloque: false });
  assert.deepEqual(fusion, { issue: "mergee" });
  assert.deepEqual(k.merges, [TETE]);
  // Ni carte (label ni commentaire de carte), ni blocage, sur l'issue comme sur la PR.
  assert.ok(!k.labels.has(CHEF_TODO) && !k.labels.has("blocked-on-human"));
  assert.ok([...k.commentairesPR, ...k.commentairesIssue].every(({ body }) => !body.includes("brigade:todo")));
  assert.deepEqual(k.issuesCreees, []);
});

test("#2551 rejoué, second juge qui refuse : la livraison repart chez un cook avec les raisons, n'est pas mergée, et ne devient pas une carte", async () => {
  const k = cuisine();
  k.commentairesPR.push({ body: corpsDApprobation("weakened"), association: "OWNER", createdAt: "2026-11-04T00:00:00Z" });
  const { decision, fusion, coup } = (await k.passer()) as Awaited<ReturnType<typeof k.passer>> & { coup?: Awaited<ReturnType<typeof renvoyerLaLivraison>> };
  assert.equal(decision.bloque, true);
  assert.equal(fusion, null);
  assert.deepEqual(k.merges, []);
  assert.equal(coup?.coup, "renvoi");
  // Le cook lit les raisons sur l'issue, et le ticket est libre.
  const renvoi = k.commentairesIssue.find(({ body }) => body.includes("brigade:renvoi"));
  assert.match(renvoi?.body ?? "", /sent back to a cook/);
  assert.match(renvoi?.body ?? "", /the second judge said: weakened/);
  assert.ok(!k.labels.has("in-pass"));
  assert.ok(!k.labels.has(CHEF_TODO) && !k.labels.has("blocked-on-human"));
  assert.ok([...k.commentairesPR, ...k.commentairesIssue].every(({ body }) => !body.includes("brigade:todo")));
});
