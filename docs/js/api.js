import { DIFFICULTIES, QUESTIONS_PER_DIFFICULTY } from "./constants.js";

const OPENTDB_BASE = "https://opentdb.com/api.php";

// OpenTDB rate-limits each IP to 1 request / 5s. Serialize requests through a
// gate that guarantees at least this gap between calls (with a little margin),
// so we never trip a 429 — including on retries and back-to-back games.
const MIN_REQUEST_GAP_MS = 5500;
let lastRequestAt = 0;

async function rateLimitGate() {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

function decodeHtml(str) {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchOne({ amount, categoryId, difficulty }) {
  const params = new URLSearchParams({
    amount: String(amount),
    type: "multiple",
    difficulty,
    encode: "url3986",
  });
  if (categoryId !== "all") params.set("category", String(categoryId));

  const url = `${OPENTDB_BASE}?${params.toString()}`;
  await rateLimitGate();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenTDB HTTP ${res.status}`);
  const json = await res.json();
  if (json.response_code !== 0) {
    throw new Error(`OpenTDB response_code ${json.response_code}`);
  }
  return json.results.map(r => {
    const correct = decodeURIComponent(r.correct_answer);
    const incorrect = r.incorrect_answers.map(decodeURIComponent);
    const options = shuffle([correct, ...incorrect]);
    return {
      question: decodeURIComponent(r.question),
      options,
      correctIndex: options.indexOf(correct),
      difficulty: r.difficulty,
      category: decodeURIComponent(r.category),
    };
  });
}

async function fetchWithRetry(args, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchOne(args);
    } catch (e) {
      lastErr = e;
      // No backoff needed here: rateLimitGate() already spaces the next
      // attempt by 5s+, which is enough to clear OpenTDB's rate limit.
    }
  }
  throw lastErr;
}

export async function fetchGameQuestions(categoryId) {
  const all = [];
  for (const diff of DIFFICULTIES) {
    const qs = await fetchWithRetry({
      amount: QUESTIONS_PER_DIFFICULTY,
      categoryId,
      difficulty: diff.id,
    });
    all.push(...qs);
  }
  return all;
}

export { decodeHtml };
