// #3974, critère 2 : un ticket `prio:0` claimable part au tour qui suit la libération d'une place dans sa zone.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL_IN_PASS } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;

test("a prio:0 ticket starts on the tick after the ticket holding its zone is done, though lower-priority tickets wait on the same zone", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, LABEL_IN_PASS]);
  faux.poster(1, "manager", fiche("runtime/src/a.ts"));
  faux.feu(2, [...CALIBRE, "prio:0"]);
  faux.poster(2, "manager", fiche("runtime/src"));
  faux.feu(3, CALIBRE);
  faux.poster(3, "manager", fiche("runtime/src/c.ts"));
  faux.feu(4, [...CALIBRE, "prio:1"]);
  faux.poster(4, "manager", fiche("runtime/src/d.ts"));
  // Un cook qui ne finit pas : le ticket qu'il cuit tient sa zone.
  let relacher: () => void = () => {};
  const bloque = new Promise<{ echec: string }>((resolve) => (relacher = () => resolve({ echec: "released" })));
  const a = faux.station("A", { places: 3, sauter: () => {}, cuisiner: () => bloque, avertir: () => {} });
  try {
    await a.tour();
    // La place se libère : #1 est mergé.
    const un = faux.ticket(1);
    un.state = "closed";
    un.labels.delete(LABEL_IN_PASS);
    await a.tour();
    assert.ok(
      faux.cuissons.some(({ issue }) => issue === 2),
      `#2 (prio:0) starts within one tick; started: ${faux.cuissons.map(({ issue }) => `#${issue}`).join(", ")}`,
    );
  } finally {
    relacher();
    await a.calme();
  }
});
