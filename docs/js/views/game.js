import { state } from "../state.js";
import { TOTAL_QUESTIONS, ANSWER_WINDOW_MS, REVEAL_DELAY_MS, colorById } from "../constants.js";
import { submitAnswer } from "../lobby.js";

let timerRaf = null;
let revealCountdownInterval = null;

export function renderGame(root) {
  cancelTimers();
  const el = document.createElement("div");
  el.className = "view view-game";
  el.appendChild(renderTopBar());

  const q = state.currentQuestion;
  if (!q) {
    el.innerHTML += `<div class="loading">Loading question…</div>`;
    root.appendChild(el);
    return;
  }

  el.appendChild(renderQuestion(q));

  if (state.questionPhase === "reveal") {
    el.appendChild(renderRevealCountdown());
  } else {
    el.appendChild(renderOptions(q));
    el.appendChild(renderTimerBar());
  }

  root.appendChild(el);

  if (state.questionPhase === "reveal") startRevealCountdown(el);
  if (state.questionPhase === "answering") startAnswerTimer(el);
}

function cancelTimers() {
  if (timerRaf) { cancelAnimationFrame(timerRaf); timerRaf = null; }
  if (revealCountdownInterval) { clearInterval(revealCountdownInterval); revealCountdownInterval = null; }
}

// ---------- Top bar ----------

function renderTopBar() {
  const wrap = document.createElement("header");
  wrap.className = "topbar";

  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const leaderScore = sorted[0]?.score ?? 0;

  const progressTicks = Array.from({ length: TOTAL_QUESTIONS }).map((_, i) =>
    `<span class="tick ${i < state.questionIndex ? "done" : ""} ${i === state.questionIndex ? "current" : ""}"></span>`
  ).join("");

  const playerChips = sorted.map(p => {
    const c = colorById(p.colorId);
    const isLeader = p.score > 0 && p.score === leaderScore;
    return `
      <div class="topbar-player">
        ${isLeader ? `<span class="crown">♛</span>` : ""}
        <div class="topbar-chip" style="background:${c?.hex || "#666"}">
          <span class="score">★ ${p.score}</span>
        </div>
        <span class="nick">${escapeHtml(p.nickname)}</span>
      </div>
    `;
  }).join("");

  wrap.innerHTML = `
    <div class="progress">${progressTicks}</div>
    <div class="topbar-players">${playerChips}</div>
  `;
  return wrap;
}

// ---------- Question text ----------

function renderQuestion(q) {
  const div = document.createElement("div");
  div.className = "question";
  div.innerHTML = `<h2>${escapeHtml(q.question)}</h2>
    <div class="q-meta">
      <span class="badge difficulty-${q.difficulty}">${q.difficulty}</span>
      <span class="muted">${escapeHtml(q.category)}</span>
    </div>`;
  return div;
}

// ---------- Reveal phase (options hidden, 3s countdown) ----------

function renderRevealCountdown() {
  const div = document.createElement("div");
  div.className = "reveal-countdown";
  div.innerHTML = `<div class="reveal-number" id="revealNumber">3</div>`;
  return div;
}

function startRevealCountdown(el) {
  const num = el.querySelector("#revealNumber");
  const update = () => {
    const remainMs = Math.max(0, state.questionStartAt - Date.now());
    const remainSec = Math.ceil(remainMs / 1000);
    if (num) num.textContent = remainSec || "";
  };
  update();
  revealCountdownInterval = setInterval(update, 100);
}

// ---------- Options ----------

function renderOptions(q) {
  const myAnswer = state.answers[state.clientId];
  const phase = state.questionPhase;

  const grid = document.createElement("div");
  grid.className = "options";
  grid.innerHTML = q.options.map((opt, i) => {
    let cls = "option";
    let pillsRow = "";

    if (phase === "answering") {
      if (myAnswer) {
        if (myAnswer.optionIndex === i) cls += " selected";
        else cls += " dimmed";
      }
    } else if (phase === "result") {
      // Build name pills for this option
      const players = Object.entries(state.answers)
        .filter(([, a]) => a.optionIndex === i)
        .map(([cid]) => state.players.find(p => p.clientId === cid))
        .filter(Boolean);
      if (players.length) {
        pillsRow = `<div class="answer-pills">
          ${players.map(p => {
            const c = colorById(p.colorId);
            return `<span class="answer-pill" style="background:${c?.hex || "#666"}">${escapeHtml(p.nickname)}</span>`;
          }).join("")}
        </div>`;
      }
      if (i === q.correctIndex) cls += " correct";
      else if (myAnswer && myAnswer.optionIndex === i) cls += " wrong";
      else cls += " dimmed";
    }

    return `
      <button class="${cls}" data-opt="${i}" ${phase !== "answering" || myAnswer ? "disabled" : ""}>
        <span class="option-text">${escapeHtml(opt)}</span>
        ${pillsRow}
      </button>
    `;
  }).join("");

  grid.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-opt]");
    if (!btn || btn.disabled) return;
    await submitAnswer(Number(btn.dataset.opt));
  });

  return grid;
}

// ---------- Timer bar with name markers ----------

function renderTimerBar() {
  const div = document.createElement("div");
  div.className = "timer-bar-wrap";
  div.innerHTML = `
    <div class="timer-bar" id="timerBar"></div>
    <div class="timer-markers" id="timerMarkers"></div>
  `;
  return div;
}

function startAnswerTimer(el) {
  const bar = el.querySelector("#timerBar");
  const markers = el.querySelector("#timerMarkers");

  const totalMs = ANSWER_WINDOW_MS;
  const startedAt = state.questionStartAt;

  const renderMarkers = () => {
    if (!markers) return;
    const html = Object.entries(state.answers).map(([cid, a]) => {
      const p = state.players.find(pl => pl.clientId === cid);
      if (!p) return "";
      const c = colorById(p.colorId);
      const leftPct = Math.max(0, Math.min(1, 1 - a.msSinceReveal / totalMs)) * 100;
      return `<span class="answer-marker" style="left:${leftPct}%; --marker-color:${c?.hex || "#666"}">${escapeHtml(p.nickname)}</span>`;
    }).join("");
    markers.innerHTML = html;
  };
  renderMarkers();

  let lastMarkerCount = Object.keys(state.answers).length;

  const loop = () => {
    if (state.questionPhase !== "answering") {
      cancelTimers();
      return;
    }
    const elapsed = Date.now() - startedAt;
    const pct = Math.max(0, Math.min(1, 1 - elapsed / totalMs)) * 100;
    if (bar) bar.style.width = pct + "%";

    const count = Object.keys(state.answers).length;
    if (count !== lastMarkerCount) {
      lastMarkerCount = count;
      renderMarkers();
    }

    if (elapsed < totalMs) {
      timerRaf = requestAnimationFrame(loop);
    }
  };
  loop();
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[ch]));
}
