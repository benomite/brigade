// Le closer d'un projet, sur Kitchen > Health (#2491, épique #2484) : ce qu'il a fait — ses passes et ce que chacune a
// retiré —, ce qu'il vérifie en premier sur ce projet, ce que le chef lui demande de vérifier en plus, et ses réglages.
// Tout se lit et s'écrit sur GitHub, par l'API REST et le jeton du `gh` de ce poste, comme les plafonds de durée
// (caps-duration.ts) : ni box. Ses réglages, gardés dans `projet.json`, et ses vérifications en plus, gardées dans
// `closer-checks.md`, s'y proposent par une pull request (#2920).
//
// - **Ses passes** : le closer passe sur GitHub (#2361) — une passe est une issue
//   `fire`, au titre `Closing pass on …` et au corps marqué `<!-- brigade:fermeture sha=<base> -->`, qu'un cook cuit
//   comme un ticket, sur sa branche `cook/<n>-…`. Ce qu'elle a retiré, c'est la PR de cette branche, mergée : ses
//   lignes retirées et ajoutées, telles que GitHub les compte.
// - **Ce qu'il vérifie en premier** : ce que la dernière passe lui a remis, lu dans le corps de son issue — le code mort
//   et les doublons repérés sur la base, la dérive des derniers merges, le temps des tickets.
// - **Ce qu'il vérifie en plus** : une ligne par vérification, dans `.claude/brigade/closer-checks.md` du dépôt. Le
//   runtime ne les met pas encore dans l'issue d'une passe : elles attendent
//   dans le dépôt.
// - **Ses réglages** : `closer.*` de `.claude/brigade/projet.json` — son
//   calibrage, sa condition de départ, ses plafonds ; le runtime les relit à chaque rapatriement. Sur GitHub, seuls le
//   calibrage et le plafond des lignes retirées sont lus (docs/reglages.md) : la page le dit.
//
// Ce module compose les demandes ; ce qui les porte est donné (`ClientDeLaPriorite`).
import { FILE as PROJECT_JSON, readTheFile, type PrOpen, proposeTheFile, textOfFile } from "./caps-duration.ts";
import type { ClientOfThePriority } from "./priority.ts";
import { PROPOSES } from "./box.ts";
import { EFFORTS, MODELS } from "./projects/projects.ts";
import { refusalOf } from "./board/client.ts";

// --- Les réglages ------------------------------------------------------------------

// Les réglages du closer, dans l'ordre où la page les montre. `defaut` : ce que le runtime prend quand ni le dépôt ni la
// station n'en disent rien ; le calibrage n'en a pas. `surGithub` : le closer sur
// GitHub le lit (closer-github-passe.ts ne lit que `calibration` et `removedLines`).
export const SETTINGS = [
  { cle: "calibration", nom: "Calibration", unite: "", defaut: null, surGithub: true },
  { cle: "cooksBelow", nom: "Start condition", unite: "cooks in flight", defaut: 1, surGithub: false },
  { cle: "maxTokens", nom: "Tokens cap", unite: "tokens", defaut: 500_000, surGithub: false },
  { cle: "maxRemovedLines", nom: "Removed lines cap", unite: "lines", defaut: 500, surGithub: true },
] as const satisfies readonly { cle: string; nom: string; unite: string; defaut: number | null; surGithub: boolean }[];
export type KeyOfCloser = (typeof SETTINGS)[number]["cle"];
export type Calibration = { model: string; effort: string };
export type SettingRead = { cle: KeyOfCloser; nom: string; unite: string; defaut: number | null; surGithub: boolean; valeur: number | Calibration | null };

// --- Les vérifications en plus -----------------------------------------------------

export const VERIFICATIONS = ".claude/brigade/closer-checks.md";
export const LENGTH_MAX = 200;
const HEADER = [
  "# The closer's extra checks",
  "",
  "What the chef asks the closer to check in addition to its own, one per line — written from the app (Kitchen > Health).",
  "",
];

// --- Les passes --------------------------------------------------------------------

// Combien de passes la page montre, les plus récentes.
export const PASSES = 5;
const BRAND = /^\s*<!--\s*brigade:fermeture(?:\s+sha=([0-9a-f]*))?\s*-->\s*$/m;
// Les auteurs dont le runtime croit une marque (`DE_CONFIANCE`).
const OF_TRUST = ["OWNER", "MEMBER", "COLLABORATOR"];

export type Candidate = { id: string; quoi: string };
export type PrOfThePass = { numero: number; url: string; mergee: boolean; retirees: number; ajoutees: number };
export type PassRead = {
  numero: number;
  url: string;
  ouverteLe: string;
  ouverte: boolean;
  sha: string;
  candidats: Candidate[];
  // Ceux qui dépassaient une passe, laissés à la suivante.
  restants: number;
  derive: string[];
  temps: string[];
  pr: PrOfThePass | null;
};

// --- La lecture --------------------------------------------------------------------

type Or<T> = T | { sans: string; detail?: string };
export type ReadOfCloser = { reglages: Or<{ liste: SettingRead[] }>; verifications: Or<{ liste: string[] }>; passes: Or<{ liste: PassRead[] }> };
// Ce qu'une écriture a rendu : la valeur écrite (null : retirée) ou la liste des vérifications, ou pourquoi rien n'a changé.
export type RenderedOfSetting =
  | ({ propose: string; cle: KeyOfCloser; valeur: number | Calibration | null } & PrOpen)
  | { fait: string; cle: KeyOfCloser; valeur: number | Calibration | null }
  | { refus: string; detail?: string };
// Ce qu'un geste sur les vérifications a rendu : la PR qui le propose — la vérification, et la liste en vigueur, qui ne
// change qu'au merge —, la liste déjà telle quelle, ou pourquoi rien n'a changé.
export type RenderedOfVerifications =
  | ({ propose: string; geste: "ajouter" | "retirer"; verification: string; liste: string[] } & PrOpen)
  | { fait: string; liste: string[] }
  | { refus: string; detail?: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const settingOf = (key: unknown) => SETTINGS.find((setting) => setting.cle === key);
const isCalibration = (value: unknown): value is Calibration =>
  isObject(value) && (MODELS as readonly unknown[]).includes(value.model) && (EFFORTS as readonly unknown[]).includes(value.effort);
const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const settingsOf = (content: Record<string, unknown> | null): SettingRead[] => {
  const closer = content !== null && isObject(content.closer) ? content.closer : {};
  return SETTINGS.map(({ cle: key, nom: name, unite, defaut: fallback, surGithub: onGithub }) => {
    const pose = closer[key];
    const value = key === "calibration" ? (isCalibration(pose) ? { model: pose.model, effort: pose.effort } : null) : isWhole(pose) ? pose : null;
    return { cle: key, nom: name, unite, defaut: fallback, surGithub: onGithub, valeur: value };
  });
};

// Le fichier des vérifications : chaque ligne `- …` en est une, le reste est son en-tête.
export const verificationsOf = (text: string): string[] => text.split(/\r?\n/).flatMap((line) => (/^\s*[-*]\s+\S/.test(line) ? [line.replace(/^\s*[-*]\s+/, "").trim()] : []));
export const textOfVerifications = (list: readonly string[]): string => [...HEADER, ...list.map((verification) => `- ${verification}`), ""].join("\n");

// Un fichier texte du dépôt (`chemin`, celui des vérifications par défaut ; le savoir-faire du projet, #4239) : son texte
// et son `sha`, ou null quand la branche ne l'a pas.
export type MarkdownRead = { texte: string; sha: string } | { texte: null; sha: null };
export async function readTheMarkdown(client: ClientOfThePriority, repository: string, branch: string | null, path: string = VERIFICATIONS): Promise<MarkdownRead> {
  const readOne = await client.lire(`/repos/${repository}/contents/${path}${branch === null ? "" : `?ref=${encodeURIComponent(branch)}`}`);
  if (readOne.status === 404) return { texte: null, sha: null };
  if (readOne.status !== 200) throw refusalOf(`the reading of ${path}`, readOne);
  const { content, sha } = isObject(readOne.data) ? readOne.data : {};
  if (typeof content !== "string" || typeof sha !== "string") throw new Error(`GitHub gave ${path} without its content`);
  return { texte: Buffer.from(content, "base64").toString("utf8"), sha };
}

// Les sections `## …` d'un corps d'issue, chacune avec ses lignes.
function sections(body: string): Map<string, string[]> {
  const readEntries = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of body.split(/\r?\n/)) {
    const title = /^##\s+(.+?)\s*$/.exec(line);
    if (title !== null) {
      current = [];
      readEntries.set(title[1] ?? "", current);
    } else if (current !== null) current.push(line);
  }
  return readEntries;
}

// Ce que l'issue d'une passe a remis au closer, tel que closer-github-passe.ts l'écrit (`corpsDeLaFermeture`).
export function readPass(issue: { number: number; html_url?: string; created_at: string; state: string; body: string }): Omit<PassRead, "pr"> | null {
  const brand = BRAND.exec(issue.body);
  if (brand === null) return null;
  const readEntries = sections(issue.body);
  const candidatesRead = readEntries.get("Candidates") ?? [];
  const candidates = candidatesRead.flatMap((line) => {
    const readOne = /^- ([DM]\d+) — (.+)$/.exec(line.trim());
    return readOne === null ? [] : [{ id: readOne[1] ?? "", quoi: readOne[2] ?? "" }];
  });
  const remaining = Number(/^(\d+) more are left for a next pass\.$/m.exec(candidatesRead.join("\n"))?.[1] ?? 0);
  const drift = (readEntries.get("Drift") ?? []).flatMap((line) => (/^- last \d+ merges: /.test(line.trim()) ? [line.trim().slice(2)] : []));
  const time = (readEntries.get("Times") ?? []).map((line) => line.trim()).filter((line) => line !== "");
  return { numero: issue.number, url: issue.html_url ?? "", ouverteLe: issue.created_at, ouverte: issue.state === "open", sha: brand[1] ?? "", candidats: candidates, restants: remaining, derive: drift, temps: time };
}

// Les passes : les issues au titre de la fermeture, cherchées sur GitHub, gardées quand leur corps porte la marque d'un
// auteur de confiance — comme le runtime les retrouve —, les plus récentes d'abord ; puis la PR de chacune.
async function readPasses(client: ClientOfThePriority, repository: string): Promise<PassRead[]> {
  const q = `repo:${repository} is:issue in:title "Closing pass on"`;
  const searches = await client.lire(`/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=${PASSES * 2}`);
  if (searches.status !== 200) throw refusalOf("the search of the closing passes", searches);
  const items = isObject(searches.data) && Array.isArray(searches.data.items) ? searches.data.items : [];
  const passes = items
    .flatMap((item: unknown) => {
      if (!isObject(item) || item.pull_request !== undefined || !OF_TRUST.includes(String(item.author_association))) return [];
      const { number, html_url, created_at, state, body } = item;
      if (typeof number !== "number" || typeof created_at !== "string" || typeof body !== "string") return [];
      const readEntry = readPass({ number, created_at, state: String(state), body, ...(typeof html_url === "string" ? { html_url } : {}) });
      return readEntry === null ? [] : [readEntry];
    })
    .sort((a, b) => b.numero - a.numero)
    .slice(0, PASSES);
  const [owner] = repository.split("/");
  return Promise.all(passes.map(async (pass) => ({ ...pass, pr: await prOf(client, repository, owner ?? "", pass.numero) })));
}

// La PR d'une passe : celle de sa branche `cook/<n>-…`, la mergée d'abord, puis la plus récente — ses lignes dans son détail.
async function prOf(client: ClientOfThePriority, repository: string, owner: string, number: number): Promise<PrOfThePass | null> {
  const listed = await client.lire(`/repos/${repository}/pulls?state=all&head=${encodeURIComponent(`${owner}:cook/${number}-github`)}&per_page=10`);
  if (listed.status !== 200) throw refusalOf(`the reading of the pull requests of #${number}`, listed);
  const prs = (Array.isArray(listed.data) ? listed.data : []).filter(isObject).filter((pr) => typeof pr.number === "number");
  const pr = prs.find((one) => typeof one.merged_at === "string") ?? prs.sort((a, b) => Number(b.number) - Number(a.number))[0];
  if (pr === undefined) return null;
  const detail = await client.lire(`/repos/${repository}/pulls/${String(pr.number)}`);
  if (detail.status !== 200) throw refusalOf(`the reading of pull request #${String(pr.number)}`, detail);
  const readOne = isObject(detail.data) ? detail.data : {};
  return {
    numero: Number(pr.number),
    url: typeof readOne.html_url === "string" ? readOne.html_url : typeof pr.html_url === "string" ? pr.html_url : "",
    mergee: readOne.merged === true || typeof readOne.merged_at === "string",
    retirees: typeof readOne.deletions === "number" ? readOne.deletions : 0,
    ajoutees: typeof readOne.additions === "number" ? readOne.additions : 0,
  };
}

// Tout le bloc : les trois lectures, chacune pour soi — l'une qui échoue ne retire pas les autres.
export async function readTheCloser({ depot: repository, branche: branch, client }: { depot: string; branche: string | null; client: ClientOfThePriority }): Promise<ReadOfCloser> {
  const [settings, verifications, passes] = await Promise.all([
    readTheFile(client, repository, branch).then(
      ({ contenu: content }) => ({ liste: settingsOf(content) }),
      (error) => ({ sans: "the closer's settings unavailable", detail: message(error) }),
    ),
    readTheMarkdown(client, repository, branch).then(
      ({ texte: text }) => ({ liste: text === null ? [] : verificationsOf(text) }),
      (error) => ({ sans: "extra checks unavailable", detail: message(error) }),
    ),
    readPasses(client, repository).then(
      (list) => ({ liste: list }),
      (error) => ({ sans: "the closer's passes unavailable", detail: message(error) }),
    ),
  ]);
  return { reglages: settings, verifications, passes };
}

// --- Les écritures -----------------------------------------------------------------

// La valeur qu'un réglage propose, ou pourquoi elle n'en est pas une. Vide, il se retire du dépôt : le calibrage, quand
// le modèle et l'effort le sont tous deux.
export function valueProposed(key: KeyOfCloser, input: unknown): { valeur: number | Calibration | null } | { refus: string } {
  if (key === "calibration") {
    const { model, effort } = isObject(input) ? input : {};
    const m = typeof model === "string" ? model.trim() : "";
    const e = typeof effort === "string" ? effort.trim() : "";
    if (m === "" && e === "") return { valeur: null };
    if (m === "" || e === "") return { refus: "the model and the effort are chosen together: one without the other makes the start be refused" };
    const calibration = { model: m, effort: e };
    return isCalibration(calibration) ? { valeur: calibration } : { refus: `the calibration must be one of ${MODELS.join(", ")} and one of ${EFFORTS.join(", ")}` };
  }
  const text = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim() : "";
  if (text === "") return { valeur: null };
  const count = /^[0-9]+$/.test(text) ? Number(text) : Number.NaN;
  return isWhole(count) ? { valeur: count } : { refus: `${(settingOf(key)?.nom ?? key).toLowerCase()} must be a whole number greater than zero` };
}

const sameValue = (a: unknown, b: number | Calibration | null) =>
  b === null ? a === undefined : typeof b === "number" ? a === b : isObject(a) && a.model === b.model && a.effort === b.effort;
const saysTheValue = (value: number | Calibration) => (typeof value === "number" ? String(value) : `${value.model} / ${value.effort}`);

// Change un réglage du closer dans le dépôt : `projet.json` relu — son dernier état, son `sha` —, la seule clé
// `closer.<cle>` changée, le reste gardé tel quel, puis proposé par une pull request vers la branche d'intégration. Sans
// fichier, il est créé, quand la branche est connue.
export async function changeTheSetting({ depot: repository, branche: branch, cle: key, saisie: input, client }: { depot: string; branche: string | null; cle: unknown; saisie: unknown; client: ClientOfThePriority }): Promise<RenderedOfSetting> {
  const setting = settingOf(key);
  if (setting === undefined) return { refus: `nothing was changed: ${String(key)} is not a setting of the closer` };
  const proposes = valueProposed(setting.cle, input);
  if ("refus" in proposes) return { refus: `nothing was changed: ${proposes.refus}` };
  let readOne: Awaited<ReturnType<typeof readTheFile>>;
  try {
    readOne = await readTheFile(client, repository, branch);
  } catch (error) {
    return { refus: `nothing was changed: ${PROJECT_JSON} was not read on GitHub`, detail: message(error) };
  }
  if (readOne.contenu === null && branch === null) return { refus: `nothing was changed: ${repository} has no ${PROJECT_JSON} and its integration branch is not known`, detail: "" };
  const content: Record<string, unknown> = readOne.contenu ?? { version: 1, integrationBranch: branch };
  const before = isObject(content.closer) ? content.closer : {};
  if (sameValue(before[setting.cle], proposes.valeur)) return { fait: "unchanged: the repository already says so", cle: setting.cle, valeur: proposes.valeur };
  const closer: Record<string, unknown> = { ...before };
  if (proposes.valeur === null) delete closer[setting.cle];
  else closer[setting.cle] = proposes.valeur;
  if (Object.keys(closer).length === 0) delete content.closer;
  else content.closer = closer;
  const said = proposes.valeur === null ? `remove closer.${setting.cle}` : `set closer.${setting.cle} to ${saysTheValue(proposes.valeur)}`;
  try {
    const openOne = await proposeTheFile(client, repository, branch, { texte: textOfFile(content), sha: readOne.sha, dit: said, ou: "Kitchen > Health" });
    return { propose: PROPOSES, ...openOne, cle: setting.cle, valeur: proposes.valeur };
  } catch (error) {
    return { refus: `nothing was proposed: GitHub did not open the pull request of ${PROJECT_JSON}`, detail: message(error) };
  }
}

// Une vérification, telle que le chef la tape, ou pourquoi elle n'en est pas une : une ligne, sans en-tête.
export function verificationProposed(input: unknown): { verification: string } | { refus: string } {
  const text = typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
  if (text === "") return { refus: "say what the closer should check" };
  if (text.length > LENGTH_MAX) return { refus: `a check holds in ${LENGTH_MAX} characters at most` };
  return { verification: text };
}

// Ajoute une vérification au fichier du dépôt — ou en retire une —, proposé par une pull request vers la branche
// d'intégration (#2920) : rien n'y change avant le merge, et la liste rendue reste celle en vigueur. Le fichier est relu
// pour son `sha` ; sans lui, il est créé. Une vérification déjà là n'est pas ajoutée deux fois.
export async function changeTheVerifications({ depot: repository, branche: branch, geste: action, saisie: input, client }: { depot: string; branche: string | null; geste: unknown; saisie: unknown; client: ClientOfThePriority }): Promise<RenderedOfVerifications> {
  if (action !== "ajouter" && action !== "retirer") return { refus: "nothing was changed: the action is neither to add nor to remove a check" };
  const proposes = verificationProposed(input);
  if ("refus" in proposes) return { refus: `nothing was changed: ${proposes.refus}` };
  let readOne: MarkdownRead;
  try {
    readOne = await readTheMarkdown(client, repository, branch);
  } catch (error) {
    return { refus: `nothing was changed: ${VERIFICATIONS} was not read on GitHub`, detail: message(error) };
  }
  const before = readOne.texte === null ? [] : verificationsOf(readOne.texte);
  const already = before.includes(proposes.verification);
  if (action === "ajouter" && already) return { fait: "unchanged: the closer already has this check", liste: before };
  if (action === "retirer" && !already) return { fait: "unchanged: the closer does not have this check", liste: before };
  const after = action === "ajouter" ? [...before, proposes.verification] : before.filter((verification) => verification !== proposes.verification);
  const said = `${action === "ajouter" ? "add" : "remove"} a check of the closer`;
  try {
    const openOne = await proposeTheFile(client, repository, branch, { chemin: VERIFICATIONS, texte: textOfVerifications(after), sha: readOne.sha, dit: said, ou: "Kitchen > Health" });
    return { propose: PROPOSES, ...openOne, geste: action, verification: proposes.verification, liste: before };
  } catch (error) {
    return { refus: `nothing was proposed: GitHub did not open the pull request of ${VERIFICATIONS}`, detail: message(error) };
  }
}
