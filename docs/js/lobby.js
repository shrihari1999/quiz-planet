import { state, setState } from "./state.js";
import { getChannel, getClient, CH_LOBBY, CH_LOBBY_INDEX } from "./ably.js";
import { randomRoomId, MAX_PLAYERS, TOTAL_QUESTIONS, REVEAL_DELAY_MS, ANSWER_WINDOW_MS, RESULT_PAUSE_MS, VOTE_WINDOW_MS, SPEED_BONUS, DIFFICULTIES, categoryById } from "./constants.js";
import { fetchGameQuestions } from "./api.js";

let lobbyCh = null;
let indexCh = null;
let hostTimers = [];
let cleanupFns = [];

function clearHostTimers() {
  hostTimers.forEach(t => clearTimeout(t));
  hostTimers = [];
}

function cleanupSubs() {
  cleanupFns.forEach(fn => { try { fn(); } catch {} });
  cleanupFns = [];
}

// ---------- Public API ----------

export async function createLobby() {
  const roomId = randomRoomId();
  await openChannels(roomId);
  setState({
    roomId,
    isHost: true,
    view: "lobby",
    lobbyName: `${state.nickname}'s game`,
    players: [],
    votePhase: null,
    questions: [],
    questionIndex: 0,
    currentQuestion: null,
    questionPhase: null,
    answers: {},
    finalLeaderboard: [],
  });

  await enterLobbyPresence();
  await announceLobby("open");
  await wireHostHandlers();
}

export async function joinLobby(roomId, _asHost = false) {
  await openChannels(roomId);
  setState({
    roomId,
    isHost: false,
    view: "lobby",
    players: [],
    votePhase: null,
    questions: [],
    questionIndex: 0,
    currentQuestion: null,
    questionPhase: null,
    answers: {},
    finalLeaderboard: [],
  });
  await enterLobbyPresence();
  await wireGuestHandlers();
}

export async function leaveLobby() {
  clearHostTimers();
  cleanupSubs();
  if (lobbyCh) {
    try { await lobbyCh.presence.leave(); } catch {}
    lobbyCh.unsubscribe();
    lobbyCh = null;
  }
  if (indexCh && state.isHost) {
    try { await indexCh.presence.leave(); } catch {}
    indexCh = null;
  }
  setState({
    view: "landing",
    roomId: null,
    isHost: false,
    players: [],
    questions: [],
    currentQuestion: null,
    votePhase: null,
    questionPhase: null,
    answers: {},
  });
}

// Host-only: open category vote.
export async function hostStartGame() {
  if (!state.isHost) return;
  const voteEndsAt = Date.now() + VOTE_WINDOW_MS;
  setState({ votePhase: "voting", votes: {}, voteEndsAt });
  await announceLobby("voting");
  await lobbyCh.publish("vote-open", { voteEndsAt });
  hostTimers.push(setTimeout(async () => {
    await hostTallyVotes();
  }, VOTE_WINDOW_MS));
}

// Player: cast a vote
export async function castVote(categoryId) {
  if (state.votePhase !== "voting") return;
  // Optimistic local update so the selection highlights instantly.
  setState({ votes: { ...state.votes, [state.clientId]: categoryId } });
  await lobbyCh.publish("vote", { categoryId });
}

// Player: submit answer
export async function submitAnswer(optionIndex) {
  if (state.questionPhase !== "answering") return;
  if (state.answers[state.clientId]) return; // already answered
  const msSinceReveal = Date.now() - state.questionStartAt;
  await lobbyCh.publish("answer", {
    qIndex: state.questionIndex,
    optionIndex,
    msSinceReveal,
  });
}

// Host: trigger play-again
export async function hostPlayAgain() {
  if (!state.isHost) return;
  // Reset scores
  const players = state.players.map(p => ({ ...p, score: 0 }));
  setState({
    players,
    questions: [],
    questionIndex: 0,
    currentQuestion: null,
    questionPhase: null,
    answers: {},
    finalLeaderboard: [],
    votePhase: null,
    view: "lobby",
  });
  await lobbyCh.publish("play-again", { players });
  await announceLobby("open");
}

// ---------- Internals ----------

async function openChannels(roomId) {
  cleanupSubs();
  clearHostTimers();
  if (lobbyCh) { lobbyCh.unsubscribe(); lobbyCh = null; }
  lobbyCh = await getChannel(CH_LOBBY(roomId));
  indexCh = await getChannel(CH_LOBBY_INDEX);
}

let knownHostClientId = null;

async function enterLobbyPresence() {
  await lobbyCh.presence.enter({
    nickname: state.nickname,
    colorId: state.colorId,
    isHost: state.isHost,
  });
  if (state.isHost) knownHostClientId = state.clientId;
  await refreshPlayers();
  const onPres = () => refreshPlayers();
  lobbyCh.presence.subscribe(onPres);
  cleanupFns.push(() => lobbyCh && lobbyCh.presence.unsubscribe(onPres));
}

async function refreshPlayers() {
  if (!lobbyCh) return;
  const members = await lobbyCh.presence.get();

  // Stable ordering by presence join timestamp.
  members.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Identify host from presence flag.
  const hostMember = members.find(m => m.data?.isHost);
  if (hostMember) knownHostClientId = hostMember.clientId;

  // If we're a guest and the host disappeared, bail out.
  if (!state.isHost && knownHostClientId && !members.some(m => m.clientId === knownHostClientId)) {
    alert("Host left — returning to lobby list.");
    await leaveLobby();
    return;
  }

  // Map to internal player shape; preserve any existing scores.
  const prev = new Map(state.players.map(p => [p.clientId, p]));
  const players = members.map(m => {
    const existing = prev.get(m.clientId);
    return {
      clientId: m.clientId,
      nickname: m.data?.nickname || "anon",
      colorId:  m.data?.colorId || null,
      score: existing?.score ?? 0,
    };
  });

  setState({ players });

  if (state.isHost) {
    await announceLobby(state.votePhase ? "voting" : (state.questionPhase ? "in-game" : "open"));
  }
}

async function announceLobby(status) {
  if (!state.isHost || !indexCh) return;
  const data = {
    roomId: state.roomId,
    lobbyName: state.lobbyName,
    hostNickname: state.nickname,
    playerCount: state.players.length,
    status,
  };
  // If we haven't entered yet, enter; else update.
  const members = await indexCh.presence.get();
  const mine = members.find(m => m.clientId === state.clientId);
  if (mine) await indexCh.presence.update(data);
  else      await indexCh.presence.enter(data);
}

// ---------- Host event handlers ----------

async function wireHostHandlers() {
  // Host subscribes to the same event stream as guests; the only host-only
  // logic lives inline within the shared handlers (gated by state.isHost).
  await wireGuestHandlers();
}

// Host: tally vote winner and start questions.
async function hostTallyVotes() {
  const picks = state.votes;
  const tally = {};
  for (const cat of Object.values(picks)) {
    tally[cat] = (tally[cat] || 0) + 1;
  }
  // Find max
  let max = 0;
  for (const v of Object.values(tally)) if (v > max) max = v;
  const winners = Object.keys(tally).filter(k => tally[k] === max);
  let chosen;
  if (winners.length === 0) {
    // No one voted — pick "All"
    chosen = "all";
  } else if (winners.includes("all")) {
    chosen = "all"; // ties involving "All" → "All" wins
  } else {
    chosen = winners[Math.floor(Math.random() * winners.length)];
  }
  await lobbyCh.publish("vote-result", { categoryId: chosen });

  // Fetch questions
  let questions;
  try {
    questions = await fetchGameQuestions(chosen);
  } catch (e) {
    await lobbyCh.publish("error", { message: "Failed to load questions: " + e.message });
    return;
  }
  await lobbyCh.publish("game-start", { questions });
  // Begin first question
  setTimeout(() => hostNextQuestion(0), 800);
}

async function hostNextQuestion(idx) {
  if (idx >= TOTAL_QUESTIONS) {
    return hostEndGame();
  }
  const q = state.questions[idx];
  if (!q) return;
  // Note: no absolute timestamp is sent — each client anchors the reveal
  // countdown to its own clock on receipt to avoid cross-device clock skew.
  await lobbyCh.publish("question", { qIndex: idx, question: q });
  // After answer window, reveal
  const totalMs = REVEAL_DELAY_MS + ANSWER_WINDOW_MS;
  hostTimers.push(setTimeout(() => hostRevealQuestion(), totalMs));
}

async function hostRevealQuestion() {
  clearHostTimers();
  const q = state.currentQuestion;
  if (!q) return;
  const players = computeScores(state.players, state.answers, q);
  await lobbyCh.publish("reveal", {
    qIndex: state.questionIndex,
    answers: state.answers,
    players,
  });
  hostTimers.push(setTimeout(() => hostNextQuestion(state.questionIndex + 1), RESULT_PAUSE_MS));
}

async function hostEndGame() {
  const finalLeaderboard = [...state.players].sort((a, b) => b.score - a.score);
  await lobbyCh.publish("end", { finalLeaderboard });
  await announceLobby("open"); // Lobby resets to open after game
}

function computeScores(players, answers, question) {
  const diff = DIFFICULTIES.find(d => d.id === question.difficulty);
  const base = diff?.points || 10;
  return players.map(p => {
    const a = answers[p.clientId];
    if (!a || a.optionIndex !== question.correctIndex) return p;
    let delta = base;
    for (const tier of SPEED_BONUS) {
      if (a.msSinceReveal <= tier.withinMs) { delta += tier.points; break; }
    }
    return { ...p, score: p.score + delta };
  });
}

// ---------- Guest event handlers (also used by host for self-sync) ----------

async function wireGuestHandlers() {
  const onVoteOpen = (msg) => {
    setState({
      votePhase: "voting",
      votes: {},
      voteEndsAt: msg.data.voteEndsAt,
      view: "lobby",
    });
  };
  lobbyCh.subscribe("vote-open", onVoteOpen);
  cleanupFns.push(() => lobbyCh.unsubscribe("vote-open", onVoteOpen));

  const onVote = (msg) => {
    if (state.votePhase !== "voting") return;
    const votes = { ...state.votes, [msg.clientId]: msg.data.categoryId };
    setState({ votes });
  };
  lobbyCh.subscribe("vote", onVote);
  cleanupFns.push(() => lobbyCh.unsubscribe("vote", onVote));

  const onVoteResult = (msg) => {
    setState({
      votePhase: "tallied",
      selectedCategory: msg.data.categoryId,
    });
  };
  lobbyCh.subscribe("vote-result", onVoteResult);
  cleanupFns.push(() => lobbyCh.unsubscribe("vote-result", onVoteResult));

  const onGameStart = (msg) => {
    setState({
      questions: msg.data.questions,
      questionIndex: 0,
      view: "game",
    });
  };
  lobbyCh.subscribe("game-start", onGameStart);
  cleanupFns.push(() => lobbyCh.unsubscribe("game-start", onGameStart));

  const onQuestion = (msg) => {
    const { qIndex, question } = msg.data;
    // Anchor the reveal countdown to this device's own clock. Using the
    // host's absolute timestamp would surface clock skew between devices
    // (e.g. a phone's clock running behind the host would show 5 instead of 3).
    const questionStartAt = Date.now() + REVEAL_DELAY_MS;
    setState({
      questionIndex: qIndex,
      currentQuestion: question,
      questionStartAt,
      questionPhase: "reveal",
      answers: {},
      view: "game",
    });
    setTimeout(() => {
      if (state.questionIndex === qIndex) {
        setState({ questionPhase: "answering" });
      }
    }, REVEAL_DELAY_MS);
  };
  lobbyCh.subscribe("question", onQuestion);
  cleanupFns.push(() => lobbyCh.unsubscribe("question", onQuestion));

  const onAnswer = (msg) => {
    // Everyone tracks answers for live timer markers.
    if (msg.data.qIndex !== state.questionIndex) return;
    const answers = { ...state.answers, [msg.clientId]: {
      optionIndex: msg.data.optionIndex,
      msSinceReveal: msg.data.msSinceReveal,
    } };
    setState({ answers });
    // Host shortcut: if everyone answered, reveal immediately.
    if (state.isHost && Object.keys(answers).length >= state.players.length) {
      clearHostTimers();
      hostRevealQuestion();
    }
  };
  lobbyCh.subscribe("answer", onAnswer);
  cleanupFns.push(() => lobbyCh.unsubscribe("answer", onAnswer));

  const onReveal = (msg) => {
    setState({
      questionPhase: "result",
      answers: msg.data.answers,
      players: msg.data.players,
    });
  };
  lobbyCh.subscribe("reveal", onReveal);
  cleanupFns.push(() => lobbyCh.unsubscribe("reveal", onReveal));

  const onEnd = (msg) => {
    setState({
      view: "podium",
      finalLeaderboard: msg.data.finalLeaderboard,
    });
  };
  lobbyCh.subscribe("end", onEnd);
  cleanupFns.push(() => lobbyCh.unsubscribe("end", onEnd));

  const onPlayAgain = (msg) => {
    setState({
      view: "lobby",
      players: msg.data.players,
      votePhase: null,
      questions: [],
      questionIndex: 0,
      currentQuestion: null,
      questionPhase: null,
      answers: {},
      finalLeaderboard: [],
    });
  };
  lobbyCh.subscribe("play-again", onPlayAgain);
  cleanupFns.push(() => lobbyCh.unsubscribe("play-again", onPlayAgain));

  const onError = (msg) => {
    alert(msg.data.message || "Error");
  };
  lobbyCh.subscribe("error", onError);
  cleanupFns.push(() => lobbyCh.unsubscribe("error", onError));
}
