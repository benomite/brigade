// La carte « Validate its screen » (ticket 3185, épique 3180) : la livraison design verte que la pass retient pour le chef
// (ticket 3184, runtime/src/validation-design/). Le runtime la pose en issue au label `chef-todo` :
//   - son commentaire de carte (`<!-- brigade:todo kind=design-validation -->`) dit la question et le lien de la PR — l'app
//     le lit comme toute carte du chef (board/todo-github.ts) ;
//   - son corps commence par `<!-- brigade:validation-design pr=<PR> ticket=<ticket> sha=<sha> -->`, puis porte la question,
//     le lien de la PR et, écran par écran, les captures avant et après en images, au commit que la pass a jugé vert.
// Ce module lit le corps (`validationDuCorps`) : la PR, son adresse, et les captures, chacune par son adresse sur GitHub —
// seulement celles du dépôt du projet, au commit de la carte, dans `docs/captures/<ticket>/`. Puis il joue les deux gestes
// du chef par la commande du runtime (`npm --prefix runtime run design`, runtime/src/validation-design/commande.ts), que le
// process principal importe et joue dans le sien (`jouerLaValidation`) : `validate <owner>/<repo>#<PR>` merge la PR et
// ferme la carte ; `send-back <owner>/<repo>#<PR> --comment <…>` renvoie la livraison à un cook avec le commentaire, et
// ferme la carte. La carte quitte TODO à la lecture suivante : l'issue est fermée.
// Le téléphone ne porte pas le runtime : la WebView ne charge pas ce que sa commande importe. Il joue les deux mêmes gestes
// sur l'API de GitHub, avec le jeton de son coffre (`validerSurGithub`, actions-github-phone.ts) : les mêmes lectures,
// les mêmes contrôles et les mêmes écritures que `valider` et `renvoyerLeDesign` (runtime/src/validation-design/
// validation-design.ts), à la lettre — le test (app/test/validation-design/) les joue tous deux sur le même GitHub.
import { capturesOfCard, readAddress, type CapturesOfCard, type CapturesRead } from "../../captures.ts";
import type { MethodOfWriting } from "../../priority.ts";
import { refusalOf, type CallGitHub, type AnswerGitHub } from "../../board/client.ts";
import { LABEL_OF_CHEF } from "../../board/todo-github.ts";
import { tellThePrByItsTicket } from "../pr-of-ticket.js";

// La sorte de la carte, telle que le runtime l'écrit (runtime/src/validation-design/validation-design.ts, `SORTE_DE_CARTE`).
export const KIND_OF_VALIDATION = "design-validation";

// Ce que la carte valide : sa PR et son adresse, le ticket livré, la tête jugée verte, les captures de chaque écran, et son brief.
export type ValidationDesign = { pr: number; ticket: number; sha: string; url: string; captures: CapturesRead; brief?: BriefOfValidation };
// Le brief (ticket 3330) : ce que le ticket demandait, en deux lignes au plus, et ce que le cook a changé à l'écran, un point
// par ligne — nul quand la carte n'en porte aucun. Le runtime l'écrit dans le corps de la carte, avant ses captures
// (runtime/src/validation-design/brief.ts, `lignesDuBrief`) ; une carte posée avant ce ticket ne dit que son titre de ticket.
export type BriefOfValidation = { demande: string; fait: string[] | null };
export const POINTS_MAX = 5;

const TITLE_REQUEST = "### What was asked";
const TITLE_DONE = "### What was done";
const TICKET_OF_THE_CARD = /^Ticket: #[1-9][0-9]* — (.+)$/;

// Le brief que le corps de la carte porte : chaque partie va de son titre au titre suivant. Sans « What was asked », le
// titre du ticket que la carte nomme ; sans point sous « What was done », aucun résumé.
export function briefOfBody(body: string): BriefOfValidation {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const part = (title: string) => {
    const start = lines.findIndex((line) => line.trim() === title);
    if (start === -1) return null;
    const end = lines.findIndex((line, rank) => rank > start && line.startsWith("### "));
    return lines.slice(start + 1, end === -1 ? undefined : end);
  };
  const aFlat = (text: string) => text.replace(/\s+/g, " ").trim();
  const requested = part(TITLE_REQUEST);
  const title = lines.map((line) => TICKET_OF_THE_CARD.exec(line.trim())?.[1]).find((readOne) => readOne !== undefined);
  const request = requested === null ? aFlat(title ?? "") : aFlat(requested.join(" "));
  const points = (part(TITLE_DONE) ?? []).filter((line) => line.startsWith("- ")).map((line) => aFlat(line.slice(2))).filter((point) => point !== "");
  return { demande: request, fait: points.length === 0 ? null : points.slice(0, POINTS_MAX) };
}

// Le marqueur du corps de la carte, ou celui de la validation demandée sur le ticket même, en tête de son commentaire
// (ticket 3615, runtime/src/validation-sur-ticket/) : `<!-- brigade:todo kind=design-validation pr=… ticket=… sha=… -->`.
const BRAND = /^\s*<!-- brigade:(?:validation-design|todo kind=design-validation) pr=([1-9][0-9]*) ticket=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->/;
const IMAGE = /!\[[^\]]*\]\((https:\/\/github\.com\/[^)\s]+)\)/g;
// Le nom d'une capture, comme le runtime l'apparie (runtime/src/captures.ts, `capturesLivrees`) : `<écran>-avant.png`,
// `<écran>-apres.png`, sans égard à la casse ni aux accents.
const MOMENT = /^(.*?)[-_. ]*(avant|apres)$/;
const withoutAccents = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// La carte que le corps de l'issue porte, pour le projet de `depot` — nulle si son marqueur n'y est pas. Une image qui
// n'est pas une capture du ticket, sur ce dépôt et à ce commit, n'est pas lue : la vue ne demande que celles-là.
export function validationOfBody(repository: string, body: string): ValidationDesign | null {
  const readOne = BRAND.exec(body);
  if (readOne === null) return null;
  const [, pr, ticket, sha] = readOne as unknown as [string, string, string, string];
  const folder = `docs/captures/${ticket}/`;
  const screens = new Map<string, { ecran: string; avant: string | null; apres: string | null }>();
  for (const [, address] of body.matchAll(IMAGE)) {
    const readEntry = address === undefined ? undefined : readAddress(address);
    if (address === undefined || readEntry === undefined || readEntry.depot.toLowerCase() !== repository.toLowerCase() || readEntry.sha !== sha || !readEntry.chemin.startsWith(folder)) continue;
    const name = readEntry.chemin.slice(folder.length);
    if (name.includes("/") || !/\.png$/i.test(name)) continue;
    const [, screen = "", moment] = MOMENT.exec(withoutAccents(name.slice(0, -".png".length))) ?? [];
    if (moment !== "avant" && moment !== "apres") continue;
    const itsOwn = screens.get(screen) ?? { ecran: name.slice(0, screen.length), avant: null, apres: null };
    itsOwn[moment] ??= address;
    screens.set(screen, itsOwn);
  }
  const readOnes = [...screens.values()];
  return {
    pr: Number(pr),
    ticket: Number(ticket),
    sha,
    url: `https://github.com/${repository}/pull/${pr}`,
    captures: { complet: readOnes.length > 0 && readOnes.every(({ avant: before, apres: after }) => before !== null && after !== null), ecrans: readOnes },
    brief: briefOfBody(body),
  };
}

// Les captures que la carte pose. Une carte dont le corps ne montre aucune capture lisible le dit en une ligne, et au
// survol ce que l'app y cherche : la vue n'a sinon rien à montrer, et le chef ne saurait pas pourquoi.
export const WITHOUT_CAPTURE = "no screenshot could be read on this card — open its pull request to see the screen";
export function capturesOfTheValidation({ ticket, sha, captures }: ValidationDesign): CapturesOfCard {
  if (captures.ecrans.length > 0) return capturesOfCard(captures);
  return { ecrans: [], incomplete: { ligne: WITHOUT_CAPTURE, detail: `the app shows only the images of docs/captures/${ticket}/ on the project's repository at \`${sha.slice(0, 7)}\`, the head the pass judged green, and the card's issue shows none` } };
}

// La même carte relue des faits (facts.ts, `chefLu`) — ou rien, si elle n'en a pas la forme.
export function validationRead(raw: unknown): ValidationDesign | undefined {
  const readOne = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : undefined;
  const whole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  const captures = typeof readOne?.captures === "object" && readOne.captures !== null ? (readOne.captures as Record<string, unknown>) : undefined;
  if (readOne === undefined || !whole(readOne.pr) || !whole(readOne.ticket) || typeof readOne.sha !== "string" || typeof readOne.url !== "string" || captures === undefined) return undefined;
  if (typeof captures.complet !== "boolean" || !Array.isArray(captures.ecrans)) return undefined;
  const address = (value: unknown): value is string | null => value === null || typeof value === "string";
  const screens = (captures.ecrans as unknown[]).flatMap((oneOf) => {
    const e = typeof oneOf === "object" && oneOf !== null ? (oneOf as Record<string, unknown>) : {};
    return typeof e.ecran === "string" && address(e.avant) && address(e.apres) ? [{ ecran: e.ecran, avant: e.avant, apres: e.apres }] : [];
  });
  const brief = briefRead(readOne.brief);
  return { pr: readOne.pr, ticket: readOne.ticket, sha: readOne.sha, url: readOne.url, captures: { complet: captures.complet, ecrans: screens }, ...(brief === undefined ? {} : { brief }) };
}

// Le brief relu des faits — ou rien, s'il n'en a pas la forme.
function briefRead(raw: unknown): BriefOfValidation | undefined {
  const readOne = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : undefined;
  if (readOne === undefined || typeof readOne.demande !== "string") return undefined;
  if (readOne.fait === null) return { demande: readOne.demande, fait: null };
  if (!Array.isArray(readOne.fait) || readOne.fait.length === 0 || !readOne.fait.every((point) => typeof point === "string")) return undefined;
  return { demande: readOne.demande, fait: (readOne.fait as string[]).slice(0, POINTS_MAX) };
}

// ── Les deux gestes ──

// Ce que la vue envoie : valider, ou renvoyer en cuisine avec le commentaire du chef.
export type ActionOfValidation = { geste: "valider" } | { geste: "renvoyer"; commentaire: string };
// Ce qu'il en est advenu : fait — ce que le runtime en dit —, ou rien n'est fait, et pourquoi en une ligne, le détail au survol.
export type RenderedOfValidation = { fait: string } | { refus: string; detail: string };

// La commande du runtime, telle que le process principal l'importe (runtime/src/validation-design/commande.ts, `principal`) :
// elle dit ce qu'elle a fait par `dire`, un refus par `redire`, et lève sa sortie — une `Sortie` (runtime/src/appel.ts), que
// `estUneSortie` reconnaît : celle du runtime même que le process principal a chargé.
export type CommandOfRuntime = (call: { args: string[]; env: Record<string, string | undefined>; dire: (line: string) => void; redire: (line: string) => void }) => Promise<void>;
export type CommandLoaded = { principal: CommandOfRuntime; estUneSortie: (error: unknown) => error is { code: number } };

export const EMPTY = "nothing was sent: the comment says what to change — write it first";
export const UNKNOWN = "nothing was sent: this card is not in the latest reading — it was answered elsewhere, or it left TODO";

const withoutPrefix = (line: string) => line.replace(/^brigade : /, "").split("\n")[0]?.trim() ?? "";
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Le geste que la vue envoie, contrôlé : rien ne part sans la carte, ni pour un renvoi sans commentaire.
type ActionRead = { geste: "valider" } | { geste: "renvoyer"; commentaire: string };
function actionRead(design: ValidationDesign | undefined, action: unknown): ActionRead | { refus: string; detail: string } {
  if (design === undefined) return { refus: UNKNOWN, detail: "" };
  const readOne = typeof action === "object" && action !== null ? (action as Record<string, unknown>) : {};
  if (readOne.geste === "valider") return { geste: "valider" };
  if (readOne.geste !== "renvoyer") return { refus: "nothing was sent: the app does not know this gesture", detail: String(readOne.geste) };
  const comment = typeof readOne.commentaire === "string" ? readOne.commentaire.trim().replace(/\r\n?/g, "\n") : "";
  return comment === "" ? { refus: EMPTY, detail: "" } : { geste: "renvoyer", commentaire: comment };
}

// Le geste du chef sur la carte `design` du projet de `depot`, joué par la commande du runtime : ses arguments, puis ce
// qu'elle a dit. Une commande qui refuse dit pourquoi, la carte reste ; une commande qui ne se charge pas, ou lève autre
// chose que sa sortie, dit qu'elle n'a pas pu tourner, et son erreur au survol.
export async function playTheValidation({ depot: repository, design, geste: action, commande: command, env }: { depot: string; design: ValidationDesign | undefined; geste: unknown; commande: () => Promise<CommandLoaded>; env: Record<string, string | undefined> }): Promise<RenderedOfValidation> {
  const readOne = actionRead(design, action);
  if ("refus" in readOne || design === undefined) return "refus" in readOne ? readOne : { refus: UNKNOWN, detail: "" };
  const target = `${repository}#${design.pr}`;
  const args = readOne.geste === "valider" ? ["validate", target] : ["send-back", target, "--comment", readOne.commentaire];
  return playTheCommand({ args, commande: command, env, parDefaut: `${deliveryOf(design.ticket, design.pr)} ${readOne.geste === "valider" ? "validated" : "sent back"}`, livraison: design });
}

// Une commande du runtime que le process principal joue, avec ses arguments : ce qu'elle a dit en dernier — `parDefaut`, si
// elle n'a rien dit —, ou pourquoi rien n'est fait.
// `livraison` : la PR que la commande nomme par son numéro, dite par son ticket dans la ligne que la carte montre (ticket
// 3716) — le détail au survol reste mot pour mot ce que la commande a dit.
export async function playTheCommand({ args, commande: command, env, parDefaut: byDefault, livraison: delivery }: { args: string[]; commande: () => Promise<CommandLoaded>; env: Record<string, string | undefined>; parDefaut: string; livraison?: { ticket: number; pr: number } }): Promise<RenderedOfValidation> {
  const saidOne = (line: string) => (delivery === undefined ? line : tellThePrByItsTicket(line, delivery.ticket, delivery.pr));
  const saidOnes: string[] = [];
  const retold: string[] = [];
  let loaded: CommandLoaded | undefined;
  try {
    loaded = await command();
    await loaded.principal({ args, env, dire: (line) => void saidOnes.push(line), redire: (line) => void retold.push(line) });
  } catch (error) {
    if (loaded?.estUneSortie(error) !== true) return { refus: "nothing was done: the kitchen's command could not run", detail: message(error) };
    return { refus: saidOne(`nothing was done: ${withoutPrefix(retold[0] ?? `the command ended with code ${error.code}`)}`), detail: retold.join("\n") };
  }
  return { fait: saidOne(saidOnes.at(-1) ?? byDefault) };
}

// ── Les deux gestes sur le téléphone, sur l'API de GitHub ──

// Ce que le runtime écrit et lit, tel qu'il l'écrit (le test les compare aux siens) : les auteurs de confiance
// (runtime/src/alimenter.ts, `DE_CONFIANCE`), la marque d'un renvoi (runtime/src/qualite-github.ts, `MARQUE_DE_RENVOI`), le
// label d'une livraison à la pass (runtime/src/github-etat/etats.ts, `LABEL_IN_PASS`), la branche d'un ticket
// (runtime/src/brigade-github.ts, `brancheDuTicket`) et la trace qu'une carte laisse sur son ticket.
export const OF_TRUST: readonly string[] = ["OWNER", "MEMBER", "COLLABORATOR"];
export const BRAND_OF_SEND_BACK = "<!-- brigade:renvoi";
export const LABEL_IN_PASS = "in-pass";
export const branchOfTicket = (ticket: number) => `cook/${ticket}-github`;
// Une PR nommée pour le chef, son ticket d'abord (runtime : `livraisonDe`, ticket 3718).
const deliveryOf = (ticket: number, pr: number) => `the delivery of #${ticket} (PR ${pr})`;
// La même, en tête de phrase (runtime : `capitale`).
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const BRAND_OF_HELD = /^<!-- brigade:validation-design-carte carte=([1-9][0-9]*) pr=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->/;
// La validation demandée sur le ticket même (ticket 3615, runtime/src/validation-sur-ticket/) : la carte est le ticket.
const REQUEST = /^<!-- brigade:todo kind=design-validation pr=([1-9][0-9]*) ticket=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->/;

// Le client du téléphone : ses lectures, et ses écritures avec le même jeton (priority.ts, `clientDeLaPriorite`).
export type ClientOfTheValidation = { lire: CallGitHub; ecrire: (method: MethodOfWriting, path: string, body?: unknown) => Promise<AnswerGitHub> };

// Un refus de la règle — rien n'est fait, ou la carte est fermée et le dit — par opposition à GitHub qui ne répond pas.
class Refusal extends Error {}

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : {});
const string = (value: unknown): string => (typeof value === "string" ? value : "");

// Le geste du chef sur la carte `carte` du projet de `depot` — `design`, ce que la dernière lecture en porte —, joué sur
// l'API de GitHub. Ce qu'il fait, dit comme la commande du runtime le dit ; ou pourquoi rien n'est fait. Une écriture que
// GitHub refuse après une autre dit ce qui est déjà écrit : le geste se rejoue.
export async function validateOnGithub({ depot: repository, carte: card, design, geste: action, client }: { depot: string; carte: unknown; design: ValidationDesign | undefined; geste: unknown; client: ClientOfTheValidation }): Promise<RenderedOfValidation> {
  const readOne = actionRead(design, action);
  if ("refus" in readOne || design === undefined || typeof card !== "number") return "refus" in readOne ? readOne : { refus: UNKNOWN, detail: "" };
  const writtenOnes: string[] = [];
  const github = actionsOnTHEApi(repository, client, writtenOnes, design.ticket);
  const name = `${repository}: ${deliveryOf(design.ticket, design.pr)}`;
  try {
    if (readOne.geste === "valider") {
      const { ticket, enAttente: queued } = await validateTheCard(github, card, design);
      return { fait: queued ? `${name} validated: your validation is kept, card #${card} closed — the branch was updated since the card and is being checked again; the pass merges it once its head is green` : `${name} validated: merged, card #${card} closed — ticket #${ticket} is served` };
    }
    const { ticket, suivi: tracking } = await sendBackTheCard(github, card, design, readOne.commentaire);
    if (tracking !== undefined) return { fait: `${name} was already merged: your comment is the follow-up ticket #${tracking}, card #${card} closed` };
    return { fait: `${name} sent back: #${ticket} goes back to a cook with your comment, card #${card} closed — its next delivery comes back as a new card` };
  } catch (error) {
    if (error instanceof Refusal) return { refus: writtenOnes.length === 0 ? `nothing was done: ${error.message}` : error.message, detail: writtenOnes.length === 0 ? "" : `already written on GitHub: ${writtenOnes.join("; ")}` };
    if (writtenOnes.length === 0) return { refus: "nothing was done: GitHub did not take the gesture", detail: message(error) };
    return { refus: `GitHub stopped the gesture midway — already written: ${writtenOnes.join("; ")}; play it again`, detail: message(error) };
  }
}

// Ce que les deux gestes lisent et écrivent sur GitHub ; chaque écriture faite est notée dans `ecrits`. La PR y est dite
// par son ticket, `ticket` (ticket 3716) : ce que GitHub refuse arrive au chef.
function actionsOnTHEApi(repository: string, client: ClientOfTheValidation, writtenOnes: string[], ticket: number) {
  const read = async (path: string, what: string): Promise<unknown> => {
    const readOne = await client.lire(path);
    if (readOne.status !== 200) throw refusalOf(what, readOne);
    return readOne.data;
  };
  const write = async (method: MethodOfWriting, path: string, body: unknown, what: string, expected: readonly number[]): Promise<AnswerGitHub> => {
    const rendered = await client.ecrire(method, path, body);
    if (!expected.includes(rendered.status)) throw refusalOf(what, rendered);
    writtenOnes.push(what);
    return rendered;
  };
  return {
    issue: async (number: number) => object(await read(`/repos/${repository}/issues/${number}`, `the reading of #${number}`)),
    pr: async (number: number) => object(await read(`/repos/${repository}/pulls/${number}`, `the reading of ${deliveryOf(ticket, number)}`)),
    // Les commentaires de l'issue, page après page — dix au plus, comme toute liste que l'app lit.
    async commentaires(number: number): Promise<Array<{ body: string; association: string }>> {
      const all: Array<{ body: string; association: string }> = [];
      for (let page = 1; page <= 10; page++) {
        const readEntry = await read(`/repos/${repository}/issues/${number}/comments?per_page=100&page=${page}`, `the reading of the comments of #${number}`);
        if (!Array.isArray(readEntry)) throw new Error(`GitHub's answer for the comments of #${number} is not a list`);
        all.push(...readEntry.map(object).map((raw) => ({ body: string(raw.body), association: string(raw.author_association) || "NONE" })));
        if (readEntry.length < 100) break;
      }
      return all;
    },
    commenter: (number: number, body: string) => write("POST", `/repos/${repository}/issues/${number}/comments`, { body: body }, `a comment on #${number}`, [201]),
    // Une issue qui ne porte pas le label : rien à retirer.
    delabelliser: (number: number, label: string) => write("DELETE", `/repos/${repository}/issues/${number}/labels/${encodeURIComponent(label)}`, undefined, `\`${label}\` taken off #${number}`, [200, 404]),
    // Une issue neuve, sans label : son numéro.
    async creer(title: string, body: string): Promise<number> {
      const rendered = await write("POST", `/repos/${repository}/issues`, { title: title, body: body }, "a follow-up ticket", [201]);
      const number = object(rendered.data).number;
      if (typeof number !== "number") throw new Error("GitHub did not say the number of the follow-up ticket");
      return number;
    },
    fermer: (number: number) => write("PATCH", `/repos/${repository}/issues/${number}`, { state: "closed", state_reason: "completed" }, `#${number} closed`, [200]),
    // Le merge à la tête `sha` : un refus de GitHub (4xx) est une réponse — rien n'est mergé —, tout autre statut lève.
    async merger(number: number, sha: string): Promise<{ fait: true } | { fait: false; motif: string }> {
      const rendered = await client.ecrire("PUT", `/repos/${repository}/pulls/${number}/merge`, { sha, merge_method: "merge" });
      if (rendered.status === 200) {
        writtenOnes.push(`${deliveryOf(ticket, number)} merged`);
        return { fait: true };
      }
      if (rendered.status < 400 || rendered.status >= 500) throw refusalOf(`the merge of ${deliveryOf(ticket, number)}`, rendered);
      const said = string(object(rendered.data).message);
      return { fait: false, motif: `HTTP ${rendered.status}${said === "" ? "" : ` — ${said}`}` };
    },
  };
}
type GitHubOfTheValidation = ReturnType<typeof actionsOnTHEApi>;

// La carte, relue : encore ouverte, posée par un auteur de confiance, et portant la PR, le ticket et la tête que la
// dernière lecture en a lus — sinon elle ne tient plus cette livraison (runtime : `carteDuNumero`). La carte qui est le ticket
// même (ticket 3615) : ouverte tant qu'il porte `chef-todo`, sa dernière demande les porte.
async function cardWhoHolds(github: GitHubOfTheValidation, card: number, { pr, ticket, sha }: ValidationDesign): Promise<void> {
  const issue = await github.issue(card);
  const onTheTicket = card === ticket;
  const labels = Array.isArray(issue.labels) ? issue.labels.map((label) => string(object(label).name)) : [];
  const body = onTheTicket
    ? labels.includes(LABEL_OF_CHEF)
      ? ((await github.commentaires(card)).findLast((c) => OF_TRUST.includes(c.association) && REQUEST.test(c.body))?.body ?? "")
      : ""
    : OF_TRUST.includes(string(issue.author_association))
      ? string(issue.body)
      : "";
  const readOne = (onTheTicket ? REQUEST : BRAND).exec(body);
  if (issue.state !== "open" || readOne === null || Number(readOne[1]) !== pr || Number(readOne[2]) !== ticket || readOne[3] !== sha) throw new Refusal(`no open “Validate its screen” card answers to ${pr}: it is neither an open ticket nor the pull request of a held delivery`);
}

// La PR de la carte, relue : encore la livraison de son ticket, sur sa branche (runtime : `prDeLaCarte`).
async function prOfTheCard(github: GitHubOfTheValidation, { pr, ticket }: ValidationDesign): Promise<{ sha: string; state: string; merged: boolean }> {
  const readEntry = await github.pr(pr);
  const head = object(readEntry.head);
  if (head.ref !== branchOfTicket(ticket)) throw new Refusal(`${deliveryOf(ticket, pr)} is no longer on the branch of #${ticket}`);
  return { sha: string(head.sha), state: string(readEntry.state), merged: readEntry.merged === true || (readEntry.merged_at ?? null) !== null };
}

// La dernière trace de la carte sur le ticket, et si un renvoi la suit ; nulle si le ticket ne la dit pas (runtime :
// `derniereRetenue`).
function lastHeld(comments: ReadonlyArray<{ body: string; association: string }>, card: number): { renvoyee: boolean } | null {
  const sure = comments.filter((c) => OF_TRUST.includes(c.association));
  const rank = sure.findLastIndex((c) => Number(BRAND_OF_HELD.exec(c.body)?.[1]) === card || Number(REQUEST.exec(c.body)?.[2]) === card);
  return rank === -1 ? null : { renvoyee: sure.slice(rank + 1).some((c) => c.body.startsWith(BRAND_OF_SEND_BACK)) };
}

// Ferme une carte : un mot dessus, `chef-todo` retiré, l'issue fermée. La carte qui est le ticket même (ticket 3615) est
// seulement levée : `chef-todo` retiré, sans mot, le ticket laissé ouvert (runtime : `fermerLaCarte`).
async function closeTheCard(github: GitHubOfTheValidation, card: number, word: string, ticket: number): Promise<void> {
  if (card === ticket) {
    await github.delabelliser(card, LABEL_OF_CHEF);
    return;
  }
  await github.commenter(card, word);
  await github.delabelliser(card, LABEL_OF_CHEF);
  await github.fermer(card);
}

// Valider (runtime : `valider`) : merge la tête que la pass a jugée verte et que la carte porte, puis ferme la carte. La tête
// a bougé sans qu'un renvoi suive la carte — la branche mise à jour depuis sa base — : la validation s'écrit sur le ticket,
// la carte se ferme, et la pass merge la PR une fois sa tête verte (ticket 3332) — `enAttente`.
async function validateTheCard(github: GitHubOfTheValidation, card: number, design: ValidationDesign): Promise<{ ticket: number; enAttente: boolean }> {
  const { pr, ticket, sha } = design;
  await cardWhoHolds(github, card, design);
  const readEntry = await prOfTheCard(github, design);
  if (!readEntry.merged) {
    if (readEntry.state !== "open") throw new Refusal(`${deliveryOf(ticket, pr)} is closed without being merged: there is nothing to validate`);
    const retainedOne = lastHeld(await github.commentaires(ticket), card);
    if (retainedOne === null || retainedOne.renvoyee) {
      const why = retainedOne === null ? `ticket #${ticket} does not say card #${card}` : `${deliveryOf(ticket, pr)} went back to a cook since card #${card}`;
      await closeTheCard(github, card, `Closed by the kitchen: ${why}. Its next delivery comes back as a new card.`, ticket);
      throw new Refusal(`${why}: nothing merged, card #${card} closed — its next delivery comes back as a new card`);
    }
    if (readEntry.sha !== sha) {
      const of = `\`${sha.slice(0, 7)}\` → \`${readEntry.sha.slice(0, 7)}\``;
      await github.commenter(ticket, `<!-- brigade:validation-design-validee carte=${card} pr=${pr} sha=${sha} -->\nValidated by the chef on card #${card} — merge pending. The branch of ${deliveryOf(ticket, pr)} was updated since the card (${of}), with no new delivery of a cook: the answer is kept, and the pass merges it once it judges its head green, without a new card. Only a cook changing the delivery (a send-back to the kitchen) asks the chef again.`);
      await closeTheCard(github, card, `Validated by the chef: the answer is kept — merge pending. The branch of ${deliveryOf(ticket, pr)} was updated since this card (${of}) and is being checked again: the pass merges it once its head is green.`, ticket);
      return { ticket, enAttente: true };
    }
    const merge = await github.merger(pr, sha);
    if (!merge.fait) throw new Refusal(`GitHub refused to merge ${deliveryOf(ticket, pr)} — ${merge.motif}; card #${card} stays open`);
  }
  await closeTheCard(github, card, `Validated by the chef: ${deliveryOf(ticket, pr)} is merged.`, ticket);
  return { ticket, enAttente: false };
}

// Renvoyer (runtime : `renvoyerLeDesign`) : la livraison repart à un cook, le commentaire du chef comme ce qu'il faut
// changer — un renvoi sur sa tête, que le cook lit sur le ticket, et `in-pass` retiré —, puis la carte se ferme.
async function sendBackTheCard(github: GitHubOfTheValidation, card: number, design: ValidationDesign, aChange: string): Promise<{ ticket: number; suivi?: number }> {
  const { pr, ticket } = design;
  await cardWhoHolds(github, card, design);
  const readEntry = await prOfTheCard(github, design);
  if (readEntry.merged) {
    const tracking = await github.creer(`Follow-up of #${ticket}: the chef asks for changes after ${deliveryOf(ticket, pr)} was merged`, `${capital(deliveryOf(ticket, pr))} was merged before the chef validated it. The chef asks for these changes:\n\n${aChange}`);
    await closeTheCard(github, card, `${capital(deliveryOf(ticket, pr))} was already merged: the chef's comment is now #${tracking}.\n\n${aChange}`, ticket);
    return { ticket, suivi: tracking };
  }
  if (readEntry.state !== "open") throw new Refusal(`${deliveryOf(ticket, pr)} is no longer open: there is nothing to send back`);
  const sendBacks = (await github.commentaires(ticket)).filter((c) => OF_TRUST.includes(c.association) && c.body.startsWith(BRAND_OF_SEND_BACK));
  await github.commenter(ticket, `${BRAND_OF_SEND_BACK} n=${sendBacks.length + 1} sha=${readEntry.sha} -->\nSend-back reason: unmet criterion\n\nThe chef sent the design of ${deliveryOf(ticket, pr)} back to a cook — the chef asks for changes to the screen:\n\n${aChange}\n\nChange the screen as asked, take its before and after captures again, and deliver.`);
  await github.delabelliser(ticket, LABEL_IN_PASS);
  await closeTheCard(github, card, `Sent back to a cook by the chef: ${aChange}`, ticket);
  return { ticket };
}
