// Les transcripts que `claude` laisse dans le `~/.claude` d'un projet
// cloisonné : un par cook, par relecture, par jugement —
// `projects/<répertoire du lancement>/<session>.jsonl`, et parfois un
// répertoire `<session>/` à côté (sous-agents, sorties d'outils). Ce module
// les lit et les retire ; qui part, et quand, se décide dans le nettoyage.
//
// Ce répertoire est en écriture pour les cooks : rien n'y est suivi. Un lien
// n'est ni lu ni traversé — ce qu'il désigne n'est pas au projet.
import { lstatSync, readdirSync, rmdirSync, rmSync, type Stats } from "node:fs";
import { join } from "node:path";

const SUFFIXE = ".jsonl";

export type Transcript = {
  // Le fichier de la session, et son répertoire s'il y en a un.
  chemins: string[];
  // Sa dernière écriture, la plus récente de tout ce qu'il porte.
  ecritMs: number;
  octets: number;
};

// Un répertoire de `projects/` : celui d'un worktree, ou de `/tmp` pour les
// jugements. `ecritMs` : la dernière fois qu'une session y est née ou partie.
export type Dossier = { chemin: string; ecritMs: number };

const voir = (chemin: string): Stats | null => {
  try {
    return lstatSync(chemin);
  } catch {
    // Parti depuis la lecture du répertoire.
    return null;
  }
};

const lister = (repertoire: string): string[] => {
  try {
    return readdirSync(repertoire);
  } catch {
    return [];
  }
};

// Ce que pèse `chemin` et sa dernière écriture, sans suivre aucun lien.
const peser = (chemin: string, vu: Stats): { ecritMs: number; octets: number } => {
  let { mtimeMs: ecritMs, size: octets } = vu;
  if (!vu.isDirectory()) return { ecritMs, octets };
  for (const nom of lister(chemin)) {
    const enfant = join(chemin, nom);
    const stats = voir(enfant);
    if (!stats) continue;
    const poids = peser(enfant, stats);
    ecritMs = Math.max(ecritMs, poids.ecritMs);
    octets += poids.octets;
  }
  return { ecritMs, octets };
};

// Les transcripts du `~/.claude` d'un projet, et les répertoires qui les
// portent. Rien d'autre n'est rendu : ni la mémoire (`memory/`), ni un
// répertoire qu'aucun transcript ne nomme, ni ce qui vit hors de `projects/`.
export function lireTranscripts(claude: string): { transcripts: Transcript[]; dossiers: Dossier[] } {
  const transcripts: Transcript[] = [];
  const dossiers: Dossier[] = [];
  const projets = join(claude, "projects");
  if (!voir(projets)?.isDirectory()) return { transcripts, dossiers };
  for (const projet of lister(projets)) {
    const chemin = join(projets, projet);
    const dossier = voir(chemin);
    if (!dossier?.isDirectory()) continue;
    dossiers.push({ chemin, ecritMs: dossier.mtimeMs });
    for (const nom of lister(chemin)) {
      if (!nom.endsWith(SUFFIXE)) continue;
      const fichier = join(chemin, nom);
      const vu = voir(fichier);
      if (!vu?.isFile()) continue;
      const transcript = { chemins: [fichier], ...peser(fichier, vu) };
      const session = join(chemin, nom.slice(0, -SUFFIXE.length));
      const annexe = voir(session);
      if (annexe?.isDirectory()) {
        const poids = peser(session, annexe);
        transcript.chemins.push(session);
        transcript.ecritMs = Math.max(transcript.ecritMs, poids.ecritMs);
        transcript.octets += poids.octets;
      }
      transcripts.push(transcript);
    }
  }
  return { transcripts, dossiers };
}

// Retire un transcript : son répertoire d'abord — s'il résiste, le fichier
// reste, et le transcript sera revu entier au passage suivant.
export function retirerTranscript({ chemins }: Transcript): void {
  for (const chemin of chemins.toReversed()) rmSync(chemin, { recursive: true, force: true });
}

// Retire un répertoire de `projects/` s'il est vide. Sinon il reste, sans bruit.
export function retirerDossierVide({ chemin }: Dossier): void {
  try {
    rmdirSync(chemin);
  } catch {
    // Pas vide : la mémoire du projet, ou une session née à l'instant.
  }
}
