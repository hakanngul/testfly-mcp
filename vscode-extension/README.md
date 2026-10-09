# TestFly Studio — AI Test Automation for VS Code

**TestFly Studio** helps manage TestFly projects in VS Code and can configure workspace MCP connections for Cursor and VS Code.

Zero Python. Zero setup headaches.

---

## ✈️ Key Capabilities

- 🤖 **Playwright MCP Integration:** Works seamlessly with the official Playwright MCP for ultra-fast live browser control and accessibility inspection.
- ⚡ **Workspace MCP Setup:** Select a local bridge script, preview destinations, and confirm changes to Cursor and VS Code workspace settings; global settings are not edited.
- 🎯 **Action Cache Explorer:** Visual Webview panel to inspect, invalidate, and manage autonomous `act("Goal")` action plans frozen in `.testfly/action-cache.json`.
- 🩹 **AI Self-Healing Patch Reviewer:** Visual diff viewer to inspect and apply `.patch` remediations synthesized by TestFly's `AiHealingEngine` directly to your test code.
- ⚙️ **Visual testfly.yml Editor:** In-IDE editor for timeouts, parallel execution, and AI providers (Gemini, Claude, OpenAI).
- ☕ **Codegen Bridge:** A separate Node MCP tool generates Java from supplied actions; the VS Code extension does not yet host a live recorder.
- 🏗️ **Project Scaffolding:** Creates Java 21 + TestFly 1.0.7 files in an empty directory.
- 📊 **CI Sharder:** The old sample-only IDE wizard is disabled until real suite metrics are available.

---

## 🚀 Quick Start

1. Install this extension in VS Code.
2. Open the **TestFly Studio** sidebar on the Activity Bar.
3. Click **Configure Workspace MCP**, select your local `bin/testfly-mcp.js`, and approve the two workspace configuration changes.
4. Start the MCP servers in your client when you need AI tooling; a compatible Node installation and Playwright MCP are required.
