export const COLORS = [
  { id: "yellow", hex: "#e6f13d" },
  { id: "purple", hex: "#803ca1" },
  { id: "green",  hex: "#109856" },
  { id: "blue",   hex: "#68a3e5" },
  { id: "orange", hex: "#eda338" },
];

export const MAX_PLAYERS = 5;

// OpenTDB categories. "All" = no category filter.
export const CATEGORIES = [
  { id: "all", name: "All" },
  { id: 9,  name: "General Knowledge" },
  { id: 10, name: "Books" },
  { id: 11, name: "Film" },
  { id: 12, name: "Music" },
  { id: 13, name: "Musicals & Theatres" },
  { id: 14, name: "Television" },
  { id: 15, name: "Video Games" },
  { id: 16, name: "Board Games" },
  { id: 17, name: "Science & Nature" },
  { id: 18, name: "Computers" },
  { id: 19, name: "Mathematics" },
  { id: 20, name: "Mythology" },
  { id: 21, name: "Sports" },
  { id: 22, name: "Geography" },
  { id: 23, name: "History" },
  { id: 24, name: "Politics" },
  { id: 25, name: "Art" },
  { id: 26, name: "Celebrities" },
  { id: 27, name: "Animals" },
  { id: 28, name: "Vehicles" },
  { id: 29, name: "Comics" },
  { id: 30, name: "Gadgets" },
  { id: 31, name: "Anime & Manga" },
  { id: 32, name: "Cartoons & Animations" },
];

export const DIFFICULTIES = [
  { id: "easy",   points: 10 },
  { id: "medium", points: 20 },
  { id: "hard",   points: 30 },
];

export const QUESTIONS_PER_DIFFICULTY = 3;
export const TOTAL_QUESTIONS = QUESTIONS_PER_DIFFICULTY * DIFFICULTIES.length; // 9

// Timings (ms)
export const REVEAL_DELAY_MS   = 3000;   // question text shown, options hidden
export const ANSWER_WINDOW_MS  = 15000;  // after options appear
export const RESULT_PAUSE_MS   = 5000;   // between question reveal and next question
export const VOTE_WINDOW_MS    = 10000;  // category vote window

// Speed bonus thresholds (ms after options appear)
export const SPEED_BONUS = [
  { withinMs: 1000, points: 5 },
  { withinMs: 2000, points: 3 },
  { withinMs: 3000, points: 1 },
];

export const ROOM_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomRoomId(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return s;
}

export function colorById(id) {
  return COLORS.find(c => c.id === id);
}

export function categoryById(id) {
  return CATEGORIES.find(c => String(c.id) === String(id));
}
