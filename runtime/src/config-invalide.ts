// Une configuration refusée : la variable, le fichier ou la valeur qui ne se
// lit pas, dit au chef. Un module à part, sans dépendance, pour que ce qui ne
// fait que la lever ne charge rien d'autre (`runtime.ts` la réexporte).
import type { CodeDeRefus } from "./projets/refus.ts";

export class ConfigInvalide extends Error {
  // La cause du refus pour le chef (`projets/refus.ts`), quand elle est connue.
  readonly code: CodeDeRefus | undefined;
  constructor(message: string, code?: CodeDeRefus) {
    super(message);
    this.code = code;
    this.name = "ConfigInvalide";
  }
}
