// La commande des stations contributrices du projet, depuis son propre process (#2936) :
//   npm --prefix runtime run contributor-stations                        les stations qui ont pris un ticket, en JSON
//   npm --prefix runtime run contributor-stations -- refuse <station>    refuse cette station
//   npm --prefix runtime run contributor-stations -- accept <station>    la réaccepte
import { enProcess } from "./appel.ts";
import { principal } from "./station-contributrice/commande.ts";

await enProcess(principal);
