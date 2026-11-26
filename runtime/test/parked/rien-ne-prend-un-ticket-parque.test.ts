// #4129 : rien ne prend un ticket parqué avant sa date, son fait ou la réponse — ni un geste du
// superviseur (qui ne remet plus rien sur le rail, #4233), ni une date qui ne le libère pas : parqué jusqu'à un fait, il attend
// qu'on le dise arrivé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reprendALaDate } from "../../src/attente-github/marque.ts";
import { LABELS_D_AVANT_PARKED } from "../../src/github-etat/etats.ts";
import { exigerNonParque, GesteRefuse } from "../../src/rail.ts";
import type { Reveil } from "../../src/superviseur/declencheur.ts";
import { jouerLeRun } from "../../src/superviseur/gestes.ts";
import { FauxDepot } from "../superviseur/faux-depot.ts";

const MAINTENANT = new Date("2026-11-25T10:00:00.000Z");
const PRISES: Reveil = { cause: "takes", takes: 3, ticket: 40 };

const parquer = (depot: FauxDepot) =>
  jouerLeRun({ github: depot.client(), depot: "acme/shop", branche: "main", maintenant: MAINTENANT }, PRISES, { saw: "the dossier", gesture: { gesture: "park", ticket: 40, what: "the key", who: "the client" } });

test("le superviseur ne remet jamais un ticket parqué sur le rail (`back-on-rail` n'existe plus, #4233) et `park` refuse un ticket déjà parqué : ses labels restent", async () => {
  for (const labels of [["fire", "parked"], ["parked"], ["fire", "parked", "chef-todo"], ["chef-todo"]]) {
    const depot = new FauxDepot();
    depot.issue(40, labels);
    const trace = await parquer(depot);
    assert.equal(trace.outcome, "refused", labels.join(","));
    assert.deepEqual(depot.labelsDe(40), labels, labels.join(","));
    assert.match(depot.commentaires.get(40)?.[0] ?? "", /- \*\*refused\*\*: park: #40 is parked \(`parked`\): it waits for someone, and nothing takes it before its date, its fact or the answer/, labels.join(","));
    const rail = await jouerLeRun({ github: depot.client(), depot: "acme/shop", branche: "main", maintenant: MAINTENANT }, PRISES, { saw: "x", gesture: { gesture: "back-on-rail", ticket: 40, note: "again" } });
    assert.equal(rail.outcome, "refused", labels.join(","));
    assert.deepEqual(depot.labelsDe(40), labels, labels.join(","));
  }
});

test("`exigerNonParque` : refuse `parked`, `chef-todo` et un label d'attente d'avant parked, laisse tout autre ticket", () => {
  assert.throws(() => exigerNonParque(["parked"], 7), GesteRefuse);
  assert.throws(() => exigerNonParque(["chef-todo"], 7), GesteRefuse);
  for (const label of LABELS_D_AVANT_PARKED) assert.throws(() => exigerNonParque(["fire", label], 7), GesteRefuse, label);
  assert.doesNotThrow(() => exigerNonParque(["fire", "taken", "in-pass", "served-elsewhere"], 7));
});

test("parqué jusqu'à une date, il reprend à cette date et pas avant ; parqué jusqu'à un fait, aucune date ne le reprend", () => {
  const jusqua = (iso: string, fact?: string) => ({ what: "the key", who: "the client", followUp: iso, ...(fact === undefined ? {} : { fact }) });
  assert.equal(reprendALaDate(jusqua("2026-11-25T09:00:00.000Z"), MAINTENANT), true);
  assert.equal(reprendALaDate(jusqua("2026-11-25T10:00:00.000Z"), MAINTENANT), true);
  assert.equal(reprendALaDate(jusqua("2026-11-25T11:00:00.000Z"), MAINTENANT), false);
  assert.equal(reprendALaDate(jusqua("2026-11-25T09:00:00.000Z", "the signed quote is in"), MAINTENANT), false);
});
