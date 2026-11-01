// La ligne du rôle produit dans `status`, et le geste du chef qui l'allume,
// l'éteint ou règle son plafond.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Appel } from "../../../src/appel.ts";
import { Sortie } from "../../../src/appel.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { principal } from "../../../src/produit/cadence/commande.ts";
import { compter, lireLaCadence, noterPassage, poserLaCadence } from "../../../src/produit/cadence/etat.ts";
import { photoDuProjet } from "../../../src/status.ts";
import { demarrer } from "../../../src/runtime.ts";
import { repertoireTemporaire } from "../../outils.ts";

const MAINTENANT = new Date("2026-10-08T15:30:00.000Z");

// Un projet dont le runtime a tourné, puis s'est arrêté : son journal existe.
function projet(t: TestContext): string {
  const repertoire = repertoireTemporaire(t);
  demarrer({ repertoireEtat: repertoire, projet: "brigade", maintenant: () => MAINTENANT }).arreter("test");
  return repertoire;
}

const ligneDuRole = (repertoire: string, maintenant = MAINTENANT) => photoDuProjet({ BRIGADE_STATE_DIR: repertoire }, { maintenant }).filter((ligne) => ligne.startsWith("product role:"));

function jouer(args: string[], env: Record<string, string>): { code: number; dit: string[] } {
  const dit: string[] = [];
  const appel: Appel = { args, env, dire: (ligne) => void dit.push(ligne), redire: (ligne) => void dit.push(ligne) };
  try {
    principal(appel);
    return { code: 0, dit };
  } catch (erreur) {
    if (erreur instanceof Sortie) return { code: erreur.code, dit };
    throw erreur;
  }
}

test("`status` d'un projet où le rôle n'a jamais tourné : éteint, 0 sur le plafond par défaut, jamais lancé — sans rien écrire", (t) => {
  const repertoire = projet(t);
  assert.deepEqual(ligneDuRole(repertoire), ["product role: OFF — 0/3 issues filed today — last run: never"]);
});

test("`status` dit le rôle allumé, ce qu'il a déposé aujourd'hui sur le plafond, et quand il a tourné", (t) => {
  const repertoire = projet(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  poserLaCadence(journal.base);
  assert.equal(jouer(["on"], { BRIGADE_STATE_DIR: repertoire }).code, 0);
  noterPassage(journal.base, new Date("2026-10-08T14:02:09.123Z"));
  compter(journal.base, "2026-10-08", 2);
  assert.deepEqual(ligneDuRole(repertoire), ["product role: ON — 2/3 issues filed today — last run: 2026-10-08 14:02 UTC"]);
  compter(journal.base, "2026-10-08", 3);
  assert.deepEqual(ligneDuRole(repertoire), ["product role: ON — 3/3 issues filed today (cap reached) — last run: 2026-10-08 14:02 UTC"]);
  // Le lendemain, le compte repart de zéro.
  assert.deepEqual(ligneDuRole(repertoire, new Date("2026-10-09T08:00:00.000Z")), ["product role: ON — 0/3 issues filed today — last run: 2026-10-08 14:02 UTC"]);
});

test("le geste du chef : `on`, `off` et `cap <N>` s'écrivent dans l'état du projet ; sans argument, il dit la ligne", (t) => {
  const repertoire = projet(t);
  const env = { BRIGADE_STATE_DIR: repertoire };
  assert.match(jouer(["on"], env).dit.join("\n"), /^brigade : product role: ON — 0\/3 /);
  assert.match(jouer(["cap", "5"], env).dit.join("\n"), /^brigade : product role: ON — 0\/5 /);
  assert.match(jouer(["off"], env).dit.join("\n"), /^brigade : product role: OFF — 0\/5 /);
  assert.match(jouer([], env).dit.join("\n"), /^brigade : product role: OFF — 0\/5 issues filed today — last run: never$/);
  const journal = ouvrirJournal(repertoire, { lectureSeule: true });
  t.after(() => journal.fermer());
  assert.deepEqual({ allume: lireLaCadence(journal.base).allume, plafond: lireLaCadence(journal.base).plafond }, { allume: false, plafond: 5 });
});

test("le geste mal écrit, ou sans journal, ne touche à rien", (t) => {
  const repertoire = projet(t);
  for (const args of [["allumer"], ["cap"], ["cap", "-1"], ["cap", "trois"], ["on", "off"]]) {
    const { code, dit } = jouer(args, { BRIGADE_STATE_DIR: repertoire });
    assert.equal(code, 2, args.join(" "));
    assert.match(dit.join("\n"), /usage: BRIGADE_STATE_DIR=<state directory> node runtime\/src\/produit\/cadence\/commande\.ts \[on \| off \| cap <N>\]/);
  }
  assert.equal(jouer(["on"], {}).code, 2);
  const vide = repertoireTemporaire(t);
  assert.deepEqual(jouer(["on"], { BRIGADE_STATE_DIR: vide }), { code: 1, dit: [`brigade : no log in ${vide}`] });
});
