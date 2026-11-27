// @ts-check
// La ligne que la page d'un projet pose au-dessus du rail quand l'app retient ses lectures pour le quota GitHub (tickets 4620,
// 4645) : ce qui est retenu, ce qui reste, et quand la lecture reprend — « GitHub quota: 0 of 5,000 left — reading resumes at
// 17:27 », à l'heure locale du chef. Rail gardé ou pas, c'est la même ligne ; elle part avec la pause.

/** @param {string} iso */
const hourOf = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

/** @param {{ jusqua: string, restant?: number, total?: number }} pause */
function sentenceOfPause({ jusqua: until, restant: left, total }) {
  const quota = left !== undefined && total !== undefined ? `${left.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} left` : "reads paused";
  return `GitHub quota: ${quota} — reading resumes at ${hourOf(until)}`;
}

/** @param {{ createElement(balise: string): any }} doc @param {{ jusqua: string, restant?: number, total?: number }} pause */
export function setThePause(doc, pause) {
  const line = doc.createElement("p");
  line.className = "pause-github";
  line.textContent = sentenceOfPause(pause);
  line.title = "The app sends no GitHub read for any project until then, to leave the rest of the hourly quota to you: what the rail shows is its last reading.";
  return line;
}
