// La commande par laquelle le chef voit la base d'intégration et fait rejouer ses gates :
// `npm run base -- [replay]`. Ses sorties sont en anglais (#952) : un état d'exemple, du vert au rouge et
// de la demande de rejeu à sa retenue, passe dans le test de glossaire, refus compris. Le détail des
// phrases de la base rouge est éprouvé avec `pass` (grant-cli.test.ts).
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { principal as base } from "../src/base-cli.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { demarrer } from "../src/runtime.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { appeler, horloge, lancer, repertoireTemporaire } from "./outils.ts";

const CLI = join(import.meta.dirname, "../src/base-cli.ts");
const ROUGES = { outcome: "red" as const, code: 1, failures: ["FAIL  tests du runtime"], tail: "" };
const VERTES = { outcome: "green" as const, code: 0, failures: [], tail: "" };
const NON_JOUEES = { outcome: "skipped" as const, code: null, failures: [], tail: "" };

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, maintenant: horloge() });
  t.after(() => runtime.arreter("test"));
  const noter = (fait: Fait, author = "pass") => runtime.journal.ajouter({ project: "brigade", ticket: null, author, ...fait });
  const dans = async (env: Record<string, string>, ...args: string[]) => {
    const enfant = lancer(t, CLI, args, env);
    return { code: await enfant.fin, lignes: enfant.sortie().trimEnd().split("\n") };
  };
  const commande = (...args: string[]) => dans({ BRIGADE_STATE_DIR: repertoire }, ...args);
  return { runtime, repertoire, noter, commande, dans };
}

test("`base` et `base replay` sur un état d'exemple, du jamais contrôlé au rouge rejoué : aucune ligne ne porte de mot français du glossaire", async (t) => {
  const { noter, commande, runtime } = cuisine(t);
  const dit = async (code: number, ...args: string[]) => {
    const { code: obtenu, lignes } = await commande(...args);
    assert.equal(obtenu, code, args.join(" "));
    sansMotFrancais(lignes);
    return lignes.join("\n");
  };

  assert.match(await dit(0), /^base never checked: no merge has had to be verified on it yet$/);
  assert.match(await dit(0, "replay"), /^brigade : nothing to replay: the base is not red$/);

  noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "green", gates: VERTES, tickets: [] } });
  assert.match(await dit(0), /^base green at the last check, on \S+ \(ba5e000\)$/);
  noter({ type: "base.checked", payload: { sha: "ba5e0005ffff", outcome: "skipped", gates: NON_JOUEES, tickets: [], reason: "git worktree : fatal: disk full" } });
  assert.match(await dit(0), /^base not checked: its gates could not be played on \S+ \(ba5e000\), the attempt did not run \(git worktree : fatal: disk full\) — nothing is held$/);

  noter({ type: "base.checked", payload: { sha: "ba5e0006ffff", outcome: "red", gates: ROUGES, tickets: [17] } });
  const rouge = await dit(0);
  assert.match(rouge, /^BASE RED since \S+ \(ba5e000\) — after the merge of #17: nothing is judged or merged, deliveries wait$/m);
  assert.match(rouge, /^ {2}replay its gates without waiting for a commit: brigade \S+ base replay$/m);

  const demande = await dit(0, "replay");
  assert.match(demande, /^brigade : replay asked: the pass replays the base's gates on its current head/);
  assert.match(demande, /no runtime is running|$/);
  assert.match(await dit(0, "replay"), /^brigade : replay already asked on \S+: the pass plays it on its next round$/);
  assert.match(await dit(0), /^ {2}replay asked by the chef since \S+: the pass plays it on its next round$/m);

  noter({ type: "base.recheck-held", payload: { resource: "cpu", observed: 64, limit: 12 } });
  assert.match(await dit(0), /the saturated machine has held it since \S+, the pass comes back to it on its own/);
  noter({ type: "base.checked", payload: { sha: "ba5e0007ffff", outcome: "skipped", gates: NON_JOUEES, tickets: [17], red: "ba5e0006ffff", reason: "git worktree : fatal: disk full" } });
  assert.match(await dit(0), /^ {2}gates not played on ba5e000 since \S+, the attempt did not run \(git worktree : fatal: disk full\): a check that was not played does not lift a red that was found$/m);

  noter({ type: "base.check-held", payload: { reason: "git fetch : fatal: origin unreachable" } });
  assert.match(await dit(0), /^ {2}check held since \S+: the base cannot be fetched \(git fetch : fatal: origin unreachable\) — the pass comes back to it on its own, at every tick$/m);
  assert.equal(runtime.journal.tout().filter((e) => e.type === "base.recheck-requested").length, 1);
});

test("un rejeu demandé sans runtime qui tourne le dit, en anglais", async (t) => {
  const { runtime, noter, commande } = cuisine(t);
  noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [] } });
  runtime.arreter("test");

  const { code, lignes } = await commande("replay");

  assert.equal(code, 0);
  assert.match(lignes.join("\n"), /no runtime is running: the command will apply at its next start/);
  sansMotFrancais(lignes);
});

test("les refus de la commande ne portent aucun mot français du glossaire", async (t) => {
  const { commande, dans } = cuisine(t);
  for (const args of [["replay", "fast"], ["rerun"]]) {
    const refus = await commande(...args);
    assert.equal(refus.code, 2, args.join(" "));
    assert.match(refus.lignes.join("\n"), /^brigade : usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run base -- \[replay\]$/m);
    sansMotFrancais(refus.lignes);
  }
  const sansEtat = await dans({}, "replay");
  assert.equal(sansEtat.code, 2);
  assert.match(sansEtat.lignes[0] ?? "", /BRIGADE_STATE_DIR is not set/);
  sansMotFrancais(sansEtat.lignes);

  const vide = repertoireTemporaire(t);
  for (const args of [[], ["replay"]]) {
    const sansJournal = await dans({ BRIGADE_STATE_DIR: vide }, ...args);
    assert.equal(sansJournal.code, 1);
    assert.equal(sansJournal.lignes.join("\n"), `brigade : no log in ${vide}`);
    sansMotFrancais(sansJournal.lignes);
  }

  const ancien = repertoireTemporaire(t);
  ouvrirJournal(ancien, { projections: [] }).fermer();
  const sortie = appeler(base, [], { BRIGADE_STATE_DIR: ancien });
  assert.equal(await sortie.fin, 1);
  assert.match(sortie.sortie(), /restart the runtime/);
  sansMotFrancais(sortie.sortie().trimEnd().split("\n"));
});

test("un rejeu demandé avant le ticket est toujours montré et se lève sans rien éditer à la main", async (t) => {
  const { noter, commande, runtime } = cuisine(t);
  // La demande telle qu'une version d'avant l'écrivait : un événement du journal, sans autre texte.
  noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [] } });
  noter({ type: "base.recheck-requested", payload: {} }, "chef");

  assert.match((await commande()).lignes.join("\n"), /^ {2}replay asked by the chef since \S+: the pass plays it on its next round$/m);
  assert.match((await commande("replay")).lignes.join("\n"), /replay already asked on \S+/);
  assert.equal(runtime.journal.tout().filter((e) => e.type === "base.recheck-requested").length, 1);
});

test("l'ancien mot `rejouer` fait toujours son effet, et le nouveau est dit", async (t) => {
  const { noter, commande, runtime } = cuisine(t);
  noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: ROUGES, tickets: [] } });

  const { code, lignes } = await commande("rejouer");

  assert.equal(code, 0);
  assert.match(lignes.join("\n"), /replay asked: /);
  assert.match(lignes[0] ?? "", /replay/);
  assert.equal(runtime.journal.tout().filter((e) => e.type === "base.recheck-requested").length, 1);
});
