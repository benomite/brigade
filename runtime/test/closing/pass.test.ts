// La PR d'une passe de fermeture passe par la pass et le merge de tout le
// monde, sur un vrai dépôt git : la passe la remet à la pass, qui la juge
// fusionnée avec la base — gates, reviewer, CI — et ne la merge que sous le
// grant `merge`. Hors du rail : rouge, aucun cook ne la reprend, elle remonte
// au chef ; et ni la passe ni la pass ne poussent rien sur la base.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { principal as montrerPass } from "../../src/montrer-pass.ts";
import { chef } from "../aides/cuisine.ts";
import { appeler, BASE, git, jusqua } from "../outils.ts";
import { cuisineFermee, RETIRER_M1 } from "./kitchen.ts";

// Le numéro de la première PR du GitHub de test : c'est sous lui que la pass
// suit la livraison de la passe.
const PR = 101;
const URL = `https://github.com/benomite/brigade/pull/${PR}`;

// Une passe qui retire M1 et livre : sa fin, et de quoi lire ce que la pass en fait.
async function livrer(cuisine: ReturnType<typeof cuisineFermee>) {
  const { demander, fin, closer, gh, journal, types } = cuisine;
  closer.gestes(RETIRER_M1);
  closer.message("<livrable>\nRetiré : M1.\nLAISSÉ D1 : deux modules qui évoluent à part\nLAISSÉ M2 : pas sûr\n</livrable>\n");
  const { code, sortie } = await demander();
  assert.equal(code, 0, sortie);
  const passe = await fin();
  assert.equal(passe.outcome, "delivered");
  assert.equal(passe.pr, URL);
  return {
    passe,
    branche: passe.branch ?? "",
    // Les faits de la pass sur cette livraison, dans l'ordre.
    histoire: () => types(PR).filter((type) => type !== "pass.started"),
    dernier: (type: string) => journal.duTicket(PR).findLast((e) => e.type === type)?.payload as Record<string, unknown> | undefined,
    commentaires: () =>
      gh.commentaires
        .filter(([numero]) => numero === PR)
        .map(([, corps]) => corps)
        .join("\n\n"),
  };
}

test("ce que la passe retire passe par la pass et le merge normaux : sa PR est jugée fusionnée avec la base — gates, reviewer —, mergée sous le grant `merge`, et rien n'est commité sur la branche d'intégration", async (t) => {
  const cuisine = cuisineFermee(t);
  const { repertoire, gh, journal, origine, clone, teteDeLaBase, gates, relectures, pass, closer, types } = cuisine;
  const avant = teteDeLaBase();
  chef(repertoire, "grant.activated");

  const { passe, branche, histoire, dernier, commentaires } = await livrer(cuisine);
  await jusqua(() => types(PR).includes("merge.done"));

  // Le chemin de toute livraison, sans un pas de moins : entrée en pass,
  // relue, jugée, puis l'intention de merger sous le grant, et son résultat.
  assert.deepEqual(histoire(), ["pass.entered", "gates.ran", "pass.reviewed", "pass.judged", "grant.used", "merge.done"]);
  assert.deepEqual(dernier("pass.entered"), { run: passe.run, branch: branche, pr: URL, number: PR });
  // Ce qui est jugé : le commit que l'origine a reçu, fusionné avec la base.
  const livre = git(origine, "rev-parse", branche);
  const jugement = dernier("pass.judged");
  assert.deepEqual([jugement?.sha, jugement?.base, jugement?.verdict, jugement?.noDiff], [livre, avant, "green", false]);
  assert.equal((jugement?.gates as { outcome: string }).outcome, "green");
  assert.equal((jugement?.review as { outcome: string }).outcome, "green");
  // Les gates du projet, une fois, dans le worktree jetable de la fusion.
  assert.deepEqual(gates.appels(), [join(repertoire, "worktrees", ".essais", `jugement-${PR}`)]);
  // Le reviewer, une fois — un autre process que le closer, parti une fois lui
  // aussi —, sur ce que la PR annonce et sur le diff.
  assert.equal(closer.lancements().length, 1);
  assert.equal(relectures().length, 1);
  const consigne = relectures()[0]?.args[1] ?? "";
  assert.match(consigne, /Tu relis le diff qu'un closer .* a livré dans la PR #101, avant qu'il ne soit mergé sur `v2`/);
  assert.match(consigne, /PR #101 — Fermeture — passe fermeture-[0-9a-f]{8}\n/);
  assert.match(consigne, /## Retiré — 1 sur 3 candidats/);
  assert.match(consigne, /-export function inutile\(\) \{ return 2; \}/);
  assert.doesNotMatch(consigne, /repart au cook/);
  // Le merge est celui de la pass, sous le grant : demandé à GitHub pour ce
  // commit, autorisé par ce verdict — et par rien d'autre.
  assert.deepEqual(gh.merges, [[PR, livre]]);
  const usage = dernier("grant.used");
  assert.deepEqual([usage?.action, usage?.pr, usage?.sha, usage?.base], ["merge", URL, livre, BASE]);
  assert.equal(usage?.verdict, journal.duTicket(PR).find((e) => e.type === "pass.judged")?.seq);
  assert.deepEqual([dernier("merge.done")?.by, dernier("merge.done")?.unverified], ["pass", false]);
  // Aucun commit direct : ni la passe ni la pass n'ont rien poussé sur la
  // branche d'intégration — l'origine la porte telle qu'elle était, et le
  // worktree de la fusion jugée n'est parti nulle part.
  assert.equal(teteDeLaBase(), avant);
  assert.equal(git(clone, "rev-parse", `origin/${BASE}`), avant);
  assert.deepEqual(cuisine.branchesDeLOrigine(), [branche, BASE].sort());
  // Hors du rail : ni ticket à servir, ni issue à fermer — et la pass, qui a
  // mergé, ne suit plus rien.
  assert.deepEqual(gh.fermetures, []);
  assert.deepEqual(cuisine.runtime.rail.tickets(), []);
  assert.deepEqual(pass(), []);
  // Elle parle sur la PR.
  await jusqua(() => /mergée sur `v2`/.test(commentaires()));
  assert.match(commentaires(), /\*\*Reviewer — rien de bloquant\.\*\*/);
  assert.match(commentaires(), /\*\*Pass — verte, mergée sur `v2` sous le grant `merge`\.\*\*/);
});

test("sans grant, la PR d'une passe n'est pas mergée : la pass s'arrête verte, le dit sur la PR, et voit le merge que le chef fait à la main", async (t) => {
  const cuisine = cuisineFermee(t);
  const { repertoire, gh, types, pass, teteDeLaBase } = cuisine;
  const avant = teteDeLaBase();

  const { histoire, dernier, commentaires } = await livrer(cuisine);
  await jusqua(() => types(PR).includes("pass.held"));

  assert.deepEqual(histoire(), ["pass.entered", "gates.ran", "pass.reviewed", "pass.judged", "pass.held"]);
  assert.equal(dernier("pass.held")?.reason, "no-grant");
  assert.deepEqual(gh.merges, []);
  assert.equal(teteDeLaBase(), avant);
  assert.deepEqual(
    pass().map(({ ticket, horsRail, phase, reason, pr }) => ({ ticket, horsRail, phase, reason, pr })),
    [{ ticket: PR, horsRail: true, phase: "held", reason: "no-grant", pr: URL }],
  );
  await jusqua(() => /non mergée/.test(commentaires()));
  assert.match(commentaires(), /\*\*Pass — verte, non mergée \(`no-grant`\)\.\*\*/);
  assert.match(commentaires(), /À merger à la main — la pass le verra\. /);
  assert.doesNotMatch(commentaires(), /servira le ticket/);
  // `run pass` la montre pour ce qu'elle est : une PR, hors du rail.
  const lue = appeler(montrerPass, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await lue.fin, 0);
  assert.match(lue.sortie(), /^PR #101 {2}off the rail \(run fermeture-[0-9a-f]{8}\) {2}STOPPED — green, not merged \(no-grant\) {2}since /m);

  // Elle ne tient qu'au journal : le runtime redémarré la suit toujours, sans
  // la rejuger ni la faire relire.
  cuisine.runtime.arreter("essai");
  const seconde = cuisineFermee(t, { lieux: cuisine.lieux });
  assert.deepEqual(
    seconde.pass().map(({ ticket, horsRail, phase, reason }) => ({ ticket, horsRail, phase, reason })),
    [{ ticket: PR, horsRail: true, phase: "held", reason: "no-grant" }],
  );

  // Le chef merge à la main : la pass le constate, et n'a plus rien à suivre.
  gh.mergerPR(PR, "chef");
  await jusqua(() => seconde.types(PR).includes("merge.done"));
  const merge = seconde.journal.duTicket(PR).findLast((e) => e.type === "merge.done")?.payload as Record<string, unknown> | undefined;
  assert.deepEqual([merge?.by, merge?.unverified], ["outside", true]);
  assert.deepEqual(seconde.pass(), []);
  assert.deepEqual(gh.fermetures, []);
  assert.deepEqual(gh.merges, []);
  assert.equal(seconde.relectures().length, 1);
});

test("un constat bloquant du reviewer retient la PR d'une passe, grant ou pas : rien n'est mergé, aucun cook ni closer n'est renvoyé, elle remonte au chef", async (t) => {
  const cuisine = cuisineFermee(t, { relecture: "relit-rouge" });
  const { repertoire, gh, types, pass, closer, relectures } = cuisine;
  chef(repertoire, "grant.activated");

  const { histoire, dernier, commentaires } = await livrer(cuisine);
  await jusqua(() => types(PR).includes("pass.escalated"));

  assert.deepEqual(histoire(), ["pass.entered", "gates.ran", "pass.reviewed", "pass.judged", "pass.escalated"]);
  assert.equal(dernier("pass.judged")?.verdict, "red");
  assert.deepEqual(dernier("pass.judged")?.findings, ["Relecture — constat bloquant (`travail.txt`) : Le cas d'erreur est avalé : rien ne remonte."]);
  assert.deepEqual(dernier("pass.escalated"), { reason: "still-red", cause: "off-rail" });
  assert.deepEqual(gh.merges, []);
  assert.deepEqual(
    pass().map(({ ticket, phase, reason, cause }) => ({ ticket, phase, reason, cause })),
    [{ ticket: PR, phase: "escalated", reason: "still-red", cause: "off-rail" }],
  );
  await jusqua(() => /remontée au chef/.test(commentaires()));
  assert.match(commentaires(), /\*\*Pass — rouge : remontée au chef\.\*\*/);
  assert.match(commentaires(), /aucun cook n'est renvoyé sur une livraison hors du rail : cette PR reste ouverte/);
  // Personne ne repart dessus : ni renvoi, ni seconde relecture, ni seconde passe.
  assert.equal(closer.lancements().length, 1);
  assert.equal(relectures().length, 1);

  // Fermée sans merge par le chef : la pass en prend acte, et ne la suit plus.
  const ouverte = [...gh.ouvertes.values()].find((pr) => pr.number === PR);
  assert.ok(ouverte);
  ouverte.state = "closed";
  await jusqua(() => types(PR).includes("pass.pr-closed"));
  assert.deepEqual(pass(), []);
  assert.deepEqual(gh.merges, []);
});

test("des gates rouges sur la fusion retiennent la PR d'une passe : le reviewer n'est pas appelé, rien n'est mergé sous le grant, elle remonte au chef", async (t) => {
  const cuisine = cuisineFermee(t);
  const { repertoire, gh, types, gates, relectures } = cuisine;
  chef(repertoire, "grant.activated");
  gates.regler("rouge");

  const { histoire, dernier, commentaires } = await livrer(cuisine);
  await jusqua(() => types(PR).includes("pass.escalated"));

  // Rouges une fois fusionnée : la base, rejouée seule, est verte — ce rouge
  // est celui de la passe.
  assert.deepEqual(histoire(), ["pass.entered", "gates.ran", "pass.judged", "pass.escalated"]);
  const jugement = dernier("pass.judged");
  assert.equal(jugement?.verdict, "red");
  assert.equal((jugement?.gates as { outcome: string }).outcome, "red");
  assert.equal((jugement?.review as { outcome: string }).outcome, "skipped");
  assert.deepEqual(gates.appels(), [join(repertoire, "worktrees", ".essais", `jugement-${PR}`), join(repertoire, "worktrees", ".essais", "base")]);
  assert.deepEqual(relectures(), []);
  assert.deepEqual(gh.merges, []);
  await jusqua(() => /remontée au chef/.test(commentaires()));
  assert.match(commentaires(), /Gates rouges sur la fusion de `[0-9a-f]{7}` avec `v2`/);
});
