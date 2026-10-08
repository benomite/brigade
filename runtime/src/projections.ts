// Le registre des projections du runtime. Un domaine ajoute son fichier sous
// projections/ et une ligne ici — rien d'autre.
import type { Projection } from "./projection.ts";
import { sessions } from "./projections/sessions.ts";

export const PROJECTIONS: Projection[] = [sessions];
