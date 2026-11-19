// Les tests d'acceptation gelés (#3724) : le premier commit de la branche, qui
// porte le trailer `Acceptance-Tests: frozen`. Aucun commit suivant de la
// livraison ne les modifie, ne les renomme ni ne les retire — sauf un commit du
// manager, ou du chef du projet (ticket 3835), portant `Amendment: #<issue>`. Le contrôle
// lit l'historique du worktree de la livraison, sans cook ni modèle. Un commit
// qui touche un test gelé puis le rend, à la tête, tel que l'a laissé le
// dernier commit qui en avait le droit, ne le modifie pas (#3847).
import { execFileSync } from "../sans-invite.ts";

// Le motif de renvoi que la fiche du ticket énonce.
const RAISON_GEL = "a frozen acceptance test was modified";

// L'identité sous laquelle la station écrit le commit d'amendement du manager
// (`amendement/amender.ts`). Le gel la reconnaît à son courriel : avant #3847,
// il ne lisait que le nom git `manager`, et refusait chaque amendement réel,
// signé `brigade manager`.
export const COURRIEL_DU_MANAGER = "manager@brigade.localhost";
export const AUTEUR_DU_MANAGER = `brigade manager <${COURRIEL_DU_MANAGER}>`;

// L'auteur d'un commit du manager : son nom git, avec ou sans le `[bot]` d'une App GitHub.
const AUTEUR_MANAGER = /^(brigade )?manager(\[bot\])?$/i;
const AMENDEMENT = /^#\d+$/;

// `retablir` : pour chaque fichier, le commit dont la tête doit le rendre tel
// quel — celui des tests gelés, ou le dernier amendement autorisé (#3847).
export type ViolationDuGel = { commit: string; fichiers: string[]; retablir: Record<string, string> };

const SEP_COMMIT = "\x01";
const SEP_CHAMP = "\x00";

const git = (worktree: string, ...args: string[]) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });

const fichiersDe = (worktree: string, commit: string) => git(worktree, "diff-tree", "--no-commit-id", "--name-only", "-r", "--no-renames", "-z", commit).split("\0").filter(Boolean);

// Les commits que la livraison ajoute à la base, du plus ancien au plus récent,
// sans les fusions (la base fusionnée dans la branche n'est pas du cook).
// Un commit : son hash, son auteur (nom et courriel), et les valeurs de ses deux trailers.
function commitsDeLaLivraison(worktree: string, base: string) {
  const format = ["%H", "%an", "%ae", "%(trailers:key=Acceptance-Tests,valueonly,unfold,separator=%x2C)", "%(trailers:key=Amendment,valueonly,unfold,separator=%x2C)"].join("%x00");
  const sortie = git(worktree, "log", "--reverse", "--topo-order", "--no-merges", `--format=${format}%x01`, `${base}..HEAD`);
  return sortie
    .split(SEP_COMMIT)
    .map((bloc) => bloc.replace(/^\n/, ""))
    .filter((bloc) => bloc !== "")
    .map((bloc) => {
      const [commit = "", auteur = "", courriel = "", gel = "", amendement = ""] = bloc.split(SEP_CHAMP).map((champ) => champ.trim());
      return { commit, auteur, courriel, gele: gel.split(",").some((valeur) => valeur.trim() === "frozen"), amendement: amendement.split(",").map((valeur) => valeur.trim()).filter(Boolean) };
    });
}

// Les fichiers des tests gelés de la livraison : ceux du premier commit de la
// branche s'il porte le trailer, aucun sinon (#3740, #3741). Lève si
// l'historique ne se lit pas.
export function fichiersGeles(worktree: string, base: string): string[] {
  const gele = commitDesTestsGeles(worktree, base);
  return gele === null ? [] : fichiersDe(worktree, gele);
}

// Le hash du commit des tests gelés : le premier commit de la branche s'il
// porte le trailer, null sinon. Lève si l'historique ne se lit pas.
export function commitDesTestsGeles(worktree: string, base: string): string | null {
  const [premier] = commitsDeLaLivraison(worktree, base);
  return premier?.gele === true ? premier.commit : null;
}

// Les commits qui touchent un fichier gelé sans y avoir droit. Vide : aucun
// commit gelé sur la branche (rien à garder), ou le gel est tenu. Lève si
// l'historique ne se lit pas : l'appelant dit alors que le contrôle n'a pas eu lieu.
// `chef` : le login du chef du projet (`chef` de ses réglages), dont un commit
// d'amendement vaut celui du manager — son nom git est son login.
export function violationsDuGel(worktree: string, base: string, chef: string | null = null): ViolationDuGel[] {
  const [premier, ...suivants] = commitsDeLaLivraison(worktree, base);
  if (premier === undefined || !premier.gele) return [];
  const gelés = new Set(fichiersDe(worktree, premier.commit));
  const autorise = (suivant: (typeof suivants)[number]) =>
    (AUTEUR_MANAGER.test(suivant.auteur) || suivant.courriel.toLowerCase() === COURRIEL_DU_MANAGER || (chef !== null && chef !== "" && suivant.auteur.toLowerCase() === chef.toLowerCase())) &&
    suivant.amendement.some((valeur) => AMENDEMENT.test(valeur));
  // Pour chaque test gelé : le dernier commit qui avait le droit de l'écrire, et
  // les commits sans ce droit qui l'ont touché depuis.
  const droit = new Map([...gelés].map((fichier) => [fichier, premier.commit]));
  const fautifs = new Map<string, string[]>();
  for (const suivant of suivants) {
    const touches = fichiersDe(worktree, suivant.commit).filter((fichier) => gelés.has(fichier));
    for (const fichier of touches) {
      if (autorise(suivant)) {
        droit.set(fichier, suivant.commit);
        fautifs.delete(fichier);
      } else fautifs.set(fichier, [...(fautifs.get(fichier) ?? []), suivant.commit]);
    }
  }
  // Un test que la tête rend tel que l'a laissé son dernier commit autorisé est tenu.
  const parCommit = new Map<string, string[]>();
  for (const [fichier, commits] of fautifs) {
    if (objetA(worktree, "HEAD", fichier) === objetA(worktree, droit.get(fichier) ?? premier.commit, fichier)) continue;
    for (const commit of commits) parCommit.set(commit, [...(parCommit.get(commit) ?? []), fichier]);
  }
  return suivants
    .filter((suivant) => parCommit.has(suivant.commit))
    .map((suivant) => {
      const fichiers = parCommit.get(suivant.commit) ?? [];
      return { commit: suivant.commit, fichiers, retablir: Object.fromEntries(fichiers.map((fichier) => [fichier, droit.get(fichier) ?? premier.commit])) };
    });
}

// L'objet git d'un fichier à un commit, null s'il n'y est pas. Lève si l'arbre ne se lit pas.
function objetA(worktree: string, commit: string, fichier: string): string | null {
  const ligne = git(worktree, "ls-tree", "-z", commit, "--", fichier).split("\0")[0] ?? "";
  return ligne === "" ? null : (ligne.split("\t")[0] ?? "").split(" ")[2] ?? null;
}

// Le motif du renvoi, ou null si le gel est tenu.
export function motifDuGel(violations: readonly ViolationDuGel[]): string | null {
  if (violations.length === 0) return null;
  const retablir = new Map(violations.flatMap((violation) => violation.fichiers.map((fichier) => [fichier, violation.retablir[fichier]] as const)));
  const ligne = (fichier: string, commit: string | undefined) =>
    commit === undefined ? `- \`${fichier}\`` : `- \`${fichier}\` — restore it as \`${commit.slice(0, 7)}\` left it: \`git checkout ${commit.slice(0, 7)} -- ${fichier}\``;
  return [
    `${RAISON_GEL}.`,
    "",
    "A commit after the frozen acceptance tests (trailer `Acceptance-Tests: frozen`) changed, renamed or removed:",
    ...[...retablir].map(([fichier, commit]) => ligne(fichier, commit)),
    "",
    "Restore each one as its last authorized commit left it — the frozen tests' commit, or the manager's or chef's latest amendment, which stays: only a commit of the manager or of the project's chef carrying `Amendment: #<issue>` may change a frozen test.",
  ].join("\n");
}
