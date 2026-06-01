import { state, setState, persistIdentity } from "../state.js";
import { COLORS } from "../constants.js";
import { getChannel, CH_LOBBY_INDEX } from "../ably.js";
import { createLobby, joinLobby } from "../lobby.js";

let indexChannel = null;
let liveLobbies = [];   // [{ roomId, lobbyName, hostNickname, playerCount, status }]

async function subscribeLobbyIndex(onUpdate) {
  if (indexChannel) return;
  indexChannel = await getChannel(CH_LOBBY_INDEX);

  const refresh = async () => {
    const members = await indexChannel.presence.get();
    liveLobbies = members.map(m => m.data).filter(Boolean);
    onUpdate();
  };
  indexChannel.presence.subscribe(refresh);
  await refresh();
}

export async function renderLanding(root) {
  const el = document.createElement("div");
  el.className = "view view-landing";
  el.innerHTML = `
    <header class="brand"><h1>Quiz Planet</h1></header>

    <section class="identity">
      <label class="field">
        <span>Your name</span>
        <input id="nicknameInput" maxlength="16" placeholder="Enter a nickname" value="${escapeHtml(state.nickname)}" />
      </label>
      <div class="field">
        <span>Pick a color</span>
        <div class="color-row" id="colorRow">
          ${COLORS.map(c => `
            <button class="color-swatch ${state.colorId === c.id ? "selected" : ""}" data-color="${c.id}" style="background:${c.hex}" title="${c.id}"></button>
          `).join("")}
        </div>
      </div>
    </section>

    <section class="lobby-section">
      <div class="lobby-section-header">
        <h2>Open lobbies</h2>
        <button id="createLobbyBtn" class="btn btn-primary">Create lobby</button>
      </div>
      <ul id="lobbyList" class="lobby-list"></ul>
    </section>
  `;
  root.appendChild(el);

  const nicknameInput = el.querySelector("#nicknameInput");
  nicknameInput.addEventListener("input", (e) => {
    state.nickname = e.target.value.trim();
    persistIdentity();
  });

  el.querySelector("#colorRow").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-color]");
    if (!btn) return;
    el.querySelectorAll(".color-swatch").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.colorId = btn.dataset.color;
    persistIdentity();
  });

  el.querySelector("#createLobbyBtn").addEventListener("click", async () => {
    if (!validateIdentity()) return;
    try {
      await createLobby();
    } catch (e) {
      alert("Couldn't create lobby: " + e.message);
    }
  });

  const renderList = () => {
    const ul = el.querySelector("#lobbyList");
    if (!liveLobbies.length) {
      ul.innerHTML = `<li class="empty">No open lobbies. Create one!</li>`;
      return;
    }
    ul.innerHTML = liveLobbies.map(l => `
      <li class="lobby-item">
        <div class="lobby-meta">
          <strong>${escapeHtml(l.lobbyName)}</strong>
          <span class="muted">host: ${escapeHtml(l.hostNickname)} · ${l.playerCount}/5 players · ${l.status}</span>
        </div>
        <button class="btn" data-join="${l.roomId}" ${l.status !== "open" || l.playerCount >= 5 ? "disabled" : ""}>Join</button>
      </li>
    `).join("");
    ul.querySelectorAll("[data-join]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!validateIdentity()) return;
        try {
          await joinLobby(btn.dataset.join, false);
        } catch (e) {
          alert("Couldn't join: " + e.message);
        }
      });
    });
  };

  renderList();
  await subscribeLobbyIndex(renderList);
}

function validateIdentity() {
  if (!state.nickname || state.nickname.length < 2) {
    alert("Pick a nickname (at least 2 characters).");
    return false;
  }
  if (!state.colorId) {
    alert("Pick a color.");
    return false;
  }
  return true;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[ch]));
}
