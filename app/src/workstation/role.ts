// Ce qu'est l'app sur la machine où elle tourne : une station, ou un poste.
//
// Sur un ordinateur — Mac, Windows, Linux de bureau —, l'app installée est une
// station : elle lance la station de la machine, la même que celle d'un serveur
// (runtime/src/station/main.ts, que le paquet Debian lance aussi), et un projet
// peut y cuire. Sur un téléphone, elle est un poste : elle pilote, elle ne cuit
// pas — la station n'y est pas démarrée, et rien n'y lance de cook.
//
// C'est le seul endroit où la plateforme compte : tout ce qui suit — lancer la
// station, l'appairer, lui ajouter des projets, y cuire — est le même code,
// quelle que soit la machine (workstation/station.ts).
import { existsSync } from "node:fs";
import { join } from "node:path";

export type Role = { role: "station"; principal: string } | { role: "poste"; pourquoi: string };

// Les plateformes d'un téléphone, telles que Node les nomme.
export const TELEPHONES: readonly string[] = ["android", "ios"];

// Le point d'entrée de la station, dans le dossier du runtime.
export const PRINCIPAL = join("src", "station", "main.ts");

export type OptionsRole = {
  plateforme: string;
  // Le dossier du runtime, à côté de celui de l'app dans son clone.
  runtime: string;
  env: Record<string, string | undefined>;
  existe?: (chemin: string) => boolean;
};

export function roleDe(options: OptionsRole): Role {
  const existe = options.existe ?? existsSync;
  if (TELEPHONES.includes(options.plateforme)) return { role: "poste", pourquoi: "a phone pilots, it does not cook" };
  // Pour essayer l'app sans que la machine devienne une station — ni gist sur GitHub, ni cook.
  if (options.env.BRIGADE_APP_STATION === "0") return { role: "poste", pourquoi: "BRIGADE_APP_STATION=0" };
  const principal = join(options.runtime, PRINCIPAL);
  if (!existe(principal)) return { role: "poste", pourquoi: `no station runtime beside the app (${principal})` };
  return { role: "station", principal };
}

// Les projets que l'app fait cuire ici : ceux qu'on lui donne sur une station, aucun sur un
// poste — un téléphone ne propose jamais de cuire.
export const kitchensHere = <T>(role: Role, projets: readonly T[]): T[] => (role.role === "station" ? [...projets] : []);
