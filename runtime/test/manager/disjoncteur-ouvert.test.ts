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
  // Le contrôle que rejoue le superviseur (#3911) échoue ici (`FAUX_CLAUDE_CONTROLE`) : le disjoncteur reste ouvert, et il n'est pas un jugement.
  const jugements = () => c.lancements().filter((lancement) => lancement.args.includes("--tools") && !lancement.args.some((arg) => arg.includes("health check of the kitchen")));
  const cuire = (ticket: number) => c.runtime.lancer({ ticket, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "fini" } });
  return { ...c, jugements, cuire };
}

test("le disjoncteur ouvert, un ticket mis sur le rail est jugé et qualifié par le manager, sans refus ni saut pour disjoncteur", async (t) => {
  const c = disjoncteurOuvert(t, 30);
  await jusqua(() => c.gh.lire(30)?.labels.includes("fire") === true);
  assert.notEqual(etatDesGardeFous(c.journal.base).breakerOpenedAt, null);
  assert.equal(c.jugements().length, 1);
  assert.equal(c.journal.tout().some((e) => e.type === "manager.judged" && e.ticket === 30), true);
  // Le contrôle du superviseur échoue ici : il le dit, une fois, comme un contrôle et non comme une issue.
  await jusqua(() => c.avertissements.includes("brigade : breaker check non abouti (code de sortie 1) — il sera retenté"));
  const tout = JSON.stringify([c.avertissements.filter((ligne) => !ligne.includes("breaker check")), c.journal.tout().filter((e) => e.type.startsWith("manager."))]);
  assert.doesNotMatch(tout, /disjoncteur|breaker/i);
});

test("le disjoncteur ouvert, le manager qualifie le ticket mais aucun cook ne part", async (t) => {
  const c = disjoncteurOuvert(t, 30);
  await jusqua(() => c.gh.lire(30)?.labels.includes("fire") === true);
  assert.equal(c.jugements().length, 1);
  assert.throws(() => c.cuire(30), (erreur) => erreur instanceof LancementRefuse && erreur.motif === "breaker");
  assert.equal(c.journal.tout().some((e) => e.type === "cook.launched" && e.payload.station !== "manager"), false);
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

test("un contrôle du disjoncteur qui échoue se dit sans numéro d'issue ; un jugement qui échoue dit la sienne", async (t) => {
  const controle = disjoncteurOuvert(t, 30);
  await jusqua(() => controle.avertissements.some((ligne) => ligne.includes("breaker check non abouti")));
  assert.equal(controle.avertissements.some((ligne) => /breaker check de l'issue/.test(ligne)), false);

  const jugement = cuisine(t, { manager: { jugement: "echec" }, issues: [issue(31, [])] });
  chef(jugement.repertoire, "manager.enabled");
  await jusqua(() => jugement.avertissements.some((ligne) => /de l'issue #31 non abouti/.test(ligne)));
});
