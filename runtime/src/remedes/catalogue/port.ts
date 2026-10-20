// `proxy-port-set` : la ligne du projet règle le port que la station garde
// pour sa porte. Le remède retire ce réglage de la ligne.
import type { Remede } from "../registre.ts";
import { reecrireLaConfiguration, sansLeReglage } from "./ligne.ts";

export const remedeDuPort: Remede = {
  id: "remove-port-setting",
  leve: ["proxy-port-set"],
  description: "Removes the network port setting from this project's line in the station's configuration.",
  destructif: true,
  executer(contexte) {
    reecrireLaConfiguration(contexte, (texte) => sansLeReglage(texte, contexte.projet, "BRIGADE_PROXY_PORT"), "this project's line in the station's configuration has no port setting to remove");
  },
};
