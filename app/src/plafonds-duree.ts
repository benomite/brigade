// Les plafonds de durée d'un projet, réglés depuis Kitchen > Health (#2490, épique #2484) : les seuils de dérive que le
// chef déclare (`drift.*` de `.claude/brigade/projet.json`, runtime/src/reglages-projet/reglages.ts) — au-delà, la
// cuisine le signale. Ils vivent dans le dépôt du projet, sur sa branche d'intégration, et le runtime les y relit à
// chaque rapatriement (runtime/src/reglages-projet/en-vigueur.ts) : changer un plafond, c'est écrire ce fichier sur
// GitHub, par l'API REST et le jeton du `gh` de ce poste — comme la priorité d'un ticket (priorite.ts). Ni box, ni PR :
// écrit, il vaut au rapatriement suivant de la station.
//
// Le temps maximum d'un ticket (#2336, `tempsMaxTicketMin`) est aussi un plafond de durée, mais il ne s'écrit pas
// d'ici : le runtime refuse encore cette clé dans `projet.json` (son crible ne la connaît pas) et ne la relit que dans
// l'arbre de son clone. La page le montre, tel que la station le publie, sans champ.
//
// L'app ne juge que ce que le runtime refuserait de lire (`SEUILS_DU_PROJET`) : un nombre au-dessus de zéro, entier
// quand le seuil l'est. Ce module compose les demandes ; ce qui les porte est donné (`ClientDeLaPriorite`).
import type { ClientDeLaPriorite } from "./priorite.ts";
import { refusDe } from "./tableau/client.ts";

export const FICHIER = ".claude/brigade/projet.json";

// Les seuils de dérive, tels que le runtime les lit, dans l'ordre où la page les montre : les durées d'abord.
// `unite` : ce que la valeur compte ; `entier` : le runtime n'y lit qu'un entier ; `defaut` : la valeur que le runtime
// prend quand rien n'est déclaré, ni dans le dépôt ni sur la station (runtime/src/derive.ts, renvois.ts).
export const PLAFONDS = [
  { cle: "testsSeconds", nom: "Test suite duration", unite: "s", entier: false, duree: true },
  { cle: "gatesSeconds", nom: "Gates duration", unite: "s", entier: false, duree: true, defaut: 100 },
  { cle: "tests", nom: "Number of tests", unite: "tests", entier: true, duree: false },
  { cle: "contextKb", nom: "Context size", unite: "KB", entier: false, duree: false },
  { cle: "repoMb", nom: "Repository size", unite: "MB", entier: false, duree: false },
  { cle: "merges", nom: "Merges since the last closing", unite: "merges", entier: true, duree: false },
  { cle: "growthPercent", nom: "Growth over the last 10 merges", unite: "%", entier: false, duree: false },
  { cle: "ticketTokens", nom: "Costliest ticket", unite: "tokens", entier: true, duree: false },
  { cle: "lostTokens", nom: "Tokens lost", unite: "tokens", entier: true, duree: false },
  { cle: "firstTryPercent", nom: "Delivered first try, below", unite: "%", entier: false, duree: false, defaut: 50 },
  { cle: "firstTryWindow", nom: "First-try window", unite: "tickets", entier: true, duree: false, defaut: 10 },
] as const satisfies readonly { cle: string; nom: string; unite: string; entier: boolean; duree: boolean; defaut?: number }[];
export type ClePlafond = (typeof PLAFONDS)[number]["cle"];

// Ce que la page reçoit : chaque plafond — son nom, son unité, son défaut — et sa valeur dans le dépôt — null quand le
// dépôt ne la déclare pas —, ou pourquoi le fichier ne se lit pas, en une ligne, le détail au survol.
export type PlafondLu = { cle: ClePlafond; nom: string; unite: string; entier: boolean; duree: boolean; defaut: number | null; valeur: number | null };
export type LectureDesPlafonds = { plafonds: PlafondLu[]; branche: string | null } | { sans: string; detail?: string };
// Ce que le changement a rendu : la valeur écrite (null : retirée), ou pourquoi rien n'a changé.
export type RenduDuPlafond = { fait: string; cle: ClePlafond; valeur: number | null } | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const plafondDe = (cle: unknown) => PLAFONDS.find((plafond) => plafond.cle === cle);

// La valeur qu'un champ propose, ou pourquoi elle n'en est pas une : vide, le plafond se retire du dépôt.
export function valeurProposee(cle: ClePlafond, saisie: unknown): { valeur: number | null } | { refus: string } {
  const plafond = plafondDe(cle);
  if (plafond === undefined) return { refus: `${String(cle)} is not a duration cap` };
  const texte = typeof saisie === "number" ? String(saisie) : typeof saisie === "string" ? saisie.trim() : "";
  if (texte === "") return { valeur: null };
  const nombre = /^[0-9]+(\.[0-9]+)?$/.test(texte) ? Number(texte) : Number.NaN;
  const bon = Number.isFinite(nombre) && nombre > 0 && (!plafond.entier || Number.isSafeInteger(nombre));
  return bon ? { valeur: nombre } : { refus: `${plafond.nom.toLowerCase()} must be ${plafond.entier ? "a whole number" : "a number"} greater than zero` };
}

// Le fichier tel que GitHub le rend : son contenu lu, et son `sha` — null quand la branche ne l'a pas.
type FichierLu = { contenu: Record<string, unknown>; sha: string } | { contenu: null; sha: null };

async function lireLeFichier(client: ClientDeLaPriorite, depot: string, branche: string | null): Promise<FichierLu> {
  const chemin = `/repos/${depot}/contents/${FICHIER}${branche === null ? "" : `?ref=${encodeURIComponent(branche)}`}`;
  const lu = await client.lire(chemin);
  if (lu.status === 404) return { contenu: null, sha: null };
  if (lu.status !== 200) throw refusDe(`the reading of ${FICHIER}`, lu);
  const { content, sha } = estObjet(lu.data) ? lu.data : {};
  if (typeof content !== "string" || typeof sha !== "string") throw new Error(`GitHub gave ${FICHIER} without its content`);
  let contenu: unknown;
  try {
    contenu = JSON.parse(Buffer.from(content, "base64").toString("utf8"));
  } catch {
    throw new Error(`${FICHIER} is not valid JSON`);
  }
  if (!estObjet(contenu)) throw new Error(`${FICHIER} is not a JSON object`);
  return { contenu, sha };
}

const valeursDe = (contenu: Record<string, unknown> | null): PlafondLu[] => {
  const drift = contenu !== null && estObjet(contenu.drift) ? contenu.drift : {};
  return PLAFONDS.map((plafond) => {
    const valeur = drift[plafond.cle];
    const defaut = "defaut" in plafond ? plafond.defaut : null;
    return { cle: plafond.cle, nom: plafond.nom, unite: plafond.unite, entier: plafond.entier, duree: plafond.duree, defaut, valeur: typeof valeur === "number" && Number.isFinite(valeur) && valeur > 0 ? valeur : null };
  });
};

// Les plafonds que le dépôt déclare, sur sa branche d'intégration (`branche` ; null : celle par défaut de GitHub).
export async function lireLesPlafonds({ depot, branche, client }: { depot: string; branche: string | null; client: ClientDeLaPriorite }): Promise<LectureDesPlafonds> {
  try {
    const { contenu } = await lireLeFichier(client, depot, branche);
    return { plafonds: valeursDe(contenu), branche };
  } catch (erreur) {
    return { sans: "duration caps unavailable", detail: message(erreur) };
  }
}

// Change un plafond dans le dépôt : le fichier est relu — son dernier état, et le `sha` que GitHub exige —, la seule
// clé `drift.<cle>` changée, le reste gardé tel quel, puis écrit sur la branche d'intégration. Sans fichier, il est créé
// avec ce que le runtime exige d'un fichier (sa version, la branche) — seulement quand la branche est connue.
export async function changerLePlafond({ depot, branche, cle, saisie, client }: { depot: string; branche: string | null; cle: unknown; saisie: unknown; client: ClientDeLaPriorite }): Promise<RenduDuPlafond> {
  const plafond = plafondDe(cle);
  if (plafond === undefined) return { refus: `nothing was changed: ${String(cle)} is not a duration cap` };
  const propose = valeurProposee(plafond.cle, saisie);
  if ("refus" in propose) return { refus: `nothing was changed: ${propose.refus}` };
  let lu: FichierLu;
  try {
    lu = await lireLeFichier(client, depot, branche);
  } catch (erreur) {
    return { refus: `nothing was changed: ${FICHIER} was not read on GitHub`, detail: message(erreur) };
  }
  if (lu.contenu === null && branche === null) return { refus: `nothing was changed: ${depot} has no ${FICHIER} and its integration branch is not known`, detail: "" };
  const contenu: Record<string, unknown> = lu.contenu ?? { version: 1, integrationBranch: branche };
  const avant = estObjet(contenu.drift) ? contenu.drift : {};
  if ((typeof avant[plafond.cle] === "number" ? avant[plafond.cle] : null) === propose.valeur) return { fait: "unchanged: the repository already says so", cle: plafond.cle, valeur: propose.valeur };
  const drift: Record<string, unknown> = { ...avant };
  if (propose.valeur === null) delete drift[plafond.cle];
  else drift[plafond.cle] = propose.valeur;
  if (Object.keys(drift).length === 0) delete contenu.drift;
  else contenu.drift = drift;
  const dit = propose.valeur === null ? `remove drift.${plafond.cle}` : `set drift.${plafond.cle} to ${propose.valeur}`;
  try {
    const ecrit = await client.ecrire("PUT", `/repos/${depot}/contents/${FICHIER}`, {
      message: `brigade: ${dit} (from the app, Kitchen > Health)`,
      content: Buffer.from(`${JSON.stringify(contenu, null, 2)}\n`, "utf8").toString("base64"),
      ...(lu.sha === null ? {} : { sha: lu.sha }),
      ...(branche === null ? {} : { branch: branche }),
    });
    if (ecrit.status !== 200 && ecrit.status !== 201) throw refusDe(`the change of ${FICHIER}`, ecrit);
  } catch (erreur) {
    return { refus: `nothing was changed: GitHub did not write ${FICHIER}`, detail: message(erreur) };
  }
  return { fait: "saved in the repository — the station applies it at its next fetch", cle: plafond.cle, valeur: propose.valeur };
}
