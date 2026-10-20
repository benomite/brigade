// Les faits d'une station : ce qu'elle annonce d'elle-même, ce qui l'empêche de
// servir, et ce qu'elle rapporte de chaque cook.
import type { Captures } from "../captures.ts";

// Comment un cook a fini, du point de vue de celle qui l'a lancé. `86` : le
// quota est épuisé — un état normal, pas un échec. `disconnected` : la
// connexion Max de la machine a expiré. `refused` : le modèle a refusé de
// répondre (`stop_reason: refusal`) — ni une panne, ni un échec du cook.
export type FinDeCook = "done" | "failed" | "86" | "disconnected" | "refused";

// Ce dont la machine peut manquer : du processeur, de la mémoire, du disque.
export type Ressource = "cpu" | "memory" | "disk";

// Une ressource qui manque. `observed`, `limit` : la charge et son plafond
// (cpu), ou ce qui reste et le minimum exigé, en Mo (memory, disk).
// `limitFrom`, de la mémoire seulement : d'où vient son minimum — dérivé de la
// mémoire totale de la machine, en Mo, ou réglé par `BRIGADE_MIN_FREE_MEMORY_MB`
// (`env`). Absent d'un fait écrit avant qu'il existe.
export type Manque = { resource: Ressource; observed: number; limit: number; limitFrom?: OrigineDuSeuil };
export type OrigineDuSeuil = { totalMb: number } | "env";

// Ce qui retient une station de prendre un ticket qui pourrait partir : le
// « stop » du chef, le disjoncteur, la base d'intégration rouge, la connexion,
// le quota, le plafond de cooks, celui des setups, le setup du projet bloqué
// sur un échec qui se répète, la machine saturée, ou la montée progressive — les cooks tout juste partis, comptés d'avance. Et, quand
// la machine a un arbitre entre projets : son refus, ou son absence — sans
// lui, la station ne fait tourner qu'un cook à la fois.
export type Retenue = "stopped" | "breaker" | "deploy" | "base" | "disconnected" | "quota" | "cap" | "setups" | "setup" | "aside" | "machine" | "ramp" | "arbiter" | "unarbitrated";

// Un cook est signalé quand cette part du bail de son ticket est passée sans
// progrès : assez tôt pour que le chef le voie avant que le bail ne tombe.
export const PART_SANS_PROGRES = 0.5;

// Les motifs qu'une station écrit sur la fin d'un cook.
// Un cook qui conclut sans rien commiter : ce qu'il a délimité dans son
// dernier message est son livrable.
export const SANS_DIFF = "no-diff";
// Un cook qui conclut sans rien commiter ni rien délimiter : son message n'est
// pas un livrable, il n'a rien livré.
export const SANS_LIVRABLE = "no-deliverable";
// Ce que le cook a commité porte le nom ou la forme des identifiants de
// Claude. Le motif dit le signe (`name`, `shape`), jamais le chemin ni le
// contenu.
export const IDENTIFIANTS_LIVRES = "credentials-committed";

export type FaitStation =
  // Écrit au démarrage, pour chaque station que le projet déclare, quand son
  // annonce change : c'est ici que le chef lit ce que la station fournit et
  // combien de cooks elle fait tourner à la fois tant qu'il n'a rien réglé.
  // `remote` : elle ne tourne pas sur cette machine, elle tire son travail.
  // `ordinary` : distante, elle prend aussi les tickets ordinaires, dans le bac
  // à sable de son poste. `cores` : les cœurs de la machine qui la porte —
  // seulement d'une station d'ici, la box ne voit pas le poste d'une distante ;
  // c'est d'eux que dérive son plafond par défaut (`plafondDesCoeurs`).
  | { type: "station.announced"; payload: { station: string; engine: string; provides: string[]; maxCooks: number; cores?: number; remote?: true; ordinary?: true } }
  // Une station distante s'est manifestée — elle s'annonce, réclame, renouvelle
  // ou rend — alors qu'elle était absente : elle sert de nouveau. Écrit quand
  // ça change, pas à chaque manifestation.
  | { type: "station.present"; payload: { station: string } }
  // Ce qu'une station distante qui prend les tickets ordinaires dit du bac à
  // sable de son poste — ou n'en dit pas : il est alors indisponible. Sans lui,
  // elle ne prend aucun ticket ordinaire, et `reason` dit pourquoi. `version` :
  // celle de son `claude`, quand il est là. Écrit quand ça change.
  | { type: "station.sandbox"; payload: { station: string; available: boolean; reason: string | null; version: string | null } }
  // Une station distante ne s'est pas manifestée depuis `presenceMs` : elle est
  // absente. Ce n'est pas une panne — son poste est éteint, ou ailleurs : les
  // tickets qu'elle seule peut cuisiner sont 86 tant que ça dure, les autres
  // partent. `lastSeen` : sa dernière manifestation.
  | { type: "station.absent"; payload: { station: string; lastSeen: string; presenceMs: number } }
  // Le projet ne déclare plus cette station : elle sort de ce que `status` et
  // `station` montrent, avec ce qui la retenait. Les cooks qu'elle a lancés
  // restent au relevé. Écrit au démarrage, par le runtime.
  | { type: "station.withdrawn"; payload: { station: string } }
  // Le projet ne déclare aucune station : aucun cook ne part, et les tickets
  // restent en attente sur le rail. Écrit au démarrage, une fois — la première
  // annonce d'une station l'efface.
  | { type: "stations.undeclared"; payload: Record<string, never> }
  // Le compte-rendu d'un cook : sa fin, pourquoi, ce qu'il dit avoir fait, et
  // où est son travail. `reconciled` : écrit au démarrage, pour une livraison
  // que la vie précédente du runtime a envoyée en pass sans la raconter.
  // `captures` : pour la livraison poussée d'un ticket d'interface, ses
  // captures avant et après (captures.ts) — absent pour tout autre ticket.
  // `kept` : le cook n'a rien livré, et sa branche porte sur l'origine ce
  // nombre de commits en plus de la base — le travail conservé, d'où le cook
  // suivant repart (`travail-conserve.ts`). Absent : rien n'est conservé.
  // `retro` : ce que le cook a délimité entre `<retro>` et `</retro>` — sa
  // rétro, lue quand le ticket est servi (`apprentissage/provisoires.ts`). Nul
  // ou absent : il n'en a rien écrit.
  // `retroTokens` : ce que sa rétro a coûté, déjà compris dans les tokens du
  // cook — estimée à la part de caractères qu'elle tient dans son dernier
  // message, sur les tokens que ce message a produits. Absent : pas de rétro,
  // ou un flux qui ne dit pas les tokens du message.
  | {
      type: "cook.reported";
      payload: { run: string; ending: FinDeCook; reason: string | null; summary: string | null; deliverable?: string | null; retro?: string | null; retroTokens?: number; branch: string; pr: string | null; reconciled?: true; captures?: Captures; kept?: number };
    }
  // La livraison d'un cook, confrontée à la zone que son ticket portait quand
  // il a été pris. `files` : ce qu'elle écrit hors de cette zone, et les
  // tickets du rail qui possèdent chaque fichier. `cardChanged` : la zone de
  // la fiche a changé pendant la cuisson. Un signal, pas un verdict : la pass
  // juge comme avant. Jamais écrit pour un ticket pris sans zone.
  | { type: "cook.out-of-zone"; payload: { run: string; zone: string[]; files: { path: string; owners: number[] }[]; cardChanged: boolean } }
  // Le chef règle le plafond de cooks simultanés, pendant que la station
  // tourne ou non. `maxCooks: 0` : pas de limite. Il l'emporte sur l'annonce.
  // `maxCooks: null` : le chef retire son réglage, le plafond par défaut revient.
  | { type: "station.capped"; payload: { station: string; maxCooks: number | null } }
  // La machine n'en peut plus : la station ne prend plus de ticket tant que ça
  // dure. La première ressource en cause, et `also` les autres, s'il y en a
  // (`Manque`). Écrit quand les ressources en cause changent, pas à chaque
  // regard.
  | { type: "station.saturated"; payload: { station: string; also?: Manque[] } & Manque }
  // La machine respire à nouveau : la station reprend.
  | { type: "station.relieved"; payload: { station: string } }
  // Un ticket pourrait partir et la station ne le prend pas : pourquoi. Écrit
  // quand la raison change, pas à chaque regard ; jamais quand aucun ticket
  // n'attend derrière.
  | { type: "station.held"; payload: { station: string; reason: Retenue } }
  // Plus rien ne retient la station, ou plus aucun ticket n'attend.
  | { type: "station.released"; payload: { station: string } }
  // L'arbitre entre projets ne répond plus : la station entre en mode dégradé
  // — au plus un cook à la fois, chacun marqué `unarbitrated` à son lancement.
  // Écrit une fois, à l'entrée. `reason` : ce que l'échange a donné.
  | { type: "station.unarbitrated"; payload: { station: string; reason: string } }
  // L'arbitre répond à nouveau — ou le projet n'en a plus : fin du mode dégradé.
  | { type: "station.arbitrated"; payload: { station: string } }
  // Un cook ne progresse plus : la moitié du bail de son ticket est passée
  // sans que son worktree bouge. Un signal, une fois par épisode — rien n'est
  // arrêté avant l'échéance du bail. `idleMs` : depuis quand ; `leaseMs` : le bail.
  | { type: "cook.stalled"; payload: { run: string; station: string; idleMs: number; leaseMs: number } }
  // Les secrets que le dépôt du ticket déclare ne peuvent pas lui être donnés :
  // aucun cook n'est lancé. `problems` : pourquoi — des noms de variables et
  // de fichiers, jamais une valeur. Écrit quand les problèmes changent, pas à
  // chaque essai.
  | { type: "secrets.unavailable"; payload: { station: string; problems: string[] } }
  // Le setup du worktree du ticket a échoué : aucun cook n'est lancé. `why` :
  // son code de sortie, ou son plafond dépassé. `hosts` : ce que la porte a
  // refusé pendant qu'il tournait. Écrit à chaque échec — le même échec ne se
  // répète qu'une fois avant que le projet ne soit bloqué (`setup.blocked`).
  // L'issue n'est recommentée que si le motif change ou qu'un hôte encore
  // jamais nommé pour ce ticket apparaît.
  | { type: "setup.failed"; payload: { station: string; why: string; hosts: string[] } }
  // Le setup vient d'échouer comme le précédent du projet — même motif, et
  // aucun hôte refusé de plus : plus aucun setup n'est lancé pour aucun ticket
  // du projet tant que la branche d'intégration reste sur `base`, le commit
  // dont le worktree était parti. `hosts` : ce que la porte a refusé aux deux.
  | { type: "setup.blocked"; payload: { station: string; why: string; hosts: string[]; base: string } }
  // La branche d'intégration a bougé depuis le blocage — un hôte déclaré, un
  // setup corrigé, mergés — : les setups reprennent. `base` : là où elle est.
  | { type: "setup.unblocked"; payload: { station: string; base: string } }
  // Un ticket vient d'être mis de côté (86) pour une cause qui se répète d'un
  // ticket à l'autre — `reason`, son motif au rail. Écrit à chaque fois ; la
  // même cause deux fois de suite, sans cook parti entre les deux, bloque le
  // projet (`aside.blocked`). Le setup a ses propres faits, ci-dessus.
  | { type: "aside.failed"; payload: { station: string; reason: string } }
  // La même cause deux fois de suite : plus aucun ticket n'est pris, pour
  // aucun ticket du projet, tant que la branche d'intégration reste sur `base`
  // et qu'aucun ticket n'est mis de côté pour une autre cause.
  | { type: "aside.blocked"; payload: { station: string; reason: string; base: string } }
  // La cause a changé, ou la branche d'intégration a bougé : les prises
  // reprennent. `base` : là où elle est. `why` : `base` ou `cause`.
  | { type: "aside.unblocked"; payload: { station: string; base: string; why: "base" | "cause" } }
  // Le quota du compte est épuisé : la station ne prend plus rien avant `until`.
  | { type: "station.86"; payload: { station: string; reason: string; until: string; window: string | null } }
  // La connexion Max a expiré : la station ne prend plus rien avant le
  // « reprendre » du chef. `run` : le cook qui l'a révélé, s'il y en a un.
  | { type: "station.disconnected"; payload: { station: string; reason: string; run: string | null } };
