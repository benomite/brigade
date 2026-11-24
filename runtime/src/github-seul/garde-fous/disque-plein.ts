// Le disque de la station est plein de ce que la cuisine ne peut pas libérer
// (#4091) : la garde de la machine refuse, et la cuisine reste oisive sans que
// le chef le sache. Ce module dit quand lui poser une carte de TODO, et ce
// qu'elle lui dit.
//
// La carte n'appartient à aucun ticket : elle vit sur une issue à elle, que le
// marqueur retrouve parmi les issues ouvertes, sinon créée — comme celle de la
// PR de mise en place (`second-init/pr-de-setup.ts`).
import { promisify } from "node:util";
import { DE_CONFIANCE } from "../../alimenter.ts";
import type { GitHub } from "../../github.ts";
import { execFile } from "../../sans-invite.ts";
import { leverCarte, poserCarte, type Carte, type GitHubDesCartes } from "../carte-todo/carte-todo.ts";

const MARQUEUR_DISQUE = "<!-- brigade:disk-full -->";
const TITRE_DISQUE = "The station disk is full of things the kitchen cannot free";

const MO = 1024 * 1024;
const DELAI_DU_MS = 120_000;

type Consommateur = { chemin: string; octets: number };

// Ce que la cuisine sait de son disque : ce qu'elle tient elle-même, donc ce
// qu'elle pourrait encore rendre, et les plus gros occupants, s'ils se lisent.
export type SondeDuDisque = { propre: number; consommateurs: Consommateur[] };

// La cuisine, devant un disque saturé et sans cook en vol : ce que la sonde
// lit, la carte qu'elle pose, la carte qu'elle lève quand le disque respire.
export type DisquePlein = {
  sonder(): Promise<SondeDuDisque>;
  poser(carte: Carte): Promise<void>;
  lever(): Promise<void>;
};

// Rendre ce que la cuisine tient pourrait-il encore ramener le disque au seuil ?
// Alors la carte n'est pas due : la cuisine peut s'en sortir seule.
export const peutEncoreLiberer = (libre: number, propre: number, minMo: number): boolean => libre + propre >= minMo * MO;

const mo = (octets: number) => Math.floor(octets / MO).toLocaleString("en-US");

export function carteDuDisque(figures: { libreMo: number; minMo: number; propre: number; consommateurs: Consommateur[]; station: string }): Carte {
  const { libreMo, minMo, propre, consommateurs, station } = figures;
  const plus = consommateurs.length === 0 ? "The biggest consumers could not be read." : `The biggest consumers:\n${consommateurs.map(({ chemin, octets }) => `- ${chemin}: ${mo(octets)} MB`).join("\n")}`;
  return {
    sorte: "blocked",
    texte: [
      `The disk of station ${station} is full of things the kitchen cannot free: ${libreMo.toLocaleString("en-US")} MB free, the kitchen needs at least ${minMo.toLocaleString("en-US")} MB, and everything the kitchen holds itself is only ${mo(propre)} MB.`,
      "",
      plus,
      "",
      "Free some space outside the kitchen (unused docker volumes or images, for instance). The kitchen takes tickets again by itself, and this card is lifted, once the disk has room.",
    ].join("\n"),
  };
}

type GitHubDuDisque = GitHubDesCartes & Pick<GitHub, "issuesDepuis" | "creerIssue">;

// L'issue ouverte qui porte le marqueur, ou rien. Elle se lit par `issuesDepuis`
// et non par `ouvertes` : celle-ci répond « inchangé » dès que le sondage du
// tour a confirmé la liste, et rien ne se lirait alors — on créerait une seconde
// issue.
async function issueDuDisque(github: GitHubDuDisque): Promise<number | undefined> {
  const toutes = await github.issuesDepuis(new Date(0).toISOString());
  return toutes.find((issue) => issue.closedAt === undefined && issue.body.includes(MARQUEUR_DISQUE) && DE_CONFIANCE.includes(issue.association))?.number;
}

// La carte du disque sur son issue : une seule tant qu'elle attend le chef.
async function poserLaCarteDuDisque(github: GitHubDuDisque, carte: Carte): Promise<void> {
  const numero = (await issueDuDisque(github)) ?? (await github.creerIssue({ titre: TITRE_DISQUE, corps: `${MARQUEUR_DISQUE}\nThe disk of a station is full of things the kitchen cannot free. The card below tells the chef.`, labels: [] }));
  await poserCarte(numero, carte, github);
}

// Lever ne crée jamais d'issue : sans issue du disque, il n'y a rien à lever.
async function leverLaCarteDuDisque(github: GitHubDuDisque): Promise<void> {
  const numero = await issueDuDisque(github);
  if (numero !== undefined) await leverCarte(numero, github, "blocked");
}

const execFileP = promisify(execFile);

// La taille en octets de ce que `du` rend pour chaque chemin : `<ko>\t<chemin>`.
function lireDu(sortie: string): Consommateur[] {
  return sortie
    .split("\n")
    .map((ligne) => /^(\d+)\t(.+)$/.exec(ligne))
    .flatMap((lu) => (lu === null ? [] : [{ chemin: lu[2] as string, octets: Number(lu[1]) * 1024 }]));
}

const du = async (args: string[]): Promise<Consommateur[]> => lireDu((await execFileP("du", args, { timeout: DELAI_DU_MS, maxBuffer: 16 * MO, encoding: "utf8" })).stdout);

// La sonde réelle : `du` sur l'état de la cuisine, et sur la racine de son
// volume pour les plus gros occupants (au mieux — `du` peut échouer ou durer).
function sondeDuDisque(repertoireEtat: string, racine: string, nombre = 5): () => Promise<SondeDuDisque> {
  return async () => {
    const propre = (await du(["-sk", repertoireEtat]))[0]?.octets;
    if (propre === undefined) throw new Error(`du did not size ${repertoireEtat}`);
    const consommateurs = await du(["-xk", "-d", "2", racine]).then(
      (lignes) => lignes.filter(({ chemin }) => chemin !== racine).sort((a, b) => b.octets - a.octets).slice(0, nombre),
      () => [],
    );
    return { propre, consommateurs };
  };
}

// Le disque plein tel que le tour le branche : la sonde réelle, et la carte sur
// l'issue du disque, de ce client GitHub.
export const disqueDuProjet = (repertoireEtat: string, github: GitHubDuDisque, racine = "/"): DisquePlein => ({
  sonder: sondeDuDisque(repertoireEtat, racine),
  poser: (carte) => poserLaCarteDuDisque(github, carte),
  lever: () => leverLaCarteDuDisque(github),
});
