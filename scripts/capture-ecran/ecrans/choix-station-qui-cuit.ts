// « Who cooks it » (#3166), quand une station du compte est hors ligne (#3187) : la box, serveur enregistré sous le
// compte, n'a pas donné signe de vie depuis 22 min — le process principal le dit (`offlineSince`) ; cet ordinateur,
// « MacBook-Air-de-Chef », a sa station.
import type { Ecran } from "./commun.ts";
import { MAINTENANT } from "./commun.ts";
import { parcoursPremierProjet } from "./parcours-premier-projet-commun.ts";

const IL_Y_A_22_MIN = new Date(Date.parse(MAINTENANT) - 22 * 60_000).toISOString();
const BOX = { id: "a1b2c3", name: "box", platform: "linux", machine: "Debian 12", version: "1.4.0", account: "chef", available: false, registeredAt: "2026-10-01T09:00:00.000Z", lastSeen: IL_Y_A_22_MIN, stoppedAt: null, refreshMs: 120_000, selection: [], offlineSince: IL_Y_A_22_MIN };

const base = parcoursPremierProjet("« Who cooks it » quand la box du compte est hors ligne depuis 22 min (#3187)", false);

export const ecran: Ecran = {
  ...base,
  donnees: () => {
    const tout = base.donnees();
    tout.reponses.stationsDuCompte = { state: "listed", stations: [BOX], unreadable: [] };
    tout.reponses.demarrage = { ...(tout.reponses.demarrage as object), poste: { nom: "MacBook-Air-de-Chef", mac: true } };
    return tout;
  },
};
