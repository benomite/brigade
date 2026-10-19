// Les réglages de la fermeture qui écrit, lus dans l'environnement du runtime.
// Le calibrage du closer n'a pas de défaut, pas plus que celui d'un cook : sans
// lui le projet n'a pas de passe qui écrit, et rien d'autre ne change. Ses
// seuils et ses plafonds, eux, ont un défaut prudent que le chef ajuste.
import { EFFORTS, MODELES } from "../calibrage.ts";
import type { ReglagesDeFermeture } from "../events/closing.ts";
import { lire } from "../plafonds.ts";
import { ConfigInvalide } from "../runtime.ts";

// La passe part quand moins de cooks que cela sont en vol : par défaut, aucun.
export const COOKS_PAR_DEFAUT = 1;
export const TOKENS_PAR_DEFAUT = 500_000;
// Les lignes qu'une passe peut retirer.
export const RETRAITS_PAR_DEFAUT = 500;

const ou = (valeurs: readonly string[]) => `${valeurs.slice(0, -1).join(", ")} or ${valeurs.at(-1)}`;

export function configFermeture(env: Record<string, string | undefined>): ReglagesDeFermeture {
  const calibre = (variable: string, admis: readonly string[]): string | null => {
    const valeur = env[variable];
    if (!valeur) return null;
    if (!admis.includes(valeur)) throw new ConfigInvalide(`${variable} invalid: “${valeur}” — expected ${ou(admis)}`);
    return valeur;
  };
  const model = calibre("BRIGADE_CLOSING_MODEL", MODELES);
  const effort = calibre("BRIGADE_CLOSING_EFFORT", EFFORTS);
  // L'un sans l'autre est une faute de frappe, pas un closer à moitié réglé.
  if ((model === null) !== (effort === null)) {
    throw new ConfigInvalide(`${model === null ? "BRIGADE_CLOSING_MODEL" : "BRIGADE_CLOSING_EFFORT"} is not set — the closer is set by both, or by neither: without them, no closing pass writes`);
  }
  const entier = (variable: string, defaut: number) => lire(env, variable, defaut, "an integer greater than zero", (valeur) => Number.isSafeInteger(valeur) && valeur > 0);
  return {
    calibration: model === null || effort === null ? null : { model, effort },
    cooksBelow: entier("BRIGADE_CLOSING_COOKS", COOKS_PAR_DEFAUT),
    tokens: entier("BRIGADE_CLOSING_MAX_TOKENS", TOKENS_PAR_DEFAUT),
    removedLines: entier("BRIGADE_CLOSING_MAX_REMOVED_LINES", RETRAITS_PAR_DEFAUT),
  };
}
