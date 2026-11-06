// « Add a project », un projet ajouté par son dossier (#2477), sans aucune station appairée : ce Mac seul est proposé.
import { AUCUNE, ajoutStation } from "./ajout-station-commun.ts";

export const ecran = ajoutStation("« Add a project », le projet ajouté, sans station appairée : ce Mac seul", AUCUNE);
