// La question qui t'attend, posée telle quelle (#681) : sur la fiche d'un ticket de T'attend,
// l'app lit son issue et, si le manager y a posé une question, la montre mot pour mot — ses
// choix (a / b / c) en boutons, un champ pour répondre en une phrase. Ce que le chef choisit
// ou écrit part sur l'issue, en commentaire, à son nom. Ni LLM, ni reformulation : le texte est
// celui du commentaire, et la réponse celle du chef. La demande au second (request.ts) reste à
// côté, pour les questions qui méritent une explication.
// L'app ne passe pas par la box pour cela : aucun geste de la box ne lit les commentaires d'une
// issue ni n'y écrit. Elle lance le `gh` du poste — celui du chef, connecté à son compte, que le
// second utilise déjà (docs/app.md, « Le poste est une station ») : la réponse est signée par lui.
// Rien ne part sans le clic du chef — ni réponse d'office, ni choix par défaut —, et rien ne part
// sur une question qui n'est plus celle qu'il a lue : l'issue est relue juste avant d'écrire.
import { execFile, type ExecFileException } from "node:child_process";
import { choiceOf, bodyOfChoice, type Choice } from "./choice-of-question.ts";
import { count } from "./format.ts";

export { choiceOf, bodyOfChoice, type Choice };

// Ce qui marque, parmi les commentaires du manager, une question posée au chef : les deux
// marqueurs qu'il écrit en tête (runtime/src/juger.ts, `MARQUEUR_MANAGER` ; runtime/src/decouper.ts,
// `MARQUEUR_QUESTION`). Le runtime ne les écrit qu'en commentaire HTML : invisibles sur GitHub.
export const MARKER_MANAGER = "<!-- brigade:manager -->";
export const MARKER_QUESTION = "<!-- brigade:question -->";

// Ceux dont le manager lit les commentaires (runtime/src/manager.ts, `DE_CONFIANCE`) : une
// question n'est prise que d'eux — le marqueur se recopie, pas le droit d'écrire sur le dépôt.
const OF_TRUST = ["OWNER", "MEMBER", "COLLABORATOR"];

// Le `gh` du poste, et le délai passé lequel il est arrêté.
export type Settings = { gh: string; delaiMs: number };

// Un commentaire de l'issue, tel que `gh` le rend : qui, quand, son adresse, son texte.
export type Comment = { auteur: string; association: string; a: string; url: string; corps: string };
// Ce qui a été écrit sur l'issue sous la question : qui, quand, son adresse, son texte sans marqueurs.
export type Written = { auteur: string; a: string; url: string; corps: string };
// La question : le commentaire du manager, sans ses marqueurs — rien d'autre n'en est retiré —,
// ses choix s'il en propose, et ce qui a été écrit sur l'issue depuis. `repondue` : le premier de
// ces commentaires que le manager lira comme une réponse (#503) — de quelqu'un qui a la main sur le
// dépôt, et qui n'est pas de lui ; absente, personne n'y a encore répondu.
export type Question = { url: string; auteur: string; a: string; texte: string; resume: string; choix: Choice[]; depuis: Written[]; repondue?: Written };
// Ce que la lecture de l'issue donne. `aucune` : l'issue est lue, le manager n'y pose pas de
// question — l'entrée garde son geste à elle. `sans` : l'issue n'a pas été lue, et pourquoi.
export type Read = { a: string } & ({ question: Question } | { aucune: true } | { sans: string });
// Ce que la vue envoie : la question qu'elle montre, par son adresse, et la réponse — la lettre
// d'un choix, ou la phrase du chef. Le texte d'un choix vient de l'issue, jamais de la vue.
// `vu` : l'adresse du dernier commentaire écrit sous la question que la vue montrait — absente ou
// vide, elle n'en montrait aucun (#503).
export type Answer = { question: string; vu?: string } & ({ choix: string } | { texte: string });
// Ce qu'il en est advenu. `poste` : le commentaire est sur l'issue — `corps` : ce qui a été écrit,
// `adresse` : la sienne, quand `gh` l'a dite. `refus` : rien n'est parti, et pourquoi ; `lue` : la
// question telle que l'issue la porte maintenant, quand elle a changé sous les yeux du chef.
export type Rendered = { poste: true; corps: string; adresse?: string } | { poste: false; refus: string; lue?: Read };

// Une ligne qui n'est qu'un commentaire HTML : un marqueur du runtime, invisible sur GitHub.
const MARKER = /^\s*<!--[\s\S]*?-->\s*$/;
// Le texte d'un commentaire tel que GitHub le montre : sans ses lignes de marqueurs, ni les
// lignes vides qu'elles laissent en tête et en fin. Le reste, mot pour mot.
const withoutMarkers = (body: string) =>
  body
    .split("\n")
    .filter((line) => !MARKER.test(line))
    .join("\n")
    .replace(/^(?:[ \t]*\r?\n)+/, "")
    .trimEnd();

// La dernière question du manager parmi ces commentaires, dans l'ordre de l'issue, et ce qui a
// été écrit après elle. Aucune : il n'en pose pas sur cette issue.
export function questionOf(comments: readonly Comment[]): Question | undefined {
  const rank = comments.findLastIndex(({ corps: body, association }) => OF_TRUST.includes(association) && body.includes(MARKER_MANAGER) && body.includes(MARKER_QUESTION));
  const setOne = comments[rank];
  if (setOne === undefined) return undefined;
  const text = withoutMarkers(setOne.corps);
  const after = comments.slice(rank + 1);
  const since = after.map(({ auteur: writer, a, url, corps: body }) => ({ auteur: writer, a, url, corps: withoutMarkers(body) }));
  // Ce que le manager lit comme une réponse : un commentaire de confiance qui n'est pas de lui (runtime/src/manager.ts).
  const answeredOne = since[after.findIndex(({ association, corps: body }) => OF_TRUST.includes(association) && !body.includes(MARKER_MANAGER))];
  return {
    url: setOne.url,
    auteur: setOne.auteur,
    a: setOne.a,
    texte: text,
    resume: resumeOf(text),
    choix: choiceOf(text),
    depuis: since,
    ...(answeredOne === undefined ? {} : { repondue: answeredOne }),
  };
}

// Ce que `gh` a rendu, brut.
type Output = { erreur: ExecFileException | null; sortie: string; erreurs: string };
// `gh` lancé une fois. Sans terminal, il ne demande rien : `GH_PROMPT_DISABLED`.
export function launch(settings: Settings, args: string[], entry?: string): Promise<Output> {
  return new Promise((resolve) => {
    const child = execFile(settings.gh, args, { windowsHide: true, timeout: settings.delaiMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (error, output, errors) =>
      resolve({ erreur: error, sortie: output, erreurs: errors }),
    );
    // Un `gh` absent ferme son entrée avant qu'on y écrive : l'erreur est celle de son lancement.
    child.stdin?.on("error", () => {});
    child.stdin?.end(entry ?? "");
  });
}

// Ce qu'un `gh` en échec a dit, et la ligne lancée.
export function failure(settings: Settings, args: string[], { erreur: error, sortie: output, erreurs: errors }: Output & { erreur: ExecFileException }): string {
  const launches = `$ ${settings.gh} ${args.join(" ")}`;
  if (error.code === "ENOENT") return `${launches} — \`${settings.gh}\` is not on this computer: the app reads and answers the issue with your own \`gh\``;
  const suite = error.killed === true ? `no answer within ${count(settings.delaiMs / 1000)} s: gh stopped` : typeof error.code === "number" ? `exit code ${error.code}` : error.message;
  const said = `${errors}${output}`.trim();
  return `${launches}${said === "" ? "" : `\n${said}`}\n→ ${suite}`;
}

// Les commentaires de l'issue, tels que `gh` les rend — ou en quoi sa sortie n'en a pas la forme.
function commentsOf(output: string): Comment[] | string {
  let readOne: unknown;
  try {
    readOne = JSON.parse(output);
  } catch {
    return "its output is not JSON";
  }
  const comments = (readOne as { comments?: unknown } | null)?.comments;
  if (!Array.isArray(comments)) return "its output has no `comments` list";
  const taken: Comment[] = [];
  for (const raw of comments as unknown[]) {
    const { author, authorAssociation, createdAt, url, body } = (raw ?? {}) as Record<string, unknown>;
    const writer = (author as { login?: unknown } | null)?.login;
    if (typeof body !== "string" || typeof createdAt !== "string" || typeof url !== "string") return "a comment lacks its `body`, `createdAt` or `url`";
    taken.push({ auteur: typeof writer === "string" ? writer : "ghost", association: typeof authorAssociation === "string" ? authorAssociation : "NONE", a: createdAt, url, corps: body });
  }
  return taken;
}

// L'issue à cette adresse, lue par `gh` : la question du manager qu'elle porte, s'il y en a une.
export async function readQuestion(settings: Settings, address: string, now = () => new Date()): Promise<Read> {
  const args = ["issue", "view", address, "--json", "comments"];
  const rendered = await launch(settings, args);
  const a = now().toISOString();
  const { erreur: error } = rendered;
  if (error !== null) return { a, sans: failure(settings, args, { ...rendered, erreur: error }) };
  const comments = commentsOf(rendered.sortie);
  if (typeof comments === "string") return { a, sans: `$ ${settings.gh} ${args.join(" ")} — ${comments}` };
  const question = questionOf(comments);
  return question === undefined ? { a, aucune: true } : { a, question };
}

// Ce que le chef répond, lu tel que la vue l'envoie — ou pourquoi rien ne part.
function answerOf(answer: unknown): Answer | { refus: string } {
  const { question, choix: choice, texte: text, vu: seenOne } = (answer ?? {}) as Record<string, unknown>;
  if (typeof question !== "string" || question === "") return { refus: "nothing was posted: the view did not say which question it answers" };
  const already = typeof seenOne === "string" && seenOne !== "" ? { vu: seenOne } : {};
  if (typeof choice === "string" && choice !== "") return { question, ...already, choix: choice };
  if (typeof text === "string") return text.trim() === "" ? { refus: "nothing was posted: the answer is empty — choose, or write a sentence" } : { question, ...already, texte: text.trim() };
  return { refus: "nothing was posted: the view sent neither a choice nor a sentence" };
}

// Ce qui a été écrit sous la question après ce que le chef a vu (`vu`) : tout, s'il n'a rien vu —
// ou si ce qu'il a vu n'y est plus.
function newOf(question: Question, seenOne: string | undefined): Written[] {
  const rank = seenOne === undefined ? -1 : question.depuis.findIndex(({ url }) => url === seenOne);
  return question.depuis.slice(rank + 1);
}

// Répond à la question de l'issue à cette adresse : relue d'abord — ce qui part répond à la
// question que le chef a lue, et à elle seule, telle qu'il l'a lue : rien n'a été écrit dessous
// depuis (#503) —, puis le commentaire, par `gh issue comment`.
export async function reply(settings: Settings, address: string, sent: unknown): Promise<Rendered> {
  const answer = answerOf(sent);
  if ("refus" in answer) return { poste: false, refus: answer.refus };
  const readEntry = await readQuestion(settings, address);
  if ("sans" in readEntry) return { poste: false, refus: `nothing was posted: the issue was not read again before writing — ${readEntry.sans}`, lue: readEntry };
  if (!("question" in readEntry) || readEntry.question.url !== answer.question) return { poste: false, refus: "nothing was posted: the question on the issue is no longer the one you read — here it is as it stands", lue: readEntry };
  // Répondue ailleurs pendant que le chef lisait — sur GitHub, par le second — : il le lit avant que rien ne parte.
  const newOnes = newOf(readEntry.question, answer.vu);
  const answeredOne = readEntry.question.repondue;
  if (answeredOne !== undefined && newOnes.includes(answeredOne)) return { poste: false, refus: `nothing was posted: ${answeredOne.auteur} answered the question on the issue since you read it — here is what was written; post yours only if it adds something`, lue: readEntry };
  if (newOnes.length > 0) return { poste: false, refus: "nothing was posted: something was written under the question on the issue since you read it — here it is; post again if your answer still stands", lue: readEntry };
  let body: string;
  if ("choix" in answer) {
    const chosen = readEntry.question.choix.find(({ lettre: letter }) => letter === answer.choix);
    if (chosen === undefined) return { poste: false, refus: `nothing was posted: the question offers no choice “${answer.choix}”`, lue: readEntry };
    body = bodyOfChoice(chosen);
  } else body = answer.texte;
  const args = ["issue", "comment", address, "--body-file", "-"];
  const rendered = await launch(settings, args, body);
  const { erreur: error } = rendered;
  if (error !== null) return { poste: false, refus: `nothing was posted — ${failure(settings, args, { ...rendered, erreur: error })}` };
  const saidOne = rendered.sortie.trim().split("\n").at(-1) ?? "";
  return { poste: true, corps: body, ...(URL.parse(saidOne)?.protocol === "https:" ? { adresse: saidOne } : {}) };
}

// Le titre d'une issue, lu par le `gh` du poste : ce que la box ne donne pas pour un ticket qui
// n'est pas sur son rail, et que le chef ne devrait pas avoir à aller chercher sur GitHub.
export type Title = { titre: string } | { sans: string };
export async function titleOf(settings: Settings, address: string): Promise<Title> {
  const args = ["issue", "view", address, "--json", "title"];
  const rendered = await launch(settings, args);
  const { erreur: error } = rendered;
  if (error !== null) return { sans: failure(settings, args, { ...rendered, erreur: error }) };
  let title: unknown;
  try {
    title = (JSON.parse(rendered.sortie) as { title?: unknown } | null)?.title;
  } catch {
    return { sans: `$ ${settings.gh} ${args.join(" ")} — its output is not JSON` };
  }
  return typeof title === "string" && title.trim() !== "" ? { titre: title.trim() } : { sans: `$ ${settings.gh} ${args.join(" ")} — its output has no \`title\`` };
}

// La question en une ou deux lignes, prise dans les mots du manager : la première ligne qui pose
// une question (`?`), sinon les deux premières lignes écrites — chacune rognée, jamais reformulée.
const LINE_MAX = 160;
const trim = (line: string) => (line.length > LINE_MAX ? `${line.slice(0, LINE_MAX - 1).trimEnd()}…` : line);
export function resumeOf(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[ \t]*(?:#+|>|[-*+])?[ \t]*/, "").replace(/\*\*|__/g, "").trim())
    .filter((line) => line !== "" && !/^_.*_$/.test(line));
  const setOne = lines.find((line) => line.includes("?"));
  return (setOne === undefined ? lines.slice(0, 2) : [setOne]).map(trim).join("\n");
}

