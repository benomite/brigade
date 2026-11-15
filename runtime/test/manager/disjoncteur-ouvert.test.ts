// Le disjoncteur ouvert ne retient que les cooks (#3600) : le manager juge et
// qualifie les tickets, qui sont prêts à cuisiner à sa fermeture.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { LancementRefuse } from "../../src/garde-fous.ts";
import { etatDesGardeFous } from "../../src/projections/guardrails.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { ENV_ENFANT, FAUX_CLAUDE, jusqua } from "../outils.ts";

// Une cuisine dont le manager est allumé et le disjoncteur déjà ouvert.
function disjoncteurOuvert(t: TestContext, numero: number) {
  const c = cuisine(t, { manager: {}, issues: [issue(numero, [])] });
  const journal = ouvrirJournal(c.repertoire);
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "breaker.opened", payload: { failures: 3, threshold: 3 } });
  journal.fermer();
  chef(c.repertoire, "manager.enabled");
  const jugements = () => c.lancements().filter((lancement) => lancement.args.includes("--tools"));
  const cuire = (ticket: number) => c.runtime.lancer({ ticket, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "fini" } });
  return { ...c, jugements, cuire };
}

test("le disjoncteur ouvert, un ticket mis sur le rail est jugé et qualifié par le manager, sans refus ni saut pour disjoncteur", async (t) => {
  const c = disjoncteurOuvert(t, 30);
  await jusqua(() => c.gh.lire(30)?.labels.includes("fire") === true);
  assert.notEqual(etatDesGardeFous(c.journal.base).breakerOpenedAt, null);
  assert.equal(c.jugements().length, 1);
  assert.equal(c.journal.tout().some((e) => e.type === "manager.judged" && e.ticket === 30), true);
  const tout = JSON.stringify([c.avertissements, c.journal.tout().filter((e) => e.type.startsWith("manager."))]);
  assert.doesNotMatch(tout, /disjoncteur|breaker/i);
});

test("le disjoncteur ouvert, aucun cook ne part", (t) => {
  const c = disjoncteurOuvert(t, 30);
  assert.throws(() => c.cuire(31), (erreur) => erreur instanceof LancementRefuse && erreur.motif === "breaker");
  assert.equal(c.journal.tout().some((e) => e.type === "cook.launched" && e.ticket === 31), false);
});

test("à la fermeture du disjoncteur, le ticket qualifié pendant l'ouverture est prêt et se cuisine sans geste ni nouveau jugement", async (t) => {
  const c = disjoncteurOuvert(t, 30);
  await jusqua(() => c.gh.lire(30)?.labels.includes("fire") === true);
  assert.throws(() => c.cuire(30), LancementRefuse);

  const journal = ouvrirJournal(c.repertoire);
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "breaker.lifted", payload: { failures: 0, threshold: 3 } });
  journal.fermer();
  await jusqua(() => etatDesGardeFous(c.journal.base).breakerOpenedAt === null);

  const fin = await c.cuire(30).fin;
  assert.equal(fin.outcome, "ok");
  assert.equal(c.gh.lire(30)?.labels.includes("fire"), true);
  assert.equal(c.jugements().length, 1);
});
