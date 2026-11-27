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
import type { ClientOfThePriority } from "./priority.ts";
import { PROPOSES } from "./settings-of-project.ts";
import { refusalOf } from "./board/client.ts";

export const FILE = ".claude/brigade/projet.json";

// Les seuils de dérive, tels que le runtime les lit, dans l'ordre où la page les montre : les durées d'abord.
// `unite` : ce que la valeur compte ; `entier` : le runtime n'y lit qu'un entier ; `defaut` : la valeur que le runtime
// prend quand rien n'est déclaré, ni dans le dépôt ni sur la station (runtime/src/derive.ts).
export const CAPS = [
  { cle: "gatesSeconds", nom: "Gates duration", unite: "s", entier: false, duree: true, defaut: 100 },
  { cle: "ticketTokens", nom: "Costliest ticket", unite: "tokens", entier: true, duree: false },
  { cle: "lostTokens", nom: "Tokens lost", unite: "tokens", entier: true, duree: false },
] as const satisfies readonly { cle: string; nom: string; unite: string; entier: boolean; duree: boolean; defaut?: number }[];
export type KeyCap = (typeof CAPS)[number]["cle"];

// Ce que la page reçoit : chaque plafond — son nom, son unité, son défaut — et sa valeur dans le dépôt — null quand le
// dépôt ne la déclare pas —, ou pourquoi le fichier ne se lit pas, en une ligne, le détail au survol.
export type CapRead = { cle: KeyCap; nom: string; unite: string; entier: boolean; duree: boolean; defaut: number | null; valeur: number | null };
export type ReadOfCaps = { plafonds: CapRead[]; branche: string | null } | { sans: string; detail?: string };
// Ce qu'une proposition a ouvert : la PR, son adresse et son numéro.
export type PrOpen = { pr: string; numero: number };
// Ce que le changement a rendu : la PR qui propose la valeur (null : la retirer), la valeur déjà là, ou pourquoi rien n'a
// changé.
export type RenderedOfCap = ({ propose: string; cle: KeyCap; valeur: number | null } & PrOpen) | { fait: string; cle: KeyCap; valeur: number | null } | { refus: string; detail?: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const capOf = (key: unknown) => CAPS.find((cap) => cap.cle === key);

// La valeur qu'un champ propose, ou pourquoi elle n'en est pas une : vide, le plafond se retire du dépôt.
export function valueProposed(key: KeyCap, input: unknown): { valeur: number | null } | { refus: string } {
  const cap = capOf(key);
  if (cap === undefined) return { refus: `${String(key)} is not a duration cap` };
  const text = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim() : "";
  if (text === "") return { valeur: null };
  const count = /^[0-9]+(\.[0-9]+)?$/.test(text) ? Number(text) : Number.NaN;
  const slip = Number.isFinite(count) && count > 0 && (!cap.entier || Number.isSafeInteger(count));
  return slip ? { valeur: count } : { refus: `${cap.nom.toLowerCase()} must be ${cap.entier ? "a whole number" : "a number"} greater than zero` };
}

// Le fichier tel que GitHub le rend : son contenu lu, et son `sha` — null quand la branche ne l'a pas. Le closer de
// Health (closer-health.ts) le relit de même.
export type FileRead = { contenu: Record<string, unknown>; sha: string } | { contenu: null; sha: null };

export async function readTheFile(client: ClientOfThePriority, repository: string, branch: string | null): Promise<FileRead> {
  const path = `/repos/${repository}/contents/${FILE}${branch === null ? "" : `?ref=${encodeURIComponent(branch)}`}`;
  const readOne = await client.lire(path);
  if (readOne.status === 404) return { contenu: null, sha: null };
  if (readOne.status !== 200) throw refusalOf(`the reading of ${FILE}`, readOne);
  const { content, sha } = isObject(readOne.data) ? readOne.data : {};
  if (typeof content !== "string" || typeof sha !== "string") throw new Error(`GitHub gave ${FILE} without its content`);
  let contents: unknown;
  try {
    contents = JSON.parse(Buffer.from(content, "base64").toString("utf8"));
  } catch {
    throw new Error(`${FILE} is not valid JSON`);
  }
  if (!isObject(contents)) throw new Error(`${FILE} is not a JSON object`);
  return { contenu: contents, sha };
}

// Propose le fichier changé par une pull request (#2920) : une branche neuve, partie de la tête de la branche
// d'intégration (`branche` ; null : celle par défaut du dépôt), le fichier écrit sur elle — le `sha` lu à la main, GitHub
// refuse un fichier changé entre-temps —, puis la PR ouverte vers la branche d'intégration. Rien ne change sur elle tant
// que la PR n'est pas mergée. Chaque étape refusée lève, avec ce que GitHub a dit.
export async function proposeTheFile(
  client: ClientOfThePriority,
  repository: string,
  branch: string | null,
  { chemin: path = FILE, texte: text, sha, dit: said, ou: or }: { chemin?: string; texte: string; sha: string | null; dit: string; ou: string },
): Promise<PrOpen> {
  let base = branch;
  if (base === null) {
    const readOne = await client.lire(`/repos/${repository}`);
    if (readOne.status !== 200) throw refusalOf(`the reading of ${repository}`, readOne);
    const byDefault = isObject(readOne.data) ? readOne.data.default_branch : undefined;
    if (typeof byDefault !== "string" || byDefault === "") throw new Error(`GitHub gave ${repository} without its default branch`);
    base = byDefault;
  }
  const head = await client.lire(`/repos/${repository}/git/ref/heads/${base}`);
  if (head.status !== 200) throw refusalOf(`the reading of ${base}`, head);
  const object = isObject(head.data) && isObject(head.data.object) ? head.data.object.sha : undefined;
  if (typeof object !== "string") throw new Error(`GitHub gave ${base} without its last commit`);
  const freshOne = `brigade/setting-${said.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${Date.now().toString(36)}`;
  const created = await client.ecrire("POST", `/repos/${repository}/git/refs`, { ref: `refs/heads/${freshOne}`, sha: object });
  if (created.status !== 201) throw refusalOf(`the branch ${freshOne}`, created);
  // La branche créée, un échec du fichier ou de la PR la retire : chaque essai raté n'en laisse pas une de plus sur le
  // dépôt. Un retrait refusé ne cache pas l'échec : il s'ajoute à son détail, le nom de la branche restée. Une PR
  // ouverte garde sa branche.
  let openRead: unknown;
  try {
    const written = await client.ecrire("PUT", `/repos/${repository}/contents/${path}`, {
      message: `brigade: ${said} (from the app, ${or})`,
      content: Buffer.from(text, "utf8").toString("base64"),
      ...(sha === null ? {} : { sha }),
      branch: freshOne,
    });
    if (written.status !== 200 && written.status !== 201) throw refusalOf(`the change of ${path}`, written);
    const openOne = await client.ecrire("POST", `/repos/${repository}/pulls`, {
      title: `brigade: ${said}`,
      head: freshOne,
      base,
      body: `Proposed from the app (${or}): ${said} in \`${path}\`. It applies once merged, at the station's next fetch.`,
    });
    if (openOne.status !== 201) throw refusalOf(`the pull request of ${freshOne}`, openOne);
    openRead = openOne.data;
  } catch (error) {
    const removedOne = await client.ecrire("DELETE", `/repos/${repository}/git/refs/heads/${freshOne}`).catch((reason: unknown) => ({ status: 0, data: { message: message(reason) } }));
    if (removedOne.status === 204) throw error;
    throw new Error(`${message(error)}; ${refusalOf(`the removal of ${freshOne}`, removedOne).message}, it stays on ${repository}`);
  }
  const { number, html_url } = isObject(openRead) ? openRead : {};
  if (typeof number !== "number" || typeof html_url !== "string") throw new Error(`GitHub opened the pull request of ${freshOne} without its number`);
  return { pr: html_url, numero: number };
}

// Le texte du fichier tel que le runtime le relit : du JSON indenté, une fin de ligne.
export const textOfFile = (contents: Record<string, unknown>) => `${JSON.stringify(contents, null, 2)}\n`;

const valuesOf = (contents: Record<string, unknown> | null): CapRead[] => {
  const drift = contents !== null && isObject(contents.drift) ? contents.drift : {};
  return CAPS.map((cap) => {
    const value = drift[cap.cle];
    const fallback = "defaut" in cap ? cap.defaut : null;
    return { cle: cap.cle, nom: cap.nom, unite: cap.unite, entier: cap.entier, duree: cap.duree, defaut: fallback, valeur: typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null };
  });
};

// Les plafonds que le dépôt déclare, sur sa branche d'intégration (`branche` ; null : celle par défaut de GitHub).
export async function readTheCaps({ depot: repository, branche: branch, client }: { depot: string; branche: string | null; client: ClientOfThePriority }): Promise<ReadOfCaps> {
  try {
    const { contenu: contents } = await readTheFile(client, repository, branch);
    return { plafonds: valuesOf(contents), branche: branch };
  } catch (error) {
    return { sans: "duration caps unavailable", detail: message(error) };
  }
}

// Change un plafond dans le dépôt : le fichier est relu — son dernier état, et le `sha` que GitHub exige —, la seule
// clé `drift.<cle>` changée, le reste gardé tel quel, puis proposé par une pull request vers la branche d'intégration.
// Sans fichier, il est créé avec ce que le runtime exige d'un fichier (sa version, la branche) — seulement quand la
// branche est connue.
export async function changeTheCap({ depot: repository, branche: branch, cle: key, saisie: input, client }: { depot: string; branche: string | null; cle: unknown; saisie: unknown; client: ClientOfThePriority }): Promise<RenderedOfCap> {
  const cap = capOf(key);
  if (cap === undefined) return { refus: `nothing was changed: ${String(key)} is not a duration cap` };
  const proposes = valueProposed(cap.cle, input);
  if ("refus" in proposes) return { refus: `nothing was changed: ${proposes.refus}` };
  let readOne: FileRead;
  try {
    readOne = await readTheFile(client, repository, branch);
  } catch (error) {
    return { refus: `nothing was changed: ${FILE} was not read on GitHub`, detail: message(error) };
  }
  if (readOne.contenu === null && branch === null) return { refus: `nothing was changed: ${repository} has no ${FILE} and its integration branch is not known`, detail: "" };
  const contents: Record<string, unknown> = readOne.contenu ?? { version: 1, integrationBranch: branch };
  const before = isObject(contents.drift) ? contents.drift : {};
  if ((typeof before[cap.cle] === "number" ? before[cap.cle] : null) === proposes.valeur) return { fait: "unchanged: the repository already says so", cle: cap.cle, valeur: proposes.valeur };
  const drift: Record<string, unknown> = { ...before };
  if (proposes.valeur === null) delete drift[cap.cle];
  else drift[cap.cle] = proposes.valeur;
  if (Object.keys(drift).length === 0) delete contents.drift;
  else contents.drift = drift;
  const said = proposes.valeur === null ? `remove drift.${cap.cle}` : `set drift.${cap.cle} to ${proposes.valeur}`;
  try {
    const openOne = await proposeTheFile(client, repository, branch, { texte: textOfFile(contents), sha: readOne.sha, dit: said, ou: "Kitchen > Health" });
    return { propose: PROPOSES, ...openOne, cle: cap.cle, valeur: proposes.valeur };
  } catch (error) {
    return { refus: `nothing was proposed: GitHub did not open the pull request of ${FILE}`, detail: message(error) };
  }
}
