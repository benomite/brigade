// « Pair a phone » (#1598), « revoke » cliqué sur un téléphone appairé : la confirmation, et son prix en une ligne.
import { ecranDesTelephones } from "./telephones-de-station-figes.ts";

export const ecran = ecranDesTelephones("« Pair a phone with box » (#1598), « revoke » cliqué sur galaxy : la confirmation et son prix", [{ cliquer: "#telephones-de-station li.telephone-appaire:first-child .action button" }]);
