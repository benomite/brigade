// Ce que dit une confirmation avant qu'une demande au second s'écrive : son prix, en clair. Aucun geste du
// socle ne se confirme plus : la vue ne pose que la confirmation d'une demande au second (alerts.ts).

// Un « oui » : ce que son bouton dit, et ce qu'il engage.
export type Choice = { id: string; libelle: string; dit: string };
// `titre` : ce que le geste fait. `prix` : ce qu'il coûte, une phrase par ligne. `lu` : l'heure de la lecture
// dont le prix est tiré. `choix` : les « oui » ; `renoncer` : le « non », qui ne fait rien partir.
export type Confirmation = { titre: string; prix: string[]; lu?: string; choix: Choice[]; renoncer: string };
