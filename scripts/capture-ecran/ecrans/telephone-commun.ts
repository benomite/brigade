// Ce que les écrans du téléphone partagent (#1161) : le démarrage de la vue tel que le pont de l'app
// Android le rend (app/android/web/pont.js) — les constantes de l'app, aucun projet, ni code, ni
// stations, ni accueil lus —, et l'état de son appairage. En largeur de téléphone.
import { configuration, demarrage, type Ecran, MAINTENANT } from "./commun.ts";

export const LARGEUR = 412;
export const HAUTEUR = 915;

// Le guichet de la station du chef, et le code qu'elle montre : ce que porte son QR.
export const ADRESSE = "http://192.168.1.20:7010";
export const QR = `brigade://pair?code=7KQ2-M9XD&url=${encodeURIComponent(ADRESSE)}`;

// `telephone` : l'appairage que le pont lit au lancement — aucun, sur une installation neuve.
export function demarrageDuTelephone(telephone: { appaire: false } | { appaire: true; station: string; adresse: string } = { appaire: false }) {
  const tout = demarrage(configuration([], []));
  return {
    ...tout,
    configuration: { ...tout.configuration, chemin: "no projects file on this phone" },
    code: undefined,
    stations: undefined,
    projetsDesStations: undefined,
    telephone,
  };
}

// Le QR de la station scanné, d'un clic sur « scan the QR » : il remplit l'adresse et le code, et part
// aussitôt au guichet, qui répond `reponse` — ou ne répond pas encore (`{ __enAttente: true }`).
export function apresLeQr(dit: string, reponse: unknown): Ecran {
  return {
    dit,
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    etapes: [{ cliquer: "#appairage .gestes-appairage .action:nth-child(2) > button" }],
    donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrageDuTelephone(), scannerLeQr: { lu: QR }, appairerLeTelephone: reponse }, envois: {} }),
  };
}
