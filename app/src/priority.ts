// Changer la priorité d'un ticket du rail, depuis sa fiche (#1739) : la priorité est le label `prio:<n>` de son issue,
// et l'app le remplace elle-même sur GitHub — l'ancien retiré, le nouveau posé —, par l'API REST et le jeton du `gh` de
// ce poste. Ni box, ni second : il suffit que l'app soit connectée à GitHub.
//
// La station le lit à son tour suivant et range le ticket ; d'ici là, la dernière lecture du rail (tableau/read.ts)
// montre encore l'ancienne priorité. Le rail montre donc celle que l'app vient d'écrire (`tenirPrioritesEcrites`), tant
// que la lecture montre celle d'avant ; dès qu'elle en montre une autre, c'est elle qui dit vrai. Un échec de GitHub ne
// change rien au rail : la fiche le dit, en une ligne, son détail au survol.
//
// Ce module compose les demandes ; ce qui les porte est donné par la plateforme — le `fetch` du desktop (`envoyerParFetch`).
import { clientGitHub, corpsLu, DELAY_MS, refusalDe, type CallGitHub, type AnswerGitHub } from "./tableau/client.ts";

// Les priorités qu'un ticket peut prendre : 1 est servi d'abord ; `none` retire son label, il passe après les autres.
export const PRIORITES: readonly string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "none"];
// Les labels de priorité que la box lit (runtime/src/alimenter.ts, `priorite`) : `prio:0` à `prio:9`.
const LABEL_DE_PRIORITY = /^prio:([0-9])$/;

// Un `POST` ou un `DELETE` à cette adresse — ou un `PUT`, un `PATCH`, pour la réponse à une carte du chef (#2434,
// tableau-actions/answer-github.ts) —, avec ces en-têtes et ce corps — un objet, que la plateforme écrit en JSON.
// Lève quand rien n'a répondu.
export type MethodeDEcriture = "POST" | "DELETE" | "PUT" | "PATCH";
export type EnvoiGitHub = (methode: MethodeDEcriture, adresse: string, entetes: Record<string, string>, corps?: unknown) => Promise<AnswerGitHub>;
export type ClientDeLaPriority = { lire: CallGitHub; ecrire: (methode: MethodeDEcriture, chemin: string, corps?: unknown) => Promise<AnswerGitHub> };

// Le client : la lecture de l'issue par le `GET` du rail (client.ts), l'écriture de ses labels avec le même jeton.
export function clientDeLaPriority({ jeton, appeler, envoyer }: { jeton: () => Promise<string | null>; appeler: CallGitHub; envoyer: EnvoiGitHub }): ClientDeLaPriority {
  return {
    lire: appeler,
    ecrire: (methode, chemin, corps) =>
      clientGitHub({ jeton, envoyer: (adresse, entetes) => envoyer(methode, adresse, corps === undefined ? entetes : { ...entetes, "Content-Type": "application/json" }, corps) })(chemin),
  };
}

// La priorité que des labels portent, comme la box la lit : la plus forte, nulle sans aucune.
export function priorityDesLabels(labels: readonly string[]): number | null {
  const niveaux = labels.flatMap((label) => LABEL_DE_PRIORITY.exec(label)?.[1] ?? []).map(Number);
  return niveaux.length === 0 ? null : Math.min(...niveaux);
}

// Ce que la fiche reçoit (vue.js, `jouerGesteDeFiche`) : la priorité écrite — `niveau`, et `avant`, celle que l'issue
// portait —, ou pourquoi rien n'a changé. `detail` : au survol.
export type RenduDeLaPriority = { fait: string; detail: string; niveau: number | null; avant: number | null } | { refus: string; detail: string };

const dite = (niveau: number | null) => (niveau === null ? "no `prio:` label" : `\`prio:${niveau}\``);
const failure = (refusal: string, error: unknown): RenduDeLaPriority => ({ refus: refusal, detail: error instanceof Error ? error.message : String(error) });

// Remplace le label `prio:` de l'issue de ce ticket, dans ce dépôt : l'issue est lue d'abord, puis le label voulu posé
// s'il n'y est pas, et chaque autre `prio:` retiré. `valeur` : l'une des `PRIORITES`.
export async function changerLaPriority({ depot: repository, ticket, valeur, client }: { depot: string; ticket: unknown; valeur: unknown; client: ClientDeLaPriority }): Promise<RenduDeLaPriority> {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing was changed: the action names no ticket", detail: "" };
  if (typeof valeur !== "string" || !PRIORITES.includes(valeur)) return { refus: `nothing was changed: the priority ${JSON.stringify(valeur) ?? String(valeur)} is not one of ${PRIORITES.join(", ")}`, detail: "" };
  const niveau = valeur === "none" ? null : Number(valeur);
  const voulu = niveau === null ? null : `prio:${niveau}`;
  const issue = `/repos/${repository}/issues/${ticket}`;
  let labels: string[];
  try {
    const lue = await client.lire(issue);
    if (lue.status !== 200) throw refusalDe(`the reading of issue #${ticket}`, lue);
    const donnes = (typeof lue.data === "object" && lue.data !== null ? (lue.data as { labels?: unknown }).labels : undefined) ?? [];
    labels = (Array.isArray(donnes) ? donnes : []).flatMap((label: unknown) => {
      const name = typeof label === "string" ? label : typeof label === "object" && label !== null ? (label as { name?: unknown }).name : undefined;
      return typeof name === "string" ? [name] : [];
    });
  } catch (error) {
    return failure(`nothing was changed: issue #${ticket} was not read on GitHub`, error);
  }
  const avant = priorityDesLabels(labels);
  const anciens = labels.filter((label) => LABEL_DE_PRIORITY.test(label) && label !== voulu);
  // Posé d'abord, puis les autres retirés : l'issue ne reste jamais sans priorité en chemin.
  if (voulu !== null && !labels.includes(voulu)) {
    try {
      const posee = await client.ecrire("POST", `${issue}/labels`, { labels: [voulu] });
      if (posee.status !== 200) throw refusalDe(`the label \`${voulu}\``, posee);
    } catch (error) {
      return failure(`nothing was changed: GitHub did not put \`${voulu}\` on #${ticket}`, error);
    }
  }
  for (const ancien of anciens) {
    try {
      const retire = await client.ecrire("DELETE", `${issue}/labels/${encodeURIComponent(ancien)}`);
      // Déjà retiré : rien à faire.
      if (retire.status !== 200 && retire.status !== 404) throw refusalDe(`the removal of \`${ancien}\``, retire);
    } catch (error) {
      const door = [...new Set([...labels.filter((label) => LABEL_DE_PRIORITY.test(label)), ...(voulu === null ? [] : [voulu])])].map((label) => `\`${label}\``).join(", ");
      return failure(`the priority did not change: GitHub did not remove \`${ancien}\` from #${ticket} — its issue carries ${door}`, error);
    }
  }
  return { fait: `priority changed on GitHub: #${ticket} now carries ${dite(niveau)} — the box reorders the rail when it reads it`, detail: `https://github.com/${repository}/issues/${ticket}`, niveau, avant };
}

// Une demande par `fetch` — celui de Node sur le desktop. Abandonnée passé `delaiMs`.
export function envoyerParFetch(options: { fetch?: typeof fetch; delaiMs?: number } = {}): EnvoiGitHub {
  const appeler = options.fetch ?? fetch;
  const delay = options.delaiMs ?? DELAY_MS;
  return async (methode, adresse, entetes, corps) => {
    const abandon = new AbortController();
    const guard = setTimeout(() => abandon.abort(new Error(`GitHub gave no answer within ${Math.round(delay / 1000)} s`)), delay);
    try {
      const answer = await appeler(adresse, { method: methode, headers: entetes, ...(corps === undefined ? {} : { body: JSON.stringify(corps) }), signal: abandon.signal });
      return { status: answer.status, data: corpsLu(await answer.text()) };
    } catch (error) {
      throw abandon.signal.aborted && abandon.signal.reason instanceof Error ? abandon.signal.reason : error;
    } finally {
      clearTimeout(guard);
    }
  };
}

// Les priorités que l'app a écrites, par projet et ticket, avec celle que l'issue portait avant : ce que le rail montre
// tant que la lecture du rail ne la montre pas (facts.ts, `rail`). Ce module ne lance rien : il retient.
export type PriorityMontree = (ticket: number, lue: number | null | undefined) => number | null | undefined;
export function holdPrioritesEcrites() {
  const tenues = new Map<string, Map<number, { niveau: number | null; avant: number | null }>>();
  return {
    // L'app vient d'écrire cette priorité sur l'issue, qui portait `avant`.
    ecrite(project: string, ticket: number, niveau: number | null, avant: number | null): void {
      const siennes = tenues.get(project) ?? new Map();
      tenues.set(project, siennes);
      if (niveau === avant) siennes.delete(ticket);
      else siennes.set(ticket, { niveau, avant });
    },
    // Ce que le rail d'un projet montre d'un ticket, d'après ce que sa lecture en dit (`lue` ; absente, elle ne le dit
    // pas) : la priorité écrite, tant que la lecture montre celle d'avant — rien sinon, et elle est oubliée dès qu'elle
    // en montre une autre.
    de(project: string): PriorityMontree {
      return (ticket, lue) => {
        const siennes = tenues.get(project);
        const tenue = siennes?.get(ticket);
        if (tenue === undefined) return undefined;
        if (lue === undefined || lue === tenue.avant) return tenue.niveau;
        siennes?.delete(ticket);
        return undefined;
      };
    },
  };
}
