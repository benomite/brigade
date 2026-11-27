// La panne d'une station qui a perdu sa connexion à Claude, telle que outages.ts la rend (#2489).
import type { Outage } from "../../../app/src/outages/outages.ts";

export const PANNES: Outage[] = [{ cle: "connexion-max:2026-10-13T09:40:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 24 min ago", survol: "nothing cooks on macbook until you log in", bouton: { libelle: "log in", geste: "login" } }];
