// Ce qu'une passe qui écrit dit au chef : pourquoi elle n'est pas partie,
// comment elle a fini. Les mêmes mots sur la sortie de sa commande, dans
// journald et dans le bloc `journal` de l'observation. Et la mise en page de
// `run fermeture` : un titre, puis des colonnes sous lui.
import type { FaitFermeture, ReglagesDeFermeture } from "../evenements/fermeture.ts";
import type { Refus } from "./condition.ts";

export const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
export const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const arrondi = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const duree = (ms: number) => (ms >= 60_000 ? `${arrondi(ms / 60_000)} min` : `${arrondi(ms / 1000)} s`);

const TITRE = 11;
export const ligne = (titre: string, valeur: string) => `${titre.padEnd(TITRE)}${valeur}`.trimEnd();
// Des colonnes alignées sur leur cellule la plus large, sous le titre.
export const colonnes = (lignes: string[][]) => lignes.map((cellules) => ligne("", cellules.map((cellule, rang) => cellule.padEnd(Math.max(...lignes.map((autres) => (autres[rang] ?? "").length)))).join("  ")));

// Le refus, tel que le chef le lit.
export function direRefus({ reason, observed, limit, detail }: Refus): string {
  switch (reason) {
    case "unconfigured":
      return "le closer n'est pas réglé sur ce projet — `BRIGADE_CLOSING_MODEL` et `BRIGADE_CLOSING_EFFORT` dans l'environnement du runtime, puis le redémarrer";
    case "busy":
      return "une passe de fermeture range déjà, ou est déjà demandée — une seule à la fois";
    case "stopped":
      return `la cuisine est arrêtée par le chef depuis le ${detail} — « reprendre » d'abord`;
    case "breaker":
      return `le disjoncteur est ouvert depuis le ${detail} — « reprendre » d'abord`;
    case "cooks": {
      const rail = Number(detail);
      return `condition d'exécution non remplie : ${pluriel(observed ?? 0, "cook")} en vol pour un seuil de ${limit} — la passe part quand il y en a moins que le seuil, ou quand le rail est vide (il porte ${pluriel(rail, "ticket")} non servi${rail > 1 ? "s" : ""})`;
    }
    case "zoneless":
      return `condition d'exécution non remplie : le cook en vol de ${detail} ne déclare aucune zone — la passe ne peut pas savoir ce qu'il tient, elle attend qu'il ait fini`;
    case "depot":
      return `la branche d'intégration ne se lit pas — ${detail}`;
    case "nothing":
      return `rien à ranger — ${detail}`;
    case "restarted":
      return "le runtime a redémarré avant de la prendre — à redemander";
  }
}

// Les plafonds d'une passe, tels que sa commande les annonce.
export function direReglages({ calibration, cooksBelow, tokens, removedLines }: ReglagesDeFermeture): string {
  return [
    calibration === null ? "closer non réglé" : `closer en \`${calibration.model}\` / \`${calibration.effort}\``,
    `part sous ${pluriel(cooksBelow, "cook")} en vol`,
    `${nombre(tokens)} tokens au plus`,
    `${pluriel(removedLines, "ligne")} retirée${removedLines > 1 ? "s" : ""} au plus`,
  ].join(" · ");
}

// La fin d'une passe, telle que le chef la lit.
export function direFin({ outcome, observed, limit, pr, removedLines, files, kept, detail }: Extract<FaitFermeture, { type: "closing.ended" }>["payload"]): string {
  const mesure = (unite: (valeur: number) => string) => `${observed == null ? "?" : unite(observed)} pour un plafond de ${limit == null ? "?" : unite(limit)}`;
  const rienDeLivre = "rien n'est livré";
  switch (outcome) {
    case "delivered":
      return `livrée : ${pluriel(removedLines ?? 0, "ligne")} retirée${(removedLines ?? 0) > 1 ? "s" : ""} dans ${pluriel(files?.length ?? 0, "fichier")}, ${pluriel(kept?.filter(({ before }) => !before).length ?? 0, "candidat")} laissé${(kept?.filter(({ before }) => !before).length ?? 0) > 1 ? "s" : ""} faute d'être sûr — ${pr}, remise à la pass, qui la juge et la merge comme toute livraison : la passe ne merge rien`;
    case "nothing":
      return `finie sans rien retirer : ${pluriel(kept?.length ?? 0, "candidat")} laissé${(kept?.length ?? 0) > 1 ? "s" : ""}, aucune PR`;
    case "tokens":
      return `arrêtée : plafond de tokens de la passe atteint (${mesure(nombre)}) — ${rienDeLivre}`;
    case "removals":
      return `arrêtée : plafond de retraits de la passe atteint (${mesure((lignes) => pluriel(lignes, "ligne"))}) — ${rienDeLivre}`;
    case "idle":
      return `arrêtée : inactive (rien produit depuis ${mesure(duree)}) — ${rienDeLivre}`;
    case "duration":
      return `arrêtée : plafond de durée atteint (${mesure(duree)}) — ${rienDeLivre}`;
    case "turns":
      return `arrêtée : plafond de tours atteint (${mesure(nombre)}) — ${rienDeLivre}`;
    case "stop":
      return `arrêtée par le « stop » du chef — ${rienDeLivre}`;
    case "breaker":
      return `arrêtée : le disjoncteur est ouvert — ${rienDeLivre}`;
    case "zone":
      return `arrêtée à la livraison : ${detail ?? "elle a écrit hors de ce qu'elle tenait"} — ${rienDeLivre}`;
    case "failed":
      return `échouée${detail ? ` : ${detail}` : ""} — ${rienDeLivre}`;
    case "interrupted":
      return `interrompue : le runtime s'est arrêté pendant qu'elle rangeait — ${rienDeLivre}`;
  }
}
