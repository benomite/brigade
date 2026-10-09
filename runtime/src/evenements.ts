// Le contrat du système : tout ce qui peut s'écrire dans le journal.
//
// Un domaine (rail, garde-fous, pass…) ajoute son fichier sous evenements/ et
// une ligne à l'union `Fait` ci-dessous — rien d'autre ici.
import type { FaitGardeFous } from "./evenements/garde-fous.ts";
import type { FaitManager } from "./evenements/manager.ts";
import type { FaitNettoyage } from "./evenements/nettoyage.ts";
import type { FaitPass } from "./evenements/pass.ts";
import type { FaitRail } from "./evenements/rail.ts";
import type { FaitRuntime } from "./evenements/runtime.ts";
import type { FaitSauvegarde } from "./evenements/sauvegarde.ts";
import type { FaitStation } from "./evenements/station.ts";

export type Fait = FaitRuntime | FaitRail | FaitGardeFous | FaitStation | FaitPass | FaitSauvegarde | FaitManager | FaitNettoyage;

export type Enveloppe = {
  // Numéro de séquence : l'ordre de vérité du journal.
  seq: number;
  // Horodatage ISO 8601 UTC, posé à l'écriture.
  at: string;
  project: string;
  // Numéro du ticket, ou null pour un fait qui ne concerne aucun ticket.
  ticket: number | null;
  // Qui a écrit : `runtime`, `chef`, `station:<nom>`…
  author: string;
};

export type Evenement<F extends Fait = Fait> = F extends Fait ? Enveloppe & F : never;

// Ce qu'un producteur fournit : le journal pose lui-même `seq` et `at`.
export type Ajout<F extends Fait = Fait> = F extends Fait
  ? Omit<Enveloppe, "seq" | "at"> & F & { dedupKey?: string }
  : never;
