// Les places de la station GitHub seul (#3446) : elle s'annonce au journal, et le plafond que le chef règle à chaud
// (`station.capped`) tient à chaque tour ; sans réglage, sa déclaration bornée par les cœurs, comme avant.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { placesDeLaStation } from "../../../src/github-seul/places/places.ts";
import { ouvrirJournal, type Journal } from "../../../src/journal.ts";
import { direPlafondEn, etatStation } from "../../../src/projections/stations.ts";
import { FauxGitHub } from "../../faux-github.ts";
import { repertoireTemporaire } from "../../outils.ts";

const BOX = { nom: "box/claude", moteur: "claude", fournit: ["code"], cooks: 30 };

function journal(t: TestContext): Journal {
  const ouvert = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => ouvert.fermer());
  return ouvert;
}

const plafonner = (j: Journal, maxCooks: number | null) => j.ajouter({ project: "brigade", ticket: null, author: "chef", type: "station.capped", payload: { station: BOX.nom, maxCooks } });

test("the GitHub-only station announces itself: status says its cap and where it comes from, 3 on 8 cores for a station declared at 30 (#3446)", (t) => {
  const j = journal(t);
  const places = placesDeLaStation(j, "brigade", BOX, { coeurs: 8, avertir: () => {} });
  const etat = etatStation(j.base, BOX.nom);
  assert.ok(etat);
  assert.deepEqual({ engine: etat.engine, provides: etat.provides, maxCooks: etat.maxCooks, cores: etat.cores }, { engine: "claude", provides: ["code"], maxCooks: 30, cores: 8 });
  assert.equal(direPlafondEn(etat), "3 at most — 8 cores");
  assert.equal(places(), 3);
});

test("the chef's cap holds at the next turn, above the cores' default too; 0 is no limit, `auto` brings the default back (#3446)", (t) => {
  const j = journal(t);
  const places = placesDeLaStation(j, "brigade", BOX, { coeurs: 8, avertir: () => {} });
  plafonner(j, 6);
  assert.equal(places(), 6);
  plafonner(j, 0);
  assert.equal(places(), Number.POSITIVE_INFINITY);
  plafonner(j, null);
  assert.equal(places(), 3);
});

test("a declaration under the cores' default is the default; a log that cannot be read keeps it, said once (#3446)", (t) => {
  // Fermé dans le test : le journal ne se lit plus.
  const j = ouvrirJournal(repertoireTemporaire(t));
  const avertis: string[] = [];
  const places = placesDeLaStation(j, "brigade", { ...BOX, cooks: 2 }, { coeurs: 16, avertir: (texte) => avertis.push(texte) });
  plafonner(j, 9);
  j.fermer();
  assert.equal(places(), 2);
  assert.equal(places(), 2);
  assert.equal(avertis.length, 1, avertis.join("\n"));
  assert.match(avertis[0] ?? "", /the cap of station box\/claude could not be read from the log .* it takes 2 tickets at most, its default/);
});

test("a log that refuses the announcement leaves the station its default, and says so (#3446)", () => {
  const avertis: string[] = [];
  const refuse = {
    ajouter: () => {
      throw new Error("disk full");
    },
    base: { lire: () => [] },
  } as unknown as Journal;
  const places = placesDeLaStation(refuse, "brigade", BOX, { coeurs: 8, avertir: (texte) => avertis.push(texte) });
  assert.equal(places(), 3);
  assert.match(avertis.join("\n"), /station box\/claude could not announce itself in the log \(disk full\)/);
});

test("the turn reads its places each time: the chef raises the cap, the next turn claims up to it (#3446)", async () => {
  const faux = new FauxGitHub();
  for (let n = 1; n <= 5; n += 1) faux.feu(n);
  let plafond = 1;
  // Des cooks qui ne finissent pas : chaque prise garde sa place.
  const a = faux.station("A", { places: () => plafond, cuisiner: () => new Promise(() => {}) });
  await a.tour();
  assert.equal(faux.prisesDe("A"), 1);
  plafond = 4;
  await a.tour();
  assert.equal(faux.prisesDe("A"), 4);
});
