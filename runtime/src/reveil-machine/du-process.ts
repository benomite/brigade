// La veille de ce process (#3643) : une seule minuterie, quels que soient les
// projets et les cooks qu'il tient. Les garde-fous et le superviseur la
// prennent par défaut ; un test leur passe la sienne, à ses horloges.
import { veilleMachine, type VeilleMachine } from "./veille.ts";

let laVeille: VeilleMachine | null = null;
export const veilleDuProcess = (): VeilleMachine => (laVeille ??= veilleMachine());
