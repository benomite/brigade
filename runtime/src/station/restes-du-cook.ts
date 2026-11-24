// Retire ce qu'un cook sorti a laissé sur le disque : son worktree (avec son
// `node_modules` et ses caches de build, qui y vivent), ses flux (`<run>.flux.jsonl`,
// `<run>-mutations-<n>.flux.jsonl`, leur `.stderr`) et ses dossiers temporaires.
// Rien n'est retiré tant que la sortie du cook n'est pas confirmée : `sorti`
// vaut `true` ou le cook est laissé tel quel. Les volumes docker, containerd
// et le cache npm partagé ne sont pas à lui : ils ne passent jamais ici.
// Pas encore appelée : le branchement est un autre ticket (#4088).
import { rmSync } from "node:fs";
import { isAbsolute } from "node:path";

export type RestesDuCook = {
  cook: string;
  // `true` : le process est confirmé sorti. `false` ou `null` (inconnu) : on n'y touche pas.
  sorti: boolean | null;
  // Les chemins que ce cook possède, absolus.
  chemins: readonly string[];
  avertir?: (message: string) => void;
};

// Les chemins effectivement retirés. Ne lève jamais : un chemin absent est
// déjà fait, une erreur de suppression est dite et le suivant est tenté.
export function retirerLesRestesDuCook({ cook, sorti, chemins, avertir = (m) => console.error(m) }: RestesDuCook): string[] {
  if (sorti !== true) return [];
  const retires: string[] = [];
  for (const chemin of chemins) {
    try {
      if (!isAbsolute(chemin)) throw new Error("chemin relatif, laissé tel quel");
      rmSync(chemin, { recursive: true, force: true });
      retires.push(chemin);
    } catch (erreur) {
      try {
        avertir(`brigade : restes du cook ${cook} — ${chemin} n'a pas pu être retiré (${erreur instanceof Error ? erreur.message : String(erreur)})`);
      } catch {
        // Dire l'échec ne doit pas le faire remonter.
      }
    }
  }
  return retires;
}
