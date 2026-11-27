// Ce qu'un geste confirmé dit avant de partir : son prix, en clair, tiré de ce que la station a déjà
// dit — les cooks en cours, le rail. Ce qui n'est
// pas lu se dit tel, jamais « aucun cook en vol ». Un geste direct n'a rien à confirmer ; un geste
// qui n'écrirait rien refuse à la place. Rien ne part d'ici : confirmation.ts dit, il ne lance rien.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { WARNING as TURN_ON } from "../src/power-up.ts";
import type { Kitchen } from "../src/box.ts";
import type { Project } from "../src/config.ts";
import { confirmationOf, type Confirmation, type Read } from "../src/confirmation.ts";
import type { Facts } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";

const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const KITCHEN: Kitchen = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
const READ = "2026-10-13T10:00:00.000Z";

const facts = (more: Partial<Facts> = {}): Facts => ({
  etat: "ouverte",
  lu: READ,
  dernierTick: READ,
  compteurs: { rail: 4, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "" }],
  ...more,
});
const readOnes = (more: Partial<Facts> = {}): Read => ({ faits: facts(more), a: READ });
const NOT_READ: Read = { sans: "`facts` n'a pas encore été lu pour ce projet" };

// Une confirmation, pas un refus.
function confirmed(rendered: ReturnType<typeof confirmationOf>): Confirmation {
  assert.ok(rendered !== undefined && !("refus" in rendered), JSON.stringify(rendered));
  return rendered;
}

describe("seul un geste confirmé a une confirmation", () => {
  test("un geste direct, ou que le socle ne connaît pas, n'en a pas : rien n'est à confirmer", () => {
    for (const id of [...DIRECT, "inconnu", 3, undefined]) assert.equal(confirmationOf(id, PARADE, readOnes(), KITCHEN), undefined, String(id));
  });

  test("chaque geste confirmé du socle en a une — ou un refus qui dit pourquoi il ne s'offre pas — avec au moins un « oui » et un « non »", () => {
    for (const id of CONFIRMED) {
      const rendered = confirmationOf(id, PARADE, readOnes({ cooks: [{ ticket: 14, titre: "x", station: "box/claude" }] }), KITCHEN);
      assert.ok(rendered !== undefined, id);
      if ("refus" in rendered) continue;
      assert.notEqual(rendered.titre.trim(), "", id);
      assert.ok(rendered.prix.length > 0, id);
      assert.ok(rendered.choix.length > 0 && rendered.choix.every((choice) => CONFIRMED.includes(choice.id)), id);
      assert.notEqual(rendered.renoncer.trim(), "", id);
    }
  });

  test("un geste qui n'écrirait rien n'a rien à confirmer : un projet dont la cuisine ne tourne pas ici n'en a pas", () => {
    assert.equal(confirmationOf("stop", PARADE, readOnes(), undefined), undefined);
  });
});

describe("arrêter la cuisine dit les cooks en vol", () => {
  test("les cooks que `faits` donne sont nommés, ce qu'ils ont dépensé est dit manquant, avec l'heure de la lecture", () => {
    const rendered = confirmed(confirmationOf("stop", PARADE, readOnes({ cooks: [{ ticket: 14, titre: "x", station: "box/claude" }] }), KITCHEN));

    assert.equal(rendered.titre, "stop the kitchen");
    assert.match(rendered.prix[0] ?? "", /stopped within the second, and nothing is harvested/);
    assert.ok(rendered.prix.some((line) => /^1 cook running at this reading \(#14\) — what they spent, this station's runtime does not say/.test(line)));
    assert.equal(rendered.lu, READ);
    assert.deepEqual(rendered.choix.map(({ id }) => id), ["stop"]);
  });

  test("ce qui n'est pas lu se dit tel, jamais « aucun cook en vol »", () => {
    for (const readOne of [NOT_READ, readOnes()]) {
      const rendered = confirmed(confirmationOf("stop", PARADE, readOne, KITCHEN));
      assert.ok(rendered.prix.some((line) => /not read.*This is not “no cook in flight”/.test(line)), JSON.stringify(rendered.prix));
    }
    assert.equal(confirmed(confirmationOf("stop", PARADE, NOT_READ, KITCHEN)).lu, undefined);
  });
});

describe("reprendre, allumer : chacun dit ce qu'il engage", () => {
  test("reprendre : les tickets repartent sur ton quota, et combien sont sur le rail", () => {
    const rendered = confirmed(confirmationOf("reprendre", PARADE, readOnes(), KITCHEN));
    assert.match(rendered.prix[0] ?? "", /queued tickets start again right away, on your quota/);
    assert.ok(rendered.prix.includes("4 tickets on the rail at this reading."));
  });

  test("allumer le projet : l'avertissement de la doc, et ses deux nombres à demander à la station", () => {
    const rendered = confirmed(confirmationOf("projet-allumer", PARADE, NOT_READ, KITCHEN));
    assert.deepEqual(rendered.prix, [TURN_ON]);
    assert.equal(rendered.chiffrer, true);
  });
});
