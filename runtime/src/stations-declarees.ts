// Les stations d'un projet : il les déclare, le runtime n'en tient aucune pour
// acquise. Une station est un endroit où un moteur tourne — `<machine>/<moteur>`
// —, ce qu'elle fournit, et combien de cooks elle fait tourner à la fois. Un
// projet en déclare plusieurs, de la même machine ou non, ou aucune : sans
// station, aucun cook ne part.
//
// Ce qu'une station fournit est une capacité : ce que la machine peut faire.
// Ce n'est pas une permission — ce qui est permis reste l'affaire des grants
// —, et ce module n'en reconnaît aucune : il lit des noms.
import { ConfigInvalide } from "./runtime.ts";

// Où le projet les déclare : avec le reste de ce que le runtime lit de lui,
// dans son environnement (le drop-in de son unité).
export const VARIABLE_DES_STATIONS = "BRIGADE_STATIONS";

export type StationDeclaree = {
  // `<machine>/<moteur>` : le nom par lequel tout la désigne — le rail, le
  // journal, `status`.
  nom: string;
  moteur: string;
  // Ses capacités, dans l'ordre où le projet les écrit.
  fournit: string[];
  // Son plafond de cooks simultanés, tant que le chef n'en règle pas un autre
  // à chaud (`run station -- cooks <N>`).
  cooks: number;
};

// Un nom de station : une machine et un moteur, chacun en minuscules, chiffres
// et tirets. C'est aussi ce qui distingue, au journal, le cook d'une station
// d'un lancement du reviewer ou du manager.
export const NOM_DE_STATION = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*\/[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u;
const CAPACITE = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
const PLAFOND = /^[1-9][0-9]*$/;

const FORME = "<machine>/<moteur>:<plafond de cooks>:<capacité>+<capacité>";
export const EXEMPLE = "box/claude:30:code+raisonnement,box/playwright:2:navigateur-headless";

// Lit `BRIGADE_STATIONS` : une station par entrée, séparées par des virgules,
// chacune `<machine>/<moteur>:<plafond>:<capacité>+<capacité>`. Absente ou
// vide : le projet ne déclare aucune station, et c'est accepté. Mal écrite,
// c'est un refus de démarrer qui nomme la station et le champ en cause — un
// plafond ne se devine pas, et une station ne disparaît pas sur une faute de
// frappe.
export function lireStations(env: Record<string, string | undefined>): StationDeclaree[] {
  const brut = env[VARIABLE_DES_STATIONS]?.trim() ?? "";
  if (brut === "") return [];
  const stations: StationDeclaree[] = [];
  brut.split(",").forEach((ecrite, rang) => {
    const entree = ecrite.trim();
    const refuser = (pourquoi: string): never => {
      throw new ConfigInvalide(`${VARIABLE_DES_STATIONS} invalide : station n° ${rang + 1} (« ${entree} ») — ${pourquoi}. Attendu \`${FORME}\`, une station par entrée, séparées par des virgules (${EXEMPLE})`);
    };
    if (entree === "") refuser("elle est vide : une virgule de trop");
    const champs = entree.split(":").map((champ) => champ.trim());
    const [nom = "", plafond, capacites] = champs;
    if (!NOM_DE_STATION.test(nom)) {
      refuser(`nom : « ${nom} » n'est pas de la forme \`<machine>/<moteur>\`, en minuscules, chiffres et tirets (box/claude)`);
    }
    if (stations.some((station) => station.nom === nom)) refuser(`nom : \`${nom}\` est déjà déclarée — deux stations ne portent pas le même nom`);
    if (plafond === undefined) refuser("plafond : il manque — combien de cooks cette station fait tourner à la fois");
    const cooks = Number(plafond);
    if (!PLAFOND.test(plafond ?? "") || !Number.isSafeInteger(cooks)) refuser(`plafond : « ${plafond} » n'est pas un entier supérieur à zéro`);
    if (capacites === undefined || capacites === "") refuser("fournit : il manque — au moins une capacité, ce que cette station fournit");
    if (champs.length > 3) refuser(`« ${champs.slice(3).join(":")} » est en trop : une station a trois champs`);
    const fournit = (capacites ?? "").split("+").map((capacite) => capacite.trim());
    for (const [place, capacite] of fournit.entries()) {
      if (!CAPACITE.test(capacite)) refuser(`fournit : « ${capacite} » n'est pas un nom de capacité — des lettres, des chiffres et des tirets (code, navigateur-headless)`);
      if (fournit.indexOf(capacite) !== place) refuser(`fournit : \`${capacite}\` est écrite deux fois`);
    }
    stations.push({ nom, moteur: nom.slice(nom.indexOf("/") + 1), fournit, cooks });
  });
  return stations;
}

// Le geste qui donne une station à un projet qui n'en déclare aucune : dit
// d'un seul endroit, à tous ceux qui le citent.
export const GESTE_DE_STATION = `déclarer une station dans \`${VARIABLE_DES_STATIONS}\` (\`${VARIABLE_DES_STATIONS}=${EXEMPLE.split(",")[0]}\`), puis redémarrer le runtime`;

// Ce que le runtime dit de ses stations au démarrage.
export function direStations(stations: StationDeclaree[]): string {
  if (stations.length === 0) {
    return `aucune (${VARIABLE_DES_STATIONS} n'est pas défini) : aucun cook ne partira, les tickets restent en attente sur le rail — ${GESTE_DE_STATION}`;
  }
  return stations.map((station) => `${station.nom} (${station.cooks} cook${station.cooks > 1 ? "s" : ""} au plus ; fournit : ${station.fournit.join(", ")})`).join(" ; ");
}
