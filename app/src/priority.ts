// Changer la priorité d'un ticket du rail, depuis sa fiche (#1739) : la priorité est le label `prio:<n>` de son issue,
// et l'app le remplace elle-même sur GitHub — l'ancien retiré, le nouveau posé —, par l'API REST et le jeton du `gh` de
// ce poste. Ni box, ni second : il suffit que l'app soit connectée à GitHub.
//
// La station le lit à son tour suivant et range le ticket ; d'ici là, la dernière lecture du rail (board/read.ts)
// montre encore l'ancienne priorité. Le rail montre donc celle que l'app vient d'écrire (`tenirPrioritesEcrites`), tant
// que la lecture montre celle d'avant ; dès qu'elle en montre une autre, c'est elle qui dit vrai. Un échec de GitHub ne
// change rien au rail : la fiche le dit, en une ligne, son détail au survol.
//
// Ce module compose les demandes ; ce qui les porte est donné par la plateforme — le `fetch` du desktop (`envoyerParFetch`).
import { clientGitHub, bodyRead, DELAY_MS, refusalOf, type CallGitHub, type AnswerGitHub } from "./board/client.ts";

// Les priorités qu'un ticket peut prendre : 1 est servi d'abord ; `none` retire son label, il passe après les autres.
export const PRIORITIES: readonly string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "none"];
// Les labels de priorité que la cuisine lit (board/kitchen-board.ts, `priority`) : `prio:0` à `prio:9`.
const LABEL_OF_PRIORITY = /^prio:([0-9])$/;

// Un `POST` ou un `DELETE` à cette adresse — ou un `PUT`, un `PATCH`, pour la réponse à une carte du chef (#2434,
// board-actions/answer-github.ts) —, avec ces en-têtes et ce corps — un objet, que la plateforme écrit en JSON.
// Lève quand rien n'a répondu.
export type MethodOfWriting = "POST" | "DELETE" | "PUT" | "PATCH";
export type SendGitHub = (method: MethodOfWriting, address: string, headers: Record<string, string>, body?: unknown) => Promise<AnswerGitHub>;
export type ClientOfThePriority = { lire: CallGitHub; ecrire: (method: MethodOfWriting, path: string, body?: unknown) => Promise<AnswerGitHub> };

// Le client : la lecture de l'issue par le `GET` du rail (client.ts), l'écriture de ses labels avec le même jeton.
export function clientOfThePriority({ jeton: token, appeler: call, envoyer: send }: { jeton: () => Promise<string | null>; appeler: CallGitHub; envoyer: SendGitHub }): ClientOfThePriority {
  return {
    lire: call,
    ecrire: (method, path, body) =>
      clientGitHub({ jeton: token, envoyer: (address, headers) => send(method, address, body === undefined ? headers : { ...headers, "Content-Type": "application/json" }, body) })(path),
  };
}

// La priorité que des labels portent, comme la box la lit : la plus forte, nulle sans aucune.
export function priorityOfLabels(labels: readonly string[]): number | null {
  const levels = labels.flatMap((label) => LABEL_OF_PRIORITY.exec(label)?.[1] ?? []).map(Number);
  return levels.length === 0 ? null : Math.min(...levels);
}

// Ce que la fiche reçoit (vue.js, `jouerGesteDeFiche`) : la priorité écrite — `niveau`, et `avant`, celle que l'issue
// portait —, ou pourquoi rien n'a changé. `detail` : au survol.
export type RenderedOfThePriority = { fait: string; detail: string; niveau: number | null; avant: number | null } | { refus: string; detail: string };

const saidOne = (level: number | null) => (level === null ? "no `prio:` label" : `\`prio:${level}\``);
const failure = (refusal: string, error: unknown): RenderedOfThePriority => ({ refus: refusal, detail: error instanceof Error ? error.message : String(error) });

// Remplace le label `prio:` de l'issue de ce ticket, dans ce dépôt : l'issue est lue d'abord, puis le label voulu posé
// s'il n'y est pas, et chaque autre `prio:` retiré. `valeur` : l'une des `PRIORITES`.
export async function changeThePriority({ depot: repository, ticket, valeur: value, client }: { depot: string; ticket: unknown; valeur: unknown; client: ClientOfThePriority }): Promise<RenderedOfThePriority> {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing was changed: the action names no ticket", detail: "" };
  if (typeof value !== "string" || !PRIORITIES.includes(value)) return { refus: `nothing was changed: the priority ${JSON.stringify(value) ?? String(value)} is not one of ${PRIORITIES.join(", ")}`, detail: "" };
  const level = value === "none" ? null : Number(value);
  const wanted = level === null ? null : `prio:${level}`;
  const issue = `/repos/${repository}/issues/${ticket}`;
  let labels: string[];
  try {
    const readEntry = await client.lire(issue);
    if (readEntry.status !== 200) throw refusalOf(`the reading of issue #${ticket}`, readEntry);
    const given = (typeof readEntry.data === "object" && readEntry.data !== null ? (readEntry.data as { labels?: unknown }).labels : undefined) ?? [];
    labels = (Array.isArray(given) ? given : []).flatMap((label: unknown) => {
      const name = typeof label === "string" ? label : typeof label === "object" && label !== null ? (label as { name?: unknown }).name : undefined;
      return typeof name === "string" ? [name] : [];
    });
  } catch (error) {
    return failure(`nothing was changed: issue #${ticket} was not read on GitHub`, error);
  }
  const before = priorityOfLabels(labels);
  const old = labels.filter((label) => LABEL_OF_PRIORITY.test(label) && label !== wanted);
  // Posé d'abord, puis les autres retirés : l'issue ne reste jamais sans priorité en chemin.
  if (wanted !== null && !labels.includes(wanted)) {
    try {
      const setOne = await client.ecrire("POST", `${issue}/labels`, { labels: [wanted] });
      if (setOne.status !== 200) throw refusalOf(`the label \`${wanted}\``, setOne);
    } catch (error) {
      return failure(`nothing was changed: GitHub did not put \`${wanted}\` on #${ticket}`, error);
    }
  }
  for (const former of old) {
    try {
      const removed = await client.ecrire("DELETE", `${issue}/labels/${encodeURIComponent(former)}`);
      // Déjà retiré : rien à faire.
      if (removed.status !== 200 && removed.status !== 404) throw refusalOf(`the removal of \`${former}\``, removed);
    } catch (error) {
      const door = [...new Set([...labels.filter((label) => LABEL_OF_PRIORITY.test(label)), ...(wanted === null ? [] : [wanted])])].map((label) => `\`${label}\``).join(", ");
      return failure(`the priority did not change: GitHub did not remove \`${former}\` from #${ticket} — its issue carries ${door}`, error);
    }
  }
  return { fait: `priority changed on GitHub: #${ticket} now carries ${saidOne(level)} — the box reorders the rail when it reads it`, detail: `https://github.com/${repository}/issues/${ticket}`, niveau: level, avant: before };
}

// Une demande par `fetch` — celui de Node sur le desktop. Abandonnée passé `delaiMs`.
export function sendByFetch(options: { fetch?: typeof fetch; delaiMs?: number } = {}): SendGitHub {
  const call = options.fetch ?? fetch;
  const delay = options.delaiMs ?? DELAY_MS;
  return async (method, address, headers, body) => {
    const abandon = new AbortController();
    const guard = setTimeout(() => abandon.abort(new Error(`GitHub gave no answer within ${Math.round(delay / 1000)} s`)), delay);
    try {
      const answer = await call(address, { method: method, headers: headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: abandon.signal });
      return { status: answer.status, data: bodyRead(await answer.text()) };
    } catch (error) {
      throw abandon.signal.aborted && abandon.signal.reason instanceof Error ? abandon.signal.reason : error;
    } finally {
      clearTimeout(guard);
    }
  };
}

// Les priorités que l'app a écrites, par projet et ticket, avec celle que l'issue portait avant : ce que le rail montre
// tant que la lecture du rail ne la montre pas (facts.ts, `rail`). Ce module ne lance rien : il retient.
export type PriorityShown = (ticket: number, readEntry: number | null | undefined) => number | null | undefined;
export function holdPrioritiesWritten() {
  const heldEntries = new Map<string, Map<number, { niveau: number | null; avant: number | null }>>();
  return {
    // L'app vient d'écrire cette priorité sur l'issue, qui portait `avant`.
    ecrite(project: string, ticket: number, level: number | null, before: number | null): void {
      const itsOwn = heldEntries.get(project) ?? new Map();
      heldEntries.set(project, itsOwn);
      if (level === before) itsOwn.delete(ticket);
      else itsOwn.set(ticket, { niveau: level, avant: before });
    },
    // Ce que le rail d'un projet montre d'un ticket, d'après ce que sa lecture en dit (`lue` ; absente, elle ne le dit
    // pas) : la priorité écrite, tant que la lecture montre celle d'avant — rien sinon, et elle est oubliée dès qu'elle
    // en montre une autre.
    de(project: string): PriorityShown {
      return (ticket, readEntry) => {
        const itsOwn = heldEntries.get(project);
        const heldOne = itsOwn?.get(ticket);
        if (heldOne === undefined) return undefined;
        if (readEntry === undefined || readEntry === heldOne.avant) return heldOne.niveau;
        itsOwn?.delete(ticket);
        return undefined;
      };
    },
  };
}
