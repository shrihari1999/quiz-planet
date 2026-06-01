// Tiny event-emitter-backed global state.
const listeners = new Set();

export const state = {
  // identity
  nickname: localStorage.getItem("qp:nickname") || "",
  colorId:  localStorage.getItem("qp:colorId") || null,
  clientId: null,           // assigned at Ably connect

  // routing
  view: "landing",          // landing | lobby | game | podium

  // lobby
  roomId: null,
  isHost: false,
  players: [],              // [{ clientId, nickname, colorId, score }]
  lobbyName: "",

  // vote
  votes: {},                // { clientId: categoryId }
  votePhase: null,          // null | "voting" | "tallied"
  voteEndsAt: null,
  selectedCategory: null,

  // game
  questions: [],
  questionIndex: 0,
  questionPhase: null,      // null | "reveal" | "answering" | "result"
  questionStartAt: null,    // timestamp options become visible (ms)
  answers: {},              // { clientId: { optionIndex, msSinceReveal } } current Q only
  currentQuestion: null,

  // podium
  finalLeaderboard: [],
};

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function persistIdentity() {
  if (state.nickname) localStorage.setItem("qp:nickname", state.nickname);
  if (state.colorId)  localStorage.setItem("qp:colorId", state.colorId);
}
