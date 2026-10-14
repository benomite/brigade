// Les stations d'un projet : il les déclare, le runtime n'en tient aucune pour
// acquise. Une station est un endroit où un moteur tourne — `<machine>/<moteur>`
// —, ce qu'elle fournit, et combien de cooks elle fait tourner à la fois. Un
// projet en déclare plusieurs, de la même machine ou non, ou aucune : sans
// station, aucun cook ne part.
//
// Une station tourne sur la machine du runtime, sauf celle que le projet dit
// `distante` : celle-là vit ailleurs — le poste du chef —, et la box n'a aucun
// chemin vers elle. C'est elle qui vient tirer son travail (`tirer.ts`).
//
// Ce qu'une station fournit est une capacité : ce que la machine peut faire.
// Ce n'est pas une permission — ce qui est permis reste l'affaire des grants
// —, et ce module n'en reconnaît aucune : il lit des noms.
import { capacite as nomDeCapacite, CAPACITE, FORME_DE_CAPACITE } from "./capacites.ts";
import { geste } from "./geste.ts";
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
  // Vrai : elle ne tourne pas sur cette machine. Le runtime n'y lance rien et
  // ne la joint jamais : elle s'annonce, réclame, renouvelle et rend.
  distante?: true;
};

// Un nom de station : une machine et un moteur, chacun en minuscules, chiffres
// et tirets. C'est aussi ce qui distingue, au journal, le cook d'une station
// d'un lancement du reviewer ou du manager.
export const NOM_DE_STATION = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*\/[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u;
const PLAFOND = /^[1-9][0-9]*$/;

// Le quatrième champ, facultatif, d'une station qui tire son travail.
export const DISTANTE = "distante";

export const FORME = `<machine>/<moteur>:<plafond de cooks>:<capacité>+<capacité>[:${DISTANTE}]`;
export const EXEMPLE = "box/claude:30:code+raisonnement,box/playwright:2:navigateur-headless";

// Lit `BRIGADE_STATIONS` : une station par entrée, séparées par des virgules,
// chacune `<machine>/<moteur>:<plafond>:<capacité>+<capacité>`, suivie de
// `:distante` quand elle ne tourne pas sur cette machine. Absente ou
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
    const [nom = "", plafond, capacites, lieu] = champs;
    if (!NOM_DE_STATION.test(nom)) {
      refuser(`nom : « ${nom} » n'est pas de la forme \`<machine>/<moteur>\`, en minuscules, chiffres et tirets (box/claude)`);
    }
    if (stations.some((station) => station.nom === nom)) refuser(`nom : \`${nom}\` est déjà déclarée — deux stations ne portent pas le même nom`);
    if (plafond === undefined) refuser("plafond : il manque — combien de cooks cette station fait tourner à la fois");
    const cooks = Number(plafond);
    if (!PLAFOND.test(plafond ?? "") || !Number.isSafeInteger(cooks)) refuser(`plafond : « ${plafond} » n'est pas un entier supérieur à zéro`);
    if (capacites === undefined || capacites === "") refuser("fournit : il manque — au moins une capacité, ce que cette station fournit");
    if (champs.length > 4 || (lieu !== undefined && lieu !== DISTANTE)) {
      refuser(`« ${champs.slice(lieu === DISTANTE ? 4 : 3).join(":")} » est en trop : une station a trois champs — un quatrième, facultatif, ne dit que \`${DISTANTE}\` : elle ne tourne pas sur cette machine, elle vient tirer son travail`);
    }
    // Le nom tel que la fiche d'un ticket le demandera.
    const fournit = (capacites ?? "").split("+").map((capacite) => nomDeCapacite(capacite.trim()));
    for (const [place, capacite] of fournit.entries()) {
      if (!CAPACITE.test(capacite)) refuser(`fournit : « ${capacite} » n'est pas un nom de capacité — ${FORME_DE_CAPACITE}`);
      if (fournit.indexOf(capacite) !== place) refuser(`fournit : \`${capacite}\` est écrite deux fois`);
    }
    stations.push({ nom, moteur: nom.slice(nom.indexOf("/") + 1), fournit, cooks, ...(lieu === DISTANTE ? { distante: true as const } : {}) });
  });
  return stations;
}

// Le geste qui donne une station à un projet qui n'en déclare aucune : dit
// d'un seul endroit, à tous ceux qui le citent.
export const GESTE_DE_STATION = `déclarer une station par \`brigade <projet> station stations ${EXEMPLE.split(",")[0]}\` — lue sans redémarrage`;
// Le même, quand le runtime a déjà un journal : le chef pose les stations par
// une décision (`decisions.ts`), lue au réveil suivant, sans redémarrage.
// Sans « : » : la ligne `stations` de `status` est « panne : geste », et l'app
// la coupe au dernier « : » (app/src/alertes.ts, `coupee`).
export const GESTE_DE_STATION_A_CHAUD = `les poser par \`${geste(`station stations ${EXEMPLE.split(",")[0]}`)}\`, lues au réveil suivant, sans redémarrage`;

// Ce que le runtime dit de ses stations au démarrage.
export function direStations(stations: StationDeclaree[]): string {
  if (stations.length === 0) {
    return `aucune (${VARIABLE_DES_STATIONS} n'est posée ni au journal) : aucun cook ne partira, les tickets restent en attente sur le rail — ${GESTE_DE_STATION}`;
  }
  return stations
    .map((station) => `${station.nom} (${station.cooks} cook${station.cooks > 1 ? "s" : ""} au plus ; fournit : ${station.fournit.join(", ")}${station.distante ? " ; distante : elle tire son travail, la box ne la joint jamais" : ""})`)
    .join(" ; ");
}
