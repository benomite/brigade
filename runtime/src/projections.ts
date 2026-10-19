// Le registre des projections du runtime. Un domaine ajoute son fichier sous
// projections/ et une ligne ici — rien d'autre.
import type { Projection } from "./projection.ts";
import { decoupages } from "./projections/splits.ts";
import { gardeFous } from "./projections/guardrails.ts";
import { jeton } from "./projections/token.ts";
import { manager } from "./projections/manager.ts";
import { measures } from "./projections/measures.ts";
import { nettoyage } from "./projections/cleanup.ts";
import { pass } from "./projections/pass.ts";
import { rail } from "./projections/rail.ts";
import { reactions } from "./projections/reactions.ts";
import { renouvellement } from "./projections/renewal.ts";
import { sauvegardes } from "./projections/backups.ts";
import { service } from "./projections/service.ts";
import { sessions } from "./projections/sessions.ts";
import { stations } from "./projections/stations.ts";
import { alerteUrgence } from "./projections/emergency.ts";

export const PROJECTIONS: Projection[] = [sessions, rail, gardeFous, stations, pass, manager, decoupages, reactions, sauvegardes, nettoyage, measures, service, renouvellement, jeton, alerteUrgence];
