// La cuisine parque elle-même un ticket (#3814, épique #3813, #4260). Sur BOBL-tech/mirrorlab, #824
// ne se faisait qu'à partir du 2026-11-25 : chaque cook disait « Too early », la relecture demandait des changements, et
// la cuisine l'a relancé toutes les trois minutes pendant 26 h (1 198 runs), sa zone tenant #803 tout ce temps. Ce
// module fait ce geste :
//   - `lireAttenteDuCook` : ce que les mots d'un cook (son blocage) ou d'une relecture disent d'une attente — pas avant
//     une date à venir, ou quelque chose qu'un tiers hors de la cuisine n'a pas encore donné. Qui, pour quoi, et jusqu'à
//     quand — la date dite ; sans date, dans sept jours. Null quand ils ne disent ni l'un ni
//     l'autre : la question va au manager, comme avant ;
//   - `mettreEnAttenteParLaCuisine` : le geste du parking (attente-github/attente-github.ts, `poserLAttente`) ;
//   - `parquerSesEchecs` : ses cooks ont échoué trop de fois, la station arrête sa boucle de relances — il attend le
//     superviseur, qui reçoit son dossier (manager/supervision.ts) ;
//   - `ramenerALaRelance` : à chaque tour de station, un ticket parqué jusqu'à une date passée reprend exactement où il
//     était — `parked` retiré, rien d'autre —, sans geste de personne. Un ticket parqué jusqu'à un fait, ou pour le chef,
//     n'en sort pas à une date : un humain dit le fait arrivé, ou le chef répond.
import { attenteDeLIssue, corpsDuParking, direRelance, poserLAttente, type AttenteGitHub } from "../attente-github/attente-github.ts";
import { reprendALaDate } from "../attente-github/marque.ts";
import { RELANCE_PAR_DEFAUT_MS } from "../attente.ts";
import { LABEL_PARKED } from "../github-etat/etats.ts";
import type { Commentaire, GitHub } from "../github.ts";

// Ce que dit un cook qui ne peut pas le faire avant une date.
const PAS_AVANT = /\b(too early|not before|not until|no earlier than|cannot be (?:done|started|built|delivered|served) (?:before|until)|can(?:not|'t) start (?:before|until)|can only be (?:done|started|built|delivered) (?:from|on|after)|only (?:from|after|opens?|starts?|available)|not (?:available|open|possible) (?:before|until))\b/i;
// Ce que dit un cook qui attend quelque chose qu'aucun cook ne peut produire : il le dit hors de la cuisine, ou il
// attend un tiers. « The HTTP client has not sent the header » n'en est pas : seuls ces mots-là comptent.
const HORS_CUISINE = /\b(outside (?:of )?the kitchen|nothing in the kitchen can|no one in the kitchen can|no cook can|(?:waiting|waits) (?:for|on) (?:the )?(?:client|customer|vendor|supplier|partner|provider|third[- ]party))/i;
// Le tiers qu'il nomme.
const TIERS = /\b(?:the |our |a )?((?:[\w-]+ )?(?:client|customer|vendor|supplier|partner|provider|third[- ]party)(?:'s [\w-]+(?: [\w-]+)?(?: team)?)?)\b/i;
// Ce qu'il attend, jusqu'à la fin de sa proposition : « Waiting for the client's API key: nothing … » attend la clé.
const ATTEND = /\b(?:waiting|waits) (?:for|on) (.+?)(?:\s*[:;,—–]|[.!?]*$)/i;
const DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

const phrases = (texte: string) =>
  texte
    .split(/\n+|(?<=[.!?])\s+/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase !== "");

const sansPoint = (phrase: string) => phrase.replace(/[.;!?\s]+$/, "");

// La première date à venir que les mots disent, à minuit UTC ; null sans elle.
function dateAVenir(texte: string, maintenant: Date): Date | null {
  for (const [, an, mois, jour] of texte.matchAll(DATE)) {
    const date = new Date(Date.UTC(Number(an), Number(mois) - 1, Number(jour)));
    if (!Number.isNaN(date.getTime()) && date.getUTCDate() === Number(jour) && date.getTime() > maintenant.getTime()) return date;
  }
  return null;
}

// De qui : la phrase « waiting for … », sinon le tiers nommé, sinon nul.
function quiDit(texte: string): string | null {
  for (const phrase of phrases(texte)) {
    const attendu = ATTEND.exec(phrase)?.[1]?.trim();
    if (attendu !== undefined && attendu !== "") return attendu;
  }
  const tiers = TIERS.exec(texte)?.[1]?.trim();
  return tiers === undefined || tiers === "" ? null : `the ${tiers.replace(/^the /i, "")}`;
}

// Ce que les mots d'un cook ou d'une relecture disent d'une attente hors de la cuisine, ou null.
export function lireAttenteDuCook(texte: string, maintenant: Date): AttenteGitHub | null {
  const date = PAS_AVANT.test(texte) ? dateAVenir(texte, maintenant) : null;
  if (date !== null) {
    const dite = phrases(texte).find((phrase) => PAS_AVANT.test(phrase) || dateAVenir(phrase, maintenant) !== null) ?? texte;
    return { what: sansPoint(dite), who: quiDit(texte) ?? `the calendar: not before ${direRelance(date.toISOString()).slice(0, 10)}`, followUp: date.toISOString() };
  }
  if (!HORS_CUISINE.test(texte)) return null;
  // Sans tiers nommé, rien ne dit que ce qu'il attend est hors de la cuisine : la question va au manager.
  const tiers = phrases(texte).find((phrase) => TIERS.test(phrase) && !ATTEND.test(phrase)) ?? phrases(texte).find((phrase) => TIERS.test(phrase));
  const who = quiDit(texte);
  if (tiers === undefined || who === null) return null;
  return { what: sansPoint(tiers), who, followUp: new Date(maintenant.getTime() + RELANCE_PAR_DEFAUT_MS).toISOString() };
}

// Parque le ticket par la cuisine : le label, puis la marque qui dit qui, pour quoi, jusqu'à quand, et les mots du cook.
export async function mettreEnAttenteParLaCuisine(github: Pick<GitHub, "labelliser" | "delabelliser" | "commenter">, numero: number, attente: AttenteGitHub, par?: { station: string; mots: string }): Promise<void> {
  await poserLAttente(github, numero, corpsDuParking(attente, par), `#${numero}`, "the ticket is given back as it was");
}

// Ses cooks ont échoué trop de fois : la station arrête sa boucle de relances et le parque — qui : le superviseur, qui
// reçoit son dossier ; pour quoi : la raison, sa première ligne ; jusqu'à un fait, la réponse du superviseur. Rien ne le prend avant (#4129 : mirrorlab #923 était repris une minute après sa mise de côté).
// Le label d'abord, et il reste : c'est lui qui arrête la boucle. Un label refusé lève, comme avant. Un commentaire
// refusé laisse le ticket parqué sans sa marque, et se dit (`avertir`) : l'invariant 3 lui pose une raison et une date.
export async function parquerSesEchecs(
  github: Pick<GitHub, "labelliser" | "commenter">,
  numero: number,
  raison: string,
  par: { station: string; mots: string } | undefined,
  maintenant: Date,
  avertir: (ligne: string) => void,
): Promise<AttenteGitHub> {
  const dite = raison.trim().split("\n")[0] || "its cooks stopped without a delivery";
  // Jusqu'à un fait, la réponse du superviseur : aucune minuterie ne le remet sur le rail (#3911).
  const attente: AttenteGitHub = { what: `its cooks failed too many times, the station stopped relaunching it. The reason: ${dite}`, who: "the supervisor", followUp: new Date(maintenant.getTime() + RELANCE_PAR_DEFAUT_MS).toISOString(), fact: "the supervisor answers", failures: true };
  await github.labelliser(numero, [LABEL_PARKED]);
  try {
    await github.commenter(numero, corpsDuParking(attente, par));
  } catch (erreur) {
    avertir(`brigade : #${numero} — parked by its failure count, its loop is stopped, but the comment that says why could not be posted: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  return attente;
}

// Un ticket du tour, tel que le retour le lit.
type TicketEnAttente = { number: number; labels: string[] };

// Les tickets parqués jusqu'à une date passée reprennent exactement où ils étaient : `parked` retiré — ni `fire` posé,
// ni un autre label touché —, un commentaire qui le dit. Rend les tickets repris. Des commentaires illisibles le
// laissent parqué, et le disent (`avertir`) : le tour suivant relit. `leve` : le tour le relit sans `parked`.
export async function ramenerALaRelance(
  github: Pick<GitHub, "labelliser" | "delabelliser" | "commenter"> & { commentaires(numero: number): Promise<Pick<Commentaire, "body" | "association">[]> },
  tickets: readonly TicketEnAttente[],
  { station, maintenant, avertir, leve }: { station: string; maintenant: Date; avertir: (ligne: string) => void; leve?: (numero: number) => void },
): Promise<number[]> {
  const rentres: number[] = [];
  for (const { number: numero, labels } of tickets) {
    // Parqué pour le chef (`chef-todo` seul), il attend sa réponse : aucune date ne l'en sort. Une carte du chef parquée
    // pour un autre jusqu'à une date y revient, à cette date : elle reprend où elle était, dans TODO.
    if (!labels.includes(LABEL_PARKED)) continue;
    let attente: AttenteGitHub | null;
    try {
      attente = attenteDeLIssue(await github.commentaires(numero));
    } catch (erreur) {
      avertir(`brigade : #${numero} sur ${station} — parked, its comments could not be read to check its date: it stays parked, read again next turn — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      continue;
    }
    if (attente === null || !reprendALaDate(attente, maintenant)) continue;
    await github.delabelliser(numero, LABEL_PARKED);
    await github.commenter(numero, `**Unparked — its date is reached**: this ticket was waiting for ${attente.who} (“${attente.what}”) until ${direRelance(attente.followUp)}. Station \`${station}\` lets it resume exactly where it was. If it still cannot be done, its cook says so and it is parked again.`);
    avertir(`brigade : #${numero} sur ${station} — parked until ${direRelance(attente.followUp)}, now reached: it resumes where it was`);
    leve?.(numero);
    rentres.push(numero);
  }
  return rentres;
}
