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
// Une station distante tourne sans cloison, sur le poste du chef : elle ne
// prend que les tickets qui demandent une de ses capacités. Déclarée aussi
// `ordinaires`, elle prend en plus les tickets qui ne demandent rien — et leurs
// cooks y tournent dans le bac à sable de Claude Code (`sandbox/`), quand
// son poste l'a ; sans lui, elle n'en prend aucun.
//
// Ce qu'une station fournit est une capacité : ce que la machine peut faire.
// Ce n'est pas une permission — ce qui est permis reste l'affaire des grants
// —, et ce module n'en reconnaît aucune : il lit des noms.
import { capacite as nomDeCapacite, CAPACITE, FORME_DE_CAPACITE_EN } from "./capacites.ts";
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
  // Vrai : distante, elle prend aussi les tickets ordinaires — ceux qui ne
  // demandent rien —, dans le bac à sable de son poste. Son plafond de cooks
  // est la limite qui vaut pour elle, tickets ordinaires compris.
  ordinaires?: true;
};

// Un nom de station : une machine et un moteur, chacun en minuscules, chiffres
// et tirets. C'est aussi ce qui distingue, au journal, le cook d'une station
// d'un lancement du reviewer ou du manager.
export const NOM_DE_STATION = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*\/[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u;
const PLAFOND = /^[1-9][0-9]*$/;

// Le quatrième champ, facultatif, d'une station qui tire son travail — suivi,
// au besoin, de ce qu'elle prend en plus de ce qui exige ses capacités.
export const DISTANTE = "distante";
export const ORDINAIRES = "ordinaires";

export const FORME = `<machine>/<engine>:<cooks cap>:<capability>+<capability>[:${DISTANTE}[+${ORDINAIRES}]]`;
export const EXEMPLE = "box/claude:30:code+raisonnement,box/playwright:2:navigateur-headless";

// Lit `BRIGADE_STATIONS` : une station par entrée, séparées par des virgules,
// chacune `<machine>/<moteur>:<plafond>:<capacité>+<capacité>`, suivie de
// `:distante` quand elle ne tourne pas sur cette machine, et de
// `:distante+ordinaires` quand elle prend aussi les tickets ordinaires. Absente ou
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
      throw new ConfigInvalide(`${VARIABLE_DES_STATIONS} invalid: station no. ${rang + 1} (“${entree}”) — ${pourquoi}. Expected \`${FORME}\`, one station per entry, separated by commas (${EXEMPLE})`);
    };
    if (entree === "") refuser("it is empty: one comma too many");
    const champs = entree.split(":").map((champ) => champ.trim());
    const [nom = "", plafond, capacites, lieu] = champs;
    if (!NOM_DE_STATION.test(nom)) {
      refuser(`name: “${nom}” is not of the form \`<machine>/<engine>\`, in lower case, digits and hyphens (box/claude)`);
    }
    if (stations.some((station) => station.nom === nom)) refuser(`name: \`${nom}\` is already declared — two stations do not share a name`);
    if (plafond === undefined) refuser("cap: it is missing — how many cooks this station runs at once");
    const cooks = Number(plafond);
    if (!PLAFOND.test(plafond ?? "") || !Number.isSafeInteger(cooks)) refuser(`cap: “${plafond}” is not an integer greater than zero`);
    if (capacites === undefined || capacites === "") refuser("provides: it is missing — at least one capability, what this station provides");
    const marques = lieu === undefined ? [] : lieu.split("+").map((marque) => marque.trim());
    const lisible = marques.length === 0 || (marques[0] === DISTANTE && (marques.length === 1 || (marques.length === 2 && marques[1] === ORDINAIRES)));
    if (champs.length > 4 || !lisible) {
      if (champs.length <= 4 && marques.includes(ORDINAIRES) && !marques.includes(DISTANTE)) {
        refuser(`\`${ORDINAIRES}\` only goes with a \`${DISTANTE}\` station (\`${DISTANTE}+${ORDINAIRES}\`): a station of the box already takes the ordinary tickets`);
      }
      refuser(`“${champs.slice(lisible ? 4 : 3).join(":")}” is one too many: a station has three fields — an optional fourth says only \`${DISTANTE}\`: it does not run on this machine, it comes to pull its work; or \`${DISTANTE}+${ORDINAIRES}\`: it also takes the ordinary tickets, inside the sandbox of its workstation`);
    }
    // Le nom tel que la fiche d'un ticket le demandera.
    const fournit = (capacites ?? "").split("+").map((capacite) => nomDeCapacite(capacite.trim()));
    for (const [place, capacite] of fournit.entries()) {
      if (!CAPACITE.test(capacite)) refuser(`provides: “${capacite}” is not a capability name — ${FORME_DE_CAPACITE_EN}`);
      if (fournit.indexOf(capacite) !== place) refuser(`provides: \`${capacite}\` is written twice`);
    }
    stations.push({
      nom,
      moteur: nom.slice(nom.indexOf("/") + 1),
      fournit,
      cooks,
      ...(marques.includes(DISTANTE) ? { distante: true as const } : {}),
      ...(marques.includes(ORDINAIRES) ? { ordinaires: true as const } : {}),
    });
  });
  return stations;
}

// Une station telle que `BRIGADE_STATIONS` l'écrit : ce que `lireStations`
// relit à l'identique.
export function ecrireStation(station: StationDeclaree): string {
  const marques = [...(station.distante ? [DISTANTE] : []), ...(station.ordinaires ? [ORDINAIRES] : [])];
  return [station.nom, station.cooks, station.fournit.join("+"), ...(marques.length > 0 ? [marques.join("+")] : [])].join(":");
}

// Le geste qui donne une station à un projet qui n'en déclare aucune : dit
// d'un seul endroit, à tous ceux qui le citent.
export const GESTE_DE_STATION = `déclarer une station par \`brigade <projet> station stations ${EXEMPLE.split(",")[0]}\` — lue sans redémarrage`;
// Le même, quand le runtime a déjà un journal : le chef pose les stations par
// une décision (`decisions.ts`), lue au réveil suivant, sans redémarrage.
// Sans « : » : la ligne `stations` de `status` est « panne : geste », et l'app
// la coupe au dernier « : » (app/src/alertes.ts, `coupee`).
export const GESTE_DE_STATION_A_CHAUD = `les poser par \`${geste(`station stations ${EXEMPLE.split(",")[0]}`)}\`, lues au réveil suivant, sans redémarrage`;

// Le même geste, en anglais : la ligne `stations` de `status`. Sans « : » non plus.
export const GESTE_DE_STATION_A_CHAUD_EN = `set them with \`${geste(`station stations ${EXEMPLE.split(",")[0]}`)}\`, read at the next wake-up, no restart`;

// Ce que le runtime dit de ses stations au démarrage.
export function direStations(stations: StationDeclaree[]): string {
  if (stations.length === 0) {
    return `none (${VARIABLE_DES_STATIONS} is set neither in the environment nor in the log): no cook will leave, the tickets stay queued on the rail — ${GESTE_DE_STATION_A_CHAUD_EN}`;
  }
  return stations
    .map((station) => `${station.nom} (${station.cooks} cook${station.cooks > 1 ? "s" : ""} at most; provides: ${station.fournit.join(", ")}${station.distante ? "; remote: it pulls its work, the box never reaches it" : ""}${station.ordinaires ? "; also takes ordinary tickets, in the sandbox of its workstation" : ""})`)
    .join(" ; ");
}
