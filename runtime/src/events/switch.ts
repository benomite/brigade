// The project switch: one ON/OFF for the whole project (#1406), in place of the
// manager's switch and the `merge` grant, which the chef had to find and flip
// one by one before anything happened.
//
// On, the kitchen takes the fired tickets, the manager judges and splits, and
// a green delivery is merged. Off, nothing new is taken, judged, split or
// merged: the running cooks finish, their deliveries are judged and wait.
//
// `cause`, when the runtime writes it itself at its start, on a log that has
// none yet (`interrupteur.ts`, `etablirLInterrupteur`): `default`, the project
// never had either of the old switches set — on, by default; `carried-over`,
// it had, whatever their position — on all the same: its stations took the
// fired tickets without reading either, it was cooking and keeps cooking.
// Absent: the chef's command.
export type CauseDeLInterrupteur = "default" | "carried-over";

export type FaitInterrupteur =
  | { type: "project.switched-on"; payload: { cause?: CauseDeLInterrupteur } }
  | { type: "project.switched-off"; payload: { cause?: CauseDeLInterrupteur } };
