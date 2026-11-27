// Le nom d'un projet, avant la box : la forme qu'elle accepte, refusée à la saisie avec sa
// raison — la même règle que le geste d'installation, que le test lit dans le runtime.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lireDemande, Refus } from "../../runtime/src/installateur.ts";
import { refusalOfShape } from "../src/name.ts";
import { CODE_OF_THE_BOX } from "./helpers/posix.ts";

// Ce que le geste de la box dit d'un nom, tout le reste de l'appel étant bon.
function refusalOfTheBox(name: string): string | undefined {
  try {
    lireDemande(["install", name, "--depot", "chef/boutique", "--sauvegardes", "/srv/sauvegardes/boutique", "--manager-modele", "opus", "--manager-effort", "high", "--reviewer-modele", "sonnet", "--reviewer-effort", "medium"]);
    return undefined;
  } catch (error) {
    if (error instanceof Refus && error.motif.startsWith("projet-")) return error.motif;
    throw error;
  }
}

describe("la forme du nom", () => {
  test("minuscules, chiffres et tirets passent ; un champ vide ne dit rien de la forme", () => {
    for (const name of ["", "  ", "boutique", "ma-cuisine-2", "42", " boutique "]) assert.equal(refusalOfShape(name), undefined, name);
  });

  test("une majuscule, un espace, un caractère refusé : le champ le dit, avec la forme attendue", () => {
    const reason = refusalOfShape("Calculus") as string;
    assert.match(reason, /^The station refuses this name — it contains “C”\./);
    assert.match(reason, /lowercase letters, digits and hyphens/);
    assert.match(refusalOfShape("ma cuisine") as string, /space/);
    assert.match(refusalOfShape("a_b.c") as string, /“_”, “\.”/);
  });

  test("un tiret en tête, un nom trop long : refusés aussi, chacun avec sa raison", () => {
    assert.match(refusalOfShape("-boutique") as string, /it starts with a hyphen/);
    assert.match(refusalOfShape("a".repeat(64)) as string, /it is 64 characters long/);
    assert.equal(refusalOfShape("a".repeat(63)), undefined);
  });

  test("la règle est celle de la box : ce que son geste d'installation refuse, l'écran le refuse — et rien de plus", { skip: CODE_OF_THE_BOX }, () => {
    const names = ["boutique", "ma-cuisine-2", "42", "a", "a-", "a--b", "Calculus", "ma cuisine", "a_b", "a.b", "-a", "--exec", "é", "a/b", "a;b", "$(id)", "a".repeat(63), "a".repeat(64), "boutique\n"];
    for (const name of names) {
      // L'écran envoie le nom rogné de ses blancs : c'est lui que la box reçoit.
      assert.equal(refusalOfShape(name) === undefined, refusalOfTheBox(name.trim()) === undefined, JSON.stringify(name));
    }
  });
});
