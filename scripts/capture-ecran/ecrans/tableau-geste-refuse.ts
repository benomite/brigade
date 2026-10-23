// Le merge de #12 posté, puis refusé par la box (#1590) : la ligne dit « refused » et la ligne que la box a répondue, et
// ses décisions reviennent.
import { CONFIRMER, espaceDuTableau, MERGER_LA_PREMIERE, POSTE, REFUSE } from "./tableau-commun.ts";

export const ecran = espaceDuTableau("Le merge de #12 refusé par la box (#1590) : « refused », sa ligne, et les décisions de nouveau offertes", REFUSE, { box: false, etapes: [MERGER_LA_PREMIERE, CONFIRMER], geste: POSTE });
