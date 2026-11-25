// Every agent the kitchen runs, once (#4220, epic #4117): the list the Agents tab shows, in this order. An agent the
// runtime starts and that is missing here is a red test (test/acceptation-4220/3-…): the roles of the kitchen
// (roles-cuisine/roles.ts), what runs outside the tickets (agents-en-cours.ts) and the autonomy team
// (autonomie/agents/agents.ts) are each read against it.
//
// `role`: one plain sentence. The roles of roles-cuisine/roles.ts keep their own sentence (`does`), read from there.
import { ROLES } from "../roles-cuisine/roles.ts";

export type AgentDuRegistre = { id: string; name: string; role: string };

const ditDe = (role: string): string => ROLES.find((une) => une.role === role)?.does ?? "";

export const REGISTRE: readonly AgentDuRegistre[] = [
  { id: "second", name: "Second", role: "Talks with the chef on the workstation and turns what they say into tickets." },
  { id: "manager", name: "Manager", role: ditDe("manager") },
  { id: "triage", name: "Triage", role: ditDe("triage") },
  { id: "cook", name: "Cooks", role: "Each cook takes one ticket on the rail, writes its change and delivers it." },
  { id: "design-cook", name: "Design cook", role: "Cooks a ticket that changes a screen, and delivers its screenshots before and after." },
  { id: "pass", name: "Pass", role: "Judges each delivery: its gates, its review and its tests, then merges it or sends it back." },
  { id: "reviewer", name: "Reviewer", role: ditDe("reviewer") },
  { id: "second-judge", name: "Second judge", role: ditDe("second judge") },
  { id: "closer", name: "Closer", role: ditDe("closer") },
  { id: "supervisor", name: "Supervisor", role: "Watches the kitchen, and wakes the manager with its file when nothing is merged for a while." },
];
