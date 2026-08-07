# CWS review reply snippets

Use these if Chrome Web Store review asks follow-ups. Keep answers factual.

## Why do you need the `debugger` permission?

Perfect drives user-approved automation in a real Chrome session using the Chrome DevTools Protocol (click, type, screenshot, file input, JS dialogs). The debugger API is required for reliable CDP attach in Manifest V3. The user sees a dedicated “Perfect” tab group, can use Manual permission mode, and can press Stop to cancel work and detach.

## Why `<all_urls>` / broad host access?

The agent navigates to URLs the user requests (any site). A fixed origin allowlist would prevent the product’s purpose. Access is gated by local permission modes and site allow/deny controls; prohibited actions (for example purchase flows) remain blocked.

## Does the extension run remote code or call a Perfect cloud API?

No. Extension code is fully packaged. The companion MCP server runs locally on the user’s machine. There is no Perfect cloud backend in v0.2.

## Is this an official Cursor product?

No. Perfect is unofficial open source and not affiliated with Cursor, Anysphere, Google, or Anthropic. “Cursor” appears only descriptively (supported MCP client).

## How does the user understand risk?

A first-run welcome page explains setup, Manual mode default, debugger use, and Stop. The side panel shows Linked status, permission prompts, and Stop. A public privacy policy URL is linked from the listing and welcome page.

## Can you narrow host permissions?

Not without breaking core functionality. Users ask the agent to open arbitrary sites. Narrowing would require a predeclared site list, which does not match the product.
