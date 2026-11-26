// Les étapes d'un ticket (#4278, règle 11 de
// `docs/superpowers/specs/2026-11-24-simplified-process.md`) : un projet peut
// déclarer des étapes pour une sorte de tickets — script, storyboard, voix,
// rendu ; un ticket d'une autre sorte en a une seule, et vit comme avant.
// Chaque étape passe par la pass avant que la suivante ne démarre, et un refus
// à n'importe quelle étape compte dans les trois essais du ticket : un seul
// compte pour toutes ses étapes.
//
// Des fonctions sans effet : la lecture de la fiche et la marque posée sur
// l'issue sont dans `etapes/sur-le-ticket.ts`.
import type { Etape } from "./fiche-projet/fiche.ts";
import { RENVOIS_MAX } from "./github-seul/renvois/renvois.ts";

// L'étape unique d'un ticket dont la sorte n'en déclare aucune : son nom ne se
// montre nulle part, un ticket à une étape n'a pas de marque.
export const ETAPE_UNIQUE = "main";

// Les essais d'un ticket, toutes étapes confondues : le premier cook et ses
// renvois (`RENVOIS_MAX`). Au-delà, il s'arrête comme un ticket à une étape.
export const ESSAIS_MAX = RENVOIS_MAX + 1;

// Les étapes de chaque sorte, par sorte : `stages` d'un projet.
export type EtapesParSorte = Record<string, string[]>;

// Où en est un ticket : ses étapes, l'index de la courante, ses essais refusés,
// et `abandonne` quand ses essais sont épuisés.
export type EtatDeEtapes = { etapes: string[]; courante: number; essais: number; abandonne?: boolean };

// Les étapes que les `stages` de la fiche déclarent pour une sorte (`kind`),
// dans leur ordre. Celles sans sorte sont l'étape unique des autres tickets.
export function etapesParSorte(stages: readonly Etape[]): EtapesParSorte {
  const parSorte: EtapesParSorte = {};
  for (const { name, kind } of stages) if (kind !== undefined) (parSorte[kind] ??= []).push(name);
  return parSorte;
}

// La sorte d'un ticket, pour ses étapes : le premier de ses labels pour lequel
// le projet en déclare ; null s'il n'en porte aucun.
export function sorteDuTicket(labels: readonly string[], stages: EtapesParSorte): string | null {
  return labels.find((label) => Object.hasOwn(stages, label)) ?? null;
}

// Les étapes d'un ticket de sorte `sorte` : celles que le projet déclare pour
// elle, sinon une seule.
export function etapesDuTicket({ projet, sorte }: { projet: { stages?: EtapesParSorte }; sorte: string | null }): string[] {
  const declarees = sorte === null || projet.stages === undefined || !Object.hasOwn(projet.stages, sorte) ? [] : (projet.stages[sorte] ?? []);
  return declarees.length > 0 ? [...declarees] : [ETAPE_UNIQUE];
}

// Ce que le verdict de la pass fait à l'étape : vert, la suivante démarre — la
// dernière, elle, reste la courante, le ticket est servi ; rouge, un essai de
// plus, et le ticket s'arrête au `ESSAIS_MAX`-ième ; en attente, rien ne bouge.
export function avancerEtape(etat: EtatDeEtapes, { verdict }: { verdict: "green" | "red" | "pending" }): EtatDeEtapes {
  if (verdict === "green") return { ...etat, courante: etat.courante < etat.etapes.length - 1 ? etat.courante + 1 : etat.courante };
  if (verdict !== "red") return etat;
  const essais = etat.essais + 1;
  return { ...etat, essais, abandonne: essais >= ESSAIS_MAX };
}

// La marque d'étape que l'issue montre : « stage 2 of 4: storyboard ». Vide
// pour un ticket à une étape, qui n'en montre aucune.
export function decrireEtape({ etapes, courante }: EtatDeEtapes): string {
  if (etapes.length < 2) return "";
  return `stage ${courante + 1} of ${etapes.length}: ${etapes[courante]}`;
}
