const ORDINALS: Record<string, string> = {
  "1st": "first", "2nd": "second", "3rd": "third", "4th": "fourth", "5th": "fifth", "6th": "sixth",
  "7th": "seventh", "8th": "eighth", "9th": "ninth", "10th": "tenth", "11th": "eleventh", "12th": "twelfth",
};

export function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ORDINALS[w] ?? w)
    .filter((w) => w !== "the" && w !== "of" && w !== "bone")
    .join(" ");
}

const stripSide = (s: string) => s.replace(/\b(left|right)\b/g, "").replace(/\s+/g, " ").trim();

function distance(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const close = (a: string, b: string) => a.length > 0 && distance(a, b) <= Math.max(1, Math.floor(b.length * 0.12));

export type Verdict = "correct" | "side" | "wrong";

/** Typos are forgiven; a right structure with the wrong or missing side counts as "side". */
export function check(answer: string, name: string): Verdict {
  const a = normalise(answer);
  const n = normalise(name);
  if (close(a, n)) return "correct";
  if (close(stripSide(a), stripSide(n))) return "side";
  return "wrong";
}

/** Progressive hint: reveal the first letters of each word. */
export function hint(name: string, level: number) {
  return name
    .split(" ")
    .map((w) => (w.length <= level ? w : w.slice(0, level) + "·".repeat(w.length - level)))
    .join(" ");
}
