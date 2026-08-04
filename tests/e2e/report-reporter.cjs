const { writeFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");

class CapabilityReporter {
  constructor() {
    this.rows = [];
  }

  onTestEnd(test, result) {
    const title = test.title;
    const [capability, tool] = title.includes("|")
      ? title.split("|").map((s) => s.trim())
      : [title, "fixture"];
    const status =
      result.status === "passed"
        ? "pass"
        : result.status === "skipped"
          ? "skip"
          : "fail";
    const notes =
      result.error?.message?.split("\n")[0]?.slice(0, 200) ||
      (status === "pass" ? "ok" : result.status);
    this.rows.push({
      capability: capability || title,
      tool: tool || "—",
      status,
      notes,
      improve: status === "fail" ? "Fix failing fixture/tool path" : "",
    });
  }

  onEnd() {
    const root = path.join(__dirname, "../..");
    mkdirSync(path.join(root, "docs"), { recursive: true });
    const working = this.rows.filter((r) => r.status === "pass");
    const broken = this.rows.filter((r) => r.status === "fail");
    const skipped = this.rows.filter((r) => r.status === "skip");
    const md = `# Perfect capability report

Generated: ${new Date().toISOString()}

## Summary

| Status | Count |
|---|---|
| Working | ${working.length} |
| Not working | ${broken.length} |
| Skipped | ${skipped.length} |

## Working

${working.map((r) => `- **${r.capability}** (\`${r.tool}\`) — ${r.notes}`).join("\n") || "_none_"}

## Not working

${broken.map((r) => `- **${r.capability}** (\`${r.tool}\`) — ${r.notes}`).join("\n") || "_none_"}

## Improve next

${
  broken
    .map((r, i) => `${i + 1}. ${r.capability} / ${r.tool}: ${r.improve || r.notes}`)
    .join("\n") || "_No P0 failures from this automated run._"
}

## Full matrix

| Capability | Tool | Status | Notes | Improve next |
|---|---|---|---|---|
${this.rows
  .map(
    (r) =>
      `| ${r.capability} | \`${r.tool}\` | ${r.status} | ${r.notes.replace(/\|/g, "/")} | ${r.improve} |`,
  )
  .join("\n")}

## Manual / agent smoke (fill after live runs)

| Capability | Status | Notes |
|---|---|---|
| RoboForm fill + visible cursor | pending | Run via Perfect MCP on www.roboform.com |
| WPBakery iframe Add Element | pending | localhost:8893 frontend editor |
| Blog research extract + annotate | pending | wpbakery.com/blog |

## Regression locks

See [baseline-regression.md](./baseline-regression.md). Vitest must stay green.
`;
    writeFileSync(path.join(root, "docs/capability-report.md"), md, "utf8");
    writeFileSync(path.join(root, "tests/e2e/last-report.md"), md, "utf8");
  }
}

module.exports = CapabilityReporter;
