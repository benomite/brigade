// Les GitHub Apps de la station de ce Mac, dans les réglages de « parade » (Settings, sous cette machine — #2317) :
// l'App du cook rangée, celles de la pass et du manager pas encore. Les étapes vont jusqu'au bloc, et y saisissent ce
// que l'écran montre.
import type { Donnees, Etape } from "./commun.ts";
import { donnees, OUVRIR } from "./reglages-commun.ts";

// Ce que `appsDeLaStation` rend (app/src/vue/identites-github.js, `LectureDesApps`) : jamais la clé.
export const APPS = {
  apps: [
    { role: "cook", id: "1203456", cle: true },
    { role: "pass", id: null, cle: false },
    { role: "manager", id: null, cle: false },
  ],
};

// Une clé privée à la forme PEM, coupée ici pour qu'aucun lecteur de secrets ne la prenne pour une vraie.
export const CLE = ["-----BEGIN RSA ", "PRIVATE KEY-----\nMIIEowIBAAKCAQEAfauxfauxfauxfauxfauxfaux\n-----END RSA ", "PRIVATE KEY-----\n"].join("");

const champ = (role: string, classe: string) => `#apps-github .reglage[data-role="${role}"] .${classe}`;
export const SAISIR = (role: string, id: string, cle: string): Etape[] => [...OUVRIR, { saisir: champ(role, "app-id"), texte: id }, { saisir: champ(role, "cle"), texte: cle }, { cliquer: `${champ(role, "gestes-du-role")} .action:last-child > button` }];

export function donneesDesApps(reponses: Record<string, unknown> = {}): Donnees {
  const lues = donnees("mac");
  return { ...lues, reponses: { ...lues.reponses, appsDeLaStation: APPS, ...reponses } };
}
