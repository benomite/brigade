// Les capacités : ce qu'une station fournit devant ce qu'un ticket demande, ce
// qui manque quand aucune ne suffit, et ce que le chef en lit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { capacite, direManque, fournitTout, gesteDeCapacite, manque, manqueDuMotif, motifSansStation } from "../src/capacites.ts";

const CLAUDE = ["code", "raisonnement"];
const PLAYWRIGHT = ["navigateur-headless"];

test("une station peut cuisiner un ticket si elle fournit tout ce qu'il demande — ce qu'elle fournit en plus ne l'écarte jamais", () => {
  assert.equal(fournitTout(CLAUDE, []), true);
  assert.equal(fournitTout(PLAYWRIGHT, []), true);
  assert.equal(fournitTout(CLAUDE, ["code"]), true);
  assert.equal(fournitTout(CLAUDE, ["code", "navigateur-headless"]), false);
  assert.equal(fournitTout([], ["code"]), false);
});

test("rien ne manque à un ticket qu'une station déclarée peut cuisiner, ni à celui qui ne demande rien — même sans station", () => {
  assert.equal(manque(["navigateur-headless"], [CLAUDE, PLAYWRIGHT]), null);
  assert.equal(manque([], [CLAUDE]), null);
  assert.equal(manque([], []), null);
});

test("ce qui manque : les capacités qu'aucune station ne fournit, ou leur réunion quand chacune est fournie ailleurs", () => {
  assert.deepEqual(manque(["chrome-connecté"], [CLAUDE, PLAYWRIGHT]), { capacites: ["chrome-connecté"], ensemble: false });
  // Seule celle que personne ne fournit manque.
  assert.deepEqual(manque(["code", "chrome-connecté", "gpu"], [CLAUDE]), { capacites: ["chrome-connecté", "gpu"], ensemble: false });
  assert.deepEqual(manque(["code"], []), { capacites: ["code"], ensemble: false });
  assert.deepEqual(manque(["code", "navigateur-headless"], [CLAUDE, PLAYWRIGHT]), { capacites: ["code", "navigateur-headless"], ensemble: true });
});

test("le motif du 86 nomme ce qui manque, et se relit tel quel", () => {
  for (const [dit, motif] of [
    [{ capacites: ["chrome-connecté"], ensemble: false }, "no-station: chrome-connecté"],
    [{ capacites: ["chrome-connecté", "gpu"], ensemble: false }, "no-station: chrome-connecté, gpu"],
    [{ capacites: ["code", "navigateur-headless"], ensemble: true }, "no-station: code + navigateur-headless"],
  ] as const) {
    assert.equal(motifSansStation({ ...dit, capacites: [...dit.capacites] }), motif);
    assert.deepEqual(manqueDuMotif(motif), dit);
  }
  for (const autre of [null, "quota", "no-calibration", "no-station", "no-stationnement: x"]) assert.equal(manqueDuMotif(autre), null, String(autre));
});

test("le chef lit ce qui manque et le geste qui le fournirait", () => {
  const une = { capacites: ["chrome-connecté"], ensemble: false };
  assert.equal(direManque(une), "aucune station ne fournit `chrome-connecté`");
  assert.equal(
    gesteDeCapacite(une),
    "déclarer une station qui la fournit par `brigade <projet> station stations <machine>/<moteur>:<plafond de cooks>:chrome-connecté`, ou retirer `chrome-connecté` de la ligne `requiert` de sa fiche — il repart seul",
  );
  const deux = { capacites: ["chrome-connecté", "gpu"], ensemble: false };
  assert.equal(direManque(deux), "aucune station ne fournit `chrome-connecté` ni `gpu`");
  assert.match(gesteDeCapacite(deux), /^déclarer une station qui les fournit par `brigade <projet> station stations <machine>\/<moteur>:<plafond de cooks>:chrome-connecté\+gpu`, ou retirer `chrome-connecté` et `gpu` de la ligne/);
  const ensemble = { capacites: ["code", "navigateur-headless"], ensemble: true };
  assert.equal(direManque(ensemble), "aucune station ne fournit à la fois `code` et `navigateur-headless`");
  assert.match(gesteDeCapacite(ensemble), /^déclarer une station qui les fournit ensemble par `brigade <projet> station stations <machine>\/<moteur>:<plafond de cooks>:code\+navigateur-headless`/);
});

test("un accent écrit en deux caractères nomme la même capacité", () => {
  assert.equal(capacite("chrome-connecté"), "chrome-connecté");
  assert.equal(fournitTout([capacite("chrome-connecté")], ["chrome-connecté"]), true);
});
