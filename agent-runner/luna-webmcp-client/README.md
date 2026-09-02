# OpenAI WebMCP Agent Runner

A local Chrome side-panel extension that connects a selected OpenAI reasoning model and effort level to the WebMCP tools registered by the active page.

## Security model

- Your OpenAI API key is stored in `chrome.storage.local` in your Chrome profile.
- The key is sent only to `https://api.openai.com`.
- The public escape-room site never receives or stores the key.
- The extension does not click or inspect the visual page. It discovers and executes tools through `document.modelContext`.

Use this as a personal development extension. Do not distribute a folder containing a prefilled API key.

## Install

1. Use Chrome 149–156 while the WebMCP origin trial is active.
2. In Chrome 150 or newer, open `chrome://flags/#enable-webmcp-testing`, enable **WebMCP for testing**, and relaunch Chrome.
3. Open `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select this folder.
   Chrome may ask you to approve access to the Agent Escape Room domain. Approve it so the runner can discover and execute the page's registered WebMCP tools.
6. Open the Agent Escape Room in a normal tab. If it was already open, reload it so the extension can capture tool registrations from page startup.
7. Click the extension icon to open the side panel.
8. Paste an OpenAI API key and click **Save locally**.
9. Click **Discover active-tab tools**. The escape room should report 21 tools.
10. Choose a model and reasoning effort, click **Start Agent**, and leave the game tab open.

## Benchmark behavior

The runner:

- Supports `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.5` through the Responses API.
- Supports `none`, `low`, `medium`, `high`, and `xhigh` reasoning. GPT-5.6 models additionally support `max`.
- Disables parallel tool calls to preserve deterministic game ordering.
- Calls only WebMCP tools registered by the active page.
- Continues prompting the model if it tries to stop before a terminal state.
- Shows tool calls, arguments, results, token usage, elapsed time, and estimated API cost.
- Reports the selected reasoning effort with agent identity so leaderboard runs distinguish low, medium, high, xhigh, and max configurations.
- Allows unlimited tool calls while retaining manual Stop, loop warnings, and progress checkpoints.
- Detects semantic loops across different actions on the same exhausted target and requires a strategy reset through `get_available_actions`.
- Uses structured state-change feedback, inventory affordances, and evidence cross-references supplied by the game.
- Can be stopped manually at any time.
- Normalizes WebMCP schemas returned as either JSON objects or serialized JSON before sending them to the OpenAI Responses API.
- Automatically pauses and retries temporary `429` rate-limit responses, honoring `Retry-After` and token-reset headers with jitter while preserving the response chain. Billing, credit, and hard usage-limit errors are not retried.
- Keeps the Manifest V3 service worker alive only while a model request or rate-limit delay is actively pending, preventing Chrome's idle suspension from canceling long waits. The panel displays a live retry countdown.

The displayed cost estimate automatically uses the pricing table for the selected model.

## Troubleshooting

### No tools registered

- Confirm the escape-room tab is the active tab.
- Reload the escape-room tab after installing or updating the extension. The compatibility bridge must be present before the page registers its tools.
- Reload the game after enabling the Chrome flag.
- Confirm the site says **WebMCP Online**.
- Click **Discover active-tab tools** again.

### OpenAI request fails

- Confirm the API key has API billing enabled. ChatGPT subscriptions and API billing are separate.
- Confirm your OpenAI project has access to `gpt-5.6-luna`.
- Review the error shown in the live trace.

### Stopping a long run

Tool calls are unlimited. Use **Stop** in the side panel when you want to end a run manually. Loop warnings and 25-call progress checkpoints remain active.
