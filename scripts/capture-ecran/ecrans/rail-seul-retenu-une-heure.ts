// Le rail de « parade » sur GitHub seul (#3761) : #21, seul ticket du rail, attend depuis 2 h #40, en WAITING sur un
// collaborateur — la ligne en tête du rail dit pourquoi il ne part pas.
import { railRetenuParWaiting } from "./rail-retenu-par-waiting-commun.ts";

// MAINTENANT (10:04:12) moins 2 h.
export const ecran = railRetenuParWaiting("Le rail de « parade » : #21, seul ticket du rail, ne part pas depuis 2 h — la ligne en tête dit qu'il attend #40, en WAITING sur un collaborateur (#3761)", "2026-10-13T08:04:12.000Z");
