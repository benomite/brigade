// Les livraisons de « parade » avec leur moteur (#3747) : #7 cuisinée sur une clé d'API Claude, au prix de 3,27 $,
// #9 sur Codex ; les autres, sans `engine`, sont dites sur l'abonnement Claude.
import type { Faits } from "../../../app/src/faits.ts";
import type { Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";

const faits = RENDUS.parade!.facts as Faits;
export const AVEC_MOTEUR: Record<string, Rendu> = {
  ...RENDUS,
  parade: {
    ...RENDUS.parade!,
    facts: {
      ...faits,
      livres: (faits.livres ?? []).map((livre) =>
        livre.ticket === 7 ? { ...livre, engine: "claude-api-key", costUsd: 3.27 } : livre.ticket === 9 ? { ...livre, engine: "codex" } : livre,
      ),
    } as Faits,
  },
};
