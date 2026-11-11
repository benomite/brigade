// The second's setup asks the user only what reading the repository could not
// settle (#3168): one question at a time, each stating its recommended answer,
// which the user accepts in one word or replaces by an answer of their own.

export interface UnsettledPoint {
  id: string;
  // The question in product terms, without the recommendation: the queue adds it.
  question: string;
  recommended: string;
  // Set when reading the repository already settled the point: it is never asked.
  settled?: string;
}

export interface Question {
  id: string;
  text: string;
  recommended: string;
}

export interface Answer {
  id: string;
  value: string;
  accepted: boolean;
}

export interface QuestionQueue {
  // The points still to ask, in order.
  pending: readonly UnsettledPoint[];
  answers: readonly Answer[];
}

const ACCEPTANCES = new Set(["yes", "y", "ok", "okay", "oui", "o", "d'accord", "accept", "accepted"]);

export function isAcceptance(reply: string): boolean {
  return ACCEPTANCES.has(reply.trim().toLowerCase().replace(/[.!]+$/, ""));
}

export function startQueue(points: readonly UnsettledPoint[]): QuestionQueue {
  return { pending: points.filter((p) => p.settled === undefined), answers: [] };
}

// The one question to ask now, or null when nothing is left to ask.
export function nextQuestion(queue: QuestionQueue): Question | null {
  const point = queue.pending[0];
  if (point === undefined) return null;
  return {
    id: point.id,
    text: `${point.question} (recommended: ${point.recommended} — reply "yes" to accept)`,
    recommended: point.recommended,
  };
}

// Records the reply to the current question. A blank reply answers nothing:
// the same question stays current.
export function answer(queue: QuestionQueue, reply: string): QuestionQueue {
  const point = queue.pending[0];
  const written = reply.trim();
  if (point === undefined || written === "") return queue;
  const accepted = isAcceptance(written);
  return {
    pending: queue.pending.slice(1),
    answers: [...queue.answers, { id: point.id, value: accepted ? point.recommended : written, accepted }],
  };
}
