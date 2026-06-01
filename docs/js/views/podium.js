import { state } from "../state.js";
import { colorById } from "../constants.js";
import { hostPlayAgain, leaveLobby } from "../lobby.js";

export function renderPodium(root) {
  const el = document.createElement("div");
  el.className = "view view-podium";

  const sorted = [...state.finalLeaderboard];
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  el.innerHTML = `
    <h1>Final Scores</h1>
    <div class="podium">
      ${[1, 0, 2].map(rankIdx => {
        const p = top3[rankIdx];
        if (!p) return `<div class="podium-slot empty"></div>`;
        const c = colorById(p.colorId);
        const place = rankIdx + 1;
        return `
          <div class="podium-slot place-${place}">
            <div class="podium-pillar" style="background:${c?.hex || "#666"}">
              <div class="podium-place">${place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉"}</div>
            </div>
            <div class="podium-name">${escapeHtml(p.nickname)}</div>
            <div class="podium-score">★ ${p.score}</div>
          </div>
        `;
      }).join("")}
    </div>

    ${rest.length ? `
      <ul class="leaderboard-rest">
        ${rest.map((p, i) => {
          const c = colorById(p.colorId);
          return `<li>
            <span class="rank">#${i + 4}</span>
            <span class="dot" style="background:${c?.hex || "#666"}"></span>
            <span class="name">${escapeHtml(p.nickname)}</span>
            <span class="score">★ ${p.score}</span>
          </li>`;
        }).join("")}
      </ul>
    ` : ""}

    <footer class="podium-footer">
      ${state.isHost
        ? `<button id="againBtn" class="btn btn-primary btn-lg">Play again</button>`
        : `<p class="muted">Waiting for the host to start a new game…</p>`}
      <button id="leaveBtn" class="btn btn-ghost">Leave lobby</button>
    </footer>
  `;

  root.appendChild(el);

  el.querySelector("#leaveBtn").addEventListener("click", async () => {
    await leaveLobby();
  });
  if (state.isHost) {
    el.querySelector("#againBtn")?.addEventListener("click", async () => {
      await hostPlayAgain();
    });
  }
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[ch]));
}
