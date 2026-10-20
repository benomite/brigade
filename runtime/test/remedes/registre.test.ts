// Le registre des remèdes, et ce que le refus servi en porte : le descripteur
// du remède qui le lève — ce qu'il fera, s'il retire ou efface quelque chose,
// son identifiant —, ou pourquoi l'app n'a pas de bouton.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CAUSES, CODES_DE_REFUS, refus } from "../../src/projets/refus.ts";
import { creerRegistre, decrire, REMEDES, SANS_REMEDE, type Remede } from "../../src/remedes/registre.ts";

// Le remède des tests : il ne fait rien d'autre que se compter.
const unRemede = (surcharge: Partial<Remede> = {}): Remede => ({
  id: "remove-hand-written-line",
  leve: ["hand-written-line"],
  description: "Removes the hand-written line for this project from the station's configuration.",
  destructif: true,
  executer: () => {},
  ...surcharge,
});

test("un refus qu'aucun remède ne lève porte pourquoi il n'y a pas de bouton, en une phrase, sans chemin ni terme de code", () => {
  assert.deepEqual(Object.keys(SANS_REMEDE).sort(), [...CODES_DE_REFUS].sort());
  for (const code of CODES_DE_REFUS) {
    const pourquoi = SANS_REMEDE[code];
    assert.match(pourquoi, /^[A-Z][^\n]*\.$/, `${code} : une phrase`);
    assert.doesNotMatch(pourquoi.slice(0, -1), /[.!?] [A-Z]/, `${code} : une seule phrase`);
    assert.doesNotMatch(pourquoi, /[/\\`]|\.(ts|json)\b|BRIGADE_/, `${code} : ni chemin ni terme de code`);
  }
  const servi = refus("hand-written-line", creerRegistre());
  assert.deepEqual(servi, { status: "refused", code: "hand-written-line", ...CAUSES["hand-written-line"], noRemedy: SANS_REMEDE["hand-written-line"] });
  assert.equal("remedy" in servi, false);
});

test("un refus qu'un remède lève porte son descripteur — description, drapeau destructif, identifiant — et plus de raison sans bouton", () => {
  const registre = creerRegistre([unRemede()]);
  const servi = refus("hand-written-line", registre);
  assert.deepEqual(servi, {
    status: "refused",
    code: "hand-written-line",
    ...CAUSES["hand-written-line"],
    remedy: { id: "remove-hand-written-line", description: "Removes the hand-written line for this project from the station's configuration.", destructive: true },
  });
  assert.equal("noRemedy" in servi, false);
  // Le payload se relit tel quel, une fois écrit dans le gist.
  assert.deepEqual(JSON.parse(JSON.stringify(servi)), servi);
  // Les autres refus n'en sont pas changés.
  assert.deepEqual(decrire("door-not-open", registre), { noRemedy: SANS_REMEDE["door-not-open"] });
});

test("un remède enregistré après coup paraît dans le refus servi, sans autre retouche ; un remède non destructif le dit", () => {
  const registre = creerRegistre();
  assert.equal("remedy" in refus("proxy-port-set", registre), false);
  registre.enregistrer(unRemede({ id: "drop-port-setting", leve: ["proxy-port-set", "configuration-invalid"], description: "Removes the port setting from this project's line.", destructif: false }));
  assert.deepEqual(decrire("proxy-port-set", registre), { remedy: { id: "drop-port-setting", description: "Removes the port setting from this project's line.", destructive: false } });
  assert.deepEqual(decrire("configuration-invalid", registre), { remedy: { id: "drop-port-setting", description: "Removes the port setting from this project's line.", destructive: false } });
  assert.equal(registre.parId("drop-port-setting")?.id, "drop-port-setting");
  assert.equal(registre.pour("proxy-port-set")?.id, "drop-port-setting");
});

test("le registre refuse, en le disant, un identifiant pris ou mal formé, un refus déjà levé, un code inconnu, une description qui n'est pas une phrase", () => {
  const registre = creerRegistre([unRemede()]);
  assert.throws(() => registre.enregistrer(unRemede({ leve: ["door-not-open"] })), /déjà enregistré/);
  assert.throws(() => registre.enregistrer(unRemede({ id: "autre" })), /« hand-written-line » est déjà levé par « remove-hand-written-line »/);
  assert.throws(() => registre.enregistrer(unRemede({ id: "Pas Bon", leve: ["door-not-open"] })), /identifiant invalide/);
  assert.throws(() => registre.enregistrer(unRemede({ id: "inconnu", leve: ["no-such-code" as never] })), /n'est pas un code de refus/);
  assert.throws(() => registre.enregistrer(unRemede({ id: "vide", leve: [] })), /ne lève aucun refus/);
  assert.throws(() => registre.enregistrer(unRemede({ id: "sans-point", leve: ["door-not-open"], description: "opens the door" })), /une phrase/);
  assert.throws(() => registre.enregistrer(unRemede({ id: "deux-phrases", leve: ["door-not-open"], description: "Opens the door. Then waits." })), /une phrase/);
  // Rien de refusé n'est entré.
  assert.equal(registre.pour("door-not-open"), null);
  assert.equal(registre.parId("autre"), null);
});

test("les remèdes du runtime sont bien formés, et le refus servi par défaut porte l'un des deux", () => {
  for (const code of CODES_DE_REFUS) {
    const servi = refus(code);
    assert.equal("remedy" in servi !== "noRemedy" in servi, true, code);
    const remede = REMEDES.pour(code);
    if (remede !== null) assert.equal(REMEDES.parId(remede.id), remede);
  }
});
