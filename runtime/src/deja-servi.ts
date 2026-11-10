// Un cook qui prouve que le ticket est déjà satisfait sur la branche
// d'intégration l'a servi : il n'a rien à commiter (#3146). Sur un projet servi,
// trois cooks de suite ont dit « le correctif est déjà sur main », comptés
// chacun pour un cook sans livraison, et le ticket est parti `served-elsewhere`
// sans cook ni question.
//
// La parole du cook ne suffit pas : la station vérifie que le commit qu'il nomme
// est sur `origin/<base>`, puis joue les gates sur cette base. Si la
// vérification échoue, la réponse du cook compte comme un essai raté.
import type { VerdictDesGates } from "./github-etat/gates-de-la-tete.ts";
import type { LanceurGit, SortieGit } from "./integration-base.ts";

export const MARQUE_DEJA_SERVI = "<!-- brigade:deja-servi";

export type DejaServi = { sha: string; sujet: string };

// Les hashes que l'affirmation du cook nomme : sept chiffres hexadécimaux au moins.
const HASH = /\b[0-9a-f]{7,40}\b/gi;

const detail = (sortie: SortieGit) => sortie.stderr.trim() || sortie.stdout.trim() || `git exited with ${sortie.code}`;

// `worktree` est celui du cook, sans commit. `gates` rend le verdict des gates
// jouées dans ce worktree, ou null quand elles n'ont pas pu se jouer.
export async function verifierDejaServi(demande: {
  git: LanceurGit;
  worktree: string;
  base: string;
  affirmation: string;
  gates: () => Promise<VerdictDesGates | null>;
}): Promise<{ servi: DejaServi } | { refus: string }> {
  const { worktree, base } = demande;
  const lancer = (args: string[]) => demande.git(args, worktree).catch((erreur: unknown): SortieGit => ({ code: 1, stdout: "", stderr: erreur instanceof Error ? erreur.message : String(erreur) }));
  const candidats = [...new Set(demande.affirmation.match(HASH) ?? [])];
  if (candidats.length === 0) return { refus: "it names no commit of the integration branch" };
  // Un worktree qui n'est pas propre n'est pas la base : les gates y jugeraient autre chose.
  const etat = await lancer(["status", "--porcelain"]);
  if (etat.code !== 0) return { refus: `its worktree could not be read: ${detail(etat)}` };
  if (etat.stdout.trim() !== "") return { refus: "it left changes in its worktree, so the gates would not judge the integration branch" };
  const rapatriee = await lancer(["fetch", "origin", base]);
  if (rapatriee.code !== 0) return { refus: `\`origin/${base}\` could not be fetched: ${detail(rapatriee)}` };
  let sha: string | null = null;
  for (const candidat of candidats) {
    const complet = await lancer(["rev-parse", "--verify", "--quiet", `${candidat}^{commit}`]);
    if (complet.code !== 0) continue;
    const entier = complet.stdout.trim();
    if ((await lancer(["merge-base", "--is-ancestor", entier, "FETCH_HEAD"])).code === 0) {
      sha = entier;
      break;
    }
  }
  if (sha === null) return { refus: `none of the commits it names (${candidats.join(", ")}) is on \`origin/${base}\`` };
  // Les gates se jouent sur la base telle qu'elle est, fix compris.
  const avance = await lancer(["merge", "--ff-only", "--quiet", "FETCH_HEAD"]);
  if (avance.code !== 0) return { refus: `its worktree could not be brought to \`origin/${base}\`: ${detail(avance)}` };
  const verdict = await demande.gates();
  if (verdict === null) return { refus: `the gates could not be run on \`origin/${base}\`` };
  if (!verdict.vert) return { refus: `the gates are red on \`origin/${base}\`: ${verdict.resume}` };
  const sujet = await lancer(["log", "-1", "--format=%s", sha]);
  return { servi: { sha, sujet: sujet.code === 0 ? sujet.stdout.trim() : "" } };
}
