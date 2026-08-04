const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const fixtures = path.join(__dirname, "fixtures");

function fileUrl(name) {
  return pathToFileURL(path.join(fixtures, name)).href;
}

test.describe("Fixture DOM contracts", () => {
  test("Form fill fields present | browser_fill", async ({ page }) => {
    await page.goto(fileUrl("form.html"));
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#country")).toBeVisible();
    await page.fill("#name", "Ada");
    await page.fill("#email", "ada@example.com");
    await page.selectOption("#country", "bd");
    await page.click("#submit");
    await expect(page.locator("#result")).toBeVisible();
  });

  test("Modal open dismiss | browser_click", async ({ page }) => {
    await page.goto(fileUrl("modal.html"));
    await page.click("#open-modal");
    await expect(page.locator("#dlg")).toBeVisible();
    await page.click("#close-modal");
    await expect(page.locator("#dlg")).toBeHidden();
  });

  test("Hover opens menu | browser_hover", async ({ page }) => {
    await page.goto(fileUrl("hover.html"));
    await page.locator("#menu-trigger").hover();
    await expect(page.locator("#menu-panel")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Alpha" })).toBeVisible();
  });

  test("Same-origin iframe pierce | browser_snapshot", async ({ page }) => {
    await page.goto(fileUrl("iframe.html"));
    const frame = page.frameLocator("#child-frame");
    await expect(frame.locator("#child-name")).toBeVisible();
    await frame.locator("#child-name").fill("InFrame");
    await frame.locator("#child-btn").click();
    await expect(frame.locator("#child-status")).toHaveText("clicked");
  });

  test("Flip box toggle | browser_click", async ({ page }) => {
    await page.goto(fileUrl("flip.html"));
    await page.click("#flip-btn");
    await expect(page.locator("#flip")).toHaveClass(/open/);
    await expect(page.locator("#flip-back")).toBeVisible();
  });

  test("Scrape article links table | browser_extract", async ({ page }) => {
    await page.goto(fileUrl("scrape.html"));
    const h1 = await page.locator("h1").innerText();
    expect(h1).toContain("Research");
    const links = await page.locator("a[href]").evaluateAll((as) =>
      as.map((a) => a.href),
    );
    expect(links.some((h) => h.includes("wpbakery"))).toBe(true);
    const rows = await page.locator("table tr").count();
    expect(rows).toBeGreaterThanOrEqual(2);
  });

  test("Wait for selector pattern | browser_wait", async ({ page }) => {
    await page.goto(fileUrl("modal.html"));
    await page.click("#open-modal");
    await page.waitForSelector("dialog[open]");
    await expect(page.locator("dialog")).toBeVisible();
  });
});

test.describe("Security classification locks", () => {
  test("Cookie evaluate prohibited | browser_evaluate", async () => {
    const { classifyAction } = await import("@perfect/protocol");
    const r = classifyAction({
      tool: "browser_evaluate",
      url: "https://example.com",
      evaluateCode: "document.cookie",
    });
    expect(r.risk).toBe("prohibited");
  });

  test("Screenshot protected | browser_screenshot", async () => {
    const { classifyAction } = await import("@perfect/protocol");
    const r = classifyAction({
      tool: "browser_screenshot",
      url: "https://example.com",
    });
    expect(r.risk).toBe("protected");
  });

  test("Console protected | browser_console", async () => {
    const { classifyAction } = await import("@perfect/protocol");
    const r = classifyAction({
      tool: "browser_console",
      url: "https://example.com",
    });
    expect(r.risk).toBe("protected");
  });

  test("Buy now click prohibited | browser_click", async () => {
    const { classifyAction } = await import("@perfect/protocol");
    const r = classifyAction({
      tool: "browser_click",
      url: "https://shop.example.com",
      label: "Buy now",
    });
    expect(r.risk).toBe("prohibited");
  });

  test("Hover normal is low | browser_hover", async () => {
    const { classifyAction } = await import("@perfect/protocol");
    const r = classifyAction({
      tool: "browser_hover",
      url: "https://example.com",
      label: "Products",
    });
    expect(r.risk).toBe("low");
  });

  test("Extract is low | browser_extract", async () => {
    const { classifyAction } = await import("@perfect/protocol");
    const r = classifyAction({
      tool: "browser_extract",
      url: "https://example.com",
    });
    expect(r.risk).toBe("low");
  });

  test("Upload protected | browser_upload", async () => {
    const { classifyAction } = await import("@perfect/protocol");
    expect(
      classifyAction({
        tool: "browser_upload",
        url: "https://example.com",
        label: "Choose file",
      }).risk,
    ).toBe("protected");
  });

  test("Network protected | browser_network", async () => {
    const { classifyAction } = await import("@perfect/protocol");
    expect(
      classifyAction({
        tool: "browser_network",
        url: "https://example.com",
      }).risk,
    ).toBe("protected");
  });

  test("Drag is low | browser_drag", async () => {
    const { classifyAction } = await import("@perfect/protocol");
    expect(
      classifyAction({
        tool: "browser_drag",
        url: "https://example.com",
        label: "Item to zone",
      }).risk,
    ).toBe("low");
  });
});

test.describe("Completion fixtures", () => {
  test("Drag drop zone | browser_drag", async ({ page }) => {
    await page.goto(fileUrl("drag.html"));
    await page.locator("#drag-src").dragTo(page.locator("#drop-zone"));
    await expect(page.locator("#status")).toHaveText("dropped");
  });

  test("File input present | browser_upload", async ({ page }) => {
    await page.goto(fileUrl("upload.html"));
    await expect(page.locator("#file")).toBeVisible();
    const sample = path.join(fixtures, "network-data.json");
    await page.setInputFiles("#file", sample);
    await expect(page.locator("#chosen")).toHaveText("network-data.json");
  });

  test("Dialog buttons present | browser_handle_dialog", async ({ page }) => {
    await page.goto(fileUrl("dialogs.html"));
    page.once("dialog", async (d) => {
      expect(d.message()).toContain("Hello");
      await d.accept();
    });
    await page.click("#btn-alert");
    await expect(page.locator("#result")).toHaveText("alerted");
  });

  test("Fetch network JSON | browser_network", async ({ page }) => {
    await page.goto(fileUrl("network.html"));
    await page.click("#fetch-btn");
    await expect(page.locator("#out")).toContainText("perfect-network");
  });
});

test.describe("Snapshot logic in page", () => {
  test("Stamp refs across iframe | browser_snapshot", async ({ page }) => {
    await page.goto(fileUrl("iframe.html"));
    await page.waitForSelector("#child-frame");
    await page.frameLocator("#child-frame").locator("#child-btn").waitFor();
    const result = await page.evaluate(() => {
      document.querySelectorAll("[data-perfect-ref]").forEach((el) => {
        el.removeAttribute("data-perfect-ref");
      });
      let counter = 0;
      const nodes = [];
      const collect = (doc, frameId) => {
        for (const el of [
          ...doc.querySelectorAll("a,button,input,textarea,select"),
        ]) {
          counter += 1;
          const ref = "e" + counter;
          el.setAttribute("data-perfect-ref", ref);
          nodes.push({
            ref,
            name: (el.getAttribute("id") || el.textContent || "")
              .trim()
              .slice(0, 40),
            frame: frameId || undefined,
          });
        }
      };
      collect(document, "");
      const iframe = document.querySelector("iframe");
      const doc = iframe && iframe.contentDocument;
      if (doc) collect(doc, "f1");
      return { nodes, hasDoc: !!doc, childCount: doc ? doc.querySelectorAll("button,input").length : 0 };
    });
    expect(result.hasDoc).toBe(true);
    expect(result.childCount).toBeGreaterThan(0);
    expect(result.nodes.some((n) => n.frame === "f1")).toBe(true);
    expect(result.nodes.length).toBeGreaterThan(2);
  });
});
