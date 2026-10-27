// Pourquoi la station refuse de servir un projet, dit au chef : un code qui ne
// change pas, une phrase, et le geste qu'il peut faire. La station l'écrit
// dans son suivi (`demande.ts`, `refus`), que l'app lit dans le gist : le
// fichier `en-service` garde, lui, le texte brut de l'erreur. En anglais :
// c'est l'app qui les montre.
//
// Toute cause de refus du runtime a ici son entrée : `CAUSES` est typé par
// `CodeDeRefus`, et un test relit le catalogue.
import { decrire, REMEDES, type CoteRemede, type Registre } from "../remedes/registre.ts";

export const CODES_DE_REFUS = [
  // La cuisine du projet refuse de s'ouvrir.
  "sandbox-unusable",
  "configuration-invalid",
  "clone-missing",
  "already-served",
  "door-not-open",
  "proxy-port-set",
  // La station ne peut pas préparer le projet.
  "clone-failed",
  "fetch-blocked",
  "push-blocked",
  "decisions-not-written",
  "hand-written-line",
  "handed-over-elsewhere",
  "kitchen-not-joinable",
  // Tout le reste.
  "unexpected",
] as const;

export type CodeDeRefus = (typeof CODES_DE_REFUS)[number];

export type Cause = { message: string; action: string };

// Une phrase pour le chef, sans chemin ni terme de code ; l'action est ce
// qu'il fait pour lever le refus.
export const CAUSES: Record<CodeDeRefus, Cause> = {
  "sandbox-unusable": { message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Update Claude Code from the app; if the sandbox is still unusable, the reason is shown." },
  "configuration-invalid": { message: "The station's settings for this project are incomplete or wrong.", action: "Let the station write its settings for this project again, from the app." },
  "clone-missing": { message: "The station has no copy of this project's repository to work from.", action: "Fetch the repository again from the app." },
  "already-served": { message: "Another brigade process on this machine is already serving this project.", action: "Stop the other process, then wait: the station takes the project over by itself." },
  "door-not-open": { message: "The station's network door for this project is not open yet.", action: "Check that the station's door service is running on this machine; the station opens the project as soon as it is." },
  "proxy-port-set": { message: "This project's settings choose a network port that the station reserves for itself.", action: "Remove the port setting from the app." },
  "clone-failed": { message: "The station could not fetch a copy of this project's repository.", action: "Check that the repository exists and that the station's GitHub account can see it; the station retries by itself." },
  "fetch-blocked": { message: "The repository refuses to let the station read it.", action: "Give the station's GitHub account read access to the repository, then wait for the next check." },
  "push-blocked": { message: "The repository refuses to let the station write to it.", action: "Give the station's GitHub account write access to the repository, then wait for the next check." },
  "decisions-not-written": { message: "The station could not save the choices you made for this project.", action: "Check that the station's disk is not full or read-only, then wait: the station tries again." },
  "hand-written-line": { message: "This project is already set up by hand on the station, which blocks the app's setup.", action: "Remove the hand-written line from the app; the station then writes its own." },
  "handed-over-elsewhere": { message: "This project was moved to another station and cooks there.", action: "Move it back to this station from the app if you want it to cook here." },
  "kitchen-not-joinable": { message: "Another station already runs this project's kitchen, and this computer cannot join it.", action: "Make sure the station that serves it is online and this computer is paired in the app; this computer tries again by itself." },
  unexpected: { message: "The station could not open this project for a reason it does not recognise.", action: "Ask for help with the station's log; the station does not retry until the project's settings change." },
};

// Ce que le suivi d'un projet refusé porte : `status` est toujours « refused ».
// Et, du remède qui le lève (`remedes/registre.ts`), son descripteur
// (`remedy`) — ou pourquoi l'app n'a pas de bouton (`noRemedy`).
export type Refus = { status: "refused"; code: CodeDeRefus; message: string; action: string } & CoteRemede;

// `registre` : les remèdes de la station — par défaut, ceux du runtime.
export function refus(code: CodeDeRefus, registre: Registre = REMEDES): Refus {
  return { status: "refused", code, ...CAUSES[code], ...decrire(code, registre) };
}
