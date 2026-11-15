// L'ordinateur qui dort en pleine cuisson (#3643), vu par les garde-fous : le
// sommeil est une pause. La minuterie d'inactivité ne tombe pas au réveil, le
// disjoncteur ne compte rien, un cook mort en dormant est relancé dans son
// worktree, et le journal dit le sommeil (`station.slept`). La machine dort à
// l'horloge du test : un saut de dix minutes.
import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Plafonds } from "../../src/events/guardrails.ts";
import { brancherGardeFous, type Reglages } from "../../src/garde-fous.ts";
import { etatDesGardeFous } from "../../src/projections/guardrails.ts";
import { veilleMachine } from "../../src/reveil-machine/veille.ts";
import { demarrer } from "../../src/runtime.ts";
import { ENV_ENFANT, FAUX_CLAUDE, git, jusqua, repertoireTemporaire, vivant } from "../outils.ts";

const DIX_MINUTES = 600_000;
const PLAFONDS: Plafonds = { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 1_000 };
const REGLAGES: Reglages = { plafonds: PLAFONDS, seuilDisjoncteur: 3, graceMs: 2000 };
const COOK_QUI_DORT = join(import.meta.dirname, "cook-qui-dort.ts");

function cuisine(t: TestContext) {
  const horloges = { mono: 1_000, mur: Date.parse("2026-11-15T10:00:00Z") };
  const veille = veilleMachine({ horloges: { mono: () => horloges.mono, mur: () => horloges.mur } });
  t.after(() => veille.arreter());
  const runtime = brancherGardeFous(REGLAGES, demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", intervalleVeilleMs: 5 }), { veille });
  t.after(() => runtime.arreter("test"));
  // Le temps passe éveillé ; ou la machine dort, et la minuterie de la veille
  // le voit à son premier coup après le réveil.
  const passer = (ms: number) => {
    horloges.mono += ms;
    horloges.mur += ms;
    veille.regarder();
  };
  const dormir = (ms: number) => passer(ms);
  const evenements = (type: string) =>
    runtime.journal
      .tout()
      .filter((e) => e.type === type)
      .map((e) => ({ payload: e.payload as Record<string, unknown> }));
  return { runtime, passer, dormir, evenements };
}

test("dix minutes de sommeil pendant qu'un cook se tait : au réveil, la minuterie d'inactivité ne tombe pas, le cook tourne, rien ne compte au disjoncteur", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { runtime, passer, dormir, evenements } = cuisine(t);
  // Sans ticket, comme les cooks d'une station GitHub : un arrêt par garde-fou
  // y compterait au disjoncteur.
  const lance = runtime.lancer({ ticket: null, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "muet" } });
  t.after(() => lance.arreter());

  passer(100);
  dormir(DIX_MINUTES);
  t.mock.timers.tick(PLAFONDS.idleMs);

  assert.deepEqual(evenements("guard.tripped"), []);
  assert.ok(vivant(lance.pid), "le cook tourne encore");
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 0);
  const [sommeil, ...autres] = evenements("station.slept");
  assert.deepEqual(autres, []);
  assert.deepEqual(sommeil?.payload, { gapMs: DIX_MINUTES, resumed: [lance.run] });
});

test("après le réveil, un vrai silence plus long que le seuil arrête le cook pour inactivité, comme avant", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { runtime, passer, dormir, evenements } = cuisine(t);
  const lance = runtime.lancer({ ticket: 7, commande: FAUX_CLAUDE, args: [], env: { ...ENV_ENFANT, FAUX_CLAUDE: "muet" } });

  passer(100);
  dormir(DIX_MINUTES);
  t.mock.timers.tick(PLAFONDS.idleMs);
  assert.deepEqual(evenements("guard.tripped"), []);

  passer(PLAFONDS.idleMs);
  t.mock.timers.tick(PLAFONDS.idleMs);
  await lance.fin;

  const [arret] = evenements("guard.tripped");
  assert.equal(arret?.payload.reason, "idle");
  assert.ok(Number(arret?.payload.observed) >= PLAFONDS.idleMs, "le silence dit est celui de l'éveil");
  assert.ok(Number(arret?.payload.observed) < DIX_MINUTES, "le sommeil n'y est pas compté");
});

// Un worktree où le cook a laissé du travail non commité.
function worktree(t: TestContext): string {
  const arbre = repertoireTemporaire(t);
  git(arbre, "init", "-q");
  writeFileSync(join(arbre, "LISEZMOI"), "brigade\n");
  git(arbre, "add", "LISEZMOI");
  git(arbre, "commit", "-q", "-m", "départ");
  writeFileSync(join(arbre, "brouillon.txt"), "le travail en cours\n");
  return arbre;
}

test("un cook mort pendant le sommeil est relancé au réveil dans son worktree, son travail non commité intact, sans échec compté", async (t) => {
  const { runtime, dormir, evenements } = cuisine(t);
  const arbre = worktree(t);
  const temoins = repertoireTemporaire(t);
  const feu = join(temoins, "feu");
  const temoin = join(temoins, "relance.json");
  const contexte = { station: "box/claude", worktree: arbre };

  const lance = runtime.lancer({ ticket: null, run: "44-github-abc", contexte, commande: process.execPath, args: [COOK_QUI_DORT], cwd: arbre, env: { ...ENV_ENFANT, REVEIL_FEU: feu, REVEIL_TEMOIN: temoin } });
  await jusqua(() => existsSync(join(arbre, ".premier-lancement")));
  dormir(DIX_MINUTES);
  // Sa mort ne se lit qu'au réveil.
  writeFileSync(feu, "");
  const fin = await lance.fin;

  assert.equal(fin.outcome, "ok");
  assert.equal(fin.run, "44-github-abc-s1");
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 0);
  assert.deepEqual(
    evenements("cook.exited").map((e) => [e.payload.run, e.payload.outcome, e.payload.cause]),
    [
      ["44-github-abc", "stop", "slept"],
      ["44-github-abc-s1", "ok", undefined],
    ],
  );
  const relance = evenements("cook.launched").at(-1);
  assert.deepEqual(relance?.payload.sleepRetry, { of: "44-github-abc", attempt: 1 });
  assert.equal(relance?.payload.worktree, arbre);
  assert.deepEqual(JSON.parse(readFileSync(temoin, "utf8")), { cwd: realpathSync(arbre), brouillon: "le travail en cours\n" });
  assert.match(git(arbre, "status", "--porcelain"), /\?\? brouillon\.txt/);
  assert.deepEqual(evenements("station.slept").map((e) => e.payload), [{ gapMs: DIX_MINUTES, resumed: ["44-github-abc"] }]);
});

test("un cook qui meurt en échec bien après le réveil est un échec, comme avant : la règle ne couvre que la mort en dormant", async (t) => {
  const { runtime, passer, dormir, evenements } = cuisine(t);
  const arbre = worktree(t);
  const temoins = repertoireTemporaire(t);
  const feu = join(temoins, "feu");

  const lance = runtime.lancer({ ticket: null, commande: process.execPath, args: [COOK_QUI_DORT], cwd: arbre, env: { ...ENV_ENFANT, REVEIL_FEU: feu, REVEIL_TEMOIN: join(temoins, "relance.json") } });
  await jusqua(() => existsSync(join(arbre, ".premier-lancement")));
  dormir(DIX_MINUTES);
  passer(61_000);
  writeFileSync(feu, "");
  const fin = await lance.fin;

  assert.equal(fin.outcome, "failed");
  assert.equal(etatDesGardeFous(runtime.journal.base).failures, 1);
  assert.equal(evenements("cook.launched").length, 1);
});
