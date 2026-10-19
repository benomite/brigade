// La portée d'une correction : ce qu'elle a le droit de toucher, et la garde
// qui le vérifie avant que quiconque la voie. Une correction ne touche que les
// consignes du projet — son `CLAUDE.md`, sa doc d'équipe, ses gates —, jamais
// son code, ni le fonctionnement de brigade (découpage, choix du modèle,
// plafonds), qui ne vit dans aucun de ces fichiers.
//
// La garde ne croit pas le diff sur parole : elle le lit elle-même, refuse ce
// qu'elle ne sait pas lire, puis demande à `git` quels fichiers il toucherait
// et s'il s'applique tel quel à la base. Un seul fichier hors des consignes, et
// tout le diff est écarté.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCRIPT_GATES } from "../gates.ts";
import { possede, refus } from "../zones.ts";

// Les consignes du projet : un chemin possède le fichier qu'il nomme et tout ce
// qui est dessous (`zones.ts`). `docs/` est la doc d'équipe ; les gates sont le
// seul script que la station joue pour juger une livraison.
export const CONSIGNES = ["CLAUDE.md", "docs/", SCRIPT_GATES] as const;

export const estUneConsigne = (chemin: string): boolean => refus(chemin) === null && CONSIGNES.some((consigne) => possede(consigne, chemin));

// Un fichier que le diff touche. `nouveau` : il le crée.
export type FichierDuDiff = { chemin: string; nouveau: boolean };

export type DiffLu = { fichiers: FichierDuDiff[] } | { refus: string; fichiers: string[] };

// Ce qu'un diff peut porter entre `diff --git` et `---` : rien qui supprime,
// renomme, copie ou change le mode d'un fichier, ni contenu binaire.
const INDEX = /^index [0-9a-f]+\.\.[0-9a-f]+( [0-7]{6})?$/;
const NOUVEAU = "new file mode 100644";
const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

// `a/<chemin>` ou `b/<chemin>`, sans guillemets ni horodatage.
function chemin(cote: string, prefixe: "a/" | "b/"): string | null {
  const nu = cote.split("\t")[0] ?? "";
  return nu.startsWith(prefixe) && !nu.startsWith('"') ? nu.slice(prefixe.length) : null;
}

// Lit un diff unifié, à la manière de `git diff` : chaque fichier, ses en-têtes
// puis ses blocs, dont les lignes se comptent. Ce qui ne se lit pas ainsi est
// refusé, et dit pourquoi. Une fonction pure.
export function lireDiff(diff: string): DiffLu {
  const lignes = diff.replace(/\r\n/g, "\n").split("\n");
  if (lignes.at(-1) === "") lignes.pop();
  const fichiers: FichierDuDiff[] = [];
  const nommes = () => [...new Set(fichiers.map(({ chemin }) => chemin))];
  const refuser = (raison: string): DiffLu => ({ refus: raison, fichiers: nommes() });
  let i = 0;
  while (i < lignes.length) {
    let ligne = lignes[i] ?? "";
    let annonce: string | null = null;
    let nouveau = false;
    if (ligne.startsWith("diff --git ")) {
      const [, a, b] = /^diff --git a\/(\S+) b\/(\S+)$/.exec(ligne) ?? [];
      if (a === undefined || a !== b) return refuser(`en-tête illisible : ${ligne}`);
      annonce = a;
      for (ligne = lignes[++i] ?? ""; i < lignes.length && !ligne.startsWith("--- "); ligne = lignes[++i] ?? "") {
        if (ligne === NOUVEAU) nouveau = true;
        else if (!INDEX.test(ligne)) return refuser(`en-tête refusé : ${ligne}`);
      }
    }
    if (!ligne.startsWith("--- ")) return refuser(`ligne hors d'un fichier du diff : ${ligne}`);
    const avant = ligne.slice(4).split("\t")[0];
    const apres = (lignes[i + 1] ?? "").startsWith("+++ ") ? chemin((lignes[i + 1] ?? "").slice(4), "b/") : null;
    if (apres === null) return refuser(`le fichier modifié n'est pas nommé en « +++ b/<chemin> » : ${lignes[i + 1] ?? "fin du diff"}`);
    if (avant === "/dev/null") nouveau = true;
    else if (chemin(avant ?? "", "a/") !== apres) return refuser(`un fichier renommé, supprimé ou mal nommé : ${ligne}`);
    if (nouveau !== (avant === "/dev/null")) return refuser(`création mal annoncée : ${apres}`);
    if (annonce !== null && annonce !== apres) return refuser(`deux noms pour un fichier : ${annonce}, ${apres}`);
    const pourquoi = refus(apres);
    if (pourquoi !== null) return refuser(`${apres} ${pourquoi}`);
    fichiers.push({ chemin: apres, nouveau });
    i += 2;
    if (!HUNK.test(lignes[i] ?? "")) return refuser(`aucun bloc pour ${apres}`);
    while (HUNK.test(lignes[i] ?? "")) {
      const [, vieux = "1", neuf = "1"] = HUNK.exec(lignes[i] ?? "") ?? [];
      let [restentAvant, restentApres] = [Number(vieux), Number(neuf)];
      for (i++; restentAvant > 0 || restentApres > 0; i++) {
        if (i >= lignes.length) return refuser(`bloc tronqué dans ${apres}`);
        const signe = (lignes[i] ?? "")[0];
        // Une ligne de contexte vide a perdu son espace : `git` la lit encore.
        if (signe === " " || signe === undefined) [restentAvant, restentApres] = [restentAvant - 1, restentApres - 1];
        else if (signe === "-") restentAvant--;
        else if (signe === "+") restentApres--;
        else if (signe !== "\\") return refuser(`ligne illisible dans un bloc de ${apres} : ${lignes[i]}`);
        if (restentAvant < 0 || restentApres < 0) return refuser(`bloc mal compté dans ${apres}`);
      }
      if ((lignes[i] ?? "").startsWith("\\")) i++;
    }
  }
  if (fichiers.length === 0) return refuser("le diff est vide");
  const dehors = nommes().filter((nomme) => !estUneConsigne(nomme));
  if (dehors.length > 0) return refuser(`hors des consignes du projet : ${dehors.join(", ")}`);
  return { fichiers };
}

// Où vérifier un diff : le clone de la station, et la branche d'intégration,
// telle que le dernier rapatriement l'a laissée (`origin/<base>`).
export type LieuDuProjet = { clone: string; base: string; env?: NodeJS.ProcessEnv };

export type Verification = { fichiers: string[]; base: string } | { refus: string; fichiers: string[] };

const DELAI_MS = 60_000;

// Les chemins que `git apply --numstat -z` nomme : `<ajouts>\t<retraits>\t<chemin>`,
// ou, pour un renommage, un chemin vide suivi de l'ancien et du nouveau.
function touchesSelonGit(sortie: string): string[] {
  const champs = sortie.split("\0");
  const chemins: string[] = [];
  for (let i = 0; i < champs.length; i++) {
    const [, , nom] = (champs[i] ?? "").split("\t");
    if (nom === undefined) continue;
    if (nom !== "") chemins.push(nom);
    else chemins.push(champs[++i] ?? "", champs[++i] ?? "");
  }
  return chemins;
}

// Lit le diff, puis le fait juger par `git` contre la base — sans toucher ni
// au clone ni à son index : `git apply --cached` joue sur un index jetable,
// tiré de la base. Rend les fichiers touchés et le commit de la base, ou ce qui
// l'écarte. Lève si `git` ne peut pas lire la base : ce n'est pas le diff qui
// est en cause.
export function verifierDiff(diff: string, lieu: LieuDuProjet): Verification {
  const lu = lireDiff(diff);
  if ("refus" in lu) return lu;
  const fichiers = [...new Set(lu.fichiers.map(({ chemin }) => chemin))];
  const reference = `origin/${lieu.base}`;
  const index = mkdtempSync(join(tmpdir(), "brigade-correctif-"));
  const env = { ...(lieu.env ?? process.env), GIT_INDEX_FILE: join(index, "index") };
  const git = (args: string[], entree?: string) => execFileSync("git", args, { cwd: lieu.clone, env, input: entree, timeout: DELAI_MS, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  try {
    const base = git(["rev-parse", "--verify", `${reference}^{commit}`]).trim();
    git(["read-tree", base]);
    // Ce que `git` refuse de lire, ou de jouer, écarte le diff.
    const jouer = (geste: string, args: string[]): { sortie: string } | { refus: string; fichiers: string[] } => {
      try {
        return { sortie: git(args, diff) };
      } catch (erreur) {
        return { refus: `${geste} : ${String((erreur as { stderr?: string }).stderr ?? "").trim().split("\n")[0] || `git ${args.join(" ")} en échec`}`, fichiers };
      }
    };
    const numstat = jouer("git ne le lit pas", ["apply", "--numstat", "-z"]);
    if ("refus" in numstat) return numstat;
    // Ce que `git` toucherait, lu par lui : rien de plus que ce que la garde a lu.
    const touches = touchesSelonGit(numstat.sortie);
    const inattendus = touches.filter((nom) => !fichiers.includes(nom) || !estUneConsigne(nom));
    if (inattendus.length > 0) return { refus: `git le lit autrement : ${inattendus.map((nom) => nom || "(sans nom)").join(", ")}`, fichiers };
    // Un lien symbolique se modifie comme un fichier, mais change où il mène.
    for (const ligne of git(["ls-tree", base, "--", ...fichiers]).split("\n").filter(Boolean)) {
      if (!/^100(644|755) blob /.test(ligne)) return { refus: `pas un fichier ordinaire à la base : ${ligne.split("\t")[1] ?? ligne}`, fichiers };
    }
    const essai = jouer(`ne s'applique pas à ${reference}`, ["apply", "--check", "--cached"]);
    if ("refus" in essai) return essai;
    return { fichiers, base };
  } finally {
    rmSync(index, { recursive: true, force: true });
  }
}
