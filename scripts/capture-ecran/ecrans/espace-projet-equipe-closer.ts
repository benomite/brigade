// Le fil du closer de « parade » ouvert sous l'équipe (ticket 4029) : ses derniers gestes, ses deux compteurs, son niveau
// d'autonomie — propose — et le geste qui attend l'OK du chef.
import { ecran as equipe } from "./espace-projet-equipe.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...equipe,
  dit: "L'espace de « parade » : le fil du closer ouvert sous l'équipe, son niveau et son geste en attente",
  etapes: [...equipe.etapes, { cliquer: '#equipe-du-projet button[data-agent="closer"]' }],
};
