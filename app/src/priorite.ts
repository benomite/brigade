// Changer la priorité d'un ticket du rail, depuis sa fiche (#1739) : la priorité est le label `prio:<n>` de son issue,
// et l'app le remplace elle-même sur GitHub — l'ancien retiré, le nouveau posé —, par l'API REST et le jeton du `gh` de
// ce poste. Ni box, ni `ssh`, ni second, ni tableau de la cuisine : il suffit que l'app soit connectée à GitHub.
//
// La box le lit à son sondage suivant et range le ticket ; d'ici là, le tableau qu'elle publie montre encore l'ancienne
// priorité — et, box injoignable, il la montre tant qu'elle l'est. Le rail montre donc celle que l'app vient d'écrire
// (`tenirPrioritesEcrites`), tant que le tableau montre celle d'avant ; dès qu'il en montre une autre, c'est lui qui
// dit vrai. Un échec de GitHub ne change rien au rail : la fiche le dit, en une ligne, son détail au survol.
//
// Ce module compose les demandes ; ce qui les porte est donné par la plateforme — le `fetch` du desktop (`envoyerParFetch`).
import { clientGitHub, corpsLu, DELAI_MS, type AppelGitHub, type ReponseGitHub } from "./tableau/client.ts";
import { refusDe } from "./tableau-gestes/github.ts";

// Les priorités qu'un ticket peut prendre : 1 est servi d'abord ; `none` retire son label, il passe après les autres.
export const PRIORITES: readonly string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "none"];
// Les labels de priorité que la box lit (runtime/src/alimenter.ts, `priorite`) : `prio:0` à `prio:9`.
const LABEL_DE_PRIORITE = /^prio:([0-9])$/;

// Un `POST` ou un `DELETE` à cette adresse, avec ces en-têtes et ce corps — un objet, que la plateforme écrit en JSON.
// Lève quand rien n'a répondu.
export type EnvoiGitHub = (methode: "POST" | "DELETE", adresse: string, entetes: Record<string, string>, corps?: unknown) => Promise<ReponseGitHub>;
export type ClientDeLaPriorite = { lire: AppelGitHub; ecrire: (methode: "POST" | "DELETE", chemin: string, corps?: unknown) => Promise<ReponseGitHub> };

// Le client : la lecture de l'issue par le `GET` du tableau (client.ts), l'écriture de ses labels avec le même jeton.
export function clientDeLaPriorite({ jeton, appeler, envoyer }: { jeton: () => Promise<string | null>; appeler: AppelGitHub; envoyer: EnvoiGitHub }): ClientDeLaPriorite {
  return {
    lire: appeler,
    ecrire: (methode, chemin, corps) =>
      clientGitHub({ jeton, envoyer: (adresse, entetes) => envoyer(methode, adresse, corps === undefined ? entetes : { ...entetes, "Content-Type": "application/json" }, corps) })(chemin),
  };
}

// La priorité que des labels portent, comme la box la lit : la plus forte, nulle sans aucune.
export function prioriteDesLabels(labels: readonly string[]): number | null {
  const niveaux = labels.flatMap((label) => LABEL_DE_PRIORITE.exec(label)?.[1] ?? []).map(Number);
  return niveaux.length === 0 ? null : Math.min(...niveaux);
}

// Ce que la fiche reçoit (vue.js, `jouerGesteDeFiche`) : la priorité écrite — `niveau`, et `avant`, celle que l'issue
// portait —, ou pourquoi rien n'a changé. `detail` : au survol.
export type RenduDeLaPriorite = { fait: string; detail: string; niveau: number | null; avant: number | null } | { refus: string; detail: string };

const dite = (niveau: number | null) => (niveau === null ? "no `prio:` label" : `\`prio:${niveau}\``);
const echec = (refus: string, erreur: unknown): RenduDeLaPriorite => ({ refus, detail: erreur instanceof Error ? erreur.message : String(erreur) });

// Remplace le label `prio:` de l'issue de ce ticket, dans ce dépôt : l'issue est lue d'abord, puis le label voulu posé
// s'il n'y est pas, et chaque autre `prio:` retiré. `valeur` : l'une des `PRIORITES`.
export async function changerLaPriorite({ depot, ticket, valeur, client }: { depot: string; ticket: unknown; valeur: unknown; client: ClientDeLaPriorite }): Promise<RenduDeLaPriorite> {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing was changed: the action names no ticket", detail: "" };
  if (typeof valeur !== "string" || !PRIORITES.includes(valeur)) return { refus: `nothing was changed: the priority ${JSON.stringify(valeur) ?? String(valeur)} is not one of ${PRIORITES.join(", ")}`, detail: "" };
  const niveau = valeur === "none" ? null : Number(valeur);
  const voulu = niveau === null ? null : `prio:${niveau}`;
  const issue = `/repos/${depot}/issues/${ticket}`;
  let labels: string[];
  try {
    const lue = await client.lire(issue);
    if (lue.status !== 200) throw refusDe(`the reading of issue #${ticket}`, lue);
    const donnes = (typeof lue.data === "object" && lue.data !== null ? (lue.data as { labels?: unknown }).labels : undefined) ?? [];
    labels = (Array.isArray(donnes) ? donnes : []).flatMap((label: unknown) => {
      const nom = typeof label === "string" ? label : typeof label === "object" && label !== null ? (label as { name?: unknown }).name : undefined;
      return typeof nom === "string" ? [nom] : [];
    });
  } catch (erreur) {
    return echec(`nothing was changed: issue #${ticket} was not read on GitHub`, erreur);
  }
  const avant = prioriteDesLabels(labels);
  const anciens = labels.filter((label) => LABEL_DE_PRIORITE.test(label) && label !== voulu);
  // Posé d'abord, puis les autres retirés : l'issue ne reste jamais sans priorité en chemin.
  if (voulu !== null && !labels.includes(voulu)) {
    try {
      const posee = await client.ecrire("POST", `${issue}/labels`, { labels: [voulu] });
      if (posee.status !== 200) throw refusDe(`the label \`${voulu}\``, posee);
    } catch (erreur) {
      return echec(`nothing was changed: GitHub did not put \`${voulu}\` on #${ticket}`, erreur);
    }
  }
  for (const ancien of anciens) {
    try {
      const retire = await client.ecrire("DELETE", `${issue}/labels/${encodeURIComponent(ancien)}`);
      // Déjà retiré : rien à faire.
      if (retire.status !== 200 && retire.status !== 404) throw refusDe(`the removal of \`${ancien}\``, retire);
    } catch (erreur) {
      const porte = [...new Set([...labels.filter((label) => LABEL_DE_PRIORITE.test(label)), ...(voulu === null ? [] : [voulu])])].map((label) => `\`${label}\``).join(", ");
      return echec(`the priority did not change: GitHub did not remove \`${ancien}\` from #${ticket} — its issue carries ${porte}`, erreur);
    }
  }
  return { fait: `priority changed on GitHub: #${ticket} now carries ${dite(niveau)} — the box reorders the rail when it reads it`, detail: `https://github.com/${depot}/issues/${ticket}`, niveau, avant };
}

// Une demande par `fetch` — celui de Node sur le desktop. Abandonnée passé `delaiMs`.
export function envoyerParFetch(options: { fetch?: typeof fetch; delaiMs?: number } = {}): EnvoiGitHub {
  const appeler = options.fetch ?? fetch;
  const delai = options.delaiMs ?? DELAI_MS;
  return async (methode, adresse, entetes, corps) => {
    const abandon = new AbortController();
    const garde = setTimeout(() => abandon.abort(new Error(`GitHub gave no answer within ${Math.round(delai / 1000)} s`)), delai);
    try {
      const reponse = await appeler(adresse, { method: methode, headers: entetes, ...(corps === undefined ? {} : { body: JSON.stringify(corps) }), signal: abandon.signal });
      return { status: reponse.status, data: corpsLu(await reponse.text()) };
    } catch (erreur) {
      throw abandon.signal.aborted && abandon.signal.reason instanceof Error ? abandon.signal.reason : erreur;
    } finally {
      clearTimeout(garde);
    }
  };
}

// Les priorités que l'app a écrites, par projet et ticket, avec celle que l'issue portait avant : ce que le rail montre
// tant que le tableau de la cuisine ne l'a pas lue (faits.ts, `rail`). Ce module ne lance rien : il retient.
export type PrioriteMontree = (ticket: number, lue: number | null | undefined) => number | null | undefined;
export function tenirPrioritesEcrites() {
  const tenues = new Map<string, Map<number, { niveau: number | null; avant: number | null }>>();
  return {
    // L'app vient d'écrire cette priorité sur l'issue, qui portait `avant`.
    ecrite(projet: string, ticket: number, niveau: number | null, avant: number | null): void {
      const siennes = tenues.get(projet) ?? new Map();
      tenues.set(projet, siennes);
      if (niveau === avant) siennes.delete(ticket);
      else siennes.set(ticket, { niveau, avant });
    },
    // Ce que le rail d'un projet montre d'un ticket, d'après ce que le tableau en dit (`lue` ; absente, il ne le dit
    // pas) : la priorité écrite, tant que le tableau montre celle d'avant — rien sinon, et elle est oubliée dès qu'il
    // en montre une autre.
    de(projet: string): PrioriteMontree {
      return (ticket, lue) => {
        const siennes = tenues.get(projet);
        const tenue = siennes?.get(ticket);
        if (tenue === undefined) return undefined;
        if (lue === undefined || lue === tenue.avant) return tenue.niveau;
        siennes?.delete(ticket);
        return undefined;
      };
    },
  };
}
