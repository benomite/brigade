// Les remèdes des refus de la station : le geste qui lève un refus
// (`projets/refus.ts`), fait par la station elle-même, quand le chef clique
// sur le bouton de l'app (#1202).
//
// Un remède s'enregistre ici, avec les codes de refus qu'il lève : le refus
// servi par la station porte alors son descripteur — ce qu'il fera, en clair,
// s'il retire ou efface quelque chose (l'app demande d'abord confirmation), et
// son identifiant —, et le point d'entrée (`executer.ts`) sait le jouer. Rien
// d'autre à toucher : ni le point d'entrée, ni l'app.
//
// Un refus qu'aucun remède ne lève porte, à la place, pourquoi il n'y a pas de
// bouton (`SANS_REMEDE`), en une phrase : toute cause de refus a la sienne,
// `SANS_REMEDE` étant typé par `CodeDeRefus`. Elle ne sert plus dès qu'un
// remède lève ce refus.
//
// Ce que le payload porte est en anglais : c'est l'app qui le montre.
import type { CodeDeRefus } from "../projets/refus.ts";
import { remedesDuCatalogue } from "./catalogue/index.ts";

// Ce que la station donne au remède qu'elle joue.
export type ContexteDuRemede = {
  // Le projet dont le refus est à lever.
  projet: string;
  // La racine de la station : sa configuration, l'état de ses projets, leurs clones
  // (`station/configuration.ts`).
  racine: string;
  env: Record<string, string | undefined>;
  // Une ligne pour la sortie de la station.
  dire: (ligne: string) => void;
  // La configuration vient d'être réécrite : la station la relit.
  relireLaConfiguration: () => void;
};

export type Remede = {
  // Stable : l'app le renvoie tel quel pour le demander.
  id: string;
  // Les refus qu'il lève — chacun n'a qu'un remède.
  leve: readonly CodeDeRefus[];
  // Ce que le geste fera, en clair, en une phrase : l'app l'écrit sur le bouton.
  description: string;
  // Il retire ou efface quelque chose : l'app demande confirmation avant.
  destructif: boolean;
  // Le geste, sur la station. Une erreur levée dit pourquoi il n'a pas abouti.
  executer(contexte: ContexteDuRemede): Promise<void> | void;
};

// Ce que le refus servi dit de son remède.
export type DescripteurDeRemede = { id: string; description: string; destructive: boolean };
export type CoteRemede = { remedy: DescripteurDeRemede } | { noRemedy: string };

export type Registre = {
  // Ajoute un remède ; refuse, en le disant, un identifiant pris, un refus déjà
  // levé par un autre, ou un descripteur mal formé.
  enregistrer(remede: Remede): void;
  // Le remède qui lève ce refus, ou null.
  pour(code: string): Remede | null;
  // Le remède de cet identifiant, ou null.
  parId(id: string): Remede | null;
};

const IDENTIFIANT = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
// Une phrase : une majuscule, un point final, aucun autre point qui en ouvre une autre.
const UNE_PHRASE = /^[A-Z][^\n]*\.$/;
const unePhrase = (texte: string) => UNE_PHRASE.test(texte) && !/[.!?] [A-Z]/.test(texte.slice(0, -1));

export function creerRegistre(remedes: readonly Remede[] = []): Registre {
  const parId = new Map<string, Remede>();
  const parCode = new Map<string, Remede>();
  const registre: Registre = {
    enregistrer(remede) {
      const { id, leve, description, destructif } = remede;
      if (!IDENTIFIANT.test(id)) throw new Error(`remède « ${id} » : identifiant invalide — attendu des minuscules, chiffres et tirets`);
      if (parId.has(id)) throw new Error(`remède « ${id} » : déjà enregistré`);
      if (leve.length === 0) throw new Error(`remède « ${id} » : il ne lève aucun refus`);
      for (const code of leve) {
        if (!Object.hasOwn(SANS_REMEDE, code)) throw new Error(`remède « ${id} » : « ${code} » n'est pas un code de refus (projets/refus.ts)`);
        const pris = parCode.get(code);
        if (pris !== undefined) throw new Error(`remède « ${id} » : le refus « ${code} » est déjà levé par « ${pris.id} »`);
      }
      if (!unePhrase(description)) throw new Error(`remède « ${id} » : la description doit être une phrase, avec sa majuscule et son point`);
      if (typeof destructif !== "boolean") throw new Error(`remède « ${id} » : on ne sait pas s'il retire ou efface quelque chose`);
      parId.set(id, remede);
      for (const code of leve) parCode.set(code, remede);
    },
    pour: (code) => parCode.get(code) ?? null,
    parId: (id) => parId.get(id) ?? null,
  };
  for (const remede of remedes) registre.enregistrer(remede);
  return registre;
}

// Pourquoi l'app n'a pas de bouton pour ce refus, tant qu'aucun remède ne le
// lève : une phrase pour le chef, sans chemin ni terme de code.
export const SANS_REMEDE: Record<CodeDeRefus, string> = {
  "sandbox-unusable": "Repairing the sandbox means installing software on this computer, which the app does not do for you.",
  "configuration-invalid": "The app cannot tell which of the station's settings is wrong, so only you can correct them.",
  "clone-missing": "The station fetches the repository again by itself, so there is nothing for a button to do.",
  "already-served": "The app cannot tell whether the other brigade process may be stopped, so only you can stop it.",
  "door-not-open": "The door service runs outside the station, so the app cannot start it for you.",
  "proxy-port-set": "The app cannot change the station's configuration for this project yet.",
  "clone-failed": "The station retries by itself, and what blocks it is on GitHub, out of the app's reach.",
  "fetch-blocked": "Only an owner of the repository can grant access, on GitHub.",
  "push-blocked": "Only an owner of the repository can grant access, on GitHub.",
  "decisions-not-written": "A full or read-only disk on the station is out of the app's reach.",
  "hand-written-line": "The app cannot change the station's configuration for this project yet.",
  "handed-over-elsewhere": "Moving the project back is done from the project's move button, not from here.",
  unexpected: "The station does not know what went wrong, so no action can be offered.",
};

// Les remèdes de la station : ceux du catalogue (`catalogue/`).
export const REMEDES: Registre = creerRegistre(remedesDuCatalogue());

// Ce que le refus de ce code porte de son remède : son descripteur, ou
// pourquoi il n'y en a pas.
export function decrire(code: CodeDeRefus, registre: Registre = REMEDES): CoteRemede {
  const remede = registre.pour(code);
  if (remede === null) return { noRemedy: SANS_REMEDE[code] };
  return { remedy: { id: remede.id, description: remede.description, destructive: remede.destructif } };
}
