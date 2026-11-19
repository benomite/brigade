// Ce que la carte d'un ticket du rail dit de ses attentes, et d'où chacune est lue (#3763) : le 2026-11-17, #3734 a été
// retenu cinq heures par une phrase de son corps que seul le journal de la station disait, sa carte disant
// `awaiting: none`. Ce que la cuisine obéit et ce que le chef voit sont la même chose : les trois sources que la porte
// de prise lit (`attendusOuverts`, attente-ticket.ts) — le corps, la fiche, l'arrêt d'un cook —, moins les attentes que
// la cuisine a levées (#3477). `brigade <project> status` (attente-du-rail/status.ts) et le rail de l'app
// (app/src/vue/rail/github.ts) les lisent ici, et `ligneDeLaCarte` (attente-du-rail/raison.ts) les dit.
import { attentesDuCorps, type AttenteSourcee } from "../attente-du-rail/raison.ts";
import { leveesDesCommentaires } from "../boucle-attente/levee.ts";
import { ticketsDeLaListe } from "../epique.ts";
import { fiche } from "../fiche.ts";

// La marque du commentaire que la station écrit sur l'issue quand le cook du ticket s'arrête sur un ticket ouvert dont
// il dépend (attente-ticket.ts, `corpsDeLAttente`), suivie des tickets attendus.
export const MARQUE_D_ATTENTE_DE_TICKET = "<!-- brigade:attend-ticket";

// Les tickets que les commentaires d'un ticket lui font attendre, par source : sa fiche (`attend`), et les marques
// d'attente que la station y a écrites à l'arrêt d'un cook. La porte de prise les lit toutes sources confondues
// (`attendusDesCommentaires`).
export function attendusDesCommentairesParSource(corps: readonly string[]): { fiche: number[]; arret: number[] } {
  const arret = new Set<number>();
  for (const body of corps) {
    if (!body.startsWith(MARQUE_D_ATTENTE_DE_TICKET)) continue;
    for (const [, n] of (body.split("-->")[0] ?? "").matchAll(/#([1-9]\d*)\b/g)) arret.add(Number(n));
  }
  return { fiche: [...new Set(fiche([...corps])?.waitsFor ?? [])], arret: [...arret] };
}

// Les attentes d'un ticket, de son corps et des corps de ses commentaires ; `commentaires` nul : ils ne se sont pas lus,
// et seules celles du corps sont dites — la carte dit alors qu'ils ne se sont pas lus (`commentairesLus`).
// `decoupage` : les tickets d'un découpage attendu, que la porte de prise attend à sa place (`attendusDuCorps`).
export function attentesDuTicket(options: { ticket: number; corps: string; commentaires: readonly string[] | null; decoupage?: (n: number) => readonly number[] }): { attentes: AttenteSourcee[]; commentairesLus: boolean } {
  const { ticket, corps, commentaires, decoupage = () => [] } = options;
  const levees = leveesDesCommentaires(commentaires ?? []);
  const duCorps = attentesDuCorps(corps).flatMap(({ ticket: n, phrase }) => {
    const siens = decoupage(n).filter((m) => m !== n && m !== ticket);
    return (siens.length > 0 ? siens : [n]).map((attendu) => ({ ticket: attendu, source: "corps" as const, phrase }));
  });
  const { fiche, arret } = attendusDesCommentairesParSource(commentaires ?? []);
  const attentes = [...duCorps, ...fiche.map((n) => ({ ticket: n, source: "fiche" as const })), ...arret.map((n) => ({ ticket: n, source: "arret" as const }))];
  return { attentes: attentes.filter(({ ticket: n }) => n !== ticket && !levees.has(n)), commentairesLus: commentaires !== null };
}

// Une issue telle que GitHub la rend : son état et son corps ; nulle, elle n'existe plus.
export type IssueDeLAttendu = { state: string; body?: string } | null;

// Les tickets que la porte de prise attend quand le corps de `ticket` attend `attendu` (`attendusDuCorps`,
// attente-ticket.ts) : aucun s'il est fermé ou disparu ; découpé — son corps porte la liste des tickets du découpage —,
// ses tickets encore ouverts, `ticket` excepté ; sinon lui. Une lecture qui échoue lève.
export async function attendusDeLAttendu(ticket: number, attendu: number, lire: (numero: number) => Promise<IssueDeLAttendu>): Promise<number[]> {
  const lue = await lire(attendu);
  if (lue?.state !== "open") return [];
  const decoupage = ticketsDeLaListe(lue.body ?? "").filter((n) => n !== attendu);
  if (decoupage.length === 0) return [attendu];
  const autres = decoupage.filter((n) => n !== ticket);
  const etats = await Promise.all(autres.map(async (n) => (await lire(n))?.state));
  return autres.filter((_, rang) => etats[rang] === "open");
}

// Les attentes que la porte de prise applique à un ticket en file, chacune avec sa source : celles de `attentesDuTicket`
// dont le ticket attendu est ouvert, sur le rail ou non — le 2026-11-18, un ticket retenu par un ticket ouvert hors du rail
// gardait une carte libre. `lire` rend l'issue d'un ticket attendu ; une lecture qui échoue garde l'attente, comme la porte
// de prise garde le ticket quand elle ne lit pas ce qu'il attend.
export async function attentesOuvertesDuTicket(options: { ticket: number; corps: string; commentaires: readonly string[] | null; lire: (numero: number) => Promise<IssueDeLAttendu> }): Promise<{ attentes: AttenteSourcee[]; commentairesLus: boolean }> {
  const { ticket, corps, commentaires, lire } = options;
  const { attentes, commentairesLus } = attentesDuTicket({ ticket, corps, commentaires });
  const levees = leveesDesCommentaires(commentaires ?? []);
  const ouvertes = await Promise.all(
    attentes.map(async (attente): Promise<AttenteSourcee[]> => {
      if (attente.source !== "corps") return (await lire(attente.ticket).then((lue) => lue?.state === "open", () => true)) ? [attente] : [];
      const attendus = await attendusDeLAttendu(ticket, attente.ticket, lire).catch(() => [attente.ticket]);
      return attendus.filter((n) => n !== ticket && !levees.has(n)).map((n) => ({ ...attente, ticket: n }));
    }),
  );
  return { attentes: ouvertes.flat(), commentairesLus };
}

// Le lecteur des tickets attendus d'une lecture du rail : un ticket du rail est ouvert, de son corps déjà lu, sans
// lecture de plus ; un autre se lit une fois par lecture du rail (`/repos/<depot>/issues/<n>`), et un 404 dit qu'il
// n'existe plus. `lire` lève sur toute autre réponse que 200, `GitHub answered HTTP <statut>`.
export function lecteurDesAttendus(depot: string, lire: (chemin: string) => Promise<unknown>, duRail: ReadonlyMap<number, string>): (numero: number) => Promise<IssueDeLAttendu> {
  const lues = new Map<number, Promise<IssueDeLAttendu>>();
  return (numero) => {
    const corps = duRail.get(numero);
    if (corps !== undefined) return Promise.resolve({ state: "open", body: corps });
    const deja = lues.get(numero);
    if (deja !== undefined) return deja;
    const lue = lire(`/repos/${depot}/issues/${numero}`).then(
      (brut) => {
        const issue = typeof brut === "object" && brut !== null ? (brut as { state?: unknown; body?: unknown }) : {};
        if (typeof issue.state !== "string") throw new Error(`GitHub gave no state for #${numero}`);
        return { state: issue.state, body: typeof issue.body === "string" ? issue.body : "" };
      },
      (erreur: unknown) => {
        if (erreur instanceof Error && /\bHTTP 404\b/.test(erreur.message)) return null;
        throw erreur;
      },
    );
    lues.set(numero, lue);
    return lue;
  };
}
