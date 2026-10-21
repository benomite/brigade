// Ajouter un projet à l'app (#983) : son dossier sur ce poste, son dépôt GitHub et sa branche
// d'intégration — rien d'autre. Aucune station n'est demandée, aucune machine n'est jointe : le
// projet entre dans le fichier des projets, il a son onglet et sa ligne sur l'accueil, et c'est
// tout. Confier sa cuisine à une station est un autre geste, depuis la page du projet, quand le
// chef le décide (projets/projets.ts, `confier`).
//
// Rien ici n'a de défaut. Le dépôt et la branche se lisent dans le clone choisi — son origine et
// la branche que l'origine désigne —, par le `git` du poste : rien ne part ailleurs. Ce qui manque
// est signalé champ par champ, et rien n'est écrit.
import { execFile } from "node:child_process";
import type { Declare } from "./config.ts";
import { nomDuProjet } from "./projets/projets.ts";

// Ce que l'écran d'ajout a recueilli.
export type Saisie = { dossier: string; depot: string; base: string };
// Un champ de l'écran, par le nom que la vue lui donne.
export type Champ = "dossier" | "depot" | "base";
export type Signales = Partial<Record<Champ, string>>;

// Ce que l'écran montre d'un ajout. `champs` : rien n'est écrit, et voici pourquoi.
// `ajoute` : sous ce `nom`, le projet est dans l'app. `pas-ajoute` : le fichier des projets l'a refusé.
export type Issue = { etat: "champs"; champs: Signales } | { etat: "ajoute"; nom: string } | { etat: "pas-ajoute"; titre: string };

// Un dépôt GitHub : `<owner>/<name>`, sans adresse ni `.git`.
const DEPOT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCHE = /^[A-Za-z0-9._/-]{1,200}$/;
const NOM = /^[a-z0-9][a-z0-9-]*$/;

const texte = (recu: unknown) => (typeof recu === "string" ? recu.trim() : "");

// Ce que la vue envoie, ramené à des textes : rien n'y est cru sur parole.
export function lireSaisie(recu: unknown): Saisie {
  const { dossier, depot, base } = (recu ?? {}) as Record<string, unknown>;
  return { dossier: texte(dossier), depot: texte(depot), base: texte(base) };
}

const depotRefuse = (depot: string) => !DEPOT.test(depot) || [".", ".."].includes(depot.split("/")[1] ?? "") || depot.endsWith(".git");

// Les champs qui empêchent d'ajouter, chacun avec sa raison. Aucun : le projet peut être écrit.
export function refusDeSaisie(saisie: Saisie): Signales {
  const signales: Signales = {};
  const signaler = (champ: Champ, raison: string | undefined) => {
    if (raison !== undefined) signales[champ] = raison;
  };
  signaler("dossier", saisie.dossier === "" ? "Choose the project's folder on this workstation." : undefined);
  signaler(
    "depot",
    saisie.depot === ""
      ? "The project's GitHub repository is missing — `<owner>/<name>`."
      : depotRefuse(saisie.depot)
        ? `“${saisie.depot.slice(0, 60)}” is not a GitHub repository — expected \`<owner>/<name>\`, with no URL and no \`.git\`.`
        : NOM.test(nomDuProjet(saisie.depot))
          ? undefined
          : "This repository's name gives no project name: letters, digits and dashes.",
  );
  signaler(
    "base",
    saisie.base === "" ? "The integration branch is missing: the branch the kitchen delivers to." : BRANCHE.test(saisie.base) ? undefined : `“${saisie.base.slice(0, 60)}” is not a branch name.`,
  );
  return signales;
}

// Le projet tel qu'il s'écrit dans le fichier : son nom est celui que ses stations lui donneront,
// tiré de son dépôt (projets/projets.ts).
export const declare = (saisie: Saisie): Declare => ({ nom: nomDuProjet(saisie.depot), dossier: saisie.dossier, depot: saisie.depot, base: saisie.base });

// L'ajout, de bout en bout : les champs, puis le fichier des projets. Rien d'autre n'est appelé.
export function ajouterALApp(recu: unknown, ajouter: (projet: Declare) => string | undefined): Issue {
  const saisie = lireSaisie(recu);
  const champs = refusDeSaisie(saisie);
  if (Object.keys(champs).length > 0) return { etat: "champs", champs };
  const projet = declare(saisie);
  const refus = ajouter(projet);
  return refus === undefined ? { etat: "ajoute", nom: projet.nom } : { etat: "pas-ajoute", titre: `Not added — ${refus}` };
}

// Le dépôt qu'une origine désigne chez GitHub — rien, si ce n'est pas une adresse que l'app sait lire.
export function depotDe(origine: string): string | undefined {
  const [, depot] = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|(?:ssh:\/\/)?(?:[^@/]+@)?github\.com[:/])([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(origine.trim()) ?? [];
  return depot === undefined || depotRefuse(depot) ? undefined : depot;
}

// La branche que l'origine désigne, telle que le clone l'a notée (`origin/main`) — rien, sinon.
export function brancheDe(sortie: string): string | undefined {
  const [, branche] = /^origin\/(.+)$/.exec(sortie.trim()) ?? [];
  return branche === undefined || !BRANCHE.test(branche) ? undefined : branche;
}

// Le dépôt et la branche du dossier choisi, lus dans son clone : ils se proposent, ils ne se
// devinent pas — sans origine lisible, c'est au chef de les écrire, et la raison le dit.
export type Lu = { depot?: string; base?: string; raisons: Signales };

const git = (binaire: string, dossier: string, args: string[]) =>
  new Promise<string | undefined>((resoudre) => execFile(binaire, ["-C", dossier, ...args], { windowsHide: true, timeout: 10_000 }, (erreur, sortie) => resoudre(erreur === null ? sortie : undefined)));

export async function lireClone(binaire: string, dossier: string): Promise<Lu> {
  const [origine, tete] = await Promise.all([git(binaire, dossier, ["remote", "get-url", "origin"]), git(binaire, dossier, ["rev-parse", "--abbrev-ref", "origin/HEAD"])]);
  const depot = origine === undefined ? undefined : depotDe(origine);
  const base = tete === undefined ? undefined : brancheDe(tete);
  const raisons: Signales = {};
  if (depot === undefined)
    raisons.depot =
      origine === undefined ? "This folder's origin cannot be read (`git remote get-url origin`): type its GitHub repository." : "This folder's origin is not a github.com address the app can read: type its GitHub repository.";
  if (base === undefined) raisons.base = "This folder does not say which branch its origin points to (`git rev-parse --abbrev-ref origin/HEAD`): type the integration branch.";
  return { ...(depot === undefined ? {} : { depot }), ...(base === undefined ? {} : { base }), raisons };
}
