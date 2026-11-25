// Parquer un ticket depuis l'app (ticket 4129 ; d'abord WAITING, ticket 3075) : ce qu'un ticket attend se lit et s'écrit sur
// son issue, exactement comme le runtime (`parked set`) et le second l'y posent — le label `parked` tant qu'il attend, et
// le commentaire marqué `<!-- brigade:parked … -->` qui dit qui il attend, pour quoi, jusqu'à quand
// (runtime/src/attente-github/marque.ts, `corpsDuParking`). Sur tout projet, sans commande de la box. Ce module en a
// les deux bouts :
//   - la lecture : le dernier commentaire de parking d'une issue au label `parked`, rendu dans la forme de `tiers`
//     (faits.ts, `Tiers`) — ce que sa carte dit (tableau/attente-du-chef.ts) ; les commentaires `**WAITING: awaiting …**`
//     d'avant ticket 4129 se lisent encore ;
//   - les gestes : « waiting for… » écrit le commentaire puis le label ; « resume » et « it arrived, back to the
//     kitchen » retirent le label (gestes-github.ts, `retirerLeLabel`) : le ticket reprend exactement où il était.
// Rien de Node : le téléphone le charge tel quel.
import { attenteDeLIssue, corpsDuParking, direJusqua, DE_CONFIANCE } from "../../../../runtime/src/attente-github/marque.ts";
import type { Tiers } from "../../faits.ts";
import { LABELS_DES_GESTES, retirerLeLabel, ticketsLus, type Ecrit } from "../../gestes-github.ts";
import type { ClientDeLaPriorite } from "../../priorite.ts";
import { refusDe } from "../../tableau/client.ts";
import type { TableauLu } from "../../tableau/lecture.ts";
import { saisieLue, type Saisie } from "./saisie.ts";

// Le label d'un ticket parqué (`parked`).
export const LABEL_WAITING = LABELS_DES_GESTES.cuisine;
// Ce que son déparquage fait de lui.
export const A_L_ARRIVEE = "it resumes exactly where it was";

const MOIS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Le commentaire qui parque le ticket : celui de `parked set` et du second, mot pour mot (`corpsDuParking`). `relance` :
// minuit, au jour du poste, du jour que le chef a choisi — comme le runtime prend `--until`.
export const marqueDAttente = ({ quoi, qui }: { quoi: string; qui: string }, relance: Date): string => corpsDuParking({ what: quoi, who: qui, followUp: relance.toISOString() });

const TETE = /^\*\*WAITING(?: — updated)?: awaiting (.+?)\.\*\* ?(.*)$/;
const INSTANT = /^(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))? (\d{2}):(\d{2}) UTC$/;
const JOUR_MS = 86_400_000;

// Un instant tel que l'app l'écrivait avant ticket 4129, ou `direInstantEn` sans son année (« 16 Nov 23:00 UTC ») : celle qui le met
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

// Ce que dit un commentaire de parking marqué (`<!-- brigade:parked … -->`) d'un auteur du dépôt, dans la forme de
// `tiers` — depuis : l'instant où il a été posté ; à l'arrivée : il reprend où il était. Null pour un autre commentaire.
function tiersDuParking(corps: string, association: unknown, posteLe: string): Tiers | null {
  const attente = typeof association === "string" && DE_CONFIANCE.includes(association) ? attenteDeLIssue([{ body: corps, association }]) : null;
  if (attente === null || Number.isNaN(Date.parse(posteLe))) return null;
  return { quoi: attente.what, qui: attente.who, depuis: new Date(posteLe).toISOString(), relance: attente.fact === undefined ? attente.followUp : null, aLArrivee: `${direJusqua(attente)}, then ${A_L_ARRIVEE}` };
}

// Ce que l'issue dit de son attente : son dernier commentaire de parking — null sans aucun qui se lise.
export function tiersDesCommentaires(commentaires: readonly { body?: unknown; created_at?: unknown; author_association?: unknown }[]): Tiers | null {
  for (const { body, created_at: le, author_association: association } of [...commentaires].reverse()) {
    const tiers = typeof body === "string" && typeof le === "string" ? (tiersDuParking(body, association, le) ?? tiersDeLaMarque(body, le)) : null;
    if (tiers !== null) return tiers;
  }
  return null;
}

const numero = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;
const raison = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const objet = (valeur: unknown): Record<string, unknown> => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : {});

// « waiting for… » écrit sur l'issue : le commentaire de parking, puis le label `parked`. Rien ne part sans un
// formulaire complet, ni pour un ticket que la dernière lecture ne porte pas ; un commentaire posté dont le label est
// refusé se dit tel : le ticket n'est pas parqué.
async function poserSurGithub(lu: TableauLu | undefined, ticket: unknown, saisie: unknown, aujourdhui: Date, client: ClientDeLaPriorite): Promise<Ecrit> {
  if (!numero(ticket)) return { refus: "nothing was written: the action names no ticket", detail: "" };
  const lue = saisieLue(saisie, aujourdhui);
  if ("refus" in lue) return { refus: lue.refus, detail: "" };
  if (lu === undefined) return { refus: "nothing was written: the rail of this project has not been read yet — read it again", detail: "" };
  if (!ticketsLus(lu).has(ticket)) return { refus: `nothing was written: #${ticket} is not on the latest rail read — read it again`, detail: "" };
  return ecrireLAttente(lu.depot, ticket, lue, aujourdhui, client);
}

// Le parking écrit sur l'issue de `ticket` : son commentaire, puis le label — ce que « waiting for… » écrit, et ce
// que « Wait for … » d'une carte du manager joue (tableau-gestes/reponse-github.ts, ticket 3434). Un commentaire posté dont le
// label est refusé se dit tel : le ticket n'est pas parqué.
export async function ecrireLAttente(depot: string, ticket: number, lue: Saisie, aujourdhui: Date, client: ClientDeLaPriorite): Promise<Ecrit> {
  const [an, mois, jour] = lue.relance.split("-").map(Number);
  const corps = marqueDAttente(lue, new Date(an ?? 0, (mois ?? 1) - 1, jour ?? 1));
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
    return { refus: `#${ticket} is not parked: its comment is posted, but GitHub did not set \`${LABEL_WAITING}\` — try again`, detail: raison(erreur) };
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
  return "fait" in rendu ? { fait: `resumed on GitHub: #${String(ticket)} no longer carries \`${LABEL_WAITING}\` — it resumes exactly where it was`, detail: rendu.detail } : rendu;
}

// Un geste de parking, d'où qu'il parte, sur tout projet : écrit sur l'issue, jamais par une commande de la box (ticket 4129).
export async function jouerLAttente(options: { id: unknown; ticket: unknown; saisie: unknown; aujourdhui: Date; lu: () => TableauLu | undefined; client: ClientDeLaPriorite }): Promise<Ecrit> {
  return attenteSurGithub({ ...options, lu: options.lu() });
}
