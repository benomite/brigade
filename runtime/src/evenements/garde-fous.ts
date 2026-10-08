// Les faits des garde-fous : la vie d'un cook vue par celui qui le surveille,
// et ce que le chef commande à la cuisine.

// Ce qu'un cook ne peut pas dépasser, quel que soit son ticket.
export type Plafonds = { turns: number; durationMs: number; tokens: number; idleMs: number };

// Pourquoi un garde-fou a arrêté un cook. `stop` : la commande du chef.
export type MotifArret = "turns" | "duration" | "tokens" | "idle" | "stop";

// Comment un cook s'est terminé, du point de vue du disjoncteur : `failed` et
// `guard` sont des échecs, `ok` remet le compteur à zéro, `stop` et `neutral`
// (le 86, que la station reconnaît) ne comptent ni pour ni contre.
export type Issue = "ok" | "failed" | "guard" | "stop" | "neutral";

export const RELEVE = "cook.progressed";

export type FaitGardeFous =
  // Les réglages en vigueur, écrits quand ils changent : c'est ici que le chef
  // lit les plafonds.
  | { type: "guard.configured"; payload: { limits: Plafonds; breakerThreshold: number } }
  // L'intention : écrite avant que le sous-processus existe. `stream` est le
  // chemin du flux brut, relatif au répertoire d'état.
  | { type: "cook.launched"; payload: { run: string; limits: Plafonds; stream: string } }
  // Le relevé d'un cook en cours, écrit à chaque tick : ce qu'il a consommé
  // jusqu'ici.
  | { type: "cook.progressed"; payload: { run: string; turns: number; tokens: number } }
  // Le motif d'un arrêt, écrit avant le signal : si le runtime meurt entre les
  // deux, le motif est déjà au journal.
  | { type: "guard.tripped"; payload: { run: string; reason: MotifArret; limit: number | null; observed: number | null } }
  // La fin du process, quelle qu'en soit la cause.
  | {
      type: "cook.exited";
      payload: {
        run: string;
        outcome: Issue;
        code: number | null;
        signal: string | null;
        turns: number;
        tokens: number;
        durationMs: number;
        error?: string;
      };
    }
  // Écrit au démarrage pour un lancement sans fin : le cook est mort avec le
  // runtime.
  | { type: "cook.interrupted"; payload: { run: string } }
  | { type: "breaker.opened"; payload: { failures: number; threshold: number } }
  // Les commandes du chef : « stop » et « reprendre ».
  | { type: "kitchen.stopped"; payload: Record<string, never> }
  | { type: "kitchen.resumed"; payload: Record<string, never> };
