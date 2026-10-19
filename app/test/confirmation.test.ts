// Ce qu'un geste confirmé dit avant de partir : son prix, en clair, tiré de ce que la box a déjà
// dit — les cooks en cours, le rail. Ce qui n'est
// pas lu se dit tel, jamais « aucun cook en vol ». Un geste direct n'a rien à confirmer ; un geste
// qui n'écrirait rien refuse à la place. Rien ne part d'ici : confirmation.ts dit, il ne lance rien.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AVERTISSEMENT as ALLUMER } from "../src/allumage.ts";
import type { Projet } from "../src/config.ts";
import { confirmationDe, type Confirmation, type Lus } from "../src/confirmation.ts";
import type { Facts } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";

const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const LU = "2026-10-13T10:00:00.000Z";

const facts = (plus: Partial<Facts> = {}): Facts => ({
  etat: "ouverte",
  lu: LU,
  dernierTick: LU,
  compteurs: { rail: 4, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "" }],
  ...plus,
});
const lus = (plus: Partial<Facts> = {}): Lus => ({ faits: facts(plus), a: LU });
const PAS_LUS: Lus = { sans: "`facts` n'a pas encore été lu pour ce projet" };

// Une confirmation, pas un refus.
function confirmee(rendu: ReturnType<typeof confirmationDe>): Confirmation {
  assert.ok(rendu !== undefined && !("refus" in rendu), JSON.stringify(rendu));
  return rendu;
}

describe("seul un geste confirmé a une confirmation", () => {
  test("un geste direct, ou que le socle ne connaît pas, n'en a pas : rien n'est à confirmer", () => {
    for (const id of [...DIRECTS, "inconnu", 3, undefined]) assert.equal(confirmationDe(id, PARADE, lus()), undefined, String(id));
  });

  test("chaque geste confirmé du socle en a une — ou un refus qui dit pourquoi il ne s'offre pas — avec au moins un « oui » et un « non »", () => {
    for (const id of CONFIRMES) {
      const rendu = confirmationDe(id, PARADE, lus({ cooks: [{ ticket: 14, titre: "x", station: "box/claude" }] }), "merge");
      assert.ok(rendu !== undefined, id);
      if ("refus" in rendu) continue;
      assert.notEqual(rendu.titre.trim(), "", id);
      assert.ok(rendu.prix.length > 0, id);
      assert.ok(rendu.choix.length > 0 && rendu.choix.every((choix) => CONFIRMES.includes(choix.id)), id);
      assert.notEqual(rendu.renoncer.trim(), "", id);
    }
  });

  test("un geste qui n'écrirait rien n'a rien à confirmer : un projet sans box n'en a pas, un grant que la doc ne nomme pas refuse", () => {
    assert.equal(confirmationDe("stop", { nom: "parade", dossier: "/tmp/parade" }, lus()), undefined);
    assert.ok("refus" in (confirmationDe("grant-activer", PARADE, lus(), "deploy") ?? {}));
  });
});

describe("arrêter la cuisine dit les cooks en vol", () => {
  test("les cooks que `faits` donne sont nommés, ce qu'ils ont dépensé est dit manquant, avec l'heure de la lecture", () => {
    const rendu = confirmee(confirmationDe("stop", PARADE, lus({ cooks: [{ ticket: 14, titre: "x", station: "box/claude" }] })));

    assert.equal(rendu.titre, "stop the kitchen");
    assert.match(rendu.prix[0] ?? "", /stopped within the second, and nothing is harvested/);
    assert.ok(rendu.prix.some((ligne) => /^1 cook running at this reading \(#14\) — what they spent, this station's runtime does not say/.test(ligne)));
    assert.equal(rendu.lu, LU);
    assert.deepEqual(rendu.choix.map(({ id }) => id), ["stop"]);
  });

  test("ce qui n'est pas lu se dit tel, jamais « aucun cook en vol »", () => {
    for (const lu of [PAS_LUS, lus()]) {
      const rendu = confirmee(confirmationDe("stop", PARADE, lu));
      assert.ok(rendu.prix.some((ligne) => /not read.*This is not “no cook in flight”/.test(ligne)), JSON.stringify(rendu.prix));
    }
    assert.equal(confirmee(confirmationDe("stop", PARADE, PAS_LUS)).lu, undefined);
  });
});

describe("reprendre, accorder, révoquer, allumer : chacun dit ce qu'il engage", () => {
  test("reprendre : les tickets repartent sur ton quota, et combien sont sur le rail", () => {
    const rendu = confirmee(confirmationDe("reprendre", PARADE, lus()));
    assert.match(rendu.prix[0] ?? "", /queued tickets start again right away, on your quota/);
    assert.ok(rendu.prix.includes("4 tickets on the rail at this reading."));
  });

  test("accorder le grant : une pass verte sera mergée sans toi ; le révoquer : plus rien ne l'est", () => {
    const accorder = confirmee(confirmationDe("grant-activer", PARADE, PAS_LUS, "merge"));
    assert.match(accorder.prix[0] ?? "", /^A green pass will be merged without you/);
    assert.deepEqual(accorder.choix.map(({ id }) => id), ["grant-activer"]);
    const revoke = confirmee(confirmationDe("grant-revoquer", PARADE, PAS_LUS, "merge"));
    assert.match(revoke.prix[0] ?? "", /^Nothing is merged without you any more/);
  });

  test("allumer le manager : l'avertissement de la doc, et ses deux nombres à demander à la box", () => {
    const rendu = confirmee(confirmationDe("manager-allumer", PARADE, PAS_LUS));
    assert.deepEqual(rendu.prix, [ALLUMER]);
    assert.equal(rendu.chiffrer, true);
  });
});
