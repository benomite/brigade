// Ce que les écrans du téléphone partagent (#1161) : le démarrage de la vue tel que le pont de l'app
// Android le rend (app/android/web/pont.js) — les constantes de l'app, aucun projet, ni code, ni
// stations, ni accueil lus —, et ce que le pont garde du téléphone : sa connexion à GitHub (#2500), ou
// l'appairage à une station d'avant elle. En largeur de téléphone.
import { configuration, demarrage, type Ecran, MAINTENANT } from "./commun.ts";

export const LARGEUR = 412;
export const HAUTEUR = 915;

type Telephone = { github?: { compte: string | null } };

// `telephone` : ce que le pont lit au lancement — aucune connexion, sur une installation neuve.
export function demarrageDuTelephone(telephone: Telephone = {}) {
  const tout = demarrage(configuration([]));
  return {
    ...tout,
    configuration: { ...tout.configuration, chemin: "no projects file on this phone" },
    code: undefined,
    stations: undefined,
    projetsDesStations: undefined,
    telephone,
  };
}

// « sign in with GitHub » cliqué sur l'écran de connexion d'une installation neuve : le pont rend `debut` — le code à
// taper, ou pourquoi le login n'est pas parti —, ou ne répond pas encore (`{ __enAttente: true }`).
export function apresLaConnexion(dit: string, debut: unknown): Ecran {
  return {
    dit,
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    etapes: [{ cliquer: "#connexion-github .suite-de-connexion .gestes button.recommande" }],
    donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrageDuTelephone(), seConnecterAGitHub: debut }, envois: {} }),
  };
}
