// La cuisine met elle-même un ticket en WAITING quand son cook dit qu'il ne se fait pas encore (#3814, épique #3813).
// Sur BOBL-tech/mirrorlab, #824 ne se faisait qu'à partir du 2026-11-25 : chaque cook disait « Too early », la
// relecture demandait des changements, et la cuisine l'a relancé toutes les trois minutes pendant 26 h (1 198 runs),
// sa zone tenant #803 tout ce temps. Le second l'a mis en WAITING à la main. Ce module fait ce geste :
//   - `lireAttenteDuCook` : ce que les mots d'un cook (son blocage) ou d'une relecture disent d'une attente — pas avant
//     une date à venir, ou quelque chose qu'un tiers hors de la cuisine n'a pas encore donné. Quoi, de qui, et la relance
//     prise de ses mots (la date dite ; sans date, dans sept jours, comme `waiting set`). Null quand ils ne disent ni
//     l'un ni l'autre : la question va au manager, comme avant ;
//   - `mettreEnAttenteParLaCuisine` : le geste de `waiting set` (attente-github/attente-github.ts, `poserLAttente`), sa
//     marque disant que le ticket rentre seul sur le rail à sa relance (`backOnFollowUp`) ;
//   - `ramenerALaRelance` : à chaque tour de station, un ticket que la cuisine a mis en WAITING et dont la relance est
//     passée quitte `waiting` et repart sur le rail, sans geste du chef. Une attente posée par le chef n'en sort pas.
import { attenteDeLIssue, corpsDeLAttente, direRelance, poserLAttente, type AttenteGitHub, type AttenteMarquee } from "../attente-github/attente-github.ts";
import { RELANCE_PAR_DEFAUT_MS } from "../attente.ts";
import { LABEL_WAITING } from "../github-etat/etats.ts";
import { ECHECS_ATTEINTS, LABEL, type Commentaire, type GitHub } from "../github.ts";

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
    return { what: sansPoint(dite), who: quiDit(texte) ?? `the calendar: not before ${direRelance(date.toISOString()).slice(0, 10)}`, followUp: date.toISOString(), backOnFollowUp: true };
  }
  if (!HORS_CUISINE.test(texte)) return null;
  // Sans tiers nommé, rien ne dit que ce qu'il attend est hors de la cuisine : la question va au manager.
  const tiers = phrases(texte).find((phrase) => TIERS.test(phrase) && !ATTEND.test(phrase)) ?? phrases(texte).find((phrase) => TIERS.test(phrase));
  const who = quiDit(texte);
  if (tiers === undefined || who === null) return null;
  return { what: sansPoint(tiers), who, followUp: new Date(maintenant.getTime() + RELANCE_PAR_DEFAUT_MS).toISOString(), backOnFollowUp: true };
}

// Met le ticket en WAITING par la cuisine : le label, puis la marque qui dit quoi, de qui, la relance et les mots du cook.
export async function mettreEnAttenteParLaCuisine(github: Pick<GitHub, "labelliser" | "delabelliser" | "commenter">, numero: number, attente: AttenteMarquee, par: { station: string; mots: string }): Promise<void> {
  await poserLAttente(github, numero, corpsDeLAttente(attente, par), `#${numero}`, "the ticket is given back as it was");
}

// Un ticket du tour, tel que le retour le lit.
type TicketEnAttente = { number: number; labels: string[] };

// Les tickets que la cuisine a mis en WAITING et dont la relance est passée rentrent sur le rail : `fire` posé s'il
// manque, `waiting` retiré, un commentaire qui le dit. Rend les tickets rentrés. Des commentaires illisibles laissent le
// ticket en WAITING, et le disent (`avertir`) : le tour suivant relit.
// Celui dont la station a arrêté la boucle de relances (`whileSetAside`, #4041) en sort aussi dès que `set-aside:failures`
// lui est retiré — le geste du chef ou du superviseur qui le relance : `leve` le dit, et le tour le prend aussitôt.
export async function ramenerALaRelance(
  github: Pick<GitHub, "labelliser" | "delabelliser" | "commenter"> & { commentaires(numero: number): Promise<Pick<Commentaire, "body" | "association">[]> },
  tickets: readonly TicketEnAttente[],
  { station, maintenant, avertir, leve }: { station: string; maintenant: Date; avertir: (ligne: string) => void; leve?: (numero: number) => void },
): Promise<number[]> {
  const rentres: number[] = [];
  for (const { number: numero, labels } of tickets) {
    if (!labels.includes(LABEL_WAITING)) continue;
    let attente: AttenteMarquee | null;
    try {
      attente = attenteDeLIssue(await github.commentaires(numero));
    } catch (erreur) {
      avertir(`brigade : #${numero} sur ${station} — in WAITING, its comments could not be read to check its follow-up date: it stays there, read again next turn — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      continue;
    }
    if (attente?.whileSetAside === true && !labels.includes(ECHECS_ATTEINTS)) {
      await github.delabelliser(numero, LABEL_WAITING);
      await github.commenter(numero, `**WAITING lifted — no longer set aside**: this ticket was awaiting ${attente.who} (“${attente.what}”) while set aside by its failure count. \`${ECHECS_ATTEINTS}\` is removed, so station \`${station}\` lifts its WAITING: a cook takes it in turn.`);
      avertir(`brigade : #${numero} sur ${station} — \`${ECHECS_ATTEINTS}\` is removed: the WAITING of its stopped relaunch loop is lifted`);
      leve?.(numero);
      rentres.push(numero);
      continue;
    }
    if (attente?.backOnFollowUp !== true || Date.parse(attente.followUp) > maintenant.getTime()) continue;
    if (!labels.includes(LABEL)) await github.labelliser(numero, [LABEL]);
    await github.delabelliser(numero, LABEL_WAITING);
    await github.commenter(numero, `**WAITING lifted — follow-up date reached**: this ticket was awaiting ${attente.who} (“${attente.what}”) until ${direRelance(attente.followUp)}. Station \`${station}\` puts it back on the rail: a cook takes it in turn. If it still cannot be done, its cook says so and it goes back to WAITING.`);
    avertir(`brigade : #${numero} sur ${station} — its WAITING follow-up date (${direRelance(attente.followUp)}) is reached: back on the rail`);
    rentres.push(numero);
  }
  return rentres;
}
