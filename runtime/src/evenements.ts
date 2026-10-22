// Le contrat du système : tout ce qui peut s'écrire dans le journal.
//
// Un domaine (rail, garde-fous, pass…) ajoute son fichier sous evenements/ et
// une ligne à l'union `Fait` ci-dessous — rien d'autre ici.
import type { FaitApprentissage } from "./apprentissage/evenements.ts";
import type { FaitCloison } from "./events/partition.ts";
import type { FaitCarnet } from "./promotion/evenements.ts";
import type { FaitCorrectif } from "./correctif/evenements.ts";
import type { FaitDecision } from "./events/decisions.ts";
import type { FaitDemenagement } from "./events/move.ts";
import type { FaitDerive } from "./events/drift.ts";
import type { FaitDistante } from "./events/remote.ts";
import type { FaitFermeture } from "./events/closing.ts";
import type { FaitGardeFous } from "./events/guardrails.ts";
import type { FaitBudgetDesGates, FaitGates } from "./events/gates.ts";
import type { FaitBlocage } from "./installation/blocages/evenements.ts";
import type { FaitDelai } from "./installation/delai/evenements.ts";
import type { FaitBesoin } from "./installation/besoins/evenements.ts";
import type { FaitReparation } from "./installation/reparations/evenements.ts";
import type { FaitInstallateur } from "./events/installer.ts";
import type { FaitInstallation } from "./events/installation.ts";
import type { FaitJeton } from "./events/token.ts";
import type { FaitManager } from "./events/manager.ts";
import type { FaitMiseAJour } from "./events/update.ts";
import type { FaitNettoyage } from "./events/cleanup.ts";
import type { FaitPass, FaitPassRevolu } from "./events/pass.ts";
import type { FaitPause } from "./pause/evenements.ts";
import type { FaitProfil } from "./profils/evenements.ts";
import type { FaitRail } from "./events/rail.ts";
import type { FaitRenouvellement } from "./events/renewal.ts";
import type { FaitRuntime } from "./events/runtime.ts";
import type { FaitSauvegarde } from "./events/backup.ts";
import type { FaitService } from "./events/service.ts";
import type { FaitStation } from "./events/station.ts";
import type { FaitInterrupteur } from "./events/switch.ts";
import type { FaitTodo } from "./events/todo.ts";
import type { FaitUrgence } from "./events/emergency.ts";

export type Fait = FaitRuntime | FaitRail | FaitGardeFous | FaitStation | FaitPass | FaitPassRevolu | FaitSauvegarde | FaitManager | FaitNettoyage | FaitDerive | FaitCloison | FaitInstallateur | FaitInstallation | FaitService | FaitDistante | FaitFermeture | FaitMiseAJour | FaitDecision | FaitRenouvellement | FaitJeton | FaitUrgence | FaitCorrectif | FaitCarnet | FaitProfil | FaitApprentissage | FaitDemenagement | FaitTodo | FaitPause | FaitGates | FaitBudgetDesGates | FaitBlocage | FaitBesoin | FaitDelai | FaitInterrupteur | FaitReparation;

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
