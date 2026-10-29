// « Pair a phone » (#1598), la box qui ne répond pas : une ligne à la place du code, ce qu'il faut vérifier au survol.
import type { ExecFileException } from "node:child_process";
import { refusDe } from "../../../app/src/telephones-de-station.ts";
import { ecranDesTelephones } from "./telephones-de-station-figes.ts";

// La commande tuée au délai : la station n'a pas répondu.
const injoignable = refusDe("box", Object.assign(new Error("timeout"), { killed: true }) as ExecFileException);
export const ecran = ecranDesTelephones("« Pair a phone with box » (#1598), la box injoignable : une ligne à la place du code et de la liste, et « try again »", [], { refus: injoignable });
