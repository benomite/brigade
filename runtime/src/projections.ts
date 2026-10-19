// Le registre des projections du runtime. Un domaine ajoute son fichier sous
// projections/ et une ligne ici — rien d'autre.
import type { Projection } from "./projection.ts";
import { splits } from "./projections/splits.ts";
import { guardrails } from "./projections/guardrails.ts";
import { jeton } from "./projections/token.ts";
import { manager } from "./projections/manager.ts";
import { measures } from "./projections/measures.ts";
import { nettoyage } from "./projections/cleanup.ts";
import { pass } from "./projections/pass.ts";
import { rail } from "./projections/rail.ts";
import { reactions } from "./projections/reactions.ts";
import { renouvellement } from "./projections/renewal.ts";
import { backups } from "./projections/backups.ts";
import { service } from "./projections/service.ts";
import { sessions } from "./projections/sessions.ts";
import { stations } from "./projections/stations.ts";
import { alerteUrgence } from "./projections/emergency.ts";

export const PROJECTIONS: Projection[] = [sessions, rail, guardrails, stations, pass, manager, splits, reactions, backups, nettoyage, measures, service, renouvellement, jeton, alerteUrgence];
