// Une carte que plus aucun cook ne prendra (ticket 3147) : « Will not start: <la raison en mots simples>. ». La station
// met un ticket de côté (`served-elsewhere`) pour des raisons qu'elle écrit dans son commentaire, en anglais de station ;
// ce module les range une à une et dit chacune en une phrase. Une raison que la liste ne connaît pas tombe sur la phrase
// générique, jamais sur le message brut seul : le message brut, lui, reste derrière « details », en entier.
//
// Les raisons que la station sait produire, d'après son code :
//   - runtime/src/brigade-github.ts : « the cook stopped without a delivery » puis « Taken off the kitchen … after N cooks
//     without a delivery » (`cooks`) ; « still not mergeable after N sends back » (`renvois`) ;
//   - runtime/src/github-seul/renvois/renvois.ts, `raisonDeSortie` : les quatre raisons pour lesquelles un ticket aux renvois
//     épuisés ne peut plus être remis au manager (`deja-remis`, `ticket-de-fix`, `calibrage-incomplet`, `calibrage-au-plus-haut`) ;
//   - runtime/src/guerison/relance.ts : relancé trop de fois pour la même cause (`boucle`) ;
//   - runtime/src/rail.ts : gelé par la pass sans avoir été jugé (`gele-par-la-pass`) ;
//   - runtime/src/mise-de-cote.ts, `RAISONS` et `direMiseDeCote` : les raisons d'un ticket 86 sur une station, en français
//     (quota, connexion, modèle qui refuse, setup, worktree, ticket ou fiche illisibles, secrets, calibrage absent, pass qui
//     ne juge pas, tiers, station absente ou sans la capacité) ; un motif que `RAISONS` ne connaît pas y est dit « mis de côté (…) » ;
//   - un label posé à la main, sans commentaire qui dise pourquoi (`sans-raison`, tableau/mise-de-cote-github.ts).
// Chaque raison porte un exemple tel que la station l'écrit : le test joue chacun, et compte les raisons de `raisonDeSortie`
// dans le code du runtime — une raison de plus sans phrase ici fait échouer le test.
import { SANS_RAISON } from "./tableau/mise-de-cote-github.ts";

export const DEBUT_DU_REFUS = "Will not start:";
// Quand aucune raison connue ne se reconnaît dans le message de la station.
export const REFUS_GENERIQUE = "the station set it aside and no cook will take it again until someone decides what to do with it";

type Raison = { id: string; motif: RegExp; exemple: string; clair: (trouve: RegExpExecArray) => string };

// Du plus précis au plus général : la première qui se reconnaît dit la raison.
export const RAISONS_DE_REFUS: readonly Raison[] = [
  { id: "deja-remis", motif: /already handed to the manager once/, exemple: "Taken off the kitchen (`served-elsewhere`): it was already handed to the manager once (fix ticket #12), and it is still not mergeable. A human decides.", clair: () => "its delivery was already handed to the manager once and is still not mergeable" },
  { id: "ticket-de-fix", motif: /itself a fix ticket of the kitchen/, exemple: "Taken off the kitchen (`served-elsewhere`): it is itself a fix ticket of the kitchen: another fix ticket would not end. A human decides.", clair: () => "it is itself a fix ticket of the kitchen, and another one would not end" },
  { id: "calibrage-incomplet", motif: /calibration is incomplete/, exemple: "Taken off the kitchen (`served-elsewhere`): its calibration is incomplete (`model:` / `effort:`): nothing to raise. A human decides.", clair: () => "its calibration is incomplete, so the station cannot raise it" },
  { id: "calibrage-au-plus-haut", motif: /already the highest the kitchen sets/, exemple: "Taken off the kitchen (`served-elsewhere`): its calibration (opus / high) is already the highest the kitchen sets. A human decides.", clair: () => "its calibration is already the highest the kitchen sets, so it cannot be raised" },
  { id: "boucle", motif: /relaunched (?:it )?\d+ times for this reason|set aside again after \d+ relaunches/, exemple: "was set aside (`served-elsewhere`) because the cook stopped without a delivery. The kitchen relaunched it 3 times for this reason", clair: () => "the kitchen relaunched it several times for the same reason and each cook brought it back to the same point" },
  { id: "cooks", motif: /after (\d+) cooks without a delivery/, exemple: "off the kitchen after 3 cooks without a delivery — the cook added nothing", clair: (trouve) => `${trouve[1]} cooks in a row stopped without delivering anything` },
  { id: "renvois", motif: /(?:off the kitchen|still not mergeable) after (\d+) sends? back/, exemple: "off the kitchen after 2 sends back — the review has blocking points", clair: (trouve) => `its delivery was sent back to a cook ${trouve[1]} times and is still not mergeable` },
  { id: "gele-par-la-pass", motif: /set aside \(86\) by the pass/, exemple: "set aside (86) by the pass, not judged", clair: () => "the pass set it aside without judging it" },
  { id: "quota", motif: /quota du compte/, exemple: "attend : quota du compte épuisé", clair: () => "the account quota is used up" },
  { id: "connexion", motif: /connexion Max expirée/, exemple: "attend : connexion Max expirée", clair: () => "the Max connection has expired" },
  { id: "modele-refuse", motif: /le modèle l'a refusé/, exemple: "attend : le modèle l'a refusé trois fois — un cook le reprend un jour plus tard", clair: () => "the model refused it three times, and a cook takes it again a day later" },
  { id: "setup", motif: /setup du projet impossible/, exemple: "attend : setup du projet impossible", clair: () => "the project's setup fails, so no cook can prepare its workspace" },
  { id: "worktree", motif: /worktree impossible/, exemple: "attend : worktree impossible à préparer", clair: () => "the station cannot prepare a workspace for the cook" },
  { id: "ticket-illisible", motif: /ticket illisible sur GitHub/, exemple: "attend : ticket illisible sur GitHub", clair: () => "the station cannot read the ticket on GitHub" },
  { id: "secrets", motif: /secrets du projet indisponibles/, exemple: "attend : secrets du projet indisponibles", clair: () => "the secrets the project needs cannot be given to the cook" },
  { id: "fiche-illisible", motif: /fiche du ticket illisible/, exemple: "attend : fiche du ticket illisible — il repart seul dès qu'elle se lit", clair: () => "the ticket's sheet cannot be read" },
  { id: "sans-calibrage", motif: /calibrage \(modèle, effort\) absent/, exemple: "attend : calibrage (modèle, effort) absent de l'issue — il repart seul dès qu'il y est", clair: () => "the issue has no calibration (model and effort), so no cook knows how to take it" },
  { id: "pass-non-jugee", motif: /la pass n'a pas pu le juger/, exemple: "attend : la pass n'a pas pu le juger", clair: () => "the pass could not judge its delivery" },
  { id: "pass-rouge", motif: /la pass le trouve encore rouge/, exemple: "attend : la pass le trouve encore rouge", clair: () => "the pass still finds its delivery red" },
  { id: "tiers", motif: /un tiers \(WAITING\)/, exemple: "attend : un tiers (WAITING)", clair: () => "it waits for a third party" },
  { id: "sans-station", motif: /aucune station ne fournit/, exemple: "attend : un humain — aucune station ne fournit macos ; brancher une station qui le fournit, le ticket repart alors tout seul", clair: () => "no station provides what its card requires" },
  { id: "station-absente", motif: /station absente/, exemple: "attend : station absente (box/claude) — il repart seul dès qu'elle se manifeste", clair: () => "the station that should take it is absent" },
  { id: "sans-motif", motif: /mis de côté, sans motif/, exemple: "attend : mis de côté, sans motif", clair: () => "it was set aside and the station gave no reason" },
  { id: "sans-raison", motif: new RegExp(`^${SANS_RAISON.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), exemple: SANS_RAISON, clair: () => "it was set aside by hand, and no comment on the issue says why" },
];

// La raison que le message de la station dit, ou null quand aucune ne se reconnaît.
export function raisonDeRefus(brut: string): Raison | null {
  for (const raison of RAISONS_DE_REFUS) if (raison.motif.test(brut)) return raison;
  return null;
}

// La phrase de la carte : toujours une phrase en mots simples, jamais le message brut seul.
export function refusEnClair(brut: string | null | undefined): string {
  const texte = (brut ?? "").replace(/\s+/g, " ").trim();
  const raison = texte === "" ? null : raisonDeRefus(texte);
  const trouve = raison === null ? null : raison.motif.exec(texte);
  const clair = raison === null || trouve === null ? REFUS_GENERIQUE : raison.clair(trouve);
  return `${DEBUT_DU_REFUS} ${clair}.`;
}
