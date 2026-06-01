import { DIFFICULTIES, QUESTIONS_PER_DIFFICULTY } from "./constants.js";

const OPENTDB_BASE = "https://opentdb.com/api.php";

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
      // OpenTDB rate limit is 1 req / 5s per IP — back off generously.
      await new Promise(r => setTimeout(r, 1200 * (i + 1)));
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
    await new Promise(r => setTimeout(r, 1100));
  }
  return all;
}

export { decodeHtml };
