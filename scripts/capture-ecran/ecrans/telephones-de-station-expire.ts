// « Pair a phone » (#1598), le code expiré : l'écran le dit, et « new code » en tire un neuf.
import { ecranDesTelephones } from "./telephones-de-station-figes.ts";

export const ecran = ecranDesTelephones("« Pair a phone with box » (#1598), le code expiré : une ligne le dit, et « new code »", [], { expire: true });
