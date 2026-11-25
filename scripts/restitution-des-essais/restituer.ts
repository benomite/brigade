// One-time tool (#4321, epic #4319): gives back the tries the Mac station's fetch failure on the
// missing branch `v2` took from tickets. A try is one `brigade:echec` comment on the ticket
// (`MARQUE_D_ECHEC`, the runtime's count), so the restore deletes the comments that failure wrote:
// the ones by `macbook-air-de-benoit/claude`, with the reason `couldn't find remote ref refs/heads/v2`,
// between 17:00 and 19:40 UTC on 2026-11-25. A failure of any other cause stays, and so do its tries.
// Then a ticket set aside by its failures goes back on the rail: `set-aside:failures` out, `fire` in.
//
// Dry run by default: it prints what it would change and writes nothing. `--apply` writes.
// A second run finds no matching comment and no set-aside label: it writes nothing.
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { MARQUE_D_ECHEC } from "../../runtime/src/qualite-github.ts";

// What this script asks of GitHub, replaceable for the tests: `lire` returns every item of a
// (paginated) listing, `ecrire` sends one write. Each `ecrire` call is one write of the budget.
export type Github = {
  lire: (chemin: string) => unknown[];
  ecrire: (methode: string, chemin: string, champs?: Record<string, string | string[]>) => void;
};

export const githubReel = (env: NodeJS.ProcessEnv = process.env): Github => {
  const gh = (...args: string[]) => execFileSync(env.BRIGADE_GH_BIN || "gh", args, { env, encoding: "utf8", timeout: 120_000, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return {
    lire: (chemin) =>
      gh("api", "--paginate", "--jq", ".[]", chemin)
        .split("\n")
        .filter((ligne) => ligne.trim() !== "")
        .map((ligne) => JSON.parse(ligne) as unknown),
    ecrire: (methode, chemin, champs = {}) => {
      gh("api", "-X", methode, ...Object.entries(champs).flatMap(([nom, valeur]) => (Array.isArray(valeur) ? valeur.flatMap((v) => ["-f", `${nom}[]=${v}`]) : ["-f", `${nom}=${valeur}`])), chemin);
    },
  };
};

export const STATION = "macbook-air-de-benoit/claude";
export const RAISON = "couldn't find remote ref refs/heads/v2";
export const DEBUT = Date.parse("2026-11-25T17:00:00Z");
export const FIN = Date.parse("2026-11-25T19:40:00Z");
const RAIL = "fire";
const ECHECS_ATTEINTS = "set-aside:failures";

const dit = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

function champ(valeur: unknown, nom: string, pour: string): unknown {
  const v = (valeur as Record<string, unknown> | null)?.[nom];
  if (v === undefined || v === null) throw new Error(`${pour}: GitHub returned no \`${nom}\``);
  return v;
}
function texte(valeur: unknown, nom: string, pour: string): string {
  const v = champ(valeur, nom, pour);
  if (typeof v !== "string") throw new Error(`${pour}: \`${nom}\` is not text`);
  return v;
}

export type Commentaire = { id: number; body: string; instant: number };

// Is it a failure comment written by the dead-branch fetch failure of the Mac station?
export function estLEchecDeV2(c: Commentaire): boolean {
  if (!c.body.startsWith(MARQUE_D_ECHEC)) return false;
  if (!(c.instant >= DEBUT && c.instant <= FIN)) return false;
  const ligne = c.body.split("\n")[1] ?? "";
  return ligne.startsWith(`Station \`${STATION}\`:`) && ligne.includes(RAISON) && !/refs\/heads\/v2[\w/.-]/.test(ligne);
}

export type Plan = { numero: number; essaisAvant: number; essaisApres: number; aSupprimer: Commentaire[]; labels: string[] | null; retire: boolean };

function lireLeTicket(github: Github, depot: string, numero: number, labelsLus: string[]): Plan {
  const pour = `${depot}#${numero}`;
  const commentaires = github.lire(`repos/${depot}/issues/${numero}/comments?per_page=100`).map((c): Commentaire => {
    const date = Date.parse(texte(c, "created_at", pour));
    if (Number.isNaN(date)) throw new Error(`${pour}: a comment has an unreadable date`);
    const id = champ(c, "id", pour);
    if (typeof id !== "number") throw new Error(`${pour}: a comment has an unreadable id`);
    return { id, body: texte(c, "body", pour), instant: date };
  });
  const essais = commentaires.filter((c) => c.body.startsWith(MARQUE_D_ECHEC));
  const aSupprimer = essais.filter(estLEchecDeV2);
  const retire = labelsLus.includes(ECHECS_ATTEINTS);
  const labels = retire ? [...labelsLus.filter((l) => l !== ECHECS_ATTEINTS && l !== RAIL), RAIL] : null;
  return { numero, essaisAvant: essais.length, essaisApres: essais.length - aSupprimer.length, aSupprimer, labels, retire };
}

const nomsDesLabels = (issue: unknown, pour: string): string[] => {
  const labels = champ(issue, "labels", pour);
  if (!Array.isArray(labels)) throw new Error(`${pour}: \`labels\` is not a list`);
  return labels.map((l) => (typeof l === "string" ? l : texte(l, "name", pour)));
};

// Candidates: the open tickets set aside by their failures, plus the numbers asked for.
export function planifier(github: Github, depot: string, numeros: number[]): Plan[] {
  const issues = new Map<number, string[]>();
  for (const issue of github.lire(`repos/${depot}/issues?state=open&labels=${encodeURIComponent(ECHECS_ATTEINTS)}&per_page=100`)) {
    const n = champ(issue, "number", depot);
    if (typeof n !== "number") throw new Error(`${depot}: an issue has an unreadable number`);
    issues.set(n, nomsDesLabels(issue, `${depot}#${n}`));
  }
  for (const n of numeros) {
    if (issues.has(n)) continue;
    const [issue] = github.lire(`repos/${depot}/issues/${n}`);
    if (issue === undefined) throw new Error(`${depot}#${n}: GitHub returned no issue`);
    issues.set(n, nomsDesLabels(issue, `${depot}#${n}`));
  }
  return [...issues]
    .sort(([a], [b]) => a - b)
    .map(([n, labels]) => lireLeTicket(github, depot, n, labels))
    .filter((plan) => plan.aSupprimer.length > 0 || plan.retire);
}

const ecritures = (plan: Plan): number => plan.aSupprimer.length + (plan.labels === null ? 0 : 1);

export function passer(depot: string, options: { appliquer: boolean; numeros: number[] }, github: Github): { sortie: string[]; code: number } {
  try {
    const plans = planifier(github, depot, options.numeros);
    const sortie: string[] = [`== ${depot}${options.appliquer ? "" : " (dry run: nothing is written, --apply writes)"}`];
    for (const plan of plans) {
      const changement = plan.labels === null ? "labels unchanged" : `labels: -${ECHECS_ATTEINTS} +${RAIL}`;
      sortie.push(`#${plan.numero}: tries ${plan.essaisAvant} -> ${plan.essaisApres}; delete ${plan.aSupprimer.length} comment(s); ${changement}`);
      if (!options.appliquer) continue;
      // A comment cannot be undone once deleted: its text is printed here, as the record.
      for (const c of plan.aSupprimer) {
        sortie.push(`  deleted comment ${c.id}: ${c.body.replaceAll("\n", " | ")}`);
        github.ecrire("DELETE", `repos/${depot}/issues/comments/${c.id}`);
      }
      // The label change comes last: an interrupted run is replayed by the next one.
      if (plan.labels !== null) github.ecrire("PATCH", `repos/${depot}/issues/${plan.numero}`, { labels: plan.labels });
    }
    const total = plans.reduce((somme, plan) => somme + ecritures(plan), 0);
    sortie.push(`${plans.length} ticket(s); ${total} GitHub write${total === 1 ? "" : "s"} ${options.appliquer ? "made" : "would be made"}`);
    return { sortie, code: 0 };
  } catch (erreur) {
    return { sortie: [`FAILED on ${depot}: ${dit(erreur)}`], code: 1 };
  }
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  const { values, positionals } = parseArgs({ options: { repo: { type: "string", default: "benomite/brigade" }, apply: { type: "boolean", default: false } }, allowPositionals: true, strict: true });
  const numeros = positionals.map((p) => (/^#?\d+$/.test(p) ? Number(p.replace("#", "")) : NaN));
  if (!/^[\w.-]+\/[\w.-]+$/.test(values.repo) || numeros.some(Number.isNaN)) {
    console.error("usage: node scripts/restitution-des-essais/restituer.ts [--repo <owner/name>] [--apply] [issue number ...]");
    process.exit(2);
  }
  const { sortie, code } = passer(values.repo, { appliquer: values.apply, numeros }, githubReel());
  console.log(sortie.join("\n"));
  process.exit(code);
}
