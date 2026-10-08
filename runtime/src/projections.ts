// Le registre des projections du runtime. Un domaine ajoute son fichier sous
// projections/ et une ligne ici — rien d'autre.
import type { Projection } from "./projection.ts";
import { gardeFous } from "./projections/garde-fous.ts";
import { manager } from "./projections/manager.ts";
import { pass } from "./projections/pass.ts";
import { rail } from "./projections/rail.ts";
import { sauvegardes } from "./projections/sauvegardes.ts";
import { sessions } from "./projections/sessions.ts";
import { stations } from "./projections/stations.ts";

export const PROJECTIONS: Projection[] = [sessions, rail, gardeFous, stations, pass, manager, sauvegardes];
