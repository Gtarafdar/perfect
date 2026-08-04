const { defineConfig } = require("@playwright/test");
const path = require("node:path");

const root = __dirname;

module.exports = defineConfig({
  testDir: root,
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"], [path.join(root, "report-reporter.cjs")]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "fixtures",
      testMatch: "**/capability.spec.cjs",
    },
    {
      name: "extension",
      testMatch: "**/extension-bridge.spec.cjs",
      timeout: 120_000,
      use: {
        headless: false,
      },
    },
  ],
  outputDir: path.join(root, "../../test-results/e2e"),
});
