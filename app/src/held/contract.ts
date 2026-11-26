// Le contrat des gestes retenus (#4273, épique #4209) : ce que le runtime dit d'un geste d'agent qui attend l'OK du chef, et
// ce qu'il faut pour le lui donner. Un geste retenu est un enregistrement — son id, sa sorte (l'agent qui le propose), son
// résumé (`split #4129 into 3 tickets`), sa raison, la commande qui l'approuve et l'instant où il a été retenu —, et
// l'approuver est une action par son id. Le runtime le montre sous `held gestures` dans `manager` (runtime/src/manager-cli.ts,
// `montrerLesAttentes`) : « <summary> — <reason> », la ligne qui se lit aussi dans le bloc `awaiting`.
export type ActionRetenu = { id: string; kind: string; summary: string; reason: string; approveCommand: string; heldAt: string };

// Les gestes retenus d'un projet, ou pourquoi ils ne se lisent pas — jamais « aucun » à la place d'une lecture ratée.
// `detail` : ce que la station a rendu, au survol.
export type ReadDesRetenus = { gestes: ActionRetenu[] } | { sans: string; detail: string };

// Ce qu'il est advenu d'une approbation : faite — ce que le runtime en dit —, ou refusée, et pourquoi.
export type Approbation = { fait: string } | { refus: string; detail: string };

// L'action d'approuver, telle que la carte l'appelle : elle tient quand l'approbation est faite, et échoue avec la raison
// du refus sinon.
export type Approuver = (id: string) => Promise<unknown>;
