// Ce qu'une passe qui écrit dit au chef : pourquoi elle n'est pas partie,
// comment elle a fini. Les mêmes mots sur la sortie de sa commande, dans
// journald et dans le bloc `journal` de l'observation. Et la mise en page de
// `run closing` : un titre, puis des colonnes sous lui.
import { SANS_ISSUE_MS, type FaitFermeture, type ReglagesDeFermeture } from "../evenements/fermeture.ts";
import { geste } from "../geste.ts";
import { faitAttendre, type Demande, type Refus } from "./condition.ts";

// Les gestes du chef sur la passe qui écrit, tels que les messages les citent.
export const DEMANDER = geste("closing write");
export const ANNULER = geste("closing cancel");

export const nombre = (valeur: number) => valeur.toLocaleString("en-US");
export const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const arrondi = (valeur: number) => valeur.toLocaleString("en-US", { maximumFractionDigits: 1 });
const duree = (ms: number) => (ms >= 60_000 ? `${arrondi(ms / 60_000)} min` : `${arrondi(ms / 1000)} s`);

const TITRE = 11;
export const ligne = (titre: string, valeur: string) => `${titre.padEnd(TITRE)}${valeur}`.trimEnd();
// Des colonnes alignées sur leur cellule la plus large, sous le titre.
export const colonnes = (lignes: string[][]) => lignes.map((cellules) => ligne("", cellules.map((cellule, rang) => cellule.padEnd(Math.max(...lignes.map((autres) => (autres[rang] ?? "").length)))).join("  ")));

// Le refus, tel que le chef le lit.
export function direRefus({ reason, observed, limit, detail }: Refus): string {
  switch (reason) {
    case "unconfigured":
      return `le closer n'est pas réglé sur ce projet — \`${geste("station closer-modele <modèle>")}\` et \`${geste("station closer-effort <effort>")}\` le règlent, sans redémarrage`;
    case "busy":
      return "une passe de fermeture range déjà, ou est déjà demandée — une seule à la fois";
    case "stopped":
      return `la cuisine est arrêtée par le chef depuis le ${detail} — « resume » d'abord`;
    case "breaker":
      return `le disjoncteur est ouvert depuis le ${detail} — « resume » d'abord`;
    case "deploying":
      return "une mise en service est demandée : aucun cook ne part, la passe non plus, tant qu'elle n'est pas lancée ou retirée — et le redémarrage qu'elle provoque retire la demande";
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

// Une demande qui attend, telle que le chef la lit — dans la file, sur la
// sortie de sa commande, dans l'observation : depuis quand, et ce qui la
// retient à la lecture. `retenue` nulle : plus rien, elle part au prochain
// réveil du runtime.
export function direDemande({ depuis, sansIssue }: Demande, retenue: Refus | null): string {
  const demandee = `passe de fermeture demandée le ${depuis}`;
  if (retenue === null) return `${demandee} : sa condition d'exécution est remplie, le runtime la fait partir à son prochain réveil, dans la seconde`;
  if (!faitAttendre(retenue)) return `${demandee} : ${direRefus(retenue)} — le runtime la refuse à son prochain réveil, rien ne part`;
  const renoncer = `y renoncer : \`${ANNULER}\``;
  if (sansIssue === null) return `${demandee}, elle attend — ${direRefus(retenue)} ; elle part seule, une fois, dès que rien ne la retient, sans que personne la relance — pour ${renoncer}`;
  return `PASSE DE FERMETURE SANS ISSUE : demandée le ${depuis}, elle attend depuis plus de ${SANS_ISSUE_MS / 3_600_000} h — ${direRefus(retenue)} ; le rail ne se vide pas seul — à trancher : relever le seuil (\`${geste("station closer-cooks <N>")}\`), éteindre le manager le temps que le rail se vide (\`${geste(`manager off`)}\`), ou ${renoncer}`;
}

// Le refus et la demande, en anglais : ce que dit le bloc `awaiting` de
// `status`, et ce que dit `closing`. Les versions françaises ci-dessus ne
// servent plus qu'au journald du runtime et au `status` français.
const pluralEn = pluriel;

export function direRefusEn({ reason, observed, limit, detail }: Refus): string {
  switch (reason) {
    case "unconfigured":
      return `the closer is not set on this project — \`${geste("station closer-modele <model>")}\` and \`${geste("station closer-effort <effort>")}\` set it, without a restart`;
    case "busy":
      return "a closing pass is already tidying up, or is already requested — only one at a time";
    case "stopped":
      return `the kitchen has been stopped by the chef since ${detail} — “resume” first`;
    case "breaker":
      return `the breaker has been open since ${detail} — “resume” first`;
    case "deploying":
      return "a deployment is requested: no cook leaves, nor does the pass, until it is launched or withdrawn — and the restart it causes withdraws the request";
    case "cooks": {
      const rail = Number(detail);
      return `start condition not met: ${pluralEn(observed ?? 0, "cook")} in flight for a threshold of ${limit} — the pass leaves when there are fewer than the threshold, or when the rail is empty (it carries ${pluralEn(rail, "unserved ticket")})`;
    }
    case "zoneless":
      return `start condition not met: the cook in flight on ${detail} declares no zone — the pass cannot know what it holds, it waits for it to finish`;
    case "depot":
      return `the integration branch cannot be read — ${detail}`;
    case "nothing":
      return `nothing to tidy up — ${detail}`;
    case "restarted":
      return "the runtime restarted before taking it — to request again";
  }
}

export function direDemandeEn({ depuis, sansIssue }: Demande, retenue: Refus | null): string {
  const demandee = `closing pass requested on ${depuis}`;
  if (retenue === null) return `${demandee}: its start condition is met, the runtime starts it at its next wake-up, within the second`;
  if (!faitAttendre(retenue)) return `${demandee}: ${direRefusEn(retenue)} — the runtime refuses it at its next wake-up, nothing leaves`;
  const renoncer = `withdraw it: \`${ANNULER}\``;
  if (sansIssue === null) return `${demandee}, it waits — ${direRefusEn(retenue)}; it leaves on its own, once, as soon as nothing holds it back, without anyone restarting it — to ${renoncer}`;
  return `CLOSING PASS WITH NO WAY OUT: requested on ${depuis}, it has waited for more than ${SANS_ISSUE_MS / 3_600_000} h — ${direRefusEn(retenue)}; the rail does not empty on its own — to decide: raise the threshold (\`${geste("station closer-cooks <N>")}\`), turn the manager off while the rail empties (\`${geste(`manager off`)}\`), or ${renoncer}`;
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

// Les mêmes, en anglais : ce que dit `station`, et `closing write`.
export function direReglagesEn({ calibration, cooksBelow, tokens, removedLines }: ReglagesDeFermeture): string {
  return [
    calibration === null ? "closer not set" : `closer on \`${calibration.model}\` / \`${calibration.effort}\``,
    `starts under ${pluralEn(cooksBelow, "cook")} in flight`,
    `${tokens.toLocaleString("en-US")} tokens at most`,
    `${pluralEn(removedLines, "line")} removed at most`,
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

// La fin d'une passe, en anglais : ce que dit `closing`.
export function direFinEn({ outcome, observed, limit, pr, removedLines, files, kept, detail }: Extract<FaitFermeture, { type: "closing.ended" }>["payload"]): string {
  const mesure = (unite: (valeur: number) => string) => `${observed == null ? "?" : unite(observed)} for a cap of ${limit == null ? "?" : unite(limit)}`;
  const nothingDelivered = "nothing is delivered";
  switch (outcome) {
    case "delivered":
      return `delivered: ${pluralEn(removedLines ?? 0, "line")} removed in ${pluralEn(files?.length ?? 0, "file")}, ${pluralEn(kept?.filter(({ before }) => !before).length ?? 0, "candidate")} left for lack of certainty — ${pr}, handed to the pass, which judges and merges it like any delivery: the closing merges nothing`;
    case "nothing":
      return `finished without removing anything: ${pluralEn(kept?.length ?? 0, "candidate")} left, no PR`;
    case "tokens":
      return `stopped: the closing's token cap reached (${mesure(nombre)}) — ${nothingDelivered}`;
    case "removals":
      return `stopped: the closing's removal cap reached (${mesure((lignes) => pluralEn(lignes, "line"))}) — ${nothingDelivered}`;
    case "idle":
      return `stopped: idle (nothing produced for ${mesure(duree)}) — ${nothingDelivered}`;
    case "duration":
      return `stopped: duration cap reached (${mesure(duree)}) — ${nothingDelivered}`;
    case "turns":
      return `stopped: turn cap reached (${mesure(nombre)}) — ${nothingDelivered}`;
    case "stop":
      return `stopped by the chef's “stop” — ${nothingDelivered}`;
    case "breaker":
      return `stopped: the breaker is open — ${nothingDelivered}`;
    case "zone":
      return `stopped at delivery: ${detail ?? "it wrote outside what it held"} — ${nothingDelivered}`;
    case "failed":
      return `failed${detail ? `: ${detail}` : ""} — ${nothingDelivered}`;
    case "interrupted":
      return `interrupted: the runtime stopped while it was tidying up — ${nothingDelivered}`;
  }
}
