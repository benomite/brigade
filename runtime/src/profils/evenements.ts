// Les faits des profils de cook : un domaine relevé par la mesure
// (`profils/domaines.ts`) devenu une proposition de profil, puis le « oui » ou
// le « non » du chef. Le « oui » écrit la définition du profil dans le dépôt
// du projet ; avant lui, aucun profil n'existe.
import type { Lesson } from "../carnet/carnet.ts";

// Une part livrée du premier coup : `first` tickets sur `merged` mergés.
export type PartDuPremierCoup = { first: number; merged: number };

// Le profil proposé pour un domaine (`profils/proposer.ts`). `name` : son nom,
// celui de son fichier. `zone` : le domaine. Les chiffres qui le justifient,
// tels que la mesure les a lus : `tickets`, ceux de la fenêtre qui portent la
// zone, dans l'ordre de leur service ; `window`, les tickets servis regardés ;
// `zoneFirstTry` et `projectFirstTry`, la part de la zone et celle du projet ;
// `gap`, les points qui les séparent ; `settings`, les seuils en vigueur. Ce
// que le profil contiendrait : `skills`, `perimeter` (la zone), et `notebook`,
// son carnet de départ — les leçons promues du projet nées d'un ticket du
// domaine.
export type PropositionDeProfil = {
  name: string;
  zone: string;
  tickets: number[];
  window: number;
  zoneFirstTry: PartDuPremierCoup;
  projectFirstTry: PartDuPremierCoup;
  gap: number;
  settings: { window: number; minTickets: number; gapPoints: number };
  skills: string[];
  perimeter: string[];
  notebook: Lesson[];
};

// Le « oui » du chef (`profils/decision.ts`). `proposal` : le fait
// `profile.proposed` qu'il tranche, par son `seq`. `file` : la définition
// écrite, relative au dépôt du projet.
export type ProfilAccepte = { proposal: number; name: string; zone: string; file: string };

// Le « non » du chef. `tickets` : ceux du domaine que le journal avait servis
// à cet instant — c'est sur d'autres que le domaine doit franchir de nouveau
// les seuils pour être proposé encore.
export type ProfilRefuse = { proposal: number; name: string; zone: string; tickets: number[] };

export type FaitProfil =
  // Une fois par domaine tant qu'elle attend, et une fois après chaque « non »
  // dépassé : la clé d'unicité porte la zone et le dernier « non ».
  | { type: "profile.proposed"; payload: PropositionDeProfil }
  // L'un ou l'autre, une fois par proposition : un second geste n'écrit rien.
  | { type: "profile.accepted"; payload: ProfilAccepte }
  | { type: "profile.refused"; payload: ProfilRefuse };
