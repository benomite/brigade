// La reprise d'une session par le cook d'un renvoi : au lieu de repartir de
// zéro — relire le ticket, le `CLAUDE.md`, le code —, il reprend la
// conversation du cook dont la pass a refusé la livraison, et ne reçoit en
// plus que ce qu'elle a trouvé. Ce module retrouve cette conversation et la
// rend au worktree neuf du renvoi ; c'est `claude --resume` qui la reprend.
//
// Rien n'y est garanti : le flux du cook précédent peut ne plus être là, sa
// session ne pas s'y lire, son transcript avoir été rangé (la durée de garde
// des transcripts, `nettoyage.ts`). Il ne manque alors rien d'autre que
// l'économie : le renvoi part comme avant, d'un cook neuf, et le motif du
// repli est rendu à qui voudrait le dire.
import { copyFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

// La forme d'un identifiant de session de `claude` : un UUID. Rien d'autre ne
// sert à composer un chemin.
const FORME_DE_SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Au-delà, `claude` raccourcit le nom du répertoire d'un projet et y ajoute
// une empreinte qu'on ne recalcule pas ici : la session n'y serait pas trouvée.
const NOM_DE_PROJET_MAX = 200;

const SUFFIXE = ".jsonl";

// La session d'un flux `stream-json` : chaque événement la porte, le premier
// (`system/init`) en tête. Une ligne illisible est ignorée — le flux d'un
// process tué s'arrête n'importe où.
export function sessionDuFlux(contenu: string): string | null {
  for (const ligne of contenu.split("\n")) {
    let evenement;
    try {
      evenement = JSON.parse(ligne);
    } catch {
      continue;
    }
    const session: unknown = evenement?.session_id;
    if (typeof session === "string" && FORME_DE_SESSION.test(session)) return session;
  }
  return null;
}

// Le répertoire où `claude`, lancé dans `cwd`, range et cherche ses sessions :
// `projects/` sous son répertoire de configuration, au nom du chemin dont tout
// ce qui n'est ni lettre ni chiffre devient un tiret. Null quand ce nom serait
// raccourci.
export function dossierDuProjet(claude: string, cwd: string): string | null {
  const nom = cwd.replace(/[^a-zA-Z0-9]/g, "-");
  return nom.length > NOM_DE_PROJET_MAX ? null : join(claude, "projects", nom);
}

const fichier = (chemin: string): boolean => {
  try {
    return lstatSync(chemin).isFile();
  } catch {
    return false;
  }
};

// Le transcript de la session, quel que soit le worktree où elle est née. Un
// lien n'est pas suivi : ce qu'il désigne n'est pas au projet.
function trouverTranscript(claude: string, session: string): string | null {
  const projets = join(claude, "projects");
  let noms: string[];
  try {
    noms = readdirSync(projets);
  } catch {
    return null;
  }
  for (const nom of noms) {
    const chemin = join(projets, nom, `${session}${SUFFIXE}`);
    if (fichier(chemin)) return chemin;
  }
  return null;
}

export type Reprise = { run: string; session: string };

// Prépare la reprise, par le cook qui va travailler dans `worktree`, de la
// session du cook `run`, dont le flux brut est `flux`. `claude` : le
// répertoire de configuration de `claude` tel que le runtime le voit — celui
// du projet sous cloison, celui du compte sinon ; null s'il n'est pas connu.
// Le transcript est copié dans le répertoire du projet du worktree neuf :
// c'est là que `claude --resume` le cherche. Rend la reprise, ou le motif du
// repli sur un cook neuf.
export function preparerReprise(lieux: { claude: string | null; run: string; flux: string | null; worktree: string }): { reprise: Reprise } | { repli: string } {
  const { claude, run, flux, worktree } = lieux;
  if (claude === null) return { repli: "répertoire de configuration de `claude` inconnu" };
  if (flux === null) return { repli: `aucun flux connu pour le cook ${run}` };
  let contenu: string;
  try {
    contenu = readFileSync(flux, "utf8");
  } catch {
    return { repli: `flux du cook ${run} illisible` };
  }
  const session = sessionDuFlux(contenu);
  if (session === null) return { repli: `aucune session dans le flux du cook ${run}` };
  const source = trouverTranscript(claude, session);
  if (source === null) return { repli: `transcript de la session ${session} absent — rangé, ou jamais écrit` };
  let cwd: string;
  try {
    cwd = realpathSync(worktree);
  } catch {
    return { repli: "worktree du renvoi introuvable" };
  }
  const dossier = dossierDuProjet(claude, cwd);
  if (dossier === null) return { repli: "chemin du worktree trop long pour que `claude` y retrouve la session" };
  const cible = join(dossier, `${session}${SUFFIXE}`);
  try {
    if (cible !== source) {
      mkdirSync(dossier, { recursive: true });
      copyFileSync(source, cible);
    }
  } catch {
    return { repli: `transcript de la session ${session} impossible à rendre au worktree du renvoi` };
  }
  return { reprise: { run, session } };
}
