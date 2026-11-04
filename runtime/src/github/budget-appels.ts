// Le budget d'appels à GitHub, par projet et par heure (#2196). Chaque appel
// que le pacer laisse partir (`limite-github.ts`, `prendre`) est déjà inscrit
// dans le compteur partagé de la station : son instant, son projet, s'il écrit.
// Ce module y ajoute sa catégorie — board, issues, gists, PRs, checks — et le
// ticket qu'il sert quand le chemin le dit, et lit ce registre par heure d'horloge :
// le total des lectures et des écritures de chaque projet, contre un budget
// horaire tenu à part pour les unes et les autres.
//
// Choix : l'heure est celle de l'horloge (10:00–10:59 UTC), pas une heure
// glissante. Les compteurs repartent de zéro à l'heure pleine, et l'alerte se
// dit une fois par projet et par heure : la table `alertes_budget` la retient
// pour tous les process qui tiennent le compteur, une transaction tranche.
//
// Ce qui est compté est ce que le compteur compte : un 304 que GitHub ne
// facture pas en sort (`rendre`), ici aussi.
import type { Base } from "../base.ts";

export const CATEGORIES = ["board", "issues", "gists", "PRs", "checks"] as const;
export type Categorie = (typeof CATEGORIES)[number];

// Le budget par défaut : 600 appels par projet et par heure, lectures et
// écritures comptées à part.
export const BUDGET_PAR_HEURE = 600;
export const HEURE_MS = 60 * 60_000;

export const debutDeLHeure = (instant: number): number => Math.floor(instant / HEURE_MS) * HEURE_MS;

// Le chemin de l'API d'un appel `gh api` : le dernier argument qui en est un,
// sans sa requête ni sa barre de tête.
function cheminDe(args: readonly string[]): string {
  const chemin = [...args].reverse().find((arg) => /^\/?(repos|gists?|graphql)\b/.test(arg)) ?? "";
  return chemin.replace(/^\//, "").split("?")[0] ?? "";
}

// La catégorie d'un appel, d'après son chemin. Ce qu'aucun chemin ne nomme
// tombe dans `issues`, le gros des appels d'un dépôt : le contrat n'a que ces
// cinq catégories, et chaque appel en a une.
export function categorieDe(args: readonly string[]): Categorie {
  const chemin = cheminDe(args);
  if (/^gists?(\/|$)/.test(chemin)) return "gists";
  const depot = /^repos\/[^/]+\/[^/]+\/(.*)$/.exec(chemin)?.[1] ?? "";
  if (/^commits\/[^/]+\/pulls$/.test(depot) || /^pulls(\/|$)/.test(depot)) return "PRs";
  if (/^(commits|check-runs|check-suites|statuses|actions)(\/|$)/.test(depot)) return "checks";
  return "issues";
}

// Le ticket que sert un appel, quand son chemin le dit (`issues/<n>`) ; sinon null.
export function ticketDe(args: readonly string[]): number | null {
  const n = /^repos\/[^/]+\/[^/]+\/issues\/([0-9]+)(\/|$)/.exec(cheminDe(args))?.[1];
  return n === undefined ? null : Number(n);
}

// La catégorie d'un appel inscrit sans elle — un compteur d'avant ce registre,
// ou un appel dont seule la sorte de lecture est dite (le tableau, le gist).
export function categorieDeLaLecture(lecture: string | null): Categorie {
  if (lecture === "board") return "board";
  if (lecture === "gist") return "gists";
  if (lecture === "pull-requests") return "PRs";
  return "issues";
}

// Le contrat du registre, tel que `status`, l'app et les mesures le lisent.
export type CompteDuType = { total: number; byCategory: Record<Categorie, number> };
export type BudgetDuProjet = {
  reads: CompteDuType;
  writes: CompteDuType;
  budget: { reads: number; writes: number };
  overBudget: boolean;
};
export type InstantaneDuBudget = {
  windowStart: string;
  projects: Record<string, BudgetDuProjet>;
  perTicket: Record<string, number>;
};

// Un projet a passé son budget dans l'heure : lequel, quels budgets, et les
// catégories qui ont fait ses appels, la plus utilisée d'abord.
export type AlerteDeBudget = {
  projet: string;
  windowStart: string;
  depasses: Array<"reads" | "writes">;
  categories: Array<{ categorie: Categorie; appels: number }>;
};

// Les colonnes et la table que le registre ajoute au compteur.
export function preparerLeRegistre(base: Base): void {
  const colonnes = base.lire<{ name: string }>("PRAGMA table_info(appels)").map((c) => c.name);
  if (!colonnes.includes("categorie")) base.script("ALTER TABLE appels ADD COLUMN categorie TEXT;");
  if (!colonnes.includes("ticket")) base.script("ALTER TABLE appels ADD COLUMN ticket INTEGER;");
  base.script("CREATE TABLE IF NOT EXISTS alertes_budget (projet TEXT NOT NULL, fenetre INTEGER NOT NULL, PRIMARY KEY (projet, fenetre)); CREATE INDEX IF NOT EXISTS appels_par_projet ON appels (projet, ecriture, instant);");
}

const zero = (): CompteDuType => ({ total: 0, byCategory: { board: 0, issues: 0, gists: 0, PRs: 0, checks: 0 } });

type Groupe = { projet: string; ecriture: number; categorie: string | null; lecture: string | null; appels: number };

const estCategorie = (nom: string | null): nom is Categorie => (CATEGORIES as readonly string[]).includes(nom ?? "");

function projetsDe(groupes: Groupe[], budget: number): Record<string, BudgetDuProjet> {
  const projets: Record<string, BudgetDuProjet> = {};
  for (const g of groupes) {
    const projet = (projets[g.projet] ??= { reads: zero(), writes: zero(), budget: { reads: budget, writes: budget }, overBudget: false });
    const compte = g.ecriture === 1 ? projet.writes : projet.reads;
    compte.total += g.appels;
    compte.byCategory[estCategorie(g.categorie) ? g.categorie : categorieDeLaLecture(g.lecture)] += g.appels;
  }
  for (const projet of Object.values(projets)) projet.overBudget = projet.reads.total > projet.budget.reads || projet.writes.total > projet.budget.writes;
  return projets;
}

const GROUPES = "SELECT COALESCE(projet, 'station') AS projet, ecriture, categorie, lecture, count(*) AS appels FROM appels WHERE instant >= ?";

// Le registre de l'heure d'horloge qui contient `instant`.
export function instantaneDe(base: Base, instant: number, budget = BUDGET_PAR_HEURE): InstantaneDuBudget {
  const debut = debutDeLHeure(instant);
  const groupes = base.lire<Groupe>(`${GROUPES} GROUP BY projet, ecriture, categorie, lecture ORDER BY projet`, debut);
  const perTicket: Record<string, number> = {};
  for (const { ticket, appels } of base.lire<{ ticket: number; appels: number }>("SELECT ticket, count(*) AS appels FROM appels WHERE instant >= ? AND ticket IS NOT NULL GROUP BY ticket ORDER BY ticket", debut)) {
    perTicket[String(ticket)] = appels;
  }
  return { windowStart: new Date(debut).toISOString(), projects: projetsDe(groupes, budget), perTicket };
}

// À appeler dans la transaction qui vient d'inscrire un appel de `projet`
// (`ecriture` : s'il écrit) :
// l'alerte à dire si le projet a passé un de ses budgets dans l'heure et qu'elle
// n'a pas encore été dite — par ce process ou un autre. Elle est alors retenue.
export function alerteAEmettre(base: Base, projet: string, ecriture: boolean, instant: number, budget = BUDGET_PAR_HEURE): AlerteDeBudget | null {
  const debut = debutDeLHeure(instant);
  if (base.lire("SELECT 1 FROM alertes_budget WHERE projet = ? AND fenetre = ?", projet, debut).length > 0) return null;
  // Le compte seul, sur l'index, à chaque appel ; le détail, une fois le budget passé.
  const passe = base.lire("SELECT 1 FROM appels WHERE projet = ? AND ecriture = ? AND instant >= ? LIMIT 1 OFFSET ?", projet, ecriture ? 1 : 0, debut, budget);
  if (passe.length === 0) return null;
  const groupes = base.lire<Groupe>(`${GROUPES} AND COALESCE(projet, 'station') = ? GROUP BY ecriture, categorie, lecture`, debut, projet);
  const etat = projetsDe(groupes, budget)[projet];
  if (etat === undefined || !etat.overBudget) return null;
  base.executer("INSERT OR IGNORE INTO alertes_budget (projet, fenetre) VALUES (?, ?)", projet, debut);
  // L'heure d'avant ne dit plus rien.
  base.executer("DELETE FROM alertes_budget WHERE fenetre < ?", debut);
  const depasses = (["reads", "writes"] as const).filter((type) => etat[type].total > etat.budget[type]);
  const categories = CATEGORIES.map((categorie) => ({ categorie, appels: etat.reads.byCategory[categorie] + etat.writes.byCategory[categorie] }))
    .filter(({ appels }) => appels > 0)
    .sort((a, b) => b.appels - a.appels || CATEGORIES.indexOf(a.categorie) - CATEGORIES.indexOf(b.categorie));
  return { projet, windowStart: new Date(debut).toISOString(), depasses, categories };
}

// La ligne de l'alerte, pour le journal de service.
export function direLAlerte(alerte: AlerteDeBudget): string {
  const budgets = alerte.depasses.map((type) => (type === "reads" ? "read" : "write")).join(" and ");
  const categories = alerte.categories.map(({ categorie, appels }) => `${categorie} ${appels}`).join(", ");
  return `brigade : project ${alerte.projet} is over its GitHub ${budgets} budget for the hour starting ${alerte.windowStart} — calls by category: ${categories}`;
}

// Les lignes de `status` : pour chaque projet, ses lectures puis ses écritures
// contre leur budget horaire, chacune sur sa ligne. Sans appel dans l'heure,
// rien : la ligne des appels de `status` dit déjà zéro.
export function direLeBudget(instantane: InstantaneDuBudget): string[] {
  return Object.entries(instantane.projects).flatMap(([nom, p]) =>
    (["reads", "writes"] as const).map((type) => `${nom} ${type} ${p[type].total}/${p.budget[type]} this hour${p[type].total > p.budget[type] ? " — over budget" : ""}`),
  );
}
