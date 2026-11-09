// Ce que le chef remplit dans « waiting for… » (vue/attente/attente.js), lu avant que rien ne parte : ce qu'il attend,
// dans ses mots, de qui, et le jour de la relance, proposé à sept jours. La même lecture sert la commande du runtime
// (attente.ts, `commandeDAttente`) et l'attente écrite sur GitHub (attente-github.ts) — sur le desktop comme sur le
// téléphone : ce module n'importe rien de Node.

// La relance que le formulaire propose : dans sept jours — celle que le runtime prend sans elle.
export const RELANCE_PROPOSEE_JOURS = 7;

// Ce que le chef remplit : ce qu'il attend, de qui, et le jour de la relance (`AAAA-MM-JJ`).
export type Saisie = { quoi: string; qui: string; relance: string };

const deux = (n: number) => String(n).padStart(2, "0");
// Un jour du calendrier du poste, tel qu'un `<input type="date">` l'écrit.
export const jourDe = (date: Date) => `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
// La relance proposée, d'après le jour du poste.
export const relanceProposee = (aujourdhui: Date) => jourDe(new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() + RELANCE_PROPOSEE_JOURS));

// Un caractère de contrôle (terminaux.ts, `CONTROLE`) : un saut de ligne enverrait la commande avant son terme.
const CONTROLE = /[\x00-\x1f\x7f]/;
const JOUR = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const SANS_CONTROLE = "nothing is written: what you typed carries a control character, and a line break would have sent the command";
export const SANS_QUOI = "nothing is written: say what it waits for, in your words";
const SANS_QUI = "nothing is written: say whom it waits for — the client, a team, a person";

// Ce que le formulaire dit de la relance, ou pourquoi elle ne part pas : un jour du
// calendrier, après aujourd'hui — le runtime prend ce jour-là à minuit, et refuse ce qui est passé.
function relanceDe(valeur: string, aujourdhui: Date): string | { refus: string } {
  const [, an, mois, jour] = JOUR.exec(valeur) ?? [];
  const date = an === undefined ? undefined : new Date(Number(an), Number(mois) - 1, Number(jour));
  if (date === undefined || jourDe(date) !== valeur) return { refus: `nothing is written: the follow-up date “${valeur}” is not a day of the calendar (YYYY-MM-DD)` };
  if (valeur <= jourDe(aujourdhui)) return { refus: `nothing is written: the follow-up date ${valeur} is not after today — a follow-up is to come` };
  return valeur;
}

// Ce que le chef a rempli, débarrassé de ses blancs — ou pourquoi rien ne part : rien sur ce qu'il attend ou de qui, un
// caractère de contrôle, une relance qui n'est pas un jour à venir. `aujourdhui` : le jour du poste, qui borne la relance.
export function saisieLue(saisie: unknown, aujourdhui: Date): Saisie | { refus: string } {
  const champs = typeof saisie === "object" && saisie !== null ? (saisie as Record<string, unknown>) : {};
  const [quoi = "", qui = "", relance = ""] = [champs.quoi, champs.qui, champs.relance].map((valeur) => (typeof valeur === "string" ? valeur.trim() : ""));
  if (quoi === "") return { refus: SANS_QUOI };
  if (qui === "") return { refus: SANS_QUI };
  if ([quoi, qui, relance].some((valeur) => CONTROLE.test(valeur))) return { refus: SANS_CONTROLE };
  const jour = relanceDe(relance, aujourdhui);
  return typeof jour === "string" ? { quoi, qui, relance: jour } : jour;
}
