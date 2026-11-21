// Le rail de « parade » sur GitHub seul (#3761) : #21 attend #40 (`Depends on #40`), et #40 est en WAITING sur un
// collaborateur. La vue reçoit ce que l'app en tire (app/src/vue/rail/github.ts, `avecLeRail`), rien écrit à la main.
import type { TicketSurGithub } from "../../../app/src/vue/rail/github.ts";
import { MAINTENANT } from "./commun.ts";
import { ticket } from "./github-seul-commun.ts";
import { ecranDuRail } from "./rail-alerte-commun.ts";

// Le rail, #21 entré dans la file à `entreLe`.
export const railRetenuParWaiting = (dit: string, entreLe: string, autres: TicketSurGithub[] = []) =>
  ecranDuRail(dit, {
    lu: MAINTENANT,
    tickets: [
      ticket(40, "WAITING", { qui: "a collaborator" }),
      ticket(21, "en attente", { priorite: 1, creeLe: entreLe, entreLe, depend: [40], attentes: [{ ticket: 40, source: "corps", phrase: "Depends on #40" }] }),
      ...autres,
    ],
  });
