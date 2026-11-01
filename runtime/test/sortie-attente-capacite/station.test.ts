// « Give it to a station » (#1958) : sur la carte d'un ticket en WAITING faute de capacité, le chef choisit une
// station du projet ; ce que la carte demande s'ajoute à ce qu'elle fournit, par le geste qui change une station
// seule (`installation stations set`, une-station.ts) — celui que l'app joue. Le ticket revient seul sur le rail,
// part chez cette station, et ne revient pas en WAITING pour cette capacité. Sur une cuisine complète : rail,
// stations, un faux `claude`, un GitHub de test.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { faits, lireEtat } from "../../src/etat.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { lireStations } from "../../src/stations-declarees.ts";
import { changerUneStation } from "../../src/une-station.ts";
import { cuisine, decider, issue, type Lieux } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

const DECLARATION = "box/claude:2:code+raisonnement,box/playwright:1:navigateur-headless";
const PLAYWRIGHT = "box/playwright";

const poser = (gh: Lieux["gh"], numero: number, ...lignes: string[]) => {
  if (lignes.length > 0) gh.ficher(numero, "2026-10-08T09:00:00Z", [MARQUEUR, ...lignes].join("\n"));
  gh.poser(issue(numero));
};

describe("« Give it to a station » : la capacité s'ajoute à la station choisie", () => {
  test("`facts` dit ce que la carte en WAITING demande ; donné à `box/playwright`, le ticket revient sur le rail, part chez elle, et ne revient pas en WAITING", async (t) => {
    const { repertoire, gh, journal, etat, heure } = cuisine(t, { decisions: true, stations: lireStations({ BRIGADE_STATIONS: DECLARATION }), scenario: "muet" });
    // La déclaration est au journal, comme celle qu'un projet installé y a posée.
    decider(repertoire, "BRIGADE_STATIONS", DECLARATION);
    // #14 demande `macos`, qu'aucune station ne fournit, et `navigateur-headless`, que `box/playwright` fournit.
    poser(gh, 14, "- requiert : macos, navigateur-headless");
    await jusqua(() => etat(14) === "86");
    const carte = () => faits(lireEtat(journal), heure.maintenant()).rail.find(({ ticket }) => ticket === 14);
    assert.equal(carte()?.etat, "WAITING");
    // Toute la ligne `requiert` : la station choisie doit tout fournir, pas seulement ce qui manque.
    assert.deepEqual(carte()?.requiert, ["macos", "navigateur-headless"]);

    // Le geste de l'app : `installation stations set box/playwright 1 navigateur-headless+macos`.
    const chef = ouvrirJournal(repertoire);
    try {
      changerUneStation(chef, { projet: "brigade", nom: PLAYWRIGHT, changement: { reglee: { cooks: 1, fournit: ["navigateur-headless", "macos"] } }, auteur: "chef" });
    } finally {
      chef.fermer();
    }
    await jusqua(() => etat(14) === "taken");

    assert.equal(journal.duTicket(14).findLast((e) => e.type === "ticket.released")?.payload.reason, "capabilities-reread");
    assert.equal(journal.duTicket(14).find((e) => e.type === "ticket.taken")?.author, `station:${PLAYWRIGHT}`);
    // Revenu, il ne porte plus ni l'attente, ni ce qu'elle demandait.
    assert.deepEqual([carte()?.etat, carte()?.tiers, carte()?.requiert], ["pris", null, undefined]);
    // Il n'a été mis de côté qu'une fois : faute de station, avant le geste.
    assert.equal(journal.duTicket(14).filter((e) => e.type === "ticket.86").length, 1);
  });

  test("seul un ticket en WAITING faute de capacité porte `requiert` dans `facts` : un ticket qui demande ce qu'une station fournit n'en porte pas", async (t) => {
    const { gh, journal, etat, heure, lancements } = cuisine(t, { stations: lireStations({ BRIGADE_STATIONS: DECLARATION }), scenario: "muet" });
    poser(gh, 15, "- requiert : code");
    await jusqua(() => lancements().length === 1);

    assert.equal(etat(15), "taken");
    assert.equal(faits(lireEtat(journal), heure.maintenant()).rail.find(({ ticket }) => ticket === 15)?.requiert, undefined);
  });
});
