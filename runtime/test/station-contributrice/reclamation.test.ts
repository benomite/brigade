// La prise d'un ticket par une station contributrice (#2935) : un commentaire
// signé du compte de la station, relu après l'écriture ; la plus ancienne prise
// valable l'emporte, jusqu'à son lâcher ou son échéance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Commentaire } from "../../src/github.ts";
import { BAIL_DE_PRISE_MS, corpsDeReclamation, corpsDeRendu, reclamant, reclamer, rendre, renouveler, type GitHubDeLaReclamation } from "../../src/station-contributrice/reclamation.ts";

const NUMERO = 7;

// Une issue publique que plusieurs comptes commentent : chaque commentaire est
// daté de l'horloge du test, qu'il avance d'une seconde.
function issue() {
  let horloge = Date.parse("2026-11-08T10:00:00Z");
  const commentaires: Commentaire[] = [];
  const client = (auteur: string, avantDePoster: () => Promise<void> = async () => {}): GitHubDeLaReclamation => ({
    commentaires: async () => [...commentaires],
    commenter: async (_numero, body) => {
      await avantDePoster();
      commentaires.push({ body, author: auteur, association: "NONE", createdAt: new Date(horloge).toISOString() });
      horloge += 1_000;
    },
  });
  return {
    commentaires,
    client,
    maintenant: () => new Date(horloge),
    avancer: (ms: number) => void (horloge += ms),
  };
}

test("two contributor stations race on a free ticket: both post, the oldest claim wins, the loser releases its own", async () => {
  const lieu = issue();
  // La seconde lit l'issue libre, puis ne poste qu'après la première.
  let poster = () => {};
  const premiere = new Promise<void>((resoudre) => (poster = resoudre));
  const [alice, bob] = await Promise.all([
    reclamer(NUMERO, { github: { ...lieu.client("alice"), commenter: async (n, corps) => (await lieu.client("alice").commenter(n, corps), poster()) }, station: "mac/claude", login: "alice", maintenant: lieu.maintenant }),
    reclamer(NUMERO, { github: lieu.client("bob", () => premiere), station: "pc/claude", login: "bob", maintenant: lieu.maintenant }),
  ]);
  assert.equal(alice.prise, true);
  assert.equal(bob.prise, false);
  assert.deepEqual(bob.tenant, alice.tenant);
  assert.deepEqual(
    lieu.commentaires.map(({ author, body }) => [author, body.split("\n")[0]]),
    [
      ["alice", "<!-- brigade:reclame station=mac/claude login=alice -->"],
      ["bob", "<!-- brigade:reclame station=pc/claude login=bob -->"],
      ["bob", "<!-- brigade:rend station=pc/claude login=bob -->"],
    ],
  );
  // Alice lâche : bob ne le tient pas pour autant, sa prise perdue est retirée.
  assert.equal(await rendre(NUMERO, { github: lieu.client("alice"), station: "mac/claude", login: "alice", maintenant: lieu.maintenant }), true);
  assert.equal(reclamant(lieu.commentaires, lieu.maintenant().getTime()), null);
});

test("a claimed ticket is not offered to another station until the claim is released", async () => {
  const lieu = issue();
  const alice = { github: lieu.client("alice"), station: "mac/claude", login: "alice", maintenant: lieu.maintenant };
  const bob = { github: lieu.client("bob"), station: "pc/claude", login: "bob", maintenant: lieu.maintenant };
  assert.equal((await reclamer(NUMERO, alice)).prise, true);
  const avant = lieu.commentaires.length;
  const refusee = await reclamer(NUMERO, bob);
  assert.equal(refusee.prise, false);
  assert.equal(refusee.tenant?.login, "alice");
  assert.equal(lieu.commentaires.length, avant, "bob writes nothing on a claimed ticket");
  // Bob ne lâche pas ce qu'il ne tient pas.
  assert.equal(await rendre(NUMERO, bob), false);
  assert.equal(await rendre(NUMERO, alice), true);
  assert.equal((await reclamer(NUMERO, bob)).prise, true);
});

test("a claimed ticket is offered again once its claim expires, unless the station renewed it", async () => {
  const lieu = issue();
  const alice = { github: lieu.client("alice"), station: "mac/claude", login: "alice", maintenant: lieu.maintenant };
  const bob = { github: lieu.client("bob"), station: "pc/claude", login: "bob", maintenant: lieu.maintenant };
  assert.equal((await reclamer(NUMERO, alice)).prise, true);
  lieu.avancer(BAIL_DE_PRISE_MS - 60_000);
  assert.equal((await reclamer(NUMERO, bob)).prise, false, "still within its lease");
  lieu.avancer(60_000);
  assert.equal((await reclamer(NUMERO, bob)).prise, true, "past its lease");

  // Renouvelée après la moitié de son bail, la prise tient au-delà du premier bail.
  const autre = issue();
  const carol = { github: autre.client("carol"), station: "mac/claude", login: "carol", maintenant: autre.maintenant };
  const dave = { github: autre.client("dave"), station: "pc/claude", login: "dave", maintenant: autre.maintenant };
  assert.equal((await reclamer(NUMERO, carol)).prise, true);
  assert.equal(await renouveler(NUMERO, carol), true);
  assert.equal(autre.commentaires.length, 1, "nothing to renew before half the lease");
  autre.avancer(BAIL_DE_PRISE_MS / 2);
  assert.equal(await renouveler(NUMERO, carol), true);
  assert.equal(autre.commentaires.length, 2);
  autre.avancer(BAIL_DE_PRISE_MS / 2);
  const refusee = await reclamer(NUMERO, dave);
  assert.equal(refusee.prise, false);
  assert.equal(refusee.tenant?.login, "carol");
  // Échue sans renouvellement, la station le sait.
  autre.avancer(BAIL_DE_PRISE_MS);
  assert.equal(await renouveler(NUMERO, carol), false);
});

test("a claim counts only when posted by the account it names: nobody claims for another", () => {
  const createdAt = "2026-11-08T10:00:00Z";
  const maintenant = Date.parse(createdAt) + 1_000;
  const usurpee: Commentaire = { body: corpsDeReclamation("pc/claude", "alice"), author: "mallory", association: "NONE", createdAt };
  assert.equal(reclamant([usurpee], maintenant), null);
  const sienne: Commentaire = { ...usurpee, author: "Alice" };
  assert.deepEqual(reclamant([sienne], maintenant), { station: "pc/claude", login: "alice", createdAt });
  // Un lâcher posté par un autre compte ne lâche rien.
  assert.deepEqual(reclamant([sienne, { body: corpsDeRendu("pc/claude", "alice"), author: "mallory", association: "NONE", createdAt }], maintenant)?.login, "alice");
  // Une date illisible ne compte pas.
  assert.equal(reclamant([{ ...sienne, createdAt: "" }], maintenant), null);
});

test("a station name or login that cannot sign a claim is refused before anything is written", async () => {
  const lieu = issue();
  await assert.rejects(reclamer(NUMERO, { github: lieu.client("alice"), station: "mac claude", login: "alice", maintenant: lieu.maintenant }), /station name/);
  await assert.rejects(reclamer(NUMERO, { github: lieu.client("alice"), station: "mac/claude", login: "a l", maintenant: lieu.maintenant }), /login/);
  assert.deepEqual(lieu.commentaires, []);
});
