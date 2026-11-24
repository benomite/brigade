// Le calendrier est une source de tickets (#4138, règle 1 du processus simplifié) :
// le travail qui revient — la clôture du mois, l'épisode de la semaine, le closer
// du jour — arrive dans le backlog comme tout ticket, une issue par période.
//
// Les entrées vivent dans la fiche du projet (`recurring` de
// `.claude/brigade/projet.json`, `docs/reglages.md`) : `{ name, frequency, priority }`.
// À chaque passage, une entrée dont la période a commencé et qui n'a pas encore
// d'issue pour elle en ouvre une : son titre est le nom, son label la priorité.
// Chaque issue porte un marqueur caché (id de la récurrence + période) que le
// passage cherche parmi les issues ouvertes et fermées avant d'ouvrir : relancé,
// dans la même période, il n'ouvre rien. Une entrée retirée de la fiche n'ouvre
// plus rien ; les issues déjà ouvertes ne sont pas touchées.
//
// Les périodes sont celles du calendrier UTC : le jour, la semaine ISO 8601, le mois.
const FREQUENCES = ["daily", "weekly", "monthly"] as const;
type Frequence = (typeof FREQUENCES)[number];

type EntreeRecurrente = { name: string; frequency: Frequence; priority: string };

type TicketDuCalendrier = { numero: number; etat: "open" | "closed"; titre: string; corps: string; etiquettes: string[] };

type GitHubDuCalendrier = {
  // Les tickets de la période courante, ouverts et fermés.
  listerTickets(): Promise<TicketDuCalendrier[]>;
  ouvrirTicket(ticket: { titre: string; corps: string; etiquettes: string[] }): Promise<number>;
};

type ErreurDEntree = { entree: string; champ: string; message: string };

const PRIORITE = /^prio:[0-9]$/;

const deux = (n: number) => String(n).padStart(2, "0");

// La semaine ISO de l'instant, `2026-W48` : son jeudi donne l'année ISO.
function semaineIso(instant: Date): string {
  const jeudi = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
  jeudi.setUTCDate(jeudi.getUTCDate() + 4 - (jeudi.getUTCDay() || 7));
  const debutDeLAnnee = Date.UTC(jeudi.getUTCFullYear(), 0, 1);
  return `${jeudi.getUTCFullYear()}-W${deux(Math.ceil(((jeudi.getTime() - debutDeLAnnee) / 86_400_000 + 1) / 7))}`;
}

// La période de la fréquence où tombe l'instant.
function periodeDe(frequence: Frequence, instant: Date): string {
  if (frequence === "daily") return instant.toISOString().slice(0, 10);
  if (frequence === "weekly") return semaineIso(instant);
  return instant.toISOString().slice(0, 7);
}

// Le marqueur caché d'une occurrence. Le nom est écrit en JSON, sans `-` ni `>` :
// il ne referme jamais le commentaire.
function marqueurDe(nom: string, periode: string): string {
  const id = JSON.stringify(nom).replace(/-/g, "\\u002d").replace(/>/g, "\\u003e");
  return `<!-- brigade:recurrence id=${id} period=${periode} -->`;
}

// Les entrées lues de la fiche : celles qui se lisent, et une erreur par champ de
// celles qui ne se lisent pas, qui nomme l'entrée et le champ.
function lireLesEntrees(brutes: unknown[]): { entrees: EntreeRecurrente[]; erreurs: ErreurDEntree[] } {
  const entrees: EntreeRecurrente[] = [];
  const erreurs: ErreurDEntree[] = [];
  const noms = new Set<string>();
  brutes.forEach((brute, rang) => {
    const champs = (typeof brute === "object" && brute !== null && !Array.isArray(brute) ? brute : {}) as Record<string, unknown>;
    const { name, frequency, priority } = champs;
    const entree = typeof name === "string" && name.trim() !== "" ? name : `#${rang + 1}`;
    const refuser = (champ: string, pourquoi: string) => erreurs.push({ entree, champ, message: `recurring entry “${entree}”: ${champ} ${pourquoi}` });
    if (typeof name !== "string" || name.trim() === "") refuser("name", "is missing: expected the title of the issue to open");
    else if (noms.has(name)) refuser("name", "is declared twice: each entry has its own name");
    if (frequency === undefined) refuser("frequency", `is missing: expected ${FREQUENCES.join(", ")}`);
    else if (!(FREQUENCES as readonly unknown[]).includes(frequency)) refuser("frequency", `is “${String(frequency)}”: expected ${FREQUENCES.join(", ")}`);
    if (priority === undefined) refuser("priority", "is missing: expected `prio:N`");
    else if (typeof priority !== "string" || !PRIORITE.test(priority)) refuser("priority", `is “${String(priority)}”: expected \`prio:N\`, N from 0 to 9`);
    if (erreurs.some((e) => e.entree === entree)) return;
    noms.add(entree);
    entrees.push({ name: entree, frequency: frequency as Frequence, priority: priority as string });
  });
  return { entrees, erreurs };
}

// Un passage : ouvre l'issue de chaque entrée dont la période n'en a pas. Une
// entrée refusée ou dont l'issue ne s'ouvre pas est dite dans `erreurs` et
// n'arrête pas les autres. Une liste des tickets qui échoue lève : sans elle, rien ne s'ouvre.
export async function ouvrirRecurrences({ entrees, maintenant, github }: { entrees: unknown[]; maintenant: Date; github: GitHubDuCalendrier }): Promise<{ ouverts: number[]; erreurs: ErreurDEntree[] }> {
  const { entrees: lues, erreurs } = lireLesEntrees(entrees);
  const ouverts: number[] = [];
  if (lues.length === 0) return { ouverts, erreurs };
  const existants = await github.listerTickets();
  for (const entree of lues) {
    const marqueur = marqueurDe(entree.name, periodeDe(entree.frequency, maintenant));
    if (existants.some((ticket) => ticket.corps.includes(marqueur))) continue;
    try {
      const numero = await github.ouvrirTicket({
        titre: entree.name,
        corps: `${marqueur}\n\nRecurring ${entree.frequency} work, opened by the calendar.`,
        etiquettes: [entree.priority],
      });
      ouverts.push(numero);
    } catch (erreur) {
      const pourquoi = (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0] ?? "";
      erreurs.push({ entree: entree.name, champ: "issue", message: `recurring entry “${entree.name}”: the issue is not opened, retried on the next run — ${pourquoi}` });
    }
  }
  return { ouverts, erreurs };
}
