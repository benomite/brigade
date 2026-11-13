// Un ticket qui bâtit sur le travail pas encore mergé d'un autre ticket ouvert
// attend ce ticket sur le rail, jamais le chef (#2968). Le 2026-11-08, les
// tickets de design #2910, #2914 et #2915 bâtissaient sur #2907, dont la PR
// #2908 était rouge : leurs cooks se sont arrêtés bloqués, et les tickets sont
// allés dans la TODO du chef sous `blocked-on-human`, la carte disant
// seulement « merge PR ». Rien n'y était à décider : il fallait attendre.
//
// Ce qu'un ticket attend se lit de trois sources, sur son issue : les lignes
// `Depends on #N` de son corps (`dependancesOuvertes`), la ligne `attend` de sa
// fiche, et la marque que la station écrit quand son cook s'arrête sur un
// ticket ouvert dont il dépend. Tant qu'un de ces tickets est ouvert, la porte
// de prise le saute, et la ligne de son saut le nomme (`#A`) ; servi — son
// issue fermée —, il ne retient plus rien, et un cook le prend au tour suivant,
// sans geste de personne. Aucune carte TODO n'est posée.
import type { GitHubDuTour, TicketLu } from "../brigade-github.ts";
import { leveesDesCommentaires } from "../boucle-attente/levee.ts";
import { fiche } from "../fiche.ts";
import { direSaut } from "../retenue/retenue.ts";

// La marque du commentaire qui met le ticket en attente, suivie des tickets attendus.
export const MARQUE_D_ATTENTE_DE_TICKET = "<!-- brigade:attend-ticket";

// Ce qui, dans une phrase du cook, dit qu'un ticket nommé n'est pas encore là :
// il en dépend, bâtit dessus, l'attend, ou ce ticket n'est pas mergé.
const DEPENDANCE = /depend|d[ée]pend|unmerged|not (?:yet )?merged|isn't merged|is not merged|builds? (?:up)?on|waits? (?:for|on)|waiting (?:for|on)|awaits?|blocked (?:by|on)|pas (?:encore )?merg|non merg|repose sur|s'appuie sur|bâtit sur|attend/i;

const numeros = (texte: string) => [...texte.matchAll(/#([1-9]\d*)\b/g)].map(([, n]) => Number(n));

// Les tickets ouverts dont le cook dit, dans sa question, que son ticket
// dépend : nommés `#N` dans une phrase qui dit la dépendance, et parmi
// `ouverts` — les tickets de la cuisine que le dernier tour a lus ouverts, ni
// épiques ni hors cuisine. Le ticket lui-même n'en est pas. Aucun : la question
// suit sa voie, au manager.
export function attendusDuBlocage(question: string, ticket: number, ouverts: ReadonlySet<number>): number[] {
  const attendus = new Set<number>();
  for (const phrase of question.split(/(?<=[.!?])\s+|\n+/)) {
    if (!DEPENDANCE.test(phrase)) continue;
    for (const n of numeros(phrase)) if (n !== ticket && ouverts.has(n)) attendus.add(n);
  }
  return [...attendus].sort((a, b) => a - b);
}

const liste = (tickets: readonly number[]) => tickets.map((n) => `#${n}`).join(", ");

const citer = (texte: string) =>
  texte
    .trim()
    .split("\n")
    .map((ligne) => `> ${ligne}`)
    .join("\n");

// Ce qui, dans les mots du cook, est du français : une lettre accentuée, ou un
// mot outil que l'anglais n'écrit pas.
const FRANCAIS = /[àâäçéèêëîïôöùûüÿœæ]|\b(?:le|la|les|des|du|une|est|sont|pas|sur|dans|avec|que|qui|mais|ou|ce|cette|ces|il|elle|je|ne|au|aux|et|sa|ses|mon|mes|encore|donc)\b/i;

// Les mots du cook tels qu'un commentaire de la station les cite sur l'issue,
// en anglais (#3033) : cités s'ils s'y lisent, et sinon pas — le cook les
// écrit le plus souvent en français, et rien ne les traduit sur ce chemin.
export function lesMotsDuCook(question: string): string[] {
  return FRANCAIS.test(question) ? ["The cook's words are not quoted: it wrote them in French."] : ["The cook's words:", "", citer(question)];
}

// Le commentaire qui met le ticket en attente : sa marque nomme les tickets
// attendus, que la porte de prise relit à chaque tour.
export function corpsDeLAttente({ station, attendus, question }: { station: string; attendus: readonly number[]; question: string }): string {
  const un = attendus.length === 1;
  return [
    `${MARQUE_D_ATTENTE_DE_TICKET} ${liste(attendus)} -->`,
    `Station \`${station}\`: the cook stopped because this ticket builds on the unmerged work of ${liste(attendus)}. Nothing here is for the chef: the ticket waits on the rail for ${liste(attendus)}, and a cook takes it on its own once ${un ? "it is" : "they are all"} served. This stop is not counted among the ticket's tries.`,
    "",
    ...lesMotsDuCook(question),
  ].join("\n");
}

// Les tickets que les commentaires d'un ticket lui font attendre : sa fiche
// (`attend`) et les marques d'attente que la station y a écrites.
export function attendusDesCommentaires(corps: readonly string[]): number[] {
  const attendus = new Set<number>(fiche([...corps])?.waitsFor ?? []);
  for (const body of corps) {
    if (!body.startsWith(MARQUE_D_ATTENTE_DE_TICKET)) continue;
    for (const n of numeros(body.split("-->")[0] ?? "")) attendus.add(n);
  }
  return [...attendus];
}

// Les tickets encore ouverts que `ticket` attend : ceux de son corps
// (`Depends on`), de sa fiche et de ses marques d'attente, moins celles que la cuisine a levées. Un ticket attendu
// parmi `lus` — les tickets ouverts du tour — est ouvert ; un autre se lit sur
// GitHub, et n'est plus attendu fermé ou disparu. Sans lecteur d'issue, seul
// un ticket du tour est ouvert. Le corps ou un ticket attendu illisible lève :
// l'appelant le garde en attente, comme une dépendance illisible. Ses
// commentaires illisibles ne le retiennent pas : la remise du ticket au cook,
// qui les lit aussi, dit sur l'issue pourquoi il ne part pas, et le rend.
export async function attendusOuverts(github: Pick<GitHubDuTour, "commentaires" | "dependancesOuvertes" | "issue">, ticket: number, lus: readonly TicketLu[]): Promise<number[]> {
  const [duCorps, commentaires] = await Promise.all([github.dependancesOuvertes(ticket), github.commentaires(ticket).catch(() => [])]);
  const corps = commentaires.map(({ body }) => body);
  // Une attente que la cuisine a levée pour défaire une boucle ne retient plus (#3477).
  const levees = leveesDesCommentaires(corps);
  const ouverts = new Set(duCorps.filter((attendu) => !levees.has(attendu)));
  for (const attendu of attendusDesCommentaires(corps)) {
    if (attendu === ticket || ouverts.has(attendu) || levees.has(attendu)) continue;
    const lu = lus.find(({ number }) => number === attendu);
    if (lu !== undefined ? lu.state === "open" : (await github.issue?.(attendu))?.state === "open") ouverts.add(attendu);
  }
  return [...ouverts].sort((a, b) => a - b);
}

// La ligne du saut : le ticket attend, nommés, les tickets ouverts qui le retiennent.
export function direAttenteDeTicket(ticket: number, attendus: readonly number[]): string {
  return direSaut(ticket, `waiting for ${liste(attendus)} — it starts on its own once ${attendus.length === 1 ? "it is" : "they are all"} served`);
}
