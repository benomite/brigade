// Ce qu'un geste confirmé dit avant de partir : son prix, en clair, tiré de ce que la box a déjà
// dit — les cooks en vol et ce qu'ils ont dépensé, le rail, la version qui attend. Ce qui n'est
// pas lu se dit tel, jamais « aucun cook en vol ». Un geste direct n'a rien à confirmer ; un geste
// qui n'écrirait rien refuse à la place. Rien ne part d'ici : confirmation.ts dit, il ne lance rien.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AVERTISSEMENT as ALLUMER } from "../src/allumage.ts";
import type { Projet } from "../src/config.ts";
import { confirmationDe, type Confirmation, type Lus } from "../src/confirmation.ts";
import type { Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { ANNULER, AVERTISSEMENT as REDEMARRER, COUPER, DEMANDER, type MiseEnService, type Version } from "../src/version.ts";

const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const LU = "2026-10-13T10:00:00.000Z";
const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");

const CALME: MiseEnService = { etat: "aucune", depuis: null, coupe: false, enVol: [], tokens: 0 };
const EN_COURS: MiseEnService = { ...CALME, enVol: [{ ticket: 14, run: "14-aa", station: "box/claude", tokens: 230000 }], tokens: 230000 };
const EN_ATTENTE: Version = { etat: "en attente", depuis: "2026-10-13T05:00:00.000Z", branche: "origin/v2", enService: "a".repeat(40), enAttente: "b".repeat(40), livraisons: 3, raison: null };
const A_JOUR: Version = { ...EN_ATTENTE, etat: "à jour", enAttente: null, livraisons: null };
const faits = (plus: Partial<Faits> = {}): Faits => ({
  etat: "ouverte",
  lu: LU,
  dernierTick: LU,
  compteurs: { rail: 4, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "" }],
  ...plus,
});
const lus = (plus: Partial<Faits> = {}): Lus => ({ faits: faits(plus), a: LU });
const PAS_LUS: Lus = { sans: "`faits` n'a pas encore été lu pour ce projet" };

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
      const rendu = confirmationDe(id, PARADE, lus({ version: EN_ATTENTE, miseEnService: { ...EN_COURS, etat: "demandée", depuis: LU } }), "merge");
      assert.ok(rendu !== undefined, id);
      if ("refus" in rendu) continue;
      assert.notEqual(rendu.titre.trim(), "", id);
      assert.ok(rendu.prix.length > 0 || rendu.enVol !== undefined, id);
      assert.ok(rendu.choix.length > 0 && rendu.choix.every((choix) => CONFIRMES.includes(choix.id)), id);
      assert.notEqual(rendu.renoncer.trim(), "", id);
    }
  });

  test("un geste qui n'écrirait rien n'a rien à confirmer : un projet sans box n'en a pas, un grant que la doc ne nomme pas refuse", () => {
    assert.equal(confirmationDe("stop", { nom: "parade", dossier: "/tmp/parade" }, lus()), undefined);
    assert.ok("refus" in (confirmationDe("grant-activer", PARADE, lus(), "deploy") ?? {}));
  });
});

describe("arrêter la cuisine dit les cooks en vol et leurs tokens", () => {
  test("d'après `miseEnService` : chaque cook, ce qu'il a dépensé, le total, et l'heure de la lecture", () => {
    const rendu = confirmee(confirmationDe("stop", PARADE, lus({ miseEnService: EN_COURS })));

    assert.equal(rendu.titre, "arrêter la cuisine");
    assert.match(rendu.prix[0] ?? "", /arrêtés dans la seconde, et rien n'est récolté/);
    assert.equal(rendu.enVol?.titre, `1 cook en vol — ${nombre(230000)} tokens déjà dépensés en tout`);
    assert.deepEqual(rendu.enVol?.cooks, [{ ticket: "#14", titre: "Le journal en ajout seul", station: "box/claude", tokens: `${nombre(230000)} tokens déjà dépensés` }]);
    assert.equal(rendu.lu, LU);
    assert.deepEqual(rendu.choix.map(({ id }) => id), ["stop"]);
    assert.match(rendu.choix[0]?.dit ?? "", /1 cook en vol/);
  });

  test("un runtime qui donne ses cooks sans leurs tokens : ils sont nommés, et ce qui manque est dit", () => {
    const rendu = confirmee(confirmationDe("stop", PARADE, lus({ cooks: [{ ticket: 14, titre: "x", station: "box/claude" }] })));
    assert.ok(rendu.prix.some((ligne) => /^1 cook en cours à cette lecture \(#14\) — ce qu'ils ont dépensé, le runtime de cette box ne le dit pas/.test(ligne)));
  });

  test("ce qui n'est pas lu se dit tel, jamais « aucun cook en vol »", () => {
    for (const lu of [PAS_LUS, lus()]) {
      const rendu = confirmee(confirmationDe("stop", PARADE, lu));
      assert.ok(rendu.prix.some((ligne) => /ne sont pas lus .*Ce n'est pas « aucun cook en vol »/.test(ligne)), JSON.stringify(rendu.prix));
      assert.equal(rendu.enVol, undefined);
    }
    assert.equal(confirmee(confirmationDe("stop", PARADE, PAS_LUS)).lu, undefined);
  });
});

describe("reprendre, accorder, révoquer, allumer : chacun dit ce qu'il engage", () => {
  test("reprendre : les tickets repartent sur ton quota, et combien sont sur le rail", () => {
    const rendu = confirmee(confirmationDe("reprendre", PARADE, lus({ miseEnService: CALME })));
    assert.match(rendu.prix[0] ?? "", /les tickets en attente repartent aussitôt, sur ton quota/);
    assert.ok(rendu.prix.includes("4 tickets sur le rail à cette lecture."));
  });

  test("accorder le grant : une pass verte sera mergée sans toi ; le révoquer : plus rien ne l'est", () => {
    const accorder = confirmee(confirmationDe("grant-activer", PARADE, PAS_LUS, "merge"));
    assert.match(accorder.prix[0] ?? "", /^Une pass verte sera mergée sans toi/);
    assert.deepEqual(accorder.choix.map(({ id }) => id), ["grant-activer"]);
    const revoquer = confirmee(confirmationDe("grant-revoquer", PARADE, PAS_LUS, "merge"));
    assert.match(revoquer.prix[0] ?? "", /^Plus rien n'est mergé sans toi/);
  });

  test("allumer le manager : l'avertissement de la doc, et ses deux nombres à demander à la box", () => {
    const rendu = confirmee(confirmationDe("manager-allumer", PARADE, PAS_LUS));
    assert.deepEqual(rendu.prix, [ALLUMER]);
    assert.equal(rendu.chiffrer, true);
  });
});

describe("mettre en service dit ce qu'il interrompt", () => {
  test("une version en attente : l'avertissement, les cooks en vol, et deux « oui » — attendre le rail calme, ou couper", () => {
    const rendu = confirmee(confirmationDe(DEMANDER, PARADE, lus({ version: EN_ATTENTE, miseEnService: EN_COURS })));

    assert.equal(rendu.titre, "mettre en service");
    assert.deepEqual(rendu.prix, [REDEMARRER]);
    assert.match(rendu.enVol?.titre ?? "", /^1 cook en vol/);
    assert.deepEqual(rendu.choix.map(({ id }) => id), [DEMANDER, COUPER]);
    assert.equal(rendu.renoncer, "ne rien demander");
  });

  test("une demande qui attend le rail calme : couper se confirme seul, et « non » la laisse attendre", () => {
    const rendu = confirmee(confirmationDe(COUPER, PARADE, lus({ etat: "retenue", version: EN_ATTENTE, miseEnService: { ...EN_COURS, etat: "demandée", depuis: LU } })));
    assert.deepEqual(rendu.choix.map(({ id }) => id), [COUPER]);
    assert.equal(rendu.renoncer, "non, attendre le rail calme");
    // Y renoncer n'interrompt rien : il n'a pas de confirmation.
    assert.equal(confirmationDe(ANNULER, PARADE, lus()), undefined);
  });

  test("rien n'attend, ou rien n'est lu : rien n'est offert, et le refus dit pourquoi", () => {
    assert.match((confirmationDe(DEMANDER, PARADE, lus({ version: A_JOUR, miseEnService: CALME })) as { refus: string }).refus, /^rien n'est offert : .* la version est « à jour »/);
    assert.match((confirmationDe(COUPER, PARADE, lus({ version: EN_ATTENTE, miseEnService: CALME })) as { refus: string }).refus, /^rien n'est offert/);
    assert.match((confirmationDe(DEMANDER, PARADE, PAS_LUS) as { refus: string }).refus, /^rien n'est offert : la version n'est pas lue/);
  });
});
