// Ce qui attend le chef, lu de GitHub seul (#2460) : le TODO de l'app et la file que le second relaie à son ouverture
// (second/file.ts) sont cette lecture, et elle seule — la même source, les mêmes entrées, le même bloc `awaiting`
// (rail.ts, `blocAwaiting`). Ni tableau de la cuisine, ni box, ni station : il suffit de joindre GitHub.
//
// La règle du chef (#2455) : une entrée de TODO est un fait de GitHub — un label, une PR qui attend le chef — et lui pose
// toujours une question. Sont lus, sur les issues ouvertes du dépôt :
//   - une issue au label `fire` que `served-elsewhere` met de côté (board/set-aside-github.ts, #2075, #2422), quand
//     elle demande quelque chose au chef : la question de produit d'un `served-elsewhere`, tant qu'aucune réponse ne la suit ;
//   - une issue au label `chef-todo` : la carte que son dernier commentaire marqué pose (board/todo-github.ts, #2217) ;
//     une carte dont la question ne se lit pas (pas de commentaire marqué, ou sans texte) n'est pas une entrée : elle est
//     dite au second, dans le bloc, avec pourquoi (`illisibles`) ;
//   - une issue que la nouvelle cuisine parque pour le chef (`parked:chef`, runtime/src/kitchen/, #4474) : sa carte pose le
//     dernier commentaire de la cuisine qui dit pourquoi, et se répond par Answer (board/parked-chef-github.ts) ;
//   - une épique ouverte (`epic`) dont la dernière parole du manager est une question avant de la découper, tant qu'aucune
//     réponse ne la suit : sa carte pose cette question, avec ses choix en boutons (board/question-of-epic-github.ts) ;
// Une issue au label `parked` attend quelqu'un d'autre que le chef : elle n'est jamais une entrée, quoi qu'elle porte
// d'autre (#3075, #4129) ; l'issue du tableau de la cuisine non plus.
//
// Ce qu'attend chaque issue au label `parked` de ces listes est lu aussi (#3075), et de la liste des issues au label
// `parked`, quand `enWaiting` le demande (#3814). Son dernier commentaire de parking (vue/wait/wait-github.ts,
// `tiersDesCommentaires`) dit ce que sa carte de WAITING montre, quoi, de qui, sa relance. Une issue qui n'est pas sur le
// rail (sans `fire`, une carte `chef-todo`) y est posée, dans WAITING : mise en attente depuis TODO, elle quitte TODO et
// se montre là. Cette lecture qui échoue ne fait pas tomber celle du chef : ses cartes de WAITING ne disent pas ce
// qu'elles attendent, et le bloc dit pourquoi (`illisibles`).
// Le bloc dit aussi chaque issue en WAITING dont l'attente se lit, une ligne chacune sous les entrées : ce qu'elle attend,
// de qui, et sa relance (#3814) — sans être une entrée : elle ne demande rien au chef. Elle se lit de la marque que la station,
// le second et l'app posent (vue/wait/wait-github.ts, `parquer`).
//
// Chaque entrée dit sa question puis son geste, sur sa ligne du bloc, et porte ce que la carte de TODO en fait (`chef`,
// `miseDeCote`) ; le bloc les range de la plus ancienne à la plus récente, et dit « nothing awaits the chef »
// quand il n'y en a aucune. Une lecture qui échoue n'est jamais « rien n'attend » : elle dit pourquoi.
import type { ExpectedOfOthers, Third } from "../facts.ts";
import type { Share } from "../vue/cards-assigned/cards-assigned.ts";
import type { CallGitHub } from "./client.ts";
import type { IssueParkedForTheChef, ReadOfBoardOfRepository, LineOfTheFile, BoardRead } from "./read.ts";
import { LABELS } from "../../../runtime/src/kitchen/decide.ts";
import { LABEL_OF_BOARD_OF_THE_KITCHEN, labelOfSetAside, setAsideOf, setAsideOn, recommendedOf, type SetAside } from "./set-aside-github.ts";
import { blockAwaiting } from "./rail.ts";
import { cardOfTheQuestionOfEpic, EPIC_LABEL, questionOfEpicThe } from "./question-of-epic-github.ts";
import { parkedChefCard, LABEL_PARKED_CHEF, whyParked, KIND_PARKED_CHEF } from "./parked-chef-github.ts";
import { cardOfComment, shapeOfChef, LABEL_OF_CHEF, type CardOfChef } from "./todo-github.ts";
import { thirdOfComments } from "../vue/wait/wait-github.ts";

const { ready: LABEL_FIRE, parked: LABEL_PARKED } = LABELS;
// Parqué (`parked`, #4129) : il attend quelqu'un d'autre que le chef — jamais une entrée, une carte du chef parquée pour un
// autre comprise. Parqué pour le chef, il ne porte que `chef-todo` : une entrée.
const awaitingOneOther = (labels: readonly string[]) => labels.includes(LABEL_PARKED);
// Les auteurs dont une marque se croit : qui a la main sur le dépôt.
const OF_TRUST = ["OWNER", "MEMBER", "COLLABORATOR"];
// La marque d'un commentaire de parking (vue/wait/wait-github.ts), ou `waiting`, d'avant #4129.
const BRAND_OF_PARKING = /^<!-- brigade:(?:parked|waiting) (\{.*?\}) -->/;
const BY_PAGE = 100;
const PAGES_AT_MOST = 10;
// Une entrée : son ticket, depuis quand elle attend, sa ligne — sa question, puis son geste —, et ce que sa carte de TODO
// en fait. `quoi` : d'où elle vient — une issue mise de côté, ou une carte.
export type WaitOfChef = {
  ticket: number;
  titre: string;
  url: string;
  depuis: string;
  quoi: "mise-de-cote" | "carte";
  ligne: string;
  chef?: CardOfChef;
  miseDeCote?: SetAside;
  // Les logins de ses assignés sur GitHub, quand elle en a : qui elle attend, à la place du chef (vue/cards-assigned/, #2761).
  assignes?: string[];
};
// Une issue au label `parked` : son ticket, et ce qu'elle attend d'un tiers — nul quand son commentaire ne se lit pas.
export type InWaiting = { ticket: number; titre: string; url: string; tiers: Third | null };
// Ce que la lecture rend : les entrées et l'heure de la lecture — ou pourquoi rien ne se lit. `horsLigne` : GitHub n'a
// pas été joint du tout. `enWaiting` : les issues au label `parked`. `illisibles` : les lignes du bloc qui ne sont pas des
// entrées — ce qui ne se lit pas, et chaque issue en WAITING avec ce qu'elle attend (#3814).
export type WaitRead = { lue: true; lu: string; attentes: WaitOfChef[]; illisibles: string[]; enWaiting: InWaiting[] } | { lue: false; raison: string; horsLigne?: true };

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null);
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.flatMap((oneOf: unknown) => { const o = object(oneOf); return o === null ? [] : [o]; }) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const date = (value: unknown): string | null => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null);
const labelsOf = (issue: Raw): string[] => list(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));

// Ce qu'une issue parquée attend, d'après son dernier commentaire de parking : la marque `<!-- brigade:parked … -->` (ou
// `waiting`, d'avant #4129) que la station, le second et l'app posent, d'un auteur du dépôt, ou le commentaire de l'app
// d'avant. `rentre` : parquée jusqu'à une date, elle reprend seule où elle était à cette date.
// Null sans aucun qui se lise : rien n'est inventé.
function waitOfTheIssue(comments: readonly Raw[]): { quoi: string; qui: string; relance: string | null; rentre: boolean } | null {
  for (const comment of [...comments].reverse()) {
    const raw = OF_TRUST.includes(text(comment.author_association)) ? BRAND_OF_PARKING.exec(text(comment.body))?.[1] : undefined;
    if (raw !== undefined) {
      try {
        const { what, who, followUp, fact } = object(JSON.parse(raw)) ?? {};
        // Parqué jusqu'à une date, il reprend seul à cette date (#4129) ; jusqu'à un fait, il attend qu'on le dise arrivé.
        if (typeof what === "string" && typeof who === "string" && date(followUp) !== null) return { quoi: what, qui: who, relance: followUp as string, rentre: typeof fact !== "string" };
      } catch {
        // Une marque illisible ne dit rien : la précédente, s'il y en a une.
      }
      continue;
    }
    const third = thirdOfComments([comment]);
    if (third !== null) return { quoi: third.quoi, qui: third.qui, relance: third.relance, rentre: false };
  }
  return null;
}

// La ligne du bloc d'une issue en WAITING : ce qu'elle attend, de qui, sa relance — la date avec son année.
const relaunchSaid = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
// Une issue en WAITING dont aucun commentaire ne dit l'attente n'a pas de ligne : rien à montrer, comme avant.
function lineInWaiting(ticket: number, title: string, wait: NonNullable<ReturnType<typeof waitOfTheIssue>>): string {
  const relaunch = wait.relance === null ? "" : ` — ${wait.rentre ? "resumes where it was on its own on" : "follow-up on"} ${relaunchSaid(new Date(wait.relance).toISOString())}`;
  return `#${ticket}  WAITING  awaiting ${wait.qui}: “${wait.quoi}”${relaunch} — it does not await you${title === "" ? "" : `  ${title}`}`;
}

class Refusal extends Error {}
class OutsideLine extends Error {}

// La ligne d'une carte du chef : sa question, puis comment y répondre — un choix de la carte, ou ses propres mots.
function lineOfTheCard({ sorte: kind, texte: said }: CardOfChef): string {
  const { question, choix: choice } = shapeOfChef(said);
  if (kind === KIND_PARKED_CHEF && question !== null && choice.length > 0) return `${question} — on its Todo card: ${choice.map(({ texte: wording }) => `“${wording}”`).join(" or ")} — or answer in your own words`;
  if (kind === KIND_PARKED_CHEF && question !== null) return `${question} — on its Todo card: Answer, in your own words — the ticket goes back on the rail`;
  const reply = choice.length === 0 ? "answer on its Todo card, in your own words" : `answer on its Todo card: ${choice.map(({ texte: wording }) => `“${wording}”`).join(" or ")} — or in your own words`;
  return `${question ?? `A ${kind} card without its question: what does it ask you?`} — ${reply}`;
}

// Ce qui attend le chef dans `depot`, lu de GitHub. `appeler` : le `GET` de l'API — celui de l'app (sous condition, un 304
// ne coûte rien) ou le `gh` du poste, pour le second. `maintenant` : l'heure de la lecture, jusqu'à laquelle les durées
// du bloc se comptent.
// `enWaiting` : lire aussi ce qu'attend chaque issue en WAITING — ce que le rail de l'app montre, et les lignes de WAITING
// du bloc (#3814) ; les notifications ne s'en servent pas, et ne paient pas sa lecture. `true` lit aussi la liste des
// issues au label `parked` : le second, qui lit la file une fois par session, y voit chaque ticket parqué et sa
// relance. `"du-rail"` s'en tient aux issues parquées des listes déjà lues — un ticket que la cuisine parque
// garde `fire` —, pour l'app, qui relit chaque projet toutes les trente secondes sous son budget GitHub (budget-github.ts).
// `parqueesPourLeChef` : les issues `parked:chef` que la lecture du rail a tirées de sa liste des issues ouvertes (#4474) —
// sans elles, la liste du label est lue.
// `newKitchen` : le projet est sur la nouvelle cuisine (#4482) — seules ses issues `parked:chef` l'attendent : aucune liste des
// labels du runtime d'avant n'est lue.
export async function readWhatAwaitingTheChef(options: { depot: string; appeler: CallGitHub; maintenant?: () => Date; enWaiting?: boolean | "du-rail"; parqueesPourLeChef?: readonly IssueParkedForTheChef[]; newKitchen?: boolean }): Promise<WaitRead> {
  const { depot: repository, appeler: call } = options;
  const read = async (path: string): Promise<unknown> => {
    const answer = await call(path).catch((error: unknown) => {
      throw new OutsideLine(error instanceof Error ? error.message : String(error));
    });
    if (answer.status !== 200) throw new Refusal(`GitHub answered HTTP ${answer.status} on ${path.split("?")[0]}`);
    return answer.data;
  };
  // Une liste, page après page, jusqu'à une page qui n'est pas pleine.
  const pages = async (path: string): Promise<Raw[]> => {
    const allEntries: Raw[] = [];
    for (let page = 1; page <= PAGES_AT_MOST; page++) {
      const readEntry = list(await read(`${path}${path.includes("?") ? "&" : "?"}per_page=${BY_PAGE}&page=${page}`));
      allEntries.push(...readEntry);
      if (readEntry.length < BY_PAGE) break;
    }
    return allEntries;
  };
  // Les issues ouvertes qui portent `label` — la vérification tient même d'une réponse que GitHub n'aurait pas filtrée.
  // Une PR de fork porte sa carte `chef-todo` elle-même : seule cette liste la garde.
  const issuesAtLabel = async (label: string) =>
    (await pages(`/repos/${repository}/issues?state=open&labels=${label}&sort=created&direction=asc`)).filter((issue) => {
      const labels = labelsOf(issue);
      return (issue.pull_request === undefined || label === LABEL_OF_CHEF) && typeof issue.number === "number" && labels.includes(label) && !labels.includes(LABEL_OF_BOARD_OF_THE_KITCHEN);
    });
  const queued = (issue: Raw) => awaitingOneOther(labelsOf(issue));
  const comments = (number: number) => pages(`/repos/${repository}/issues/${number}/comments`);
  const entry = (issue: Raw) => {
    const assignes = list(issue.assignees).flatMap(({ login }) => (typeof login === "string" ? [login] : []));
    return { ticket: issue.number as number, titre: text(issue.title), url: text(issue.html_url) || `https://github.com/${repository}/issues/${issue.number}`, ...(assignes.length === 0 ? {} : { assignes }) };
  };
  const created = (issue: Raw) => date(issue.created_at) ?? new Date(0).toISOString();

  try {
    const readOne = (options.maintenant ?? (() => new Date()))().toISOString();
    const waits: WaitOfChef[] = [];
    const saidOnes = new Set<number>();
    const unreadable: string[] = [];
    const set = (wait: WaitOfChef) => {
      if (saidOnes.has(wait.ticket)) return;
      saidOnes.add(wait.ticket);
      waits.push(wait);
    };
    // Les listes d'abord, puis ce que chaque issue en dit — chaque fois toutes à la fois : le `gh` du second paie chaque
    // lecture d'un processus, et son crochet a peu de temps.
    // Les issues `parked:chef` que la lecture du rail a déjà listées ne se relisent pas (le budget GitHub de l'app, budget-github.ts).
    const alreadyListed = options.parqueesPourLeChef?.map(({ ticket, titre: title, url, creee: created, labels, assignes }): Raw => ({ number: ticket, title: title, html_url: url, created_at: created, labels: labels.map((name) => ({ name })), assignees: (assignes ?? []).map((login) => ({ login })) }));
    const ofRuntimeOfBefore = (label: string) => (options.newKitchen === true ? Promise.resolve([]) : issuesAtLabel(label));
    const lists = await Promise.all([ofRuntimeOfBefore(LABEL_FIRE), ofRuntimeOfBefore(LABEL_OF_CHEF), alreadyListed ?? issuesAtLabel(LABEL_PARKED_CHEF)]);
    // Une issue en WAITING n'attend pas le chef : elle n'est l'entrée d'aucun label.
    const [atFire, atChef, parkedForTheChef] = lists.map((issues) => issues.filter((issue) => !queued(issue)));
    const putOfSide = await Promise.all(
      (atFire ?? []).flatMap((issue) => {
        const label = labelOfSetAside(labelsOf(issue));
        return label === null ? [] : [comments(issue.number as number).then((readOnes) => ({ issue, label, lus: readOnes }))];
      }),
    );
    const cards = await Promise.all((atChef ?? []).map((issue) => comments(issue.number as number).then((readOnes) => ({ issue, lus: readOnes }))));
    // Les épiques du rail, déjà lues avec `fire` : aucune lecture de plus (le budget GitHub de l'app, budget-github.ts).
    const epics = (atFire ?? []).filter((issue) => labelsOf(issue).includes(EPIC_LABEL));
    const parked = await Promise.all((parkedForTheChef ?? []).map((issue) => comments(issue.number as number).then((readOnes) => ({ issue, lus: readOnes }))));
    const epicsRead = await Promise.all(epics.map((issue) => comments(issue.number as number).then((readOnes) => ({ issue, lus: readOnes }))));
    // Les tickets du rail mis de côté qui demandent quelque chose au chef : la question de produit qu'ils posent.
    for (const { issue, label, lus: readOnes } of putOfSide) {
      const setAside = setAsideOf(repository, label, readOnes, issue.number as number);
      if (setAside.chef === undefined) continue;
      set({ ...entry(issue), depuis: setAsideOn(label, readOnes) ?? created(issue), quoi: "mise-de-cote", ligne: lineOfTheCard(setAside.chef), miseDeCote: setAside, chef: setAside.chef });
    }
    // Les cartes `chef-todo` : celle du dernier commentaire marqué.
    for (const { issue, lus: readOnes } of cards) {
      const brand = readOnes
        .flatMap((comment) => {
          const card = cardOfComment(text(comment.body));
          return card === null ? [] : [{ carte: card, le: date(comment.created_at) }];
        })
        .at(-1);
      const { ticket } = entry(issue);
      if (brand === undefined || shapeOfChef(brand.carte.texte).question === null) {
        const why = brand === undefined ? "no comment marked `<!-- brigade:todo kind=… -->` says what it asks" : "its marked card has no text: nothing is asked";
        unreadable.push(`#${ticket} carries \`${LABEL_OF_CHEF}\` but is not shown in Todo: ${why} — write the question on the ticket (the chef sees it once it is written), or take the label off if it is technical`);
        continue;
      }
      // La carte d'une question du manager, qui parque l'issue pour le chef (#4129) : la réponse qu'il recommande, comme sur
      // un écart (#3434) — sa ligne `Recommended:` quitte le texte. Sans elle, la carte est comme toute autre.
      const shape = shapeOfChef(brand.carte.texte.replace(/\*\*/g, ""));
      const recommended = recommendedOf(shape.contexte, shape.choix);
      const textOfTheCard = recommended === null ? brand.carte.texte : [shape.question ?? "", ...shape.choix.map(({ texte: wording, suite }) => `- [${suite}] ${wording}`), ...(recommended.contexte === "" ? [] : ["", recommended.contexte])].join("\n");
      const chef = { ...brand.carte, texte: textOfTheCard, ...(recommended === null ? {} : { recommandee: recommended.recommandee }) };
      set({ ...entry(issue), depuis: brand.le ?? created(issue), quoi: "carte", ligne: lineOfTheCard(brand.carte), chef });
    }
    // Les issues que la nouvelle cuisine parque pour le chef, si aucune carte ne les dit déjà : depuis son commentaire.
    for (const { issue, lus: readOnes } of parked) {
      if (saidOnes.has(issue.number as number)) continue;
      const chef = parkedChefCard(readOnes);
      set({ ...entry(issue), depuis: whyParked(readOnes)?.le ?? created(issue), quoi: "carte", ligne: lineOfTheCard(chef), chef });
    }
    // Les épiques dont le manager attend la réponse du chef avant de les découper, si aucune carte ne les dit déjà.
    for (const { issue, lus: readOnes } of epicsRead) {
      if (saidOnes.has(issue.number as number)) continue;
      const chef = cardOfTheQuestionOfEpic(readOnes);
      if (chef !== null) set({ ...entry(issue), depuis: questionOfEpicThe(readOnes) ?? created(issue), quoi: "carte", ligne: lineOfTheCard(chef), chef });
    }
    // La plus ancienne d'abord, comme le bloc de la box.
    const instant = (iso: string) => Date.parse(iso);
    waits.sort((a, b) => instant(a.depuis) - instant(b.depuis) || a.ticket - b.ticket);
    // Ce qu'attend chaque issue parquée : une lecture qui échoue le dit au bloc, et laisse ses cartes sans ce qu'elles
    // attendent — jamais l'attente du chef tombée avec elle.
    // Avec `enWaiting`, la liste des issues au label `parked` aussi : une issue parquée que rien d'autre ne liste a sa
    // ligne dans le bloc (#3814).
    // Cette liste qui ne se lit pas ne fait pas tomber la lecture du chef : le bloc le dit, et s'en tient aux autres listes.
    const atWaiting =
      options.enWaiting === true
        ? await issuesAtLabel(LABEL_PARKED).catch((error: unknown) => {
            unreadable.push(`the \`${LABEL_PARKED}\` issues were not listed from GitHub: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]?.replace(/[.\s]+$/, "") ?? ""} — only those on the rail or in Todo say what they wait for, until the next reading`);
            return [];
          })
        : [];
    const pendingOnes = [...new Map([...lists.flat(), ...atWaiting].filter(queued).map((issue) => [issue.number as number, issue])).values()].sort((a, b) => (a.number as number) - (b.number as number));
    // Une issue dont les commentaires ne se lisent pas garde sa carte, sans ce qu'elle attend ; le bloc dit pourquoi, une fois.
    let rate: string | undefined;
    const linesInWaiting: string[] = [];
    const inWaiting: InWaiting[] = await Promise.all(
      (!options.enWaiting ? [] : pendingOnes).map(async (issue) => {
        const { ticket, titre: title, url } = entry(issue);
        const readOnes = await comments(ticket).catch((error: unknown) => {
          rate ??= (error instanceof Error ? error.message : String(error)).split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
          return null;
        });
        const wait = readOnes === null ? null : waitOfTheIssue(readOnes);
        if (wait !== null) linesInWaiting[pendingOnes.indexOf(issue)] = lineInWaiting(ticket, title, wait);
        return { ticket, titre: title, url, tiers: readOnes === null ? null : thirdOfComments(readOnes) };
      }),
    );
    unreadable.push(...linesInWaiting.filter((line) => line !== undefined));
    if (rate !== undefined) unreadable.push(`what the \`${LABEL_PARKED}\` issues wait for was not read from GitHub: ${rate} — their WAITING cards do not say it until the next reading`);
    return { lue: true, lu: readOne, attentes: waits, illisibles: unreadable, enWaiting: inWaiting };
  } catch (error) {
    const said = (error instanceof Error ? error.message : String(error)).split("\n")[0]?.replace(/[.\s]+$/, "") ?? "";
    const reason = `What awaits the chef in ${repository} was not read from GitHub: ${said}.`;
    return error instanceof OutsideLine ? { lue: false, raison: reason, horsLigne: true } : { lue: false, raison: reason };
  }
}

// Les entrées comme lignes de la file, dans la forme que le bloc `awaiting` écrit (rail.ts, `blocAwaiting`).
export const fileOfChef = (waits: readonly WaitOfChef[]): LineOfTheFile[] =>
  waits.map(({ ticket, titre: title, depuis: since, quoi: what, ligne: line }) => ({ nom: `#${ticket}`, ticket, titre: title === "" ? null : title, quoi: what, depuis: since, ligne: line }));

// Le bloc `awaiting` de ce qui attend le chef, de sa tête à `end awaiting` : ce que le second relaie, et ce que le TODO
// de l'app lit.
export const blockOfChef = ({ lu: readOne, attentes: waits, illisibles: unreadable }: { lu: string; attentes: readonly WaitOfChef[]; illisibles: readonly string[] }): string[] =>
  blockAwaiting({ file: fileOfChef(waits), bilans: [...unreadable], lu: readOne });

// Le rail, avec ce qu'attend chaque issue en WAITING : rien à changer sans elles.
function withInWaiting(rail: unknown, inWaiting: readonly InWaiting[]): { rail?: Raw[] } {
  if (inWaiting.length === 0) return {};
  const readOnes = list(rail);
  const onTheRail = new Set(readOnes.map(({ ticket }) => ticket));
  const itsOwn = new Map(inWaiting.map((issue) => [issue.ticket, issue]));
  const thirdOf = (third: Third | null) => (third === null ? {} : { tiers: third });
  return {
    rail: [
      ...readOnes.map((ticket) => {
        const issue = typeof ticket.ticket === "number" ? itsOwn.get(ticket.ticket) : undefined;
        return issue === undefined || ticket.etat !== "WAITING" ? ticket : { ...ticket, ...thirdOf(issue.tiers) };
      }),
      ...inWaiting.filter(({ ticket }) => !onTheRail.has(ticket)).map(({ ticket, titre: title, url, tiers: third }) => ({ ticket, etat: "WAITING", titre: title, url, ...thirdOf(third) })),
    ],
  };
}

// La lecture du rail, dont ce qui attend le chef est cette lecture, et rien d'autre : la file du bloc `awaiting` de
// `status` et `faits.attend`, que TODO dessine, dans le même ordre. `autres` : les entrées qui attendent un autre humain
// que le compte connecté, que TODO replie sous « Awaiting others » (`faits.attendAutres`, ticket 2985) — hors de la file.
// Les issues en WAITING (`enWaiting`, #3075) : un ticket du rail en WAITING porte ce qu'il attend (`tiers`) ; une issue
// qui n'est pas sur le rail y est posée, en WAITING, pour que sa carte y soit.
export function withTheWaitOfChef(readOne: BoardRead, { attentes: waits, illisibles: unreadable, autres: others = [], enWaiting: inWaiting = [] }: { attentes: readonly WaitOfChef[]; illisibles: readonly string[]; autres?: Share<WaitOfChef>["autres"]; enWaiting?: readonly InWaiting[] }): BoardRead {
  const said = ({ ticket, titre: title, url, chef, miseDeCote: setAside }: WaitOfChef) => ({
    ticket,
    titre: title,
    url,
    ...(setAside === undefined ? {} : { miseDeCote: setAside }),
    ...(chef === undefined ? {} : { chef }),
  });
  const awaiting = waits.map(said);
  return {
    ...readOne,
    file: fileOfChef(waits),
    bilans: [...unreadable],
    faits: { ...readOne.faits, ...withInWaiting(readOne.faits.rail, inWaiting), attend: awaiting, ...(others.length === 0 ? {} : { attendAutres: others.map(({ attente: wait, qui: who }) => ({ ...said(wait), qui: who })) }), compteurs: { ...(object(readOne.faits.compteurs) ?? {}), attend: awaiting.length } },
  };
}

// La lecture du rail, avec ce qui attend le chef lu de GitHub comme le second le lit (main.ts) : l'app ne dit jamais autre
// chose que lui. Pas lu : une lecture ratée, jamais un TODO vide. `partager` : les cartes qui attendent le compte connecté,
// et celles qui attendent un autre humain (vue/cards-assigned/, #2761, #2985).
export async function withWhatAwaitingTheChef(readOne: ReadOfBoardOfRepository, call: CallGitHub, share?: (waits: WaitOfChef[]) => Promise<Share<WaitOfChef>>): Promise<ReadOfBoardOfRepository> {
  if (!readOne.lu) return readOne;
  const wait = await readWhatAwaitingTheChef({ depot: readOne.depot, appeler: call, maintenant: () => new Date(readOne.luLe), enWaiting: "du-rail", ...(readOne.parqueesPourLeChef === undefined ? {} : { parqueesPourLeChef: readOne.parqueesPourLeChef }), ...(readOne.faits.kitchenBoard === undefined ? {} : { newKitchen: true }) });
  if (!wait.lue) return { lu: false, depot: readOne.depot, luLe: readOne.luLe, raison: wait.raison, ...(wait.horsLigne === undefined ? {} : { horsLigne: true as const }) };
  if (share === undefined) return withTheWaitOfChef(readOne, wait);
  const { siennes: itsOwn, autres: others } = await share(wait.attentes);
  return withTheWaitOfChef(readOne, { ...wait, attentes: itsOwn, autres: others });
}
