// Le premier ticket de « cantine », le premier projet du chef (#3302), jusqu'à son service : sa PR mergée, avec son lien.
import { DE_NOUVEAU_EN_PASS, EN_PASS, premierTicket, PRIS, RENVOYE, SERVI } from "./premier-ticket-commun.ts";

export const ecran = premierTicket("Le premier ticket du premier projet, raconté jusqu'à son service (#3302) : sa PR mergée, et son lien", [PRIS, EN_PASS, RENVOYE, DE_NOUVEAU_EN_PASS, SERVI]);
