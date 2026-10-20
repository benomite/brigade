// La cuisine reprise après un renommage du code mergé (`renommage.ts`) : la
// pause est levée par le merge lui-même, et la pass merge à nouveau, les
// stations prennent à nouveau, sans geste du chef. Restent les tickets que la
// pause a retenus : leur zone et leur branche nomment encore les chemins
// d'avant le renommage.
//
// - Leur zone — et celle de tout ticket du rail — se lit sur les nouveaux
//   chemins : la levée la réécrit au journal, et chaque relecture de la fiche
//   la traduit de même (`alimenter.ts`). La fiche de l'issue reste telle que
//   le chef l'a écrite : le runtime la lit à travers le renommage.
// - Leur branche est portée sur le nouvel arbre par la pass, avant qu'elle ne
//   la juge (`pass.ts`, `Depot.transposer`) : un commit de plus, qui fusionne
//   la base renommée et y déplace ce que la livraison avait écrit, selon les
//   déplacements de l'outil. Une livraison qui ne touchait aucun fichier
//   déplacé est jugée telle quelle ; une qui ne se porte pas — un conflit avec
//   le renommage — est remontée au chef, nommée dans la file avec la raison.
//
// Tout se relit du journal : les déplacements sont ceux que l'outil a dits,
// portés par `rename.delivered`, d'un renommage dont la pause a été levée
// mergée.
import type { Base } from "../base.ts";
import type { Fiche } from "../fiche.ts";
import type { Journal } from "../journal.ts";
import { lireRail } from "../projections/rail.ts";
import type { Deplacement } from "./evenements.ts";

// La cause d'un `pass.escalated` sur une livraison qui ne se porte pas sur
// l'arbre d'un renommage mergé : la file la nomme, avec ce qu'en dit
// `rename.stranded`.
export const INTRANSPOSABLE = "rename-conflict";

// Ce que dit le dernier `rename.stranded` du ticket : pourquoi sa livraison
// ne se porte pas sur l'arbre renommé. Null s'il n'y en a pas.
export function pourquoiIntransposable(base: Base, ticket: number): string | null {
  const [fait] = base.lire<{ why: string }>("SELECT json_extract(payload, '$.why') AS why FROM events WHERE type = 'rename.stranded' AND ticket = ? ORDER BY seq DESC LIMIT 1", ticket);
  return fait?.why ?? null;
}

// Le préfixe d'une ligne `move` de l'outil (`scripts/rename-code/README.md`).
export const LIGNE_DE_DEPLACEMENT = /^move\t/;

// Les déplacements que disent les lignes `move` de l'outil : `move`, l'ancien
// chemin, le nouveau nom. Toute autre ligne est écartée.
export function deplacementsDeLOutil(lignes: readonly string[]): Deplacement[] {
  return lignes.flatMap((ligne): Deplacement[] => {
    const [quoi, de, vers, ...reste] = ligne.replace(/\r$/, "").split("\t");
    return quoi === "move" && de && vers && reste.length === 0 && !vers.includes("/") ? [[de, vers]] : [];
  });
}

const segments = (chemin: string) => chemin.split("/").filter((segment) => segment !== "" && segment !== ".");

// Un chemin du dépôt, sur l'arbre renommé : chacun de ses segments prend le
// nouveau nom que l'outil a donné au fichier ou au dossier qu'il termine.
// Un chemin que rien ne déplace est rendu tel quel.
export function traduireChemin(chemin: string, deplacements: readonly Deplacement[]): string {
  if (deplacements.length === 0) return chemin;
  const noms = new Map(deplacements);
  const anciens = segments(chemin);
  const nouveaux = anciens.map((segment, i) => noms.get(anciens.slice(0, i + 1).join("/")) ?? segment);
  return nouveaux.join("/") === anciens.join("/") ? chemin : nouveaux.join("/");
}

// Un renommage mergé : sa demande, son commit, et ce que l'outil y a déplacé.
export type RenommageMerge = { request: number; sha: string; moves: Deplacement[] };

// Les renommages mergés qui ont déplacé quelque chose, le plus ancien d'abord.
export function renommagesMerges(base: Base): RenommageMerge[] {
  return base
    .lire<{ payload: string }>(
      `SELECT livree.payload FROM events AS levee JOIN events AS livree
         ON livree.type = 'rename.delivered' AND json_extract(livree.payload, '$.request') = json_extract(levee.payload, '$.request')
       WHERE levee.type = 'pause.released' AND json_extract(levee.payload, '$.outcome') = 'merged'
       ORDER BY levee.seq, livree.seq DESC`,
    )
    .flatMap(({ payload }): RenommageMerge[] => {
      const { request, sha, moves } = JSON.parse(payload) as { request: number; sha: string; moves?: Deplacement[] };
      return moves === undefined || moves.length === 0 ? [] : [{ request, sha, moves }];
    })
    .filter((renommage, i, tous) => tous.findIndex((autre) => autre.request === renommage.request) === i);
}

// Une zone sur l'arbre des renommages donnés, dans l'ordre : chaque chemin
// traduit, sans doublon.
export function zoneTraduite(zone: readonly string[], renommages: readonly RenommageMerge[]): string[] {
  const traduite = zone.map((chemin) => renommages.reduce((courant, { moves }) => traduireChemin(courant, moves), chemin));
  return [...new Set(traduite)];
}

// La fiche d'un ticket lue sur l'arbre des renommages mergés : sa zone sur
// les nouveaux chemins. Une fiche illisible, ou que rien ne déplace, est
// rendue telle quelle.
export function ficheSurLeNouvelArbre<F extends Fiche | null>(fiche: F, renommages: readonly RenommageMerge[]): F {
  if (fiche === null || fiche.problems.length > 0 || renommages.length === 0) return fiche;
  const zone = zoneTraduite(fiche.zone, renommages);
  return zone.length === fiche.zone.length && zone.every((chemin, i) => chemin === fiche.zone[i]) ? fiche : { ...fiche, zone };
}

// Réécrit au journal, sur les nouveaux chemins, la zone de chaque ticket du
// rail qu'un renommage mergé déplace — dans la transaction de la levée, pour
// que la cuisine reparte sur des zones à jour. Rend les tickets réécrits.
export function reprendreLesZones(journal: Journal, projet: string, auteur: string): number[] {
  const renommages = renommagesMerges(journal.base);
  if (renommages.length === 0) return [];
  return lireRail(journal.base).flatMap(({ ticket, title, priority, model, effort, card }) => {
    const traduite = ficheSurLeNouvelArbre(card, renommages);
    if (traduite === card || traduite === null) return [];
    journal.ajouter({ project: projet, ticket, author: auteur, type: "ticket.changed", payload: { title, priority, model, effort, card: traduite } });
    return [ticket];
  });
}
