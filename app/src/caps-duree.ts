// Les plafonds de durée d'un projet, réglés depuis Kitchen > Health (#2490, épique #2484) : les seuils de dérive que le
// chef déclare (`drift.*` de `.claude/brigade/projet.json`, runtime/src/reglages-projet/reglages.ts) — au-delà, la
// cuisine le signale. Ils vivent dans le dépôt du projet, sur sa branche d'intégration, et le runtime les y relit à
// chaque rapatriement (runtime/src/reglages-projet/en-vigueur.ts) : changer un plafond, c'est écrire ce fichier sur
// GitHub, par l'API REST et le jeton du `gh` de ce poste — comme la priorité d'un ticket (priority.ts). Ni box : gardé
// dans le dépôt, un plafond changé s'y propose par une pull request (#2920), et vaut une fois mergée, au rapatriement
// suivant de la station.
//
// Le seuil du temps perdu par ticket (#2670, `lostTimeMaxMin` : la médiane du temps perdu des tickets récents — l'attente
// avant la prise, les cuissons ratées, les renvois ; le temps total d'un ticket n'a pas de plafond) est aussi un plafond
// de durée, mais il ne s'écrit pas d'ici : ce n'est pas un seuil `drift.*`, et la station ne le relit que dans l'arbre
// de son clone. La page le montre, tel que la station le publie, sans champ.
//
// L'app ne juge que ce que le runtime refuserait de lire (`SEUILS_DU_PROJET`) : un nombre au-dessus de zéro, entier
// quand le seuil l'est. Ce module compose les demandes ; ce qui les porte est donné (`ClientDeLaPriorite`).
import type { ClientDeLaPriority } from "./priority.ts";
import { PROPOSE } from "./settings-du-project.ts";
import { refusalDe } from "./tableau/client.ts";

export const FICHIER = ".claude/brigade/projet.json";

// Les seuils de dérive, tels que le runtime les lit, dans l'ordre où la page les montre : les durées d'abord.
// `unite` : ce que la valeur compte ; `entier` : le runtime n'y lit qu'un entier ; `defaut` : la valeur que le runtime
// prend quand rien n'est déclaré, ni dans le dépôt ni sur la station (runtime/src/derive.ts).
export const CAPS = [
  { cle: "gatesSeconds", nom: "Gates duration", unite: "s", entier: false, duree: true, defaut: 100 },
  { cle: "ticketTokens", nom: "Costliest ticket", unite: "tokens", entier: true, duree: false },
  { cle: "lostTokens", nom: "Tokens lost", unite: "tokens", entier: true, duree: false },
] as const satisfies readonly { cle: string; nom: string; unite: string; entier: boolean; duree: boolean; defaut?: number }[];
export type CleCap = (typeof CAPS)[number]["cle"];

// Ce que la page reçoit : chaque plafond — son nom, son unité, son défaut — et sa valeur dans le dépôt — null quand le
// dépôt ne la déclare pas —, ou pourquoi le fichier ne se lit pas, en une ligne, le détail au survol.
export type CapLu = { cle: CleCap; nom: string; unite: string; entier: boolean; duree: boolean; defaut: number | null; valeur: number | null };
export type ReadDesCaps = { plafonds: CapLu[]; branche: string | null } | { sans: string; detail?: string };
// Ce qu'une proposition a ouvert : la PR, son adresse et son numéro.
export type PrOuverte = { pr: string; numero: number };
// Ce que le changement a rendu : la PR qui propose la valeur (null : la retirer), la valeur déjà là, ou pourquoi rien n'a
// changé.
export type RenduDuCap = ({ propose: string; cle: CleCap; valeur: number | null } & PrOuverte) | { fait: string; cle: CleCap; valeur: number | null } | { refus: string; detail?: string };

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const capDe = (cle: unknown) => CAPS.find((cap) => cap.cle === cle);

// La valeur qu'un champ propose, ou pourquoi elle n'en est pas une : vide, le plafond se retire du dépôt.
export function valeurProposee(cle: CleCap, saisie: unknown): { valeur: number | null } | { refus: string } {
  const cap = capDe(cle);
  if (cap === undefined) return { refus: `${String(cle)} is not a duration cap` };
  const texte = typeof saisie === "number" ? String(saisie) : typeof saisie === "string" ? saisie.trim() : "";
  if (texte === "") return { valeur: null };
  const nombre = /^[0-9]+(\.[0-9]+)?$/.test(texte) ? Number(texte) : Number.NaN;
  const slip = Number.isFinite(nombre) && nombre > 0 && (!cap.entier || Number.isSafeInteger(nombre));
  return slip ? { valeur: nombre } : { refus: `${cap.nom.toLowerCase()} must be ${cap.entier ? "a whole number" : "a number"} greater than zero` };
}

// Le fichier tel que GitHub le rend : son contenu lu, et son `sha` — null quand la branche ne l'a pas. Le closer de
// Health (closer-sante.ts) le relit de même.
export type FichierLu = { contenu: Record<string, unknown>; sha: string } | { contenu: null; sha: null };

export async function lireLeFichier(client: ClientDeLaPriority, repository: string, branch: string | null): Promise<FichierLu> {
  const chemin = `/repos/${repository}/contents/${FICHIER}${branch === null ? "" : `?ref=${encodeURIComponent(branch)}`}`;
  const lu = await client.lire(chemin);
  if (lu.status === 404) return { contenu: null, sha: null };
  if (lu.status !== 200) throw refusalDe(`the reading of ${FICHIER}`, lu);
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

// Propose le fichier changé par une pull request (#2920) : une branche neuve, partie de la tête de la branche
// d'intégration (`branche` ; null : celle par défaut du dépôt), le fichier écrit sur elle — le `sha` lu à la main, GitHub
// refuse un fichier changé entre-temps —, puis la PR ouverte vers la branche d'intégration. Rien ne change sur elle tant
// que la PR n'est pas mergée. Chaque étape refusée lève, avec ce que GitHub a dit.
export async function proposerLeFichier(
  client: ClientDeLaPriority,
  repository: string,
  branch: string | null,
  { chemin = FICHIER, texte, sha, dit, ou }: { chemin?: string; texte: string; sha: string | null; dit: string; ou: string },
): Promise<PrOuverte> {
  let base = branch;
  if (base === null) {
    const lu = await client.lire(`/repos/${repository}`);
    if (lu.status !== 200) throw refusalDe(`the reading of ${repository}`, lu);
    const parDefaut = estObjet(lu.data) ? lu.data.default_branch : undefined;
    if (typeof parDefaut !== "string" || parDefaut === "") throw new Error(`GitHub gave ${repository} without its default branch`);
    base = parDefaut;
  }
  const tete = await client.lire(`/repos/${repository}/git/ref/heads/${base}`);
  if (tete.status !== 200) throw refusalDe(`the reading of ${base}`, tete);
  const objet = estObjet(tete.data) && estObjet(tete.data.object) ? tete.data.object.sha : undefined;
  if (typeof objet !== "string") throw new Error(`GitHub gave ${base} without its last commit`);
  const neuve = `brigade/setting-${dit.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${Date.now().toString(36)}`;
  const creee = await client.ecrire("POST", `/repos/${repository}/git/refs`, { ref: `refs/heads/${neuve}`, sha: objet });
  if (creee.status !== 201) throw refusalDe(`the branch ${neuve}`, creee);
  // La branche créée, un échec du fichier ou de la PR la retire : chaque essai raté n'en laisse pas une de plus sur le
  // dépôt. Un retrait refusé ne cache pas l'échec : il s'ajoute à son détail, le nom de la branche restée. Une PR
  // ouverte garde sa branche.
  let ouverteLue: unknown;
  try {
    const ecrit = await client.ecrire("PUT", `/repos/${repository}/contents/${chemin}`, {
      message: `brigade: ${dit} (from the app, ${ou})`,
      content: Buffer.from(texte, "utf8").toString("base64"),
      ...(sha === null ? {} : { sha }),
      branch: neuve,
    });
    if (ecrit.status !== 200 && ecrit.status !== 201) throw refusalDe(`the change of ${chemin}`, ecrit);
    const ouverte = await client.ecrire("POST", `/repos/${repository}/pulls`, {
      title: `brigade: ${dit}`,
      head: neuve,
      base,
      body: `Proposed from the app (${ou}): ${dit} in \`${chemin}\`. It applies once merged, at the station's next fetch.`,
    });
    if (ouverte.status !== 201) throw refusalDe(`the pull request of ${neuve}`, ouverte);
    ouverteLue = ouverte.data;
  } catch (error) {
    const retiree = await client.ecrire("DELETE", `/repos/${repository}/git/refs/heads/${neuve}`).catch((raison: unknown) => ({ status: 0, data: { message: message(raison) } }));
    if (retiree.status === 204) throw error;
    throw new Error(`${message(error)}; ${refusalDe(`the removal of ${neuve}`, retiree).message}, it stays on ${repository}`);
  }
  const { number, html_url } = estObjet(ouverteLue) ? ouverteLue : {};
  if (typeof number !== "number" || typeof html_url !== "string") throw new Error(`GitHub opened the pull request of ${neuve} without its number`);
  return { pr: html_url, numero: number };
}

// Le texte du fichier tel que le runtime le relit : du JSON indenté, une fin de ligne.
export const texteDuFichier = (contenu: Record<string, unknown>) => `${JSON.stringify(contenu, null, 2)}\n`;

const valeursDe = (contenu: Record<string, unknown> | null): CapLu[] => {
  const drift = contenu !== null && estObjet(contenu.drift) ? contenu.drift : {};
  return CAPS.map((cap) => {
    const valeur = drift[cap.cle];
    const defaut = "defaut" in cap ? cap.defaut : null;
    return { cle: cap.cle, nom: cap.nom, unite: cap.unite, entier: cap.entier, duree: cap.duree, defaut, valeur: typeof valeur === "number" && Number.isFinite(valeur) && valeur > 0 ? valeur : null };
  });
};

// Les plafonds que le dépôt déclare, sur sa branche d'intégration (`branche` ; null : celle par défaut de GitHub).
export async function lireLesCaps({ depot: repository, branche: branch, client }: { depot: string; branche: string | null; client: ClientDeLaPriority }): Promise<ReadDesCaps> {
  try {
    const { contenu } = await lireLeFichier(client, repository, branch);
    return { plafonds: valeursDe(contenu), branche: branch };
  } catch (error) {
    return { sans: "duration caps unavailable", detail: message(error) };
  }
}

// Change un plafond dans le dépôt : le fichier est relu — son dernier état, et le `sha` que GitHub exige —, la seule
// clé `drift.<cle>` changée, le reste gardé tel quel, puis proposé par une pull request vers la branche d'intégration.
// Sans fichier, il est créé avec ce que le runtime exige d'un fichier (sa version, la branche) — seulement quand la
// branche est connue.
export async function changerLeCap({ depot: repository, branche: branch, cle, saisie, client }: { depot: string; branche: string | null; cle: unknown; saisie: unknown; client: ClientDeLaPriority }): Promise<RenduDuCap> {
  const cap = capDe(cle);
  if (cap === undefined) return { refus: `nothing was changed: ${String(cle)} is not a duration cap` };
  const propose = valeurProposee(cap.cle, saisie);
  if ("refus" in propose) return { refus: `nothing was changed: ${propose.refus}` };
  let lu: FichierLu;
  try {
    lu = await lireLeFichier(client, repository, branch);
  } catch (error) {
    return { refus: `nothing was changed: ${FICHIER} was not read on GitHub`, detail: message(error) };
  }
  if (lu.contenu === null && branch === null) return { refus: `nothing was changed: ${repository} has no ${FICHIER} and its integration branch is not known`, detail: "" };
  const contenu: Record<string, unknown> = lu.contenu ?? { version: 1, integrationBranch: branch };
  const avant = estObjet(contenu.drift) ? contenu.drift : {};
  if ((typeof avant[cap.cle] === "number" ? avant[cap.cle] : null) === propose.valeur) return { fait: "unchanged: the repository already says so", cle: cap.cle, valeur: propose.valeur };
  const drift: Record<string, unknown> = { ...avant };
  if (propose.valeur === null) delete drift[cap.cle];
  else drift[cap.cle] = propose.valeur;
  if (Object.keys(drift).length === 0) delete contenu.drift;
  else contenu.drift = drift;
  const dit = propose.valeur === null ? `remove drift.${cap.cle}` : `set drift.${cap.cle} to ${propose.valeur}`;
  try {
    const ouverte = await proposerLeFichier(client, repository, branch, { texte: texteDuFichier(contenu), sha: lu.sha, dit, ou: "Kitchen > Health" });
    return { propose: PROPOSE, ...ouverte, cle: cap.cle, valeur: propose.valeur };
  } catch (error) {
    return { refus: `nothing was proposed: GitHub did not open the pull request of ${FICHIER}`, detail: message(error) };
  }
}
