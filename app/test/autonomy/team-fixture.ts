// La fixture de l'équipe d'un projet (ticket 4029) : un enregistrement par agent, dans la forme que le runtime publiera
// (le ticket la fixe ; un autre ticket construit le côté runtime). Le test de l'équipe et l'écran de capture
// `espace-projet-equipe` la lisent tous deux. Les heures sont celles du matin de la cuisine figée (2026-10-13).
import type { Agent } from "../../src/vue/autonomy/source.js";

const fait = (at: string, line: string, reason: string, outcome: string) => ({ at, line, reason, outcome });

export const TEAM: Agent[] = [
  {
    agent: "manager",
    state: "working on #4031",
    lastGesture: { line: "split epic #4024 into 4 tickets", at: "2026-10-13T08:12:00.000Z" },
    nextRun: { text: "manager: next run in 10 min", at: "2026-10-13T10:14:00.000Z" },
    thread: "manager",
    autonomy: "act",
    counters: { fixedBySelf: 21, handedToChef: 3 },
    gestures: [fait("2026-10-13T08:12:00.000Z", "split epic #4024 into 4 tickets", "the chef validated its spec", "4 tickets on the rail")],
    pending: [],
  },
  {
    agent: "pass",
    state: "judging #4030",
    lastGesture: { line: "sent back #4027", at: "2026-10-13T09:48:00.000Z" },
    nextRun: { text: "pass: on the next delivery", at: "2026-10-13T10:04:12.000Z" },
    thread: "pass",
    autonomy: "act",
    counters: { fixedBySelf: 14, handedToChef: 0 },
    gestures: [fait("2026-10-13T09:48:00.000Z", "sent back #4027", "a mutation survived on line 42", "back to a cook")],
    pending: [],
  },
  {
    agent: "cook-4029",
    state: "cooking #4029",
    lastGesture: { line: "pushed 3 commits", at: "2026-10-13T09:58:00.000Z" },
    nextRun: { text: "cook-4029: running now", at: "2026-10-13T10:04:12.000Z" },
    thread: "cook-4029",
    autonomy: "act",
    counters: { fixedBySelf: 0, handedToChef: 0 },
    gestures: [],
    pending: [],
  },
  {
    agent: "supervisor",
    state: "idle",
    lastGesture: { line: "reran tests on 0de1ff5", at: "2026-10-13T09:01:00.000Z" },
    nextRun: { text: "supervisor: wakes if nothing is merged by 10:40", at: "2026-10-13T10:40:00.000Z" },
    thread: "supervisor",
    autonomy: "act",
    counters: { fixedBySelf: 12, handedToChef: 1 },
    gestures: [
      fait("2026-10-13T09:01:00.000Z", "reran tests on 0de1ff5", "red for 10 min", "green"),
      fait("2026-10-13T07:30:00.000Z", "freed the zone of #4012", "no cook held it", "#4013 taken"),
    ],
    pending: [],
  },
  {
    agent: "cook-4032",
    state: "broken",
    lastGesture: { line: "stopped on a red gate", at: "2026-10-13T09:20:00.000Z" },
    nextRun: { text: "cook-4032: waits for the supervisor", at: "2026-10-13T10:40:00.000Z" },
    thread: "cook-4032",
    autonomy: "act",
    counters: { fixedBySelf: 0, handedToChef: 0 },
    gestures: [],
    pending: [],
  },
  {
    agent: "closer",
    state: "idle",
    lastGesture: { line: "deleted 412 dead lines in runtime/src/retenue/", at: "2026-10-13T03:12:00.000Z" },
    nextRun: { text: "closer: next pass in 3 h", at: "2026-10-13T13:04:00.000Z" },
    thread: "closer",
    autonomy: "propose",
    counters: { fixedBySelf: 7, handedToChef: 2 },
    gestures: [
      fait("2026-10-13T03:12:00.000Z", "deleted 412 dead lines in runtime/src/retenue/", "no caller left", "merged"),
      fait("2026-10-12T03:05:00.000Z", "merged two copies of the rail reading", "the same 17 lines twice", "merged"),
    ],
    pending: [{ id: "p-1", line: "delete 180 dead lines in runtime/src/rail.ts" }],
  },
];
