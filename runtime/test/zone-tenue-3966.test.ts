// #3966 : ce que la règle « un ticket en file ne tient aucune zone » laisse tenu.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "./faux-github.ts";

const fiche = (zone: string) => `<!-- brigade:fiche -->\n- awaiting: none\n- zone: ${zone}`;

// #40 est `taken` sans prise lisible, ni cook ni pass : en file, il ne tient pas `runtime/src/q.ts`, #41 qui s'y trouve part.
function ticketsEnFile(faux: FauxGitHub): void {
  faux.feu(40, [...CALIBRE, LABEL_TAKEN], "the ticket's body");
  faux.poster(40, "manager", fiche("runtime/src/q.ts"));
  faux.feu(41, CALIBRE, "the ticket's body");
  faux.poster(41, "manager", fiche("runtime/src/q.ts"));
}

const tourner = async (a: { tour(): Promise<void>; calme(): Promise<void> }, tours: number, fini: () => boolean = () => false) => {
  for (let i = 0; i < tours && !fini(); i += 1) {
    await a.tour();
    await a.calme();
  }
};

test("a ticket in pass holds its zone though no claim comment names a station, a queued one holds none, and a rewrite after the last send-back keeps the PR open", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, LABEL_IN_PASS], "the ticket's body");
  faux.poster(1, "manager", "<!-- brigade:fiche -->\n- awaiting: none\n- zone: runtime/src/a.ts");
  faux.feu(2, CALIBRE, "the ticket's body");
  faux.poster(2, "manager", "<!-- brigade:fiche -->\n- awaiting: none\n- zone: runtime/src/a.ts");
  ticketsEnFile(faux);
  const sauts: string[] = [];
  const a = faux.station("A", { places: 3, sauter: (_numero, ligne) => sauts.push(ligne), cuisiner: async () => ({ echec: "not the point" }), avertir: () => {} });
  await tourner(a, 2);
  assert.ok(!faux.cuissons.some(({ issue }) => issue === 2), "#2 does not start on the zone of #1, in pass");
  assert.ok(faux.cuissons.some(({ issue }) => issue === 41), "#41 starts: #40, queued, holds no zone");
  assert.ok(sauts.some((ligne) => ligne.startsWith("#2 ")), sauts.join("\n"));
  await livraisonGardeeApresLesRenvois();
});

// Après le dernier renvoi de la pass, la réécriture du manager laisse la PR ouverte : elle reste la livraison en pass.
async function livraisonGardeeApresLesRenvois(): Promise<void> {
  const faux = new FauxGitHub();
  faux.corpsEcrivables = true;
  faux.feu(31);
  let consultations = 0;
  const a = faux.station("A", {
    avertir: () => {},
    places: 3,
    reprendre: async () => {
      consultations += 1;
      return { reprise: { choix: "reecrire", motif: "The CI fails on a test the ticket never names.", corps: "Fix the `tests` check first." } };
    },
  });
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 31);
  assert.ok(pr);
  // Après le premier tour : la guérison du premier tour ne rend pas ces tickets.
  ticketsEnFile(faux);
  faux.ciRouge.add(pr.number);
  await tourner(a, 12, () => consultations > 0);
  assert.equal(consultations, 1);
  assert.equal(faux.pr(pr.number).state, "open");
  assert.ok(faux.cuissons.some(({ issue }) => issue === 41), "#41 starts: #40, queued, holds no zone");
}
