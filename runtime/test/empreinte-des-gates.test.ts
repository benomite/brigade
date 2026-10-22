// Les mêmes gates ne se jouent pas deux fois sur le même code : un passage
// vert, sur le même arbre et la même configuration, se reprend au lieu d'être
// rejoué — et la reprise ne coûte rien.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { coutDuProjet, lireBudget, noterCoutDesGates } from "../src/cout-des-gates.ts";
import { empreinteDeConfig, gatesReprises, passageVert, type EmpreinteDesGates } from "../src/empreinte-des-gates.ts";
import type { FaitGates } from "../src/events/gates.ts";
import type { Gates } from "../src/events/pass.ts";
import { SCRIPT_GATES, SCRIPT_SETUP } from "../src/gates.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { DECLARATION } from "../src/secrets.ts";
import { aArreter, repertoireTemporaire } from "./outils.ts";

const PROJET = "espace";
const HEURE = "2026-10-22T08:00:00Z";
const CONFIG = "c".repeat(64);
const VERTES: Gates = { outcome: "green", code: 0, failures: [], tail: "gates : VERT" };
const ROUGES: Gates = { outcome: "red", code: 1, failures: ["FAIL  tests du runtime en échec"], tail: "gates : ROUGE" };
const COUT = { durationMs: 60_000, cpuMs: 200_000 };

function cas(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: () => new Date(HEURE) });
  // Fermé avant que son répertoire soit retiré : sous Windows, un fichier ouvert ne s'efface pas.
  aArreter(t, () => journal.fermer());
  const empreinte = (tree: string, config = CONFIG): EmpreinteDesGates => ({ tree, config });
  // Un passage des gates, écrit comme la pass l'écrit, avec ce qu'il a jugé.
  const passage = (gates: Gates, juge: EmpreinteDesGates, ticket: number | null = 17, coureur: FaitGates["payload"]["runner"] = "pass") =>
    noterCoutDesGates(journal, { projet: PROJET, ticket, coureur, auteur: "pass", gates, cout: COUT, empreinte: juge });
  const passages = () => journal.tout().filter((evenement) => evenement.type === "gates.ran");
  return { journal, empreinte, passage, passages };
}

// Un worktree qui porte des gates, et ce qu'on lui donne en plus.
function worktree(t: TestContext, fichiers: Record<string, string> = {}): string {
  const racine = repertoireTemporaire(t);
  for (const [chemin, contenu] of Object.entries({ [SCRIPT_GATES]: "#!/bin/sh\nexit 0\n", "README.md": "le projet\n", ...fichiers })) {
    mkdirSync(join(racine, chemin, ".."), { recursive: true });
    writeFileSync(join(racine, chemin), contenu);
  }
  return racine;
}

describe("l'empreinte des gates", { concurrency: 8 }, () => {
  test("un passage écrit l'arbre qu'il a jugé et le condensé de la configuration de ses gates", (t) => {
    const { empreinte, passage, passages } = cas(t);

    passage(VERTES, empreinte("arbre-a"));

    const [ecrit] = passages();
    assert.equal(ecrit?.type, "gates.ran");
    const payload = ecrit?.payload as FaitGates["payload"];
    assert.deepEqual([payload.tree, payload.config], ["arbre-a", CONFIG]);
  });

  test("la configuration des gates est leur script, le setup et la déclaration des secrets : un condensé, qu'aucun autre fichier ne change", (t) => {
    const config = empreinteDeConfig(worktree(t));
    assert.match(config, /^[0-9a-f]{64}$/);
    // Le même worktree, ailleurs, un autre fichier changé : la même configuration.
    assert.equal(empreinteDeConfig(worktree(t, { "README.md": "un autre texte\n", "src/code.ts": "export {};\n" })), config);

    const changees = [
      worktree(t, { [SCRIPT_GATES]: "#!/bin/sh\nexit 1\n" }),
      worktree(t, { [SCRIPT_SETUP]: "#!/bin/sh\necho export A=1\n" }),
      worktree(t, { [DECLARATION]: "CLE_API\n" }),
    ];
    for (const autre of changees) assert.notEqual(empreinteDeConfig(autre), config);
  });

  test("le même arbre sous la même configuration, déjà vert, se reprend : le passage repris est nommé", (t) => {
    const { journal, empreinte, passage } = cas(t);
    passage(VERTES, empreinte("arbre-a"), 17, "cook");
    const seq = journal.dernierSeq();

    const repris = passageVert(journal.base, PROJET, empreinte("arbre-a"));

    assert.deepEqual(repris, { seq, runner: "cook", ticket: 17, at: new Date(HEURE).toISOString() });
    const gates = gatesReprises(repris!);
    assert.equal(gates.outcome, "green");
    assert.equal(gates.code, 0);
    assert.deepEqual(gates.failures, []);
    assert.deepEqual(gates.reused, repris);
    assert.match(gates.tail, new RegExp(`gates non rejouées : le cook .* passage ${seq} du journal \\(#17, `));
  });

  test("un seul fichier changé change l'arbre : rien n'est repris", (t) => {
    const { journal, empreinte, passage } = cas(t);
    passage(VERTES, empreinte("arbre-a"));

    assert.equal(passageVert(journal.base, PROJET, empreinte("arbre-a-un-fichier-de-plus")), null);
  });

  test("une configuration changée n'est pas reprise, sur le même arbre", (t) => {
    const { journal, empreinte, passage } = cas(t);
    passage(VERTES, empreinte("arbre-a"));

    assert.equal(passageVert(journal.base, PROJET, empreinte("arbre-a", "d".repeat(64))), null);
    assert.notEqual(passageVert(journal.base, PROJET, empreinte("arbre-a")), null);
  });

  test("un passage rouge ou coupé n'est pas repris, et il l'emporte sur un vert plus ancien du même arbre", (t) => {
    const { journal, empreinte, passage } = cas(t);
    passage(ROUGES, empreinte("arbre-rouge"));
    assert.equal(passageVert(journal.base, PROJET, empreinte("arbre-rouge")), null);

    passage(VERTES, empreinte("arbre-a"));
    passage({ ...ROUGES, outcome: "timeout", code: null }, empreinte("arbre-a"));
    assert.equal(passageVert(journal.base, PROJET, empreinte("arbre-a")), null);

    // Rejouées vertes ensuite : c'est ce dernier vert qui se reprend.
    passage(VERTES, empreinte("arbre-a"), 18);
    assert.equal(passageVert(journal.base, PROJET, empreinte("arbre-a"))?.ticket, 18);
  });

  test("un passage d'avant l'empreinte, ou d'un autre projet, n'est jamais repris", (t) => {
    const { journal, empreinte } = cas(t);
    const sans: FaitGates["payload"] = { runner: "pass", outcome: "green", durationMs: 60_000, cpuMs: 200_000 };
    journal.ajouter({ project: PROJET, ticket: 17, author: "pass", type: "gates.ran", payload: sans });
    const juge = empreinte("arbre-a");
    journal.ajouter({ project: "autre", ticket: 17, author: "pass", type: "gates.ran", payload: { ...sans, ...juge } });

    assert.equal(passageVert(journal.base, PROJET, juge), null);
  });

  test("une reprise n'écrit aucun passage : ni horloge ni processeur au coût du projet", (t) => {
    const { journal, empreinte, passage, passages } = cas(t);
    passage(VERTES, empreinte("arbre-a"));
    const repris = passageVert(journal.base, PROJET, empreinte("arbre-a"));
    assert.notEqual(repris, null);

    passage(gatesReprises(repris!), empreinte("arbre-a"), 18);

    assert.equal(passages().length, 1);
    const cout = coutDuProjet(journal.base, PROJET, lireBudget({}), new Date(HEURE));
    assert.deepEqual(cout.lastDay, { runs: 1, durationSeconds: 60, cpuSeconds: 200 });
    assert.equal(cout.latest?.ticket, 17);
  });
});
