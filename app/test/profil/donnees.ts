// Ce que la box rend d'un profil de cook proposé (#1053), pour les tests de ce dossier : la forme que le
// runtime écrit dans `facts` (runtime/src/profils/cartes.ts) — le domaine `app/src/vue`, cinq tickets
// dont un sans adresse, deux leçons de départ.
import type { Faits } from "../../src/faits.ts";
import { CUISINE_OUVERTE } from "../correction/donnees.ts";
import type { ProfilLu } from "../../src/profil.ts";

export const PROFIL: ProfilLu = {
  proposition: 377,
  nom: "app-src-vue",
  domaine: "app/src/vue",
  chiffres: {
    tickets: [
      { ticket: 4, url: "https://github.com/chef/parade/issues/4" },
      { ticket: 7, url: "https://github.com/chef/parade/issues/7" },
      { ticket: 9, url: "https://github.com/chef/parade/issues/9" },
      { ticket: 11, url: "https://github.com/chef/parade/issues/11" },
      { ticket: 14, url: null },
    ],
    fenetre: 20,
    domaine: { premiers: 2, retenus: 5, part: 0.4 },
    projet: { premiers: 15, retenus: 20, part: 0.75 },
    ecart: 35,
    seuils: { fenetre: 20, tickets: 5, ecart: 20 },
  },
  skills: [],
  perimetre: ["app/src/vue"],
  carnet: [
    { id: "L-007", texte: "A view change is judged on a screenshot.", retros: ["#9"] },
    { id: "L-012", texte: "Reuse the bricks before writing a new style.", retros: ["#11", "retro-3"] },
  ],
  proposee: "2026-10-13T09:41:05.000Z",
};

export const FAITS: Faits = { ...CUISINE_OUVERTE, profils: [PROFIL] };
