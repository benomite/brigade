import assert from "node:assert/strict";
import { test } from "node:test";
import { approuvee, ciDeLaTete, corpsDeVerdict, dernierVerdict, fusionnable, fusionner, relire, type CommentaireDeVerdict, type GitHubDeLaFusion, type Jugement, type PRAFusionner } from "../../src/github-etat/fusion.ts";
import type { Merge } from "../../src/github.ts";
import { CONTEXTE_DES_GATES } from "../../src/github-etat/gates-de-la-tete.ts";

const NUMERO = 77;

// Une PR sur GitHub, que plusieurs stations lisent et écrivent. Chaque
// commentaire reçoit l'id suivant et l'instant de l'horloge, avancée d'une
// seconde à chaque commentaire. `enRetard` est ce que GitHub dit de la
// branche face à sa base ; une mise à jour la remet à jour, sous une tête
// nouvelle. Le merge suit la règle de GitHub : refusé si la branche est en
// retard ou si la tête a bougé.
function prSurGitHub() {
  let horloge = Date.parse("2026-11-02T10:00:00Z");
  let id = 5000;
  let tetes = 0;
  const pr: { sha: string; state: "open" | "closed"; merged: boolean; enRetard: boolean } = { sha: "a1", state: "open", merged: false, enRetard: false };
  const commentaires: CommentaireDeVerdict[] = [];
  // La CI de la tête : verte par défaut.
  const ci: { etat: "green" | "red" | "pending" } = { etat: "green" };
  const appels: string[] = [];
  const poster = (corps: string, association = "OWNER") => {
    commentaires.push({ id: ++id, body: corps, association, createdAt: new Date(horloge).toISOString() });
    horloge += 1_000;
  };
  const github: GitHubDeLaFusion = {
    async commentaires() {
      await Promise.resolve();
      return [...commentaires];
    },
    async commenter(_numero, corps) {
      await Promise.resolve();
      appels.push(`comment ${corps.split("\n")[0]}`);
      poster(corps);
    },
    async mettreAJour(_numero, sha) {
      appels.push(`update-branch ${sha}`);
      if (sha !== pr.sha) return;
      pr.sha = `b${++tetes}`;
      pr.enRetard = false;
    },
    async ci() {
      return [{ name: "tests", outcome: ci.etat }];
    },
    async merger(_numero, sha): Promise<Merge> {
      appels.push(`merge ${sha}`);
      if (pr.enRetard) return { fait: false, motif: "HTTP 405 — Head branch is out of date" };
      if (sha !== pr.sha) return { fait: false, motif: "HTTP 409 — Head branch was modified" };
      pr.state = "closed";
      pr.merged = true;
      return { fait: true };
    },
  };
  return {
    github,
    commentaires,
    appels,
    // La PR telle qu'une station la lit au sondage.
    lue: (): PRAFusionner => ({ number: NUMERO, ...pr }),
    // La base avance : GitHub dit la branche en retard.
    baseAvance: () => (pr.enRetard = true),
    // Le cook pousse une livraison nouvelle sur la branche.
    pousser: (sha: string) => (pr.sha = sha),
    poster,
    ci,
  };
}

const juge = (verdict: Jugement["verdict"], motif = "") => {
  const jugees: string[] = [];
  return { jugees, juger: async (pr: PRAFusionner) => (jugees.push(pr.sha), { verdict, motif }) };
};

test("une station qui n'a pas cuisiné relit la PR : son verdict l'approuve", async () => {
  const pr = prSurGitHub();
  // `mac` a cuisiné et ouvert la PR ; c'est `box` qui la relit.
  assert.equal(approuvee(pr.commentaires), false);
  const { juger } = juge("approve", "Looks good.");
  const rendu = await relire(pr.lue(), { github: pr.github, station: "box", juger });
  assert.deepEqual(rendu, { station: "box", verdict: "approve", sha: "a1", commentaire: pr.commentaires[0]?.id });
  assert.equal(approuvee(pr.commentaires), true);
  assert.equal(fusionnable(pr.lue(), pr.commentaires), true);
  assert.deepEqual(pr.appels, ["comment <!-- brigade:verdict station=box verdict=approve sha=a1 -->"]);
  assert.match(pr.commentaires[0]?.body ?? "", /^<!-- brigade:verdict station=box verdict=approve sha=a1 -->\nApproved by station `box`\.\n\nLooks good\.$/);
});

test("la station qui a cuisiné peut aussi relire : aucune station n'est à part", async () => {
  const pr = prSurGitHub();
  await relire(pr.lue(), { github: pr.github, station: "mac", ...juge("approve") });
  assert.equal(dernierVerdict(pr.commentaires)?.station, "mac");
  assert.equal(approuvee(pr.commentaires), true);
});

test("une PR déjà approuvée ne se relit pas, d'où que vienne l'approbation", async () => {
  const pr = prSurGitHub();
  await relire(pr.lue(), { github: pr.github, station: "box", ...juge("approve") });
  const seconde = juge("request-changes");
  const rendu = await relire(pr.lue(), { github: pr.github, station: "pi", juger: seconde.juger });
  assert.equal(rendu?.station, "box");
  assert.deepEqual(seconde.jugees, []);
  assert.equal(pr.commentaires.length, 1);
});

test("un refus tient pour sa tête ; une livraison nouvelle se relit, et le dernier verdict l'emporte", async () => {
  const pr = prSurGitHub();
  await relire(pr.lue(), { github: pr.github, station: "box", ...juge("request-changes", "Missing test.") });
  assert.equal(approuvee(pr.commentaires), false);
  assert.equal(fusionnable(pr.lue(), pr.commentaires), false);
  // Même tête : rien ne se rejuge.
  const meme = juge("approve");
  assert.equal((await relire(pr.lue(), { github: pr.github, station: "pi", juger: meme.juger }))?.verdict, "request-changes");
  assert.deepEqual(meme.jugees, []);
  // Le cook relivre : une autre station relit la tête nouvelle et l'approuve.
  pr.pousser("c3");
  const nouvelle = juge("approve");
  const rendu = await relire(pr.lue(), { github: pr.github, station: "pi", juger: nouvelle.juger });
  assert.deepEqual(nouvelle.jugees, ["c3"]);
  assert.deepEqual(rendu && { station: rendu.station, verdict: rendu.verdict, sha: rendu.sha }, { station: "pi", verdict: "approve", sha: "c3" });
  assert.equal(approuvee(pr.commentaires), true);
});

test("le dernier verdict se lit dans quelque ordre que GitHub rende les commentaires, et seul le dépôt en rend", () => {
  const pr = prSurGitHub();
  pr.poster(corpsDeVerdict("box", "a1", { verdict: "approve", motif: "" }));
  pr.poster(corpsDeVerdict("pi", "a1", { verdict: "request-changes", motif: "" }));
  // Un inconnu ne peut pas approuver une PR publique.
  pr.poster(corpsDeVerdict("intrus", "a1", { verdict: "approve", motif: "" }), "NONE");
  assert.equal(dernierVerdict(pr.commentaires)?.station, "pi");
  assert.equal(dernierVerdict([...pr.commentaires].reverse())?.station, "pi");
  assert.equal(approuvee(pr.commentaires), false);
  // Deux verdicts dans la même seconde : l'id départage.
  const meme = pr.commentaires.slice(0, 2).map((commentaire) => ({ ...commentaire, createdAt: "2026-11-02T10:00:00.000Z" }));
  assert.equal(dernierVerdict([...meme].reverse())?.station, "pi");
  assert.equal(dernierVerdict([]), null);
});

test("fusionnable est faux tant que la branche est en retard sur sa base, vrai une fois à jour et approuvée", async () => {
  const pr = prSurGitHub();
  // Ni approuvée ni en retard : pas fusionnable.
  assert.equal(fusionnable(pr.lue(), pr.commentaires), false);
  await relire(pr.lue(), { github: pr.github, station: "box", ...juge("approve") });
  pr.baseAvance();
  // Approuvée mais en retard : pas fusionnable.
  assert.equal(pr.lue().enRetard, true);
  assert.equal(fusionnable(pr.lue(), pr.commentaires), false);
  await fusionner(pr.lue(), pr.github);
  // À jour, et l'approbation tient sous la tête nouvelle : fusionnable.
  assert.equal(pr.lue().enRetard, false);
  assert.notEqual(pr.lue().sha, "a1");
  assert.equal(fusionnable(pr.lue(), pr.commentaires), true);
  // Une PR mergée ne l'est plus.
  await fusionner(pr.lue(), pr.github);
  assert.equal(fusionnable(pr.lue(), pr.commentaires), false);
});

test("une branche en retard : la mise à jour est demandée, jamais le merge", async () => {
  const pr = prSurGitHub();
  await relire(pr.lue(), { github: pr.github, station: "box", ...juge("approve") });
  pr.baseAvance();
  pr.appels.length = 0;
  assert.deepEqual(await fusionner(pr.lue(), pr.github), { issue: "mise-a-jour" });
  assert.deepEqual(pr.appels, ["update-branch a1"]);
  assert.equal(pr.appels.some((appel) => appel.startsWith("merge")), false);
  assert.equal(pr.lue().merged, false);
  // Le passage suivant, sur la PR relue à jour, la merge.
  assert.deepEqual(await fusionner(pr.lue(), pr.github), { issue: "mergee" });
  assert.deepEqual(pr.appels, ["update-branch a1", "merge b1"]);
});

test("une PR non approuvée ne se met pas à jour et ne se merge pas", async () => {
  const pr = prSurGitHub();
  pr.baseAvance();
  assert.deepEqual(await fusionner(pr.lue(), pr.github), { issue: "non-approuvee" });
  await relire(pr.lue(), { github: pr.github, station: "box", ...juge("request-changes") });
  pr.appels.length = 0;
  assert.deepEqual(await fusionner(pr.lue(), pr.github), { issue: "non-approuvee" });
  assert.deepEqual(pr.appels, []);
});

test("le merge est tenté par la station qui appelle, quelle qu'elle soit, sans demander qui elle est", async () => {
  for (const station of ["mac", "box", "pi"]) {
    const pr = prSurGitHub();
    // `mac` a cuisiné, `box` a relu ; c'est `station` qui passe merger.
    await relire(pr.lue(), { github: pr.github, station: "box", ...juge("approve") });
    pr.appels.length = 0;
    // Le client ne porte ni identité ni station principale : qu'on lui en
    // demande une, et le test casse.
    const github = Object.assign(Object.create(pr.github) as GitHubDeLaFusion, {
      identite: () => assert.fail(`${station} : la fusion a demandé une identité`),
      stationPrincipale: () => assert.fail(`${station} : la fusion a cherché une station principale`),
    });
    assert.deepEqual(await fusionner(pr.lue(), github), { issue: "mergee" }, station);
    assert.deepEqual(pr.appels, ["merge a1"], station);
    assert.equal(pr.lue().merged, true);
  }
});

test("la base bouge entre la lecture et le merge : GitHub refuse, et le refus est rendu tel quel", async () => {
  const pr = prSurGitHub();
  await relire(pr.lue(), { github: pr.github, station: "box", ...juge("approve") });
  const lue = pr.lue();
  pr.baseAvance();
  assert.deepEqual(await fusionner(lue, pr.github), { issue: "refusee", motif: "HTTP 405 — Head branch is out of date" });
  assert.equal(pr.lue().merged, false);
  // La station suivante relit la PR en retard : elle la met à jour.
  assert.deepEqual(await fusionner(pr.lue(), pr.github), { issue: "mise-a-jour" });
});

test("une PR close ne se relit ni ne se merge", async () => {
  const pr = prSurGitHub();
  const close: PRAFusionner = { ...pr.lue(), state: "closed" };
  const { juger, jugees } = juge("approve");
  assert.equal(await relire(close, { github: pr.github, station: "box", juger }), null);
  assert.deepEqual(await fusionner(close, pr.github), { issue: "close" });
  assert.deepEqual(jugees, []);
  assert.deepEqual(pr.appels, []);
});

test("un nom de station qui ne s'écrit pas dans le marqueur est refusé avant toute écriture", async () => {
  const pr = prSurGitHub();
  await assert.rejects(relire(pr.lue(), { github: pr.github, station: "box --> x", ...juge("approve") }), /station name not usable/);
  assert.deepEqual(pr.appels, []);
});

test("une station nommée <machine>/<moteur> signe son verdict et le relit", async () => {
  const pr = prSurGitHub();
  const rendu = await relire(pr.lue(), { github: pr.github, station: "box/claude", ...juge("approve") });
  assert.equal(rendu?.station, "box/claude");
  assert.match(pr.commentaires[0]?.body ?? "", /^<!-- brigade:verdict station=box\/claude verdict=approve sha=a1 -->/);
  assert.equal(approuvee(pr.commentaires), true);
});

test("une PR approuvée ne se merge pas tant que la CI de sa tête n'est pas verte : rouge, elle n'est jamais mergée", async () => {
  const pr = prSurGitHub();
  await relire(pr.lue(), { github: pr.github, station: "box", ...juge("approve") });
  pr.ci.etat = "pending";
  assert.deepEqual(await fusionner(pr.lue(), pr.github), { issue: "ci-attendue" });
  pr.ci.etat = "red";
  assert.deepEqual(await fusionner(pr.lue(), pr.github), { issue: "ci-rouge" });
  assert.equal(pr.appels.some((a) => a.startsWith("merge")), false);
  pr.ci.etat = "green";
  assert.deepEqual(await fusionner(pr.lue(), pr.github), { issue: "mergee" });
});

// espace, le 2026-11-05 (#2456) : ses PR ne portent plus aucune CI — ses tests
// tournent sur la box. Ce sont les gates du projet, jouées par une station sur
// la tête, qui en tiennent lieu ; un projet qui a une CI sur ses PR la garde.
test("un projet sans CI sur ses PR : la PR approuvée sans aucun check attend ses gates, se merge sur leur statut vert, repart sur un rouge", async () => {
  const pr = prSurGitHub();
  await relire(pr.lue(), { github: pr.github, station: "box/claude", ...juge("approve") });
  let checks: Array<{ name: string; outcome: "green" | "red" | "pending" }> = [];
  const github: GitHubDeLaFusion = { ...pr.github, ci: async () => checks };
  assert.deepEqual(await fusionner(pr.lue(), github, { ciDesPR: false }), { issue: "gates-a-jouer" });
  checks = [{ name: CONTEXTE_DES_GATES, outcome: "pending" }];
  assert.deepEqual(await fusionner(pr.lue(), github, { ciDesPR: false }), { issue: "ci-attendue" });
  checks = [{ name: CONTEXTE_DES_GATES, outcome: "red" }];
  assert.deepEqual(await fusionner(pr.lue(), github, { ciDesPR: false }), { issue: "ci-rouge" });
  // Un autre check rouge sur la tête la renvoie aussi, sans attendre les gates.
  checks = [{ name: "pages", outcome: "red" }];
  assert.deepEqual(await fusionner(pr.lue(), github, { ciDesPR: false }), { issue: "ci-rouge" });
  assert.equal(pr.appels.some((a) => a.startsWith("merge")), false);
  checks = [{ name: CONTEXTE_DES_GATES, outcome: "green" }];
  assert.deepEqual(await fusionner(pr.lue(), github, { ciDesPR: false }), { issue: "mergee" });
});

test("un projet avec une CI sur ses PR la garde : ni l'absence de check ni un statut vert des gates ne la remplacent", async () => {
  const pr = prSurGitHub();
  await relire(pr.lue(), { github: pr.github, station: "box/claude", ...juge("approve") });
  let checks: Array<{ name: string; outcome: "green" | "red" | "pending" }> = [];
  const github: GitHubDeLaFusion = { ...pr.github, ci: async () => checks };
  // La CI n'a pas encore démarré : la PR attend, et aucune gate ne se joue.
  assert.deepEqual(await fusionner(pr.lue(), github), { issue: "ci-attendue" });
  assert.deepEqual(await fusionner(pr.lue(), github, { ciDesPR: true }), { issue: "ci-attendue" });
  checks = [{ name: CONTEXTE_DES_GATES, outcome: "green" }];
  assert.deepEqual(await fusionner(pr.lue(), github), { issue: "ci-attendue" });
  checks = [{ name: CONTEXTE_DES_GATES, outcome: "green" }, { name: "tests", outcome: "pending" }];
  assert.deepEqual(await fusionner(pr.lue(), github), { issue: "ci-attendue" });
  assert.equal(pr.appels.some((a) => a.startsWith("merge")), false);
  checks = [{ name: CONTEXTE_DES_GATES, outcome: "red" }, { name: "tests", outcome: "green" }];
  assert.deepEqual(await fusionner(pr.lue(), github), { issue: "mergee" });
});

test("ciDeLaTete : la CI de la tête pour le merge, avec ou sans CI sur les PR du projet", () => {
  assert.equal(ciDeLaTete([], true), "pending");
  assert.equal(ciDeLaTete([], false), "gates-a-jouer");
  assert.equal(ciDeLaTete([{ name: "pages", outcome: "green" }], false), "gates-a-jouer");
  assert.equal(ciDeLaTete([{ name: "pages", outcome: "pending" }, { name: CONTEXTE_DES_GATES, outcome: "green" }], false), "pending");
  assert.equal(ciDeLaTete([{ name: "pages", outcome: "green" }, { name: CONTEXTE_DES_GATES, outcome: "green" }], false), "green");
  assert.equal(ciDeLaTete([{ name: "tests", outcome: "green" }], true), "green");
});
