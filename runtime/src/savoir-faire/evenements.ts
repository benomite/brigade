// Les faits du savoir-faire du projet (#4241) : ce que le chef change d'une de ses
// entrées — les leçons provisoires du projet (`apprentissage/provisoires.ts`),
// celles que ses cooks reçoivent. `id` : l'id de la leçon (`L3`), qui ne change
// jamais. Le journal n'est qu'en ajout : la leçon ne s'efface pas, ces faits
// s'appliquent par-dessus (`corrections.ts`).
export type FaitSavoirFaire =
  // Le chef a réécrit le texte de l'entrée : `text`, sur une ligne, non vide.
  | { type: "know-how.edited"; payload: { id: string; text: string } }
  // Le chef a retiré l'entrée : plus aucun cook ne la reçoit, l'écran ne la montre plus.
  | { type: "know-how.removed"; payload: { id: string } };
