import assert from "node:assert/strict";
import { test } from "node:test";
import { CHEF_TODO, corpsDeCarte } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { corpsDeVerdict, type CommentaireDeVerdict } from "../../src/github-etat/fusion.ts";
import { HORS_CUISINE, LABEL } from "../../src/github.ts";
import { MARQUE_D_ECHEC } from "../../src/qualite-github.ts";
import { LABEL_DU_BUG, relancer, RELANCES_MAX, type ContexteDeLaGuerison } from "../../src/guerison/relance.ts";

const TICKET = 40;
const PR = 41;
const SHA = "abc1234def";

// Un faux GitHub tenu en mémoire : les labels, les commentaires, la PR du
// ticket, les checks de chaque commit, les issues créées. Chaque `contexte()`
// est une station neuve, qui ne le lit que par son client.
function depot(labels: string[] = [LABEL, HORS_CUISINE]) {
  const etiquettes = new Set(labels);
  const commentaires = new Map<number, CommentaireDeVerdict[]>();
  const checks = new Map<string, { name: string; outcome: "red" | "green" | "pending" }[]>();
  const creees: { numero: number; titre: string; corps: string; labels: string[] }[] = [];
  let pr: { number: number; sha: string; state: "open" | "closed"; merged: boolean; enRetard: boolean; enConflit?: boolean; base?: string } | null = null;
  let horloge = Date.parse("2026-11-07T10:00:00Z");
  let id = 0;
  const poster = (numero: number, body: string, association = "OWNER") => {
    const liste = commentaires.get(numero) ?? [];
    liste.push({ id: ++id, body, association, createdAt: new Date((horloge += 1000)).toISOString() });
    commentaires.set(numero, liste);
  };
  const contexte = (): ContexteDeLaGuerison => ({
    station: "box/claude",
    base: "trunk",
    github: {
      commentaires: async (numero) => [...(commentaires.get(numero) ?? [])],
      commenter: async (numero, corps) => poster(numero, corps),
      labelliser: async (numero, ajout) => void (numero === TICKET && ajout.forEach((label) => etiquettes.add(label))),
      delabelliser: async (numero, label) => void (numero === TICKET && etiquettes.delete(label)),
      prDuTicket: async () => pr,
      ci: async (sha) => checks.get(sha) ?? [],
      creerIssue: async (issue) => {
        const numero = 100 + creees.length;
        creees.push({ numero, ...issue });
        return numero;
      },
    },
  });
  const ticket = () => ({ number: TICKET, title: "Heal the rail", labels: [...etiquettes] });
  return {
    etiquettes,
    creees,
    poster,
    checks,
    ouvrirPR: (etat: Partial<NonNullable<typeof pr>> = {}) => void (pr = { number: PR, sha: SHA, state: "open", merged: false, enRetard: false, ...etat }),
    commentairesDu: (numero = TICKET) => (commentaires.get(numero) ?? []).map(({ body }) => body),
    // La station remet le ticket de côté, comme elle le fait après ses renvois.
    remettreDeCote: () => void etiquettes.add(HORS_CUISINE),
    relancer: () => relancer(ticket(), contexte()),
  };
}

test("une PR en conflit avec la base : le ticket repart sur le rail sans geste humain, et le commentaire dit de rebaser sur la base", async () => {
  const d = depot();
  d.ouvrirPR({ enConflit: true, base: "develop" });
  assert.deepEqual(await d.relancer(), { fait: "relance", cause: "conflict", n: 1 });
  assert.ok(!d.etiquettes.has(HORS_CUISINE));
  assert.ok(d.etiquettes.has(LABEL));
  const [commentaire] = d.commentairesDu();
  assert.match(commentaire ?? "", /rebase the branch on `develop`/);
  assert.match(commentaire ?? "", /relaunch 1\/2/);
});

test("une PR qui ne dit pas sa base : la consigne nomme la branche d'intégration du projet, sans valeur propre à un dépôt", async () => {
  const d = depot();
  d.ouvrirPR({ enConflit: true });
  await d.relancer();
  assert.match(d.commentairesDu()[0] ?? "", /rebase the branch on `trunk`/);
});

test("un check rouge : le ticket repart, et le commentaire nomme le check en échec", async () => {
  const d = depot();
  d.ouvrirPR();
  d.checks.set(SHA, [
    { name: "unit tests", outcome: "red" },
    { name: "lint", outcome: "green" },
  ]);
  assert.deepEqual(await d.relancer(), { fait: "relance", cause: "red-check", n: 1 });
  assert.ok(!d.etiquettes.has(HORS_CUISINE));
  const [commentaire] = d.commentairesDu();
  assert.match(commentaire ?? "", /`unit tests`/);
  assert.doesNotMatch(commentaire ?? "", /`lint`/);
});

test("une relecture avec des points bloquants : le ticket repart, et le commentaire les liste", async () => {
  const d = depot();
  d.ouvrirPR();
  d.poster(PR, corpsDeVerdict("box/claude", SHA, { verdict: "request-changes", motif: "Two things block:\n- the guard is never tested\n- `relance.ts` writes outside its zone" }));
  assert.deepEqual(await d.relancer(), { fait: "relance", cause: "review", n: 1 });
  assert.ok(!d.etiquettes.has(HORS_CUISINE));
  const [commentaire] = d.commentairesDu();
  assert.match(commentaire ?? "", /^- the guard is never tested$/m);
  assert.match(commentaire ?? "", /^- `relance\.ts` writes outside its zone$/m);
});

test("un refus sur une tête plus ancienne ne compte pas : la livraison nouvelle n'a pas été relue", async () => {
  const d = depot();
  d.ouvrirPR();
  d.poster(PR, corpsDeVerdict("box/claude", "0000000", { verdict: "request-changes", motif: "- old point" }));
  assert.equal((await d.relancer()).fait, "rien");
  assert.ok(d.etiquettes.has(HORS_CUISINE));
});

test("un cook qui s'est arrêté : le ticket repart, et le commentaire dit pourquoi il s'est arrêté", async () => {
  const d = depot();
  d.poster(TICKET, `${MARQUE_D_ECHEC} n=3 -->\nStation \`box/claude\`: the cook stopped without a delivery — token ceiling reached\n\nTaken off the kitchen (\`${HORS_CUISINE}\`) after 3 cooks without a delivery: a human decides.`);
  assert.deepEqual(await d.relancer(), { fait: "relance", cause: "cook-stopped", n: 1 });
  assert.ok(!d.etiquettes.has(HORS_CUISINE));
  assert.match(d.commentairesDu().at(-1) ?? "", /token ceiling reached/);
});

test("après deux relances pour la même raison, la troisième n'a pas lieu, et un seul ticket de bug dit ce qui fait boucler", async () => {
  const d = depot();
  d.ouvrirPR({ enConflit: true });
  for (let n = 1; n <= RELANCES_MAX; n++) {
    assert.deepEqual(await d.relancer(), { fait: "relance", cause: "conflict", n });
    d.remettreDeCote();
  }
  const boucle = await d.relancer();
  assert.deepEqual(boucle, { fait: "boucle", cause: "conflict", bug: 100 });
  assert.ok(d.etiquettes.has(HORS_CUISINE), "the third relaunch is not performed");
  assert.equal(d.creees.length, 1);
  const [bug] = d.creees;
  assert.match(bug?.titre ?? "", /#40 loops/);
  assert.match(bug?.corps ?? "", /## What makes it loop/);
  assert.match(bug?.corps ?? "", /conflicts with the base/);
  assert.deepEqual(bug?.labels, [LABEL_DU_BUG]);
  // Rappelée, d'une station neuve : aucun second bug, aucune relance.
  assert.deepEqual(await d.relancer(), { fait: "deja-signale", cause: "conflict", bug: 100 });
  assert.equal(d.creees.length, 1);
  assert.ok(d.etiquettes.has(HORS_CUISINE));
});

test("les relances se comptent par raison : deux pour un conflit n'empêchent pas une relance pour un check rouge", async () => {
  const d = depot();
  d.ouvrirPR({ enConflit: true });
  await d.relancer();
  d.remettreDeCote();
  await d.relancer();
  d.remettreDeCote();
  d.ouvrirPR();
  d.checks.set(SHA, [{ name: "types", outcome: "red" }]);
  assert.deepEqual(await d.relancer(), { fait: "relance", cause: "red-check", n: 1 });
  assert.equal(d.creees.length, 0);
});

test("un ticket mis de côté pour une raison produit ou de design n'est pas relancé, même si sa PR est rouge", async () => {
  const d = depot([LABEL, HORS_CUISINE, CHEF_TODO]);
  d.poster(TICKET, corpsDeCarte({ sorte: "product-question", texte: "Which of the two layouts does the chef want?" }));
  d.ouvrirPR({ enConflit: true });
  assert.equal((await d.relancer()).fait, "rien");
  assert.ok(d.etiquettes.has(HORS_CUISINE));
  assert.equal(d.commentairesDu().length, 1);
  assert.equal(d.creees.length, 0);
});

test("une mise de côté dont la raison n'est pas réparable par un cook n'est pas relancée : un humain décide", async () => {
  const d = depot();
  d.poster(TICKET, "<!-- brigade:renvoi n=3 sha=abc -->\nStation `box/claude`: still not mergeable after 2 sends back — the design is undecided\n\nTaken off the kitchen (`served-elsewhere`): a human decides.");
  assert.equal((await d.relancer()).fait, "rien");
  assert.ok(d.etiquettes.has(HORS_CUISINE));
  assert.equal(d.commentairesDu().length, 1);
});

test("un ticket qui n'est pas de côté n'est pas touché", async () => {
  const d = depot([LABEL]);
  d.ouvrirPR({ enConflit: true });
  assert.deepEqual(await d.relancer(), { fait: "rien", pourquoi: "not set aside" });
  assert.equal(d.commentairesDu().length, 0);
});
