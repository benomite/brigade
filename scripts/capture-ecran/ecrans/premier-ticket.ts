// Le premier ticket de « cantine », le premier projet du chef (#3302) : pris, sa PR en pass, renvoyé et pourquoi, de
// nouveau en pass — une ligne par étape, au-dessus du rail.
import { DE_NOUVEAU_EN_PASS, EN_PASS, premierTicket, PRIS, RENVOYE } from "./premier-ticket-commun.ts";

export const ecran = premierTicket("Le premier ticket du premier projet, raconté pas à pas (#3302) : pris, PR ouverte, en pass, renvoyé et pourquoi, de nouveau en pass", [PRIS, EN_PASS, RENVOYE, DE_NOUVEAU_EN_PASS]);
