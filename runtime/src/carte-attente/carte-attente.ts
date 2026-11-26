// Ce que la carte d'un ticket du rail dit de ses attentes, et d'où chacune est lue (#3763) : le 2026-11-17, #3734 a été
// retenu cinq heures par une phrase de son corps que seul le journal de la station disait, sa carte disant
// `awaiting: none`. Ce que la cuisine obéit et ce que le chef voit sont la même chose : les trois sources que la porte
// de prise lit (`attendusOuverts`, attente-ticket.ts) — le corps, la fiche, l'arrêt d'un cook —, moins les attentes que
// la cuisine a levées (#3477). `brigade <project> status` (attente-du-rail/status.ts) et le rail de l'app
// (app/src/vue/rail/github.ts) les lisent ici, et `ligneDeLaCarte` (attente-du-rail/raison.ts) les dit.
import { attentesDuCorps, type AttenteSourcee } from "../attente-du-rail/raison.ts";
import { leveesDesCommentaires } from "../boucle-attente/levee.ts";
import { fiche } from "../fiche.ts";

// La marque du commentaire d'attente d'un cook, la même que celle de la porte de prise (attente-ticket.ts,
// `corpsDeLAttente`) : redite ici, car attente-ticket.ts tire la base et les E/S que la lecture du rail ne charge pas
// (app/test/tableau/read.test.ts) ; un test garde les deux égales.
const MARQUE_D_ATTENTE_DE_TICKET = "<!-- brigade:attend-ticket";

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
