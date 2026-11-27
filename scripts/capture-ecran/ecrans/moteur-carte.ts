// L'onglet Stations de « parade », cuit par sa box (#3746) : sa carte dit son moteur, l'abonnement Claude, et que ses cooks
// cuisent sur la clé d'API jusqu'à la date où le plafond de l'abonnement se lève — l'état que le runtime publie dans `facts`.
import type { Facts } from "../../../app/src/facts.ts";
import type { Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "parade-box/claude" };
const moteur = { chosen: "claude-subscription", active: "claude-api-key", onFallback: true, blockedUntil: "2026-10-13T15:00:00Z" };
const ligne = { station: "parade-box/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, presente: true, cooks: [COOK_14], engine: moteur };
const facts = { ...PARADE.facts, cooks: [COOK_14], stations: [ligne] } as unknown as Facts;

export const ecran = ongletDesStations("L'onglet Stations de « parade », cuit par sa box sur la clé d'API : sa carte dit son moteur et « cooking on the API key » jusqu'à la date du plafond (#3746)", { stations: [BOX, MAC], projet: CONFIE, cuit: true, facts });
