/** Pure helpers for first-run welcome gating (unit-tested). */

export function shouldOpenWelcome(input: {
  reason: string;
  currentVersion: string;
  welcomeSeenVersion?: string;
}): boolean {
  if (input.reason === "install") return true;
  if (input.reason === "update") {
    return input.welcomeSeenVersion !== input.currentVersion;
  }
  return false;
}
