// La page de nas (#1780), « chat » tapé dans le champ qui cherche parmi les autres dépôts du compte : les deux qui le
// contiennent, un bouton chacun, et rien d'autre.
import { DEPOTS, NAS } from "./station-projets-du-chef.ts";
import { stationsDuChef } from "./stations-une-liste.ts";

export const ecran = stationsDuChef("La page de nas (#1780), « chat » tapé : les dépôts du compte qui le contiennent, un bouton « add » chacun", [NAS, { saisir: `#station .projets-de-la-station input[type="search"]`, texte: "chat" }], DEPOTS);
