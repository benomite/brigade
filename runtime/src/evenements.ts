// Le contrat du système : tout ce qui peut s'écrire dans le journal.
//
// Un domaine (rail, garde-fous, pass…) ajoute son fichier sous evenements/ et
// une ligne à l'union `Fait` ci-dessous — rien d'autre ici.
import type { FaitCloison } from "./evenements/cloison.ts";
import type { FaitDecision } from "./evenements/decisions.ts";
import type { FaitDerive } from "./evenements/derive.ts";
import type { FaitDistante } from "./evenements/distante.ts";
import type { FaitFermeture } from "./evenements/fermeture.ts";
import type { FaitGardeFous } from "./evenements/garde-fous.ts";
import type { FaitInstallateur } from "./evenements/installateur.ts";
import type { FaitInstallation } from "./evenements/installation.ts";
import type { FaitJeton } from "./evenements/jeton.ts";
import type { FaitManager } from "./evenements/manager.ts";
import type { FaitMiseAJour } from "./evenements/mise-a-jour.ts";
import type { FaitNettoyage } from "./evenements/nettoyage.ts";
import type { FaitPass, FaitPassRevolu } from "./evenements/pass.ts";
import type { FaitRail } from "./evenements/rail.ts";
import type { FaitRenouvellement } from "./evenements/renouvellement.ts";
import type { FaitRuntime } from "./evenements/runtime.ts";
import type { FaitSauvegarde } from "./evenements/sauvegarde.ts";
import type { FaitService } from "./evenements/service.ts";
import type { FaitStation } from "./evenements/station.ts";
import type { FaitUrgence } from "./evenements/urgence.ts";

export type Fait = FaitRuntime | FaitRail | FaitGardeFous | FaitStation | FaitPass | FaitPassRevolu | FaitSauvegarde | FaitManager | FaitNettoyage | FaitDerive | FaitCloison | FaitInstallateur | FaitInstallation | FaitService | FaitDistante | FaitFermeture | FaitMiseAJour | FaitDecision | FaitRenouvellement | FaitJeton | FaitUrgence;

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
