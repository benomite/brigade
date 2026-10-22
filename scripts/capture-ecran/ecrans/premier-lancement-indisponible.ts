// Le premier lancement, sans `gh` sur ce PC (#1434) : la raison en une phrase, son détail au survol, « get the GitHub CLI » et « read again ».
import { premierLancement, SANS_GH } from "./premier-lancement-commun.ts";

export const ecran = premierLancement("Le premier lancement, sans `gh` sur ce PC (#1434) : la raison en une phrase, et le bouton de sa page", SANS_GH);
