import { state, subscribe, setState } from "./state.js";
import { renderLanding } from "./views/landing.js";
import { renderLobby } from "./views/lobby.js";
import { renderGame } from "./views/game.js";
import { renderPodium } from "./views/podium.js";
import { getClient } from "./ably.js";

const root = document.getElementById("app");

function render() {
  root.innerHTML = "";
  switch (state.view) {
    case "landing": renderLanding(root); break;
    case "lobby":   renderLobby(root);   break;
    case "game":    renderGame(root);    break;
    case "podium":  renderPodium(root);  break;
    default:        renderLanding(root);
  }
}

subscribe(render);

(async () => {
  try {
    const client = await getClient();
    setState({ clientId: client.auth.clientId });
  } catch (e) {
    root.innerHTML = `<div class="fatal">
      <h1>Quiz Planet</h1>
      <p>Could not connect to Ably. Make sure <code>js/config.js</code> exists and contains a valid API key.</p>
      <p>Copy <code>js/config.example.js</code> to <code>js/config.js</code> and paste your key.</p>
      <pre>${(e && e.message) || e}</pre>
    </div>`;
    return;
  }
  render();
})();
