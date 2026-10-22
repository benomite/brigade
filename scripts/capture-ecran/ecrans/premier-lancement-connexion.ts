// Le premier lancement, ce PC connecté à aucun compte GitHub (#1434) : la phrase du runtime, et le bouton qui connecte.
import { premierLancement, SANS_COMPTE } from "./premier-lancement-commun.ts";

export const ecran = premierLancement("Le premier lancement, ce PC connecté à aucun compte GitHub (#1434) : la phrase et « Sign in to GitHub »", SANS_COMPTE);
