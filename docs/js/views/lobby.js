import { state, subscribe } from "../state.js";
import { CATEGORIES, MAX_PLAYERS, colorById, categoryById } from "../constants.js";
import { hostStartGame, castVote, leaveLobby } from "../lobby.js";

let voteTickerInterval = null;

export function renderLobby(root) {
  if (voteTickerInterval) { clearInterval(voteTickerInterval); voteTickerInterval = null; }

  const el = document.createElement("div");
  el.className = "view view-lobby";

  if (state.votePhase === "voting" || state.votePhase === "tallied") {
    renderVote(el);
  } else {
    renderRoom(el);
  }

  root.appendChild(el);

  if (state.votePhase === "voting") {
    voteTickerInterval = setInterval(() => {
      const t = el.querySelector("#voteCountdown");
      if (!t) return;
      const left = Math.max(0, Math.ceil((state.voteEndsAt - Date.now()) / 1000));
      t.textContent = left;
    }, 250);
  }
}

function renderRoom(el) {
  const players = state.players;
  const slots = Array.from({ length: MAX_PLAYERS }).map((_, i) => players[i] || null);
  el.innerHTML = `
    <header class="lobby-header">
      <button id="leaveBtn" class="btn btn-ghost">← Leave</button>
      <h1>${escapeHtml(state.lobbyName || "Lobby")}</h1>
      <span class="room-code">Room <code>${state.roomId}</code></span>
    </header>

    <section class="player-grid">
      ${slots.map((p, i) => p
        ? renderPlayerCard(p, i === 0 && state.isHost === false ? false : (p.clientId === state.players[0]?.clientId))
        : `<div class="player-card empty"><span class="muted">Empty slot</span></div>`
      ).join("")}
    </section>

    <footer class="lobby-footer">
      ${state.isHost
        ? `<button id="startBtn" class="btn btn-primary btn-lg" ${players.length < 2 ? "disabled" : ""}>Start game</button>
           ${players.length < 2 ? `<p class="muted">Need at least 2 players to start.</p>` : ""}`
        : `<p class="muted">Waiting for the host to start the game…</p>`}
    </footer>
  `;

  el.querySelector("#leaveBtn").addEventListener("click", async () => {
    await leaveLobby();
  });
  if (state.isHost) {
    el.querySelector("#startBtn")?.addEventListener("click", async () => {
      await hostStartGame();
    });
  }
}

function renderPlayerCard(p, _isHost) {
  const color = colorById(p.colorId);
  return `
    <div class="player-card" style="border-color:${color?.hex || "#333"}">
      <span class="player-dot" style="background:${color?.hex || "#666"}"></span>
      <span class="player-name">${escapeHtml(p.nickname)}</span>
      ${p.clientId === state.clientId ? `<span class="you-tag">you</span>` : ""}
    </div>
  `;
}

function renderVote(el) {
  const tally = {};
  for (const cat of Object.values(state.votes)) {
    tally[cat] = (tally[cat] || 0) + 1;
  }
  const myVote = state.votes[state.clientId];

  if (state.votePhase === "tallied") {
    const cat = categoryById(state.selectedCategory);
    el.innerHTML = `
      <div class="vote-result">
        <h2>Category</h2>
        <h1>${escapeHtml(cat?.name || state.selectedCategory)}</h1>
        <p class="muted">Loading questions…</p>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <header class="vote-header">
      <h2>Vote for a category</h2>
      <div class="vote-timer">Time left: <span id="voteCountdown">10</span>s</div>
    </header>
    <ul class="category-grid">
      ${CATEGORIES.map(c => `
        <li>
          <button class="category-btn ${myVote == c.id ? "selected" : ""}" data-cat="${c.id}">
            <span class="cat-name">${escapeHtml(c.name)}</span>
            <span class="cat-votes">${tally[c.id] ? `× ${tally[c.id]}` : ""}</span>
          </button>
        </li>
      `).join("")}
    </ul>
  `;

  el.querySelectorAll("[data-cat]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await castVote(btn.dataset.cat);
    });
  });
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[ch]));
}
