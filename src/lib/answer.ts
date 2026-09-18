import type { Answer } from "./graph";

/**
 * Strict reader for a model reply. The contract with the model is "reply with
 * only YES or NO", so anything else ("Yes, because...", "It depends") is a
 * failed step, not a guess. Tolerated: case, surrounding whitespace/quotes/
 * markdown emphasis, a trailing period, and reasoning-model <think> blocks.
 */
export function parseYesNo(raw: string): Answer | null {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^[\s"'`*_]+|[\s"'`*_.!]+$/g, "")
    .toUpperCase();
  if (cleaned === "YES") return "YES";
  if (cleaned === "NO") return "NO";
  return null;
}
