// Ce que le chef remplit pour parquer un ticket, lu avant que rien ne parte : ce qu'il attend,
// dans ses mots, de qui, et le jour de la relance, proposé à sept jours. Cette lecture sert le parking écrit sur GitHub
// (wait-github.ts) et le second (second/parking.ts) : ce module n'importe rien
// de Node.

// La relance que le formulaire propose : dans sept jours — celle que le runtime prend sans elle.
export const RELAUNCH_PROPOSED_DAYS = 7;

// Ce que le chef remplit : ce qu'il attend, de qui, et le jour de la relance (`AAAA-MM-JJ`).
export type Input = { quoi: string; qui: string; relance: string };

const two = (n: number) => String(n).padStart(2, "0");
// Un jour du calendrier du poste, tel qu'un `<input type="date">` l'écrit.
export const dayOf = (date: Date) => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
// La relance proposée, d'après le jour du poste.
export const relaunchProposed = (today: Date) => dayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + RELAUNCH_PROPOSED_DAYS));

// Un caractère de contrôle (terminals.ts, `CONTROLE`) : un saut de ligne enverrait la commande avant son terme.
const CONTROL = /[\x00-\x1f\x7f]/;
const DAY = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const WITHOUT_CONTROL = "nothing is written: what you typed carries a control character, and a line break would have sent the command";
export const WITHOUT_WHAT = "nothing is written: say what it waits for, in your words";
const WITHOUT_WHO = "nothing is written: say whom it waits for — the client, a team, a person";

// Ce que le formulaire dit de la relance, ou pourquoi elle ne part pas : un jour du
// calendrier, après aujourd'hui — le runtime prend ce jour-là à minuit, et refuse ce qui est passé.
function relaunchOf(value: string, today: Date): string | { refus: string } {
  const [, an, month, day] = DAY.exec(value) ?? [];
  const date = an === undefined ? undefined : new Date(Number(an), Number(month) - 1, Number(day));
  if (date === undefined || dayOf(date) !== value) return { refus: `nothing is written: the follow-up date “${value}” is not a day of the calendar (YYYY-MM-DD)` };
  if (value <= dayOf(today)) return { refus: `nothing is written: the follow-up date ${value} is not after today — a follow-up is to come` };
  return value;
}

// Ce que le chef a rempli, débarrassé de ses blancs — ou pourquoi rien ne part : rien sur ce qu'il attend ou de qui, un
// caractère de contrôle, une relance qui n'est pas un jour à venir. `aujourdhui` : le jour du poste, qui borne la relance.
export function inputRead(input: unknown, today: Date): Input | { refus: string } {
  const fields = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const [what = "", who = "", relaunch = ""] = [fields.quoi, fields.qui, fields.relance].map((value) => (typeof value === "string" ? value.trim() : ""));
  if (what === "") return { refus: WITHOUT_WHAT };
  if (who === "") return { refus: WITHOUT_WHO };
  if ([what, who, relaunch].some((value) => CONTROL.test(value))) return { refus: WITHOUT_CONTROL };
  const day = relaunchOf(relaunch, today);
  return typeof day === "string" ? { quoi: what, qui: who, relance: day } : day;
}
