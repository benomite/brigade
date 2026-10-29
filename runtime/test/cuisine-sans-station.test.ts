// Le rail ne porte que ce que la cuisine peut cuire (#1925, #1926, #1927) : des cartes qui attendent une station sont
// en WAITING, un rail qui n'en porte que de celles-là est vide pour la cuisine, et ce n'est pas une panne. La ligne
// « kitchen idle — the rest of the rail needs a human » (#1751) n'existe plus, ni dans `status`, ni sur le tableau.
// Bâti d'un vrai journal et d'un vrai rail, lu par `lireEtat` et `decrireEtat`.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirRail } from "../src/rail.ts";
import { tableauDeLaCuisine } from "../src/tableau/rendu/donnees.ts";
import { aArreter, horloge, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const MAINTENANT = new Date(`${JOUR_HORLOGE}T11:00:00.000Z`);

// Un projet dont le manager suit l'interrupteur, allumé ou non ; ses tickets arrivent avec leur fiche.
function cuisine(t: TestContext, { manager = true }: { manager?: boolean } = {}) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  aArreter(t, () => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: manager ? "project.switched-on" : "project.switched-off", payload: { cause: "default" } });
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => MAINTENANT });
  const arriver = (ticket: number, { waitsFor = [], requires = [] }: { waitsFor?: number[]; requires?: string[] } = {}) =>
    journal.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: {
        title: `Ticket ${ticket}`,
        priority: null,
        createdAt: `2026-10-01T00:00:${ticket}Z`,
        url: `https://exemple.test/${ticket}`,
        card: { waitsFor, zone: [`zone/${ticket}/`], problems: [], ...(requires.length === 0 ? {} : { requires }) },
      },
    });
  // Le bloc `awaiting` de `status`, de sa tête à son bord ; et le tableau du même état.
  const lire = () => {
    const etat = lireEtat(journal, MAINTENANT);
    const lignes = decrireEtat(etat, MAINTENANT);
    const debut = lignes.findIndex((ligne) => ligne.startsWith("awaiting "));
    return { etat, bloc: lignes.slice(debut, lignes.indexOf("end awaiting") + 1), tableau: tableauDeLaCuisine(etat, MAINTENANT) };
  };
  return { journal, rail, arriver, lire };
}

// Le cas du chef : #12 et #13 mis de côté faute de station, #15 qui attend #12, #16 qui attend #15 et #13 — et #17,
// qui attend #20, un ticket qui n'est pas sur le rail : rien ne le lie à une capacité.
function railDuChef(t: TestContext, options?: { manager?: boolean }) {
  const c = cuisine(t, options);
  c.arriver(12, { requires: ["macos"] });
  c.arriver(13, { requires: ["enregistrement-ecran"] });
  c.arriver(15, { waitsFor: [12] });
  c.arriver(16, { waitsFor: [15, 13] });
  c.arriver(17, { waitsFor: [20] });
  c.rail.quatreVingtSix(12, { motif: "no-station: macos" });
  c.rail.quatreVingtSix(13, { motif: "no-station: enregistrement-ecran" });
  return c;
}

const SANS_LA_LIGNE = /kitchen idle|needs a human/;

test("le cas du chef : plus aucune ligne « kitchen idle », ni dans le bloc `awaiting`, ni sur le tableau, ni dans la file", (t) => {
  const { lire } = railDuChef(t);
  const { etat, bloc, tableau } = lire();

  // La file ne change pas : aucune décision, et aucun bilan sur le tableau.
  assert.deepEqual(bloc, ["awaiting   nothing awaits the chef", "end awaiting"]);
  assert.deepEqual(tableau.bilans, []);
  assert.deepEqual(etat.attend, []);
  assert.equal(faits(etat, MAINTENANT).compteurs.attend, 0);
  assert.doesNotMatch(decrireEtat(etat, MAINTENANT).join("\n"), SANS_LA_LIGNE);
});

test("un rail qui ne porte que des cartes en WAITING : `status` le dit vide, normal, et sans ligne `fault`", (t) => {
  const { journal, arriver, rail } = cuisine(t);
  arriver(12, { requires: ["macos"] });
  arriver(15, { waitsFor: [12] });
  rail.quatreVingtSix(12, { motif: "no-station: macos" });
  const tard = new Date(MAINTENANT.getTime() + 6 * 3_600_000);

  for (const quand of [MAINTENANT, tard]) {
    const etat = lireEtat(journal, quand);
    const texte = decrireEtat(etat, quand).join("\n");
    assert.match(texte, /^rail {7}empty — 2 WAITING, normal: nothing on it for a cook$/m);
    assert.doesNotMatch(texte, /^fault /m);
    assert.doesNotMatch(texte, SANS_LA_LIGNE);
    assert.equal(faits(etat, quand).cuisineOisive, null);
  }
});

test("dès qu'une carte peut cuire, le rail n'est plus dit vide", (t) => {
  const { journal, arriver, rail } = cuisine(t);
  arriver(12, { requires: ["macos"] });
  rail.quatreVingtSix(12, { motif: "no-station: macos" });
  arriver(18);

  const texte = decrireEtat(lireEtat(journal, MAINTENANT), MAINTENANT).join("\n");
  assert.match(texte, /^rail {7}1 queued · 1 WAITING$/m);
});

test("les sources du runtime ne portent plus ni l'état « no return time » ni la ligne « kitchen idle … needs a human »", () => {
  const src = join(import.meta.dirname, "../src");
  const trouves = (readdirSync(src, { recursive: true, encoding: "utf8" }) as string[])
    .filter((chemin) => chemin.endsWith(".ts"))
    .filter((chemin) => /no return time|the rest of the rail needs a human/.test(readFileSync(join(src, chemin), "utf8")));
  assert.deepEqual(trouves, []);
});
