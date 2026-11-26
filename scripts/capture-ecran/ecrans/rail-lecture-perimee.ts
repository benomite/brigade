// Le rail de « parade » dont la dernière lecture de GitHub a raté (#3008) : il se dessine de la lecture d'il y a quatre minutes,
// et une ligne dit son âge — jamais un renvoi vers un panneau.
import { tenirFaits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, type Envoi, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const IL_Y_A_QUATRE_MINUTES = new Date(Date.parse(MAINTENANT) - 4 * 60_000).toISOString();
const LIMITE = "GitHub refused to read the rail of chef/parade (HTTP 403): API rate limit exceeded for user ID 1.";

export const ecran: Ecran = {
  dit: "Le rail de « parade » dessiné d'une lecture périmée de quatre minutes, la lecture suivante ayant raté (#3008)",
  largeur: 2200,
  hauteur: 520,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => {
    const envois = cuisine(RENDUS);
    // Toute lecture réussie date d'il y a quatre minutes ; la dernière, celle de GitHub, a raté — après toutes, y compris la relecture à l'ouverture du projet.
    const ancienne = (liste: Envoi[]) => liste.map((envoi) => (envoi.sur === "surFaits" ? { ...envoi, args: [{ ...(envoi.args[0] as object), a: IL_Y_A_QUATRE_MINUTES }] } : envoi));
    const ratee: Envoi = { sur: "surFaits", args: [tenirFaits().recevoir({ projet: "parade", demande: 0, a: MAINTENANT, erreur: LIMITE, atteinte: true, cas: null, duTableau: true })], demande: "faits" };
    const regarder = Object.fromEntries(Object.entries(envois.regarder).map(([projet, liste]) => [projet, projet === "parade" ? [...ancienne(liste), ratee] : ancienne(liste)]));
    return { maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)) }, envois: { ...envois, faits: [...ancienne(envois.faits), ratee], regarder } };
  },
};
