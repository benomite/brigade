// Les plafonds de durée d'un projet, réglés depuis Kitchen > Health (#2490, épique #2484) : les seuils de dérive que le
// chef déclare (`drift.*` de `.claude/brigade/projet.json`) — au-delà, la
// cuisine le signale. Ils vivent dans le dépôt du projet, sur sa branche d'intégration, et le runtime les y relit à
// chaque rapatriement : changer un plafond, c'est écrire ce fichier sur
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
import { refusalOf } from "./board/client.ts";

export const FILE = ".claude/brigade/projet.json";


// Ce qu'une proposition a ouvert : la PR, son adresse et son numéro.
export type PrOpen = { pr: string; numero: number };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));


// Le fichier tel que GitHub le rend : son contenu lu, et son `sha` — null quand la branche ne l'a pas.
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
  { chemin: path = FILE, texte: text, sha, dit: said, ou: or }: { chemin?: string; texte: string | null; sha: string | null; dit: string; ou: string },
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
    // `texte` null deletes the file (its `sha` is then required by GitHub).
    const written = await client.ecrire(text === null ? "DELETE" : "PUT", `/repos/${repository}/contents/${path}`, {
      message: `brigade: ${said} (from the app, ${or})`,
      ...(text === null ? {} : { content: Buffer.from(text, "utf8").toString("base64") }),
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




