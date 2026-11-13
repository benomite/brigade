// WAITING sur un projet GitHub (ticket 3075) : ce qu'un ticket attend d'un tiers se lit et s'écrit sur son issue, comme le
// runtime l'y pose (runtime/src/attente.ts, `marquerAttentes`) — le label `waiting` tant qu'il attend, et un commentaire
// à l'entrée en WAITING : ce qu'il attend, de qui, depuis quand, sa relance, ce que « c'est arrivé » fera de lui
// (`direMarque`). Ce module en a les deux bouts :
//   - la lecture : le dernier commentaire `**WAITING…: awaiting …**` d'une issue au label `waiting`, rendu dans la forme
//     de `tiers` (faits.ts, `Tiers`) — ce que la carte de WAITING dit (tableau/attente-du-chef.ts) ;
//   - les gestes : « waiting for… » et « resume » partent dans la commande `waiting` du runtime quand il tourne sur ce
//     poste (attente.ts, `ecrireAttente`) ; sans runtime à joindre — le téléphone, ou un ordinateur dont la station du
//     projet est ailleurs —, ils s'écrivent sur l'issue, ce que la commande y écrit : le commentaire puis le label pour
//     « waiting for… », le label retiré pour « resume ». « It arrived, back to the kitchen » retire le label, partout
//     (gestes-github.ts, `retirerLeLabel`).
// Rien de Node : le téléphone le charge tel quel.
import type { Tiers } from "../../faits.ts";
import { LABELS_DES_GESTES, retirerLeLabel, ticketsLus, type Ecrit } from "../../gestes-github.ts";
import type { ClientDeLaPriorite } from "../../priorite.ts";
import { refusDe } from "../../tableau/client.ts";
import type { TableauLu } from "../../tableau/lecture.ts";
import { saisieLue, type Saisie } from "./saisie.ts";

export const LABEL_WAITING = LABELS_DES_GESTES.cuisine;
// Ce que « c'est arrivé » fait d'un ticket sans livraison ouverte, mot pour mot comme le runtime le dit
// (runtime/src/projections/rail.ts, `direALArriveeEn`).
export const A_L_ARRIVEE = "it goes back to the kitchen, without going through TODO: it is put back on the rail, and a cook takes it in its turn";

const MOIS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const deux = (n: number) => String(n).padStart(2, "0");
// Un instant comme le runtime le dit (`direInstantEn`, « 16 Nov 23:00 UTC »), son année en plus : une relance lointaine
// ne se relit pas l'année d'avant.
const instantEcrit = (date: Date) => `${date.getUTCDate()} ${MOIS[date.getUTCMonth()]} ${date.getUTCFullYear()} ${deux(date.getUTCHours())}:${deux(date.getUTCMinutes())} UTC`;

// Le commentaire d'entrée en WAITING, dans la forme de `direMarque` (runtime/src/attente.ts) : sa tête, puis une ligne
// par ce qu'il dit. `relance` : minuit, au jour du poste, du jour que le chef a choisi — comme le runtime prend `--remind`.
export function marqueDAttente({ quoi, qui }: { quoi: string; qui: string }, depuis: Date, relance: Date): string {
  return [
    `**WAITING: awaiting ${qui}.** ${quoi}`,
    "",
    `- **from whom**: ${qui}`,
    `- **since**: ${instantEcrit(depuis)}`,
    `- **follow-up**: ${instantEcrit(relance)}`,
    `- **on arrival**: ${A_L_ARRIVEE}`,
    "",
    `As long as it has the \`${LABEL_WAITING}\` label, the kitchen does not take it, and its follow-up does not take it out. Removing this label sends it back to the kitchen; “resume” on its card in the app gives it back the state it had before waiting.`,
  ].join("\n");
}

const TETE = /^\*\*WAITING(?: — updated)?: awaiting (.+?)\.\*\* ?(.*)$/;
const INSTANT = /^(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))? (\d{2}):(\d{2}) UTC$/;
const JOUR_MS = 86_400_000;

// Un instant tel que `instantEcrit` l'écrit, ou `direInstantEn` sans son année (« 16 Nov 23:00 UTC ») : celle qui le met
// au plus près de `repere` — avant lui, à un jour près, pour `depuis` (le commentaire est posté après la mise en
// attente) ; à partir de lui pour la relance, qui vient après. Null pour un texte qui n'a pas cette forme.
function instantDit(dit: string, repere: number, sens: "avant" | "apres"): string | null {
  const [, jour, mois, annee, heure, minute] = INSTANT.exec(dit.trim()) ?? [];
  const rang = MOIS.indexOf(mois ?? "");
  if (jour === undefined || rang < 0) return null;
  const en = (an: number) => Date.UTC(an, rang, Number(jour), Number(heure), Number(minute));
  const an = new Date(repere).getUTCFullYear();
  const instant = annee !== undefined ? en(Number(annee)) : sens === "avant" ? (en(an) > repere + JOUR_MS ? en(an - 1) : en(an)) : en(an) < repere ? en(an + 1) : en(an);
  return Number.isNaN(instant) ? null : new Date(instant).toISOString();
}

// Ce qu'un commentaire d'entrée en WAITING dit, dans la forme de `tiers` — ou null pour un autre commentaire, ou une
// marque dont un morceau ne se lit pas : rien n'est inventé à sa place. `posteLe` : l'instant où il a été posté.
export function tiersDeLaMarque(corps: string, posteLe: string): Tiers | null {
  const lignes = corps.split("\n").map((ligne) => ligne.trimEnd());
  const [, qui, quoi] = TETE.exec(lignes[0] ?? "") ?? [];
  if (qui === undefined || quoi === undefined || quoi.trim() === "") return null;
  const dit = (libelle: string) => lignes.find((ligne) => ligne.startsWith(`- **${libelle}**: `))?.slice(`- **${libelle}**: `.length).trim();
  const [depuisDit, relanceDite, aLArrivee] = [dit("since"), dit("follow-up"), dit("on arrival")];
  const poste = Date.parse(posteLe);
  if (depuisDit === undefined || relanceDite === undefined || aLArrivee === undefined || Number.isNaN(poste)) return null;
  const depuis = instantDit(depuisDit, poste, "avant");
  const relance = depuis === null ? null : instantDit(relanceDite, Date.parse(depuis), "apres");
  if (depuis === null || relance === null) return null;
  return { quoi: quoi.trim(), qui: dit("from whom") ?? qui, depuis, relance, aLArrivee };
}

// Ce que l'issue dit de son attente : son dernier commentaire d'entrée en WAITING — null sans aucun qui se lise.
export function tiersDesCommentaires(commentaires: readonly { body?: unknown; created_at?: unknown }[]): Tiers | null {
  for (const { body, created_at: le } of [...commentaires].reverse()) {
    const tiers = typeof body === "string" && typeof le === "string" ? tiersDeLaMarque(body, le) : null;
    if (tiers !== null) return tiers;
  }
  return null;
}

const numero = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;
const raison = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const objet = (valeur: unknown): Record<string, unknown> => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : {});

// « waiting for… » écrit sur l'issue : le commentaire d'entrée en WAITING, puis le label `waiting`. Rien ne part sans un
// formulaire complet, ni pour un ticket que la dernière lecture ne porte pas ; un commentaire posté dont le label est
// refusé se dit tel : le ticket n'est pas en WAITING.
async function poserSurGithub(lu: TableauLu | undefined, ticket: unknown, saisie: unknown, aujourdhui: Date, client: ClientDeLaPriorite): Promise<Ecrit> {
  if (!numero(ticket)) return { refus: "nothing was written: the action names no ticket", detail: "" };
  const lue = saisieLue(saisie, aujourdhui);
  if ("refus" in lue) return { refus: lue.refus, detail: "" };
  if (lu === undefined) return { refus: "nothing was written: the rail of this project has not been read yet — read it again", detail: "" };
  if (!ticketsLus(lu).has(ticket)) return { refus: `nothing was written: #${ticket} is not on the latest rail read — read it again`, detail: "" };
  return ecrireLAttente(lu.depot, ticket, lue, aujourdhui, client);
}

// L'entrée en WAITING écrite sur l'issue de `ticket` : son commentaire, puis le label — ce que « waiting for… » écrit, et ce
// que « Wait for … » d'une carte du manager joue (tableau-gestes/reponse-github.ts, #3434). Un commentaire posté dont le
// label est refusé se dit tel : le ticket n'est pas en WAITING.
export async function ecrireLAttente(depot: string, ticket: number, lue: Saisie, aujourdhui: Date, client: ClientDeLaPriorite): Promise<Ecrit> {
  const [an, mois, jour] = lue.relance.split("-").map(Number);
  const corps = marqueDAttente(lue, aujourdhui, new Date(an ?? 0, (mois ?? 1) - 1, jour ?? 1));
  const issue = `/repos/${depot}/issues/${ticket}`;
  let adresse = `https://github.com/${depot}/issues/${ticket}`;
  try {
    const poste = await client.ecrire("POST", `${issue}/comments`, { body: corps });
    if (poste.status !== 201) throw refusDe("the comment", poste);
    const url = objet(poste.data).html_url;
    if (typeof url === "string") adresse = url;
  } catch (erreur) {
    return { refus: `nothing was changed: GitHub did not take the WAITING comment on #${ticket}`, detail: raison(erreur) };
  }
  try {
    const pose = await client.ecrire("POST", `${issue}/labels`, { labels: [LABEL_WAITING] });
    if (pose.status !== 200) throw refusDe(`\`${LABEL_WAITING}\``, pose);
  } catch (erreur) {
    return { refus: `#${ticket} is not in WAITING: its comment is posted, but GitHub did not set \`${LABEL_WAITING}\` — try again`, detail: raison(erreur) };
  }
  return { fait: `in WAITING on GitHub: #${ticket} awaits ${lue.qui}, follow-up on ${lue.relance}`, detail: adresse };
}

// Un geste de WAITING écrit sur GitHub, sans runtime : « waiting for… », « resume » ou « it arrived, back to the kitchen ».
export async function attenteSurGithub(options: { id: unknown; ticket: unknown; saisie: unknown; aujourdhui: Date; lu: TableauLu | undefined; client: ClientDeLaPriorite }): Promise<Ecrit> {
  const { id, ticket, lu, client } = options;
  if (id === "attente-poser") return poserSurGithub(lu, ticket, options.saisie, options.aujourdhui, client);
  if (id === "attente-arrivee") return retirerLeLabel(lu, "cuisine", ticket, client);
  if (id !== "attente-reprendre") return { refus: "nothing was sent: this is not a WAITING gesture", detail: `“${String(id)}” is not one` };
  const rendu = await retirerLeLabel(lu, "cuisine", ticket, client);
  return "fait" in rendu ? { fait: `resumed on GitHub: #${String(ticket)} no longer carries \`${LABEL_WAITING}\` — it is back where it was before waiting`, detail: rendu.detail } : rendu;
}

// Un geste de WAITING, d'où qu'il parte : par la commande du runtime quand il tourne ici (`parLeRuntime`, attente.ts —
// rien, sans lui ou pour « it arrived », qui n'est pas une commande), sinon écrit sur GitHub.
export async function jouerLAttente<R>(options: { id: unknown; ticket: unknown; saisie: unknown; aujourdhui: Date; lu: () => TableauLu | undefined; client: ClientDeLaPriorite; parLeRuntime?: () => R | undefined }): Promise<R | Ecrit> {
  const parti = options.id === "attente-arrivee" ? undefined : options.parLeRuntime?.();
  if (parti !== undefined) return parti;
  return attenteSurGithub({ ...options, lu: options.lu() });
}
