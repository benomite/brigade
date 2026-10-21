import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigInvalide } from "../../src/runtime.ts";
import { Sortie } from "../../src/appel.ts";
import { principal } from "../../src/seuils/seuils-cli.ts";
import { lireSeuils, VARIABLES } from "../../src/seuils/seuils.ts";
import { sansMotFrancais } from "../aides/glossaire.ts";

test("sans configuration : promotion 3, expiration promue 20, expiration provisoire 20, écart des renvois 1", () => {
  assert.deepEqual(lireSeuils({}), { promotion: 3, expirationPromue: 20, expirationProvisoire: 20, ecartRenvoi: 1 });
});

test("une valeur posée ne change que celle-là, et chaque projet a les siennes", () => {
  const a = lireSeuils({ [VARIABLES.promotion]: "5" });
  const b = lireSeuils({ [VARIABLES.expirationPromue]: "40", [VARIABLES.expirationProvisoire]: "10" });
  assert.deepEqual(a, { promotion: 5, expirationPromue: 20, expirationProvisoire: 20, ecartRenvoi: 1 });
  assert.deepEqual(b, { promotion: 3, expirationPromue: 40, expirationProvisoire: 10, ecartRenvoi: 1 });
});

test("zéro, négatif, non entier ou illisible : refusé, en nommant le réglage", () => {
  for (const variable of Object.values(VARIABLES)) {
    // L'écart des renvois admet zéro : il éteint l'avance.
    for (const mauvais of variable === VARIABLES.ecartRenvoi ? ["-3", "2.5", "abc"] : ["0", "-3", "2.5", "abc"]) {
      assert.throws(() => lireSeuils({ [variable]: mauvais }), (erreur: Error) => erreur instanceof ConfigInvalide && erreur.message.includes(variable), `${variable}=${mauvais}`);
    }
  }
});

function jouer(env: Record<string, string>) {
  const sortie: string[] = [];
  const erreurs: string[] = [];
  let code = 0;
  try {
    principal({ args: [], env, dire: (l) => sortie.push(l), redire: (l) => erreurs.push(l) });
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    code = erreur.code;
  }
  return { sortie, erreurs, code };
}

test("la commande imprime les seuils courants du projet", () => {
  const defaut = jouer({});
  assert.equal(defaut.code, 0);
  assert.deepEqual(defaut.sortie, [
    "promotion (retros)            3   (BRIGADE_PROMOTION_RETROS)",
    "promoted expiry (tickets)     20  (BRIGADE_PROMOTED_EXPIRY_TICKETS)",
    "provisional expiry (tickets)  20  (BRIGADE_PROVISIONAL_EXPIRY_TICKETS)",
    "send-back promotion gap       1   (BRIGADE_SENDBACK_PROMOTION_GAP)",
    "lessons per cook              20  (BRIGADE_INJECTED_LESSONS)",
    "common tier (projects)        2   (BRIGADE_COMMON_TIER_PROJECTS)",
  ]);
  sansMotFrancais(defaut.sortie);
  const regle = jouer({ [VARIABLES.promotion]: "4", BRIGADE_INJECTED_LESSONS: "0" });
  assert.match(regle.sortie[0] ?? "", /promotion \(retros\)\s+4\s/);
  assert.match(regle.sortie[4] ?? "", /lessons per cook\s+0\s/);
});

test("la commande refuse un plafond de leçons illisible en nommant la variable, code 1", () => {
  const { erreurs, code, sortie } = jouer({ BRIGADE_INJECTED_LESSONS: "-1" });
  assert.equal(code, 1);
  assert.deepEqual(sortie, []);
  assert.match(erreurs.join("\n"), /BRIGADE_INJECTED_LESSONS/);
});

test("la commande refuse une valeur invalide en nommant le réglage, code 1", () => {
  const { erreurs, code, sortie } = jouer({ [VARIABLES.expirationProvisoire]: "0" });
  assert.equal(code, 1);
  assert.deepEqual(sortie, []);
  assert.match(erreurs.join("\n"), /BRIGADE_PROVISIONAL_EXPIRY_TICKETS/);
});

test("l'écart des renvois : zéro est permis, et se pose par projet", () => {
  assert.equal(lireSeuils({ [VARIABLES.ecartRenvoi]: "0" }).ecartRenvoi, 0);
  assert.equal(lireSeuils({ [VARIABLES.ecartRenvoi]: "2" }).ecartRenvoi, 2);
});
