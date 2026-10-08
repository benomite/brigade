// Une projection : un état dérivé du journal, matérialisé dans ses propres
// tables. Elle est appliquée dans la transaction qui ajoute l'événement, et
// doit pouvoir être effacée puis recalculée en rejouant le journal — donc ne
// dépendre de rien d'autre que des événements, dans l'ordre.
import type { Base } from "./base.ts";
import type { Evenement, Fait } from "./evenements.ts";

export type Projection = {
  nom: string;
  // Les tables que la projection possède : ce sont elles qu'un rejeu vide.
  tables: string[];
  // Leur création, rejouable (CREATE TABLE IF NOT EXISTS).
  schema: string;
  appliquer(base: Base, evenement: Evenement): void;
};

// `F` est l'ensemble des faits que la projection écoute. `sur` doit en traiter
// chaque type : en oublier un est une erreur de tsc. Les faits hors de `F` sont
// ignorés.
export function definirProjection<F extends Fait>(definition: {
  nom: string;
  tables: string[];
  schema: string;
  sur: { [T in F["type"]]: (base: Base, evenement: Evenement<Extract<F, { type: T }>>) => void };
}): Projection {
  const sur = definition.sur as unknown as Record<string, (base: Base, evenement: Evenement) => void>;
  return {
    nom: definition.nom,
    tables: definition.tables,
    schema: definition.schema,
    appliquer(base, evenement) {
      if (Object.hasOwn(sur, evenement.type)) sur[evenement.type]?.(base, evenement);
    },
  };
}
