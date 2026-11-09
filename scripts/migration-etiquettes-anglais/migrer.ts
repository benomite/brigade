// Brings an existing GitHub repo to the English label catalogue (epic #3029):
// `hors-cuisine` is renamed `served-elsewhere` (GitHub carries the new name onto
// every issue that had the old one) and every label of the catalogue gets its
// English description. The catalogue is the runtime's (`runtime/src/etiquettes.ts`),
// and so is the plan (`planDesLabels`): this script defines no label.
//
// Dry run by default: it prints what it would change and writes nothing. `--apply`
// writes. `--audit` is read-only: it lists the issue and pull request titles and
// comments still written in French, and never rewrites them.
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { planDesLabels, type EtiquetteLue } from "../../runtime/src/etiquettes.ts";

// What this script asks of GitHub, replaceable for the tests: `lire` returns every
// item of a (paginated) listing, `ecrire` sends one PATCH.
export type Github = {
  lire: (chemin: string) => unknown[];
  ecrire: (chemin: string, champs: Record<string, string>) => void;
};

export const githubReel = (env: NodeJS.ProcessEnv = process.env): Github => {
  const gh = (...args: string[]) => execFileSync(env.BRIGADE_GH_BIN || "gh", args, { env, encoding: "utf8", timeout: 120_000, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return {
    lire: (chemin) =>
      gh("api", "--paginate", "--jq", ".[]", chemin)
        .split("\n")
        .filter((ligne) => ligne.trim() !== "")
        .map((ligne) => JSON.parse(ligne) as unknown),
    ecrire: (chemin, champs) => {
      gh("api", "-X", "PATCH", ...Object.entries(champs).flatMap(([nom, valeur]) => ["-f", `${nom}=${valeur}`]), chemin);
    },
  };
};

const dit = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

function texte(valeur: unknown, champ: string, pour: string): string {
  const v = (valeur as Record<string, unknown> | null)?.[champ];
  if (typeof v !== "string") throw new Error(`${pour}: GitHub returned no \`${champ}\``);
  return v;
}

export function lireLesLabels(github: Github, depot: string): EtiquetteLue[] {
  return github.lire(`repos/${depot}/labels?per_page=100`).map((label) => {
    const description = (label as Record<string, unknown> | null)?.description;
    if (description !== null && typeof description !== "string") throw new Error(`${depot}: a label has an unreadable description`);
    return { name: texte(label, "name", `${depot} labels`), description };
  });
}

// The labels path: the plan, as lines to print; with `appliquer`, also the writes.
// A missing label is told, not created: this script renames and describes.
export function migrerLesLabels(github: Github, depot: string, options: { appliquer: boolean }): string[] {
  const plan = planDesLabels(lireLesLabels(github, depot));
  const sortie: string[] = [];
  for (const { de, vers } of plan.renommer) {
    sortie.push(`rename: ${de} -> ${vers.name} (description: ${vers.description})`);
    if (options.appliquer) github.ecrire(`repos/${depot}/labels/${encodeURIComponent(de)}`, { new_name: vers.name, color: vers.color, description: vers.description });
  }
  for (const label of plan.corriger) {
    sortie.push(`description: ${label.name} -> ${label.description}`);
    if (options.appliquer) github.ecrire(`repos/${depot}/labels/${encodeURIComponent(label.name)}`, { description: label.description });
  }
  for (const label of plan.creer) sortie.push(`missing, not created by this script: ${label.name}`);
  const changes = plan.renommer.length + plan.corriger.length;
  sortie.push(changes === 0 ? "labels: already up to date" : options.appliquer ? `applied: ${plan.renommer.length} rename(s), ${plan.corriger.length} description change(s)` : `dry run: ${plan.renommer.length} rename(s), ${plan.corriger.length} description change(s), nothing is written (--apply writes)`);
  return sortie;
}

// French or not: common French words against common English ones. Code and links
// are dropped first. It is a heuristic for the chef to read, not a verdict.
const FRANCAIS = new Set("le les des une est pour avec dans pas que qui sur et du au aux ce cette ces ne il elle nous vous ils sont ont être etre mais ou où donc si par plus comme faire fait doit dit sans sous aussi tout très cela ça quand dont leur lors".split(" "));
const ANGLAIS = new Set("the is are and of to in for with that this it not be was were will would should from by as at or but if on an has have had you we they can does do".split(" "));

export function estEnFrancais(brut: string): boolean {
  const mots = brut
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .toLowerCase()
    .split(/[^\p{L}']+/u)
    .filter((m) => m !== "");
  const fr = mots.filter((m) => FRANCAIS.has(m)).length;
  const en = mots.filter((m) => ANGLAIS.has(m)).length;
  return fr >= 2 && fr > en;
}

export type Francais = { genre: "title" | "comment"; lien: string };

// Read-only: every issue and PR title, and every issue, PR and review comment.
export function auditer(github: Github, depot: string): Francais[] {
  const trouves: Francais[] = [];
  const pose = (genre: Francais["genre"], elements: unknown[], champ: string) => {
    for (const element of elements) {
      if (estEnFrancais(texte(element, champ, depot))) trouves.push({ genre, lien: texte(element, "html_url", depot) });
    }
  };
  pose("title", github.lire(`repos/${depot}/issues?state=all&per_page=100`), "title");
  pose("comment", github.lire(`repos/${depot}/issues/comments?per_page=100`), "body");
  pose("comment", github.lire(`repos/${depot}/pulls/comments?per_page=100`), "body");
  return trouves;
}

export function passer(depot: string, options: { appliquer: boolean; audit: boolean }, github: Github): { sortie: string[]; code: number } {
  try {
    if (options.audit) {
      const trouves = auditer(github, depot);
      const titres = trouves.filter((t) => t.genre === "title");
      const commentaires = trouves.filter((t) => t.genre === "comment");
      return {
        sortie: [`audit of ${depot} (read-only, nothing is written): ${titres.length} title(s) and ${commentaires.length} comment(s) look French`, ...trouves.map((t) => `${t.genre}: ${t.lien}`)],
        code: 0,
      };
    }
    return { sortie: [`== ${depot}`, ...migrerLesLabels(github, depot, options)], code: 0 };
  } catch (erreur) {
    return { sortie: [`FAILED on ${depot}: ${dit(erreur)}`], code: 1 };
  }
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  const { values } = parseArgs({ options: { repo: { type: "string" }, apply: { type: "boolean", default: false }, audit: { type: "boolean", default: false } }, strict: true });
  if (values.repo === undefined || !/^[\w.-]+\/[\w.-]+$/.test(values.repo) || (values.apply && values.audit)) {
    console.error("usage: node scripts/migration-etiquettes-anglais/migrer.ts --repo <owner/name> [--apply | --audit]");
    process.exit(2);
  }
  const { sortie, code } = passer(values.repo, { appliquer: values.apply, audit: values.audit }, githubReel());
  console.log(sortie.join("\n"));
  process.exit(code);
}
