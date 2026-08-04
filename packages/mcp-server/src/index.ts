/**
 * Package entry: `npx perfect-mcp` starts the MCP server (for Cursor).
 * `npx perfect-mcp setup` (and other CLI cmds) go to the setup CLI.
 */
const args = process.argv.slice(2);
const cliCommands = new Set([
  "setup",
  "install",
  "token",
  "status",
  "cursor-config",
  "demo",
  "help",
  "-h",
  "--help",
]);

if (args[0] && cliCommands.has(args[0])) {
  await import("./cli.js");
} else {
  await import("./server.js");
}
