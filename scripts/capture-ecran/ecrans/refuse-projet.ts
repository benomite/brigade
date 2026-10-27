// L'onglet Cooks de « parade » (#1790) : le Mac a refusé d'en rejoindre la cuisine. Ses stations sont celles d'avant —
// la box seule —, et la phrase du refus se lit sous la ligne qui dit où il cuit.
import { COOKS_DE_PARADE, ecranRejoindre } from "./rejoindre-commun.ts";

export const ecran = ecranRejoindre("L'onglet Cooks de « parade » : le Mac a refusé d'en rejoindre la cuisine — ses stations inchangées, et la phrase du refus (#1790)", false, COOKS_DE_PARADE);
