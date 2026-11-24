// Les écrans de la visite d'une vraie cuisine (#4087) : le pont rend à `lireLaCuisineVisitee` la cuisine figée de
// « parade », rangée en tableau par les modules de l'app — jamais une raison, jamais un écran qui ne se construit pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ecran as visite } from "../ecrans/visite.ts";
import { ecran as visiteCook } from "../ecrans/visite-cook.ts";

type Tableau = { rail?: { colonnes: Array<{ nom: string; cartes?: unknown[] }> } };

test("la visite : « visit a real kitchen » cliqué, et la cuisine figée rendue rangée en tableau", () => {
  for (const ecran of [visite, visiteCook]) {
    assert.deepEqual(ecran.etapes[0], { cliquer: 'button[data-choix="visiter"]' });
    const { reponses } = ecran.donnees() as { reponses: { lireLaCuisineVisitee?: { tableau?: Tableau } } };
    const tableau = reponses.lireLaCuisineVisitee?.tableau ?? assert.fail("aucun tableau pour la visite");
    assert.ok((tableau.rail?.colonnes.length ?? 0) > 0, JSON.stringify(tableau.rail));
  }
});
