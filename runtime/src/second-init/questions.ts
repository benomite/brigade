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
}

export interface QuestionQueue {
  // The points still to ask, in order.
  pending: readonly UnsettledPoint[];
  answers: readonly Answer[];
}

// The one-word replies that accept the recommendation. Whole words only: a bare
// letter could be a real answer.
export const ACCEPTANCES = ["yes", "ok", "okay", "oui", "d'accord"] as const;

function isAcceptance(reply: string): boolean {
  return (ACCEPTANCES as readonly string[]).includes(reply.trim().toLowerCase().replace(/[.!]+$/, ""));
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
    text: `${point.question} (recommended: ${point.recommended} — reply "yes" or "oui" to accept)`,
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
    answers: [...queue.answers, { id: point.id, value: accepted ? point.recommended : written }],
  };
}

// Every question still to ask, in order, as the queue yields them one by one.
export function questionsInOrder(points: readonly UnsettledPoint[]): Question[] {
  const questions: Question[] = [];
  let queue = startQueue(points);
  for (let q = nextQuestion(queue); q !== null; q = nextQuestion(queue)) {
    questions.push(q);
    queue = answer(queue, q.recommended);
  }
  return questions;
}
