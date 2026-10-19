// Le contrat du système : tout ce qui peut s'écrire dans le journal.
//
// Un domaine (rail, garde-fous, pass…) ajoute son fichier sous evenements/ et
// une ligne à l'union `Fait` ci-dessous — rien d'autre ici.
import type { FaitCloison } from "./events/partition.ts";
import type { FaitCorrectif } from "./correctif/evenements.ts";
import type { FaitDecision } from "./events/decisions.ts";
import type { FaitDerive } from "./events/drift.ts";
import type { FaitDistante } from "./events/remote.ts";
import type { FaitFermeture } from "./events/closing.ts";
import type { FaitGardeFous } from "./events/guardrails.ts";
import type { FaitInstallateur } from "./events/installer.ts";
import type { FaitInstallation } from "./events/installation.ts";
import type { FaitJeton } from "./events/token.ts";
import type { FaitManager } from "./events/manager.ts";
import type { FaitMiseAJour } from "./events/update.ts";
import type { FaitNettoyage } from "./events/cleanup.ts";
import type { FaitPass, FaitPassRevolu } from "./events/pass.ts";
import type { FaitProfil } from "./profils/evenements.ts";
import type { FaitRail } from "./events/rail.ts";
import type { FaitRenouvellement } from "./events/renewal.ts";
import type { FaitRuntime } from "./events/runtime.ts";
import type { FaitSauvegarde } from "./events/backup.ts";
import type { FaitService } from "./events/service.ts";
import type { FaitStation } from "./events/station.ts";
import type { FaitUrgence } from "./events/emergency.ts";

export type Fait = FaitRuntime | FaitRail | FaitGardeFous | FaitStation | FaitPass | FaitPassRevolu | FaitSauvegarde | FaitManager | FaitNettoyage | FaitDerive | FaitCloison | FaitInstallateur | FaitInstallation | FaitService | FaitDistante | FaitFermeture | FaitMiseAJour | FaitDecision | FaitRenouvellement | FaitJeton | FaitUrgence | FaitCorrectif | FaitProfil;

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
