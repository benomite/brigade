// La panne d'une station qui a perdu sa connexion à Claude, telle que pannes.ts la rend (#2489).
import type { Panne } from "../../../app/src/pannes/pannes.ts";

export const PANNES: Panne[] = [{ cle: "connexion-max:2026-10-13T09:40:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 24 min ago", survol: "nothing cooks on macbook until you log in", bouton: { libelle: "log in", geste: "login" } }];
