/**
 * DOM ops via chrome.scripting — avoids chrome.debugger, which throws
 * "Cannot access a chrome-extension:// URL of different extension" when
 * other extensions (RoboForm, Grammarly, …) inject frames into the page.
 * Also avoids the yellow debugger banner flashing on every tool call.
 */

export async function runInPage<T, A extends unknown[]>(
  tabId: number,
  func: (...args: A) => T,
  args: A,
): Promise<T> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
    args,
  });
  const entry = results?.[0];
  if (!entry) throw new Error("Script injection returned no result");
  return entry.result as T;
}

/**
 * Evaluate an expression string in the page main world (IIFEs / values).
 */
export async function evaluateExpression<T>(
  tabId: number,
  expression: string,
): Promise<T> {
  return runInPage(
    tabId,
    (expr: string) => {
      // Expressions from tools are typically `(() => { ... })()` or simple values
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      return new Function(`"use strict"; return (${expr});`)() as T;
    },
    [expression],
  );
}
