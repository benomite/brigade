// Les faits des décisions du chef : ce qu'il décide pour son projet et qui
// n'est pas un fait de la machine (`decisions.ts`). `name` : la variable
// d'environnement que la décision remplace — c'est par elle qu'une décision
// l'emporte sur l'environnement. `previous` : ce que le journal portait pour
// elle avant, ou null s'il n'en portait rien.
export type FaitDecision =
  // Le chef pose une valeur : elle vaut à la lecture suivante, sans redémarrage.
  | { type: "decision.set"; payload: { name: string; value: string; previous: string | null } }
  // Il la retire : l'environnement est relu comme avant.
  | { type: "decision.withdrawn"; payload: { name: string; previous: string } };
