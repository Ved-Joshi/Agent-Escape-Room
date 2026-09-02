const MODEL_CONFIG = {
  "gpt-5.6-sol": { label: "GPT-5.6 Sol", input: 4, cached: 0.4, output: 20, efforts: ["none", "low", "medium", "high", "xhigh", "max"] },
  "gpt-5.6-terra": { label: "GPT-5.6 Terra", input: 2, cached: 0.2, output: 12, efforts: ["none", "low", "medium", "high", "xhigh", "max"] },
  "gpt-5.6-luna": { label: "GPT-5.6 Luna", input: 0.2, cached: 0.02, output: 1.2, efforts: ["none", "low", "medium", "high", "xhigh", "max"] },
  "gpt-5.5": { label: "GPT-5.5", input: 5, cached: 0.5, output: 30, efforts: ["none", "low", "medium", "high", "xhigh"] }
};
const runs = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "save-key") {
    chrome.storage.local.set({ openaiApiKey: message.key.trim() }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "key-status") {
    chrome.storage.local.get("openaiApiKey").then(({ openaiApiKey }) => sendResponse({ configured: Boolean(openaiApiKey) }));
    return true;
  }
  if (message.type === "discover") {
    discoverTools(message.tabId).then(tools => sendResponse({ ok: true, tools })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "start") {
    startRun(message.tabId, message.prompt, message.model, message.effort).catch(error => finish(message.tabId, "error", error.message));
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "stop") {
    const run = runs.get(message.tabId);
    if (run) run.stopped = true;
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "snapshot") {
    sendResponse({ run: serializableRun(runs.get(message.tabId)) });
    return false;
  }
});

async function discoverTools(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async () => {
      if (!document.modelContext) throw new Error("WebMCP is unavailable in this tab. Check the Chrome flag, origin trial, and reload the page.");
      let tools = [];
      if (typeof document.modelContext.getTools === "function") tools = await document.modelContext.getTools();
      if (!tools.length && globalThis.__lunaWebMCPRegistry instanceof Map) tools = [...globalThis.__lunaWebMCPRegistry.values()];
      return tools.map(({ name, title, description, inputSchema, annotations }) => ({
        name,
        title: title || name,
        description: description || "",
        inputSchema: inputSchema || { type: "object", properties: {} },
        annotations: annotations || {}
      }));
    }
  });
  if (!result?.length) throw new Error("No WebMCP tools were captured. Reload the escape-room tab once after installing or updating this extension, wait for the game to finish loading, then try discovery again.");
  return result;
}

async function executeWebMCPTool(tabId, name, args) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [name, args],
    func: async (toolName, toolArgs) => {
      if (!document.modelContext) throw new Error("WebMCP became unavailable.");
      const typeMap = {observe_direction:"observe",navigate_to_landmark:"approach",move_to:"move",use_item:"use",enter_code:"code",talk_to:"talk",get_inventory:"inventory",get_known_clues:"clues",get_available_actions:"available",get_current_room:"look",look_around:"look",get_spatial_state:"spatial",identify_agent:"register",submit_solution:"submit"};
      const action = { type: typeMap[toolName] || toolName, ...toolArgs };
      let nativeVisualReceived = false;
      const nativeVisual = () => { nativeVisualReceived = true; };
      window.addEventListener("helix-agent-action", nativeVisual);
      window.dispatchEvent(new CustomEvent("helix-agent-preview", { detail: { phase: "start", toolName, action, at: Date.now() } }));
      let tools = [];
      if (typeof document.modelContext.getTools === "function") tools = await document.modelContext.getTools();
      if (!tools.length && globalThis.__lunaWebMCPRegistry instanceof Map) tools = [...globalThis.__lunaWebMCPRegistry.values()];
      const tool = tools.find(candidate => candidate.name === toolName);
      if (!tool) throw new Error(`Tool '${toolName}' is no longer registered.`);
      let value;
      try {
        value = typeof document.modelContext.executeTool === "function"
          ? await document.modelContext.executeTool(tool, JSON.stringify(toolArgs))
          : await tool.execute(toolArgs, { signal: new AbortController().signal });
      } finally {
        window.removeEventListener("helix-agent-action", nativeVisual);
      }
      if (!nativeVisualReceived) window.dispatchEvent(new CustomEvent("helix-agent-preview-camera", { detail: { phase: "start", toolName, action, at: Date.now() } }));
      window.dispatchEvent(new CustomEvent("helix-agent-preview", { detail: { phase: "complete", toolName, action, result: value, at: Date.now() } }));
      if (typeof value === "string") return value;
      if (value === null || value === undefined) return String(value);
      try { return JSON.stringify(value); } catch { return String(value); }
    }
  });
  return result;
}

function openAITools(webTools) {
  return webTools.map(tool => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: normalizeSchema(tool.inputSchema, tool.name),
    strict: false
  }));
}

function normalizeSchema(schema, toolName) {
  let value = schema;
  if (typeof value === "string") {
    try { value = JSON.parse(value); }
    catch { throw new Error(`WebMCP tool '${toolName}' returned an invalid JSON input schema.`); }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { type: "object", properties: {}, additionalProperties: false };
  }
  return value;
}

async function callOpenAI(apiKey, body, tabId) {
  const retryStartedAt = Date.now();
  let attempt = 0;
  while (true) {
    const response = await keepAliveWhile(fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    }));
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      if (attempt) emit(tabId, "rate-limit-resumed", { attempt });
      return payload;
    }

    const code = String(payload?.error?.code || payload?.error?.type || "").toLowerCase();
    const message = payload?.error?.message || `OpenAI request failed (${response.status}).`;
    const permanent = ["insufficient_quota", "credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "organization_usage_limit_exceeded"].some(value => code.includes(value));
    if (response.status !== 429 || permanent) throw new Error(message);
    if (attempt >= 20 || Date.now() - retryStartedAt > 30 * 60 * 1000) {
      throw new Error(`Temporary rate limit did not clear within the retry window. Last error: ${message}`);
    }

    attempt += 1;
    const waitMs = rateLimitWaitMs(response.headers, message, attempt);
    emit(tabId, "rate-limit", { attempt, waitMs, message });
    await waitForRetry(tabId, waitMs);
  }
}

function rateLimitWaitMs(headers, message, attempt) {
  const candidates = [
    parseDuration(headers.get("retry-after"), true),
    parseDuration(headers.get("x-ratelimit-reset-project-tokens")),
    parseDuration(headers.get("x-ratelimit-reset-tokens")),
    parseDuration(message.match(/try again in\s+([\d.]+\s*(?:ms|s|m|h))/i)?.[1])
  ].filter(Number.isFinite);
  const specified = candidates.length ? Math.max(...candidates) : Math.min(60_000, 1000 * 2 ** Math.min(attempt - 1, 6));
  return Math.max(1000, specified) + 350 + Math.floor(Math.random() * 650);
}

function parseDuration(value, bareSeconds = false) {
  if (!value) return NaN;
  const text = String(value).trim().toLowerCase();
  if (bareSeconds && /^\d+(?:\.\d+)?$/.test(text)) return Number(text) * 1000;
  let total = 0;
  let matched = false;
  for (const part of text.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h)/g)) {
    matched = true;
    const amount = Number(part[1]);
    total += amount * ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[part[2]] || 0);
  }
  return matched ? total : NaN;
}

async function waitForRetry(tabId, waitMs) {
  const until = Date.now() + waitMs;
  await keepAliveWhile(new Promise((resolve, reject) => {
    const tick = () => {
      if (runs.get(tabId)?.stopped) {
        clearInterval(countdown);
        reject(new Error("Run stopped while waiting for the rate limit to reset."));
        return;
      }
      const remainingMs = Math.max(0, until - Date.now());
      emit(tabId, "rate-limit-countdown", { remainingMs });
      if (!remainingMs) {
        clearInterval(countdown);
        resolve();
      }
    };
    const countdown = setInterval(tick, 5000);
    tick();
  }));
}

async function keepAliveWhile(promise) {
  const heartbeat = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20_000);
  try { return await promise; }
  finally { clearInterval(heartbeat); }
}

async function startRun(tabId, prompt, requestedModel, requestedEffort) {
  if (runs.get(tabId)?.status === "running") throw new Error("A run is already active in this tab.");
  const { openaiApiKey } = await chrome.storage.local.get("openaiApiKey");
  if (!openaiApiKey) throw new Error("Add your OpenAI API key first.");
  const model = MODEL_CONFIG[requestedModel] ? requestedModel : "gpt-5.6-luna";
  const modelConfig = MODEL_CONFIG[model];
  const effort = modelConfig.efforts.includes(requestedEffort) ? requestedEffort : "medium";
  const webTools = await discoverTools(tabId);
  const run = {
    tabId,
    status: "running",
    stopped: false,
    calls: 0,
    idleTurns: 0,
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
    startedAt: Date.now(),
    model,
    effort,
    logs: [],
    recentSignatures: [],
    recentNoProgressTargets: []
  };
  runs.set(tabId, run);
  emit(tabId, "run-start", { model, modelLabel: modelConfig.label, effort, toolCount: webTools.length });

  const tools = openAITools(webTools);
  const instructions = [
    "You are an autonomous WebMCP benchmark agent.",
    "Use only the provided function tools to observe and act in the page. Never use or request visual browser interaction.",
    "Continue until the game returns a terminal end state. Do not stop merely to summarize progress.",
    "Treat tool results as the only authoritative game state. Inspect before deeper interactions and derive answers from evidence rather than guessing.",
    "Call get_available_actions whenever you are uncertain or a result reports STATE CHANGE: None. Treat exhausted, already inspected, and already read results as final; never repeat them.",
    "Use get_inventory affordances and get_known_clues cross-references to connect earlier discoveries to newly accessible targets.",
    `Call identify_agent before investigating. Unless the user prompt specifies another agent name, use agentName '${modelConfig.label} Agent'. Always report the exact model '${model}' and reasoning effort '${effort}'.`,
    "When you have enough evidence, submit a supported solution and then call escape."
  ].join(" ");

  let response = await callOpenAI(openaiApiKey, {
    model,
    reasoning: { effort, summary: "auto", context: "all_turns" },
    instructions,
    input: prompt,
    tools,
    tool_choice: "auto",
    parallel_tool_calls: false,
    store: true
  }, tabId);

  while (!run.stopped) {
    recordUsage(run, response.usage);
    emitReasoningSummary(tabId, response);
    const text = response.output_text || response.output?.filter(item => item.type === "message")
      .flatMap(item => item.content || []).filter(item => item.type === "output_text").map(item => item.text).join("\n") || "";
    if (text) emit(tabId, "model-text", { text });
    const calls = (response.output || []).filter(item => item.type === "function_call");

    if (!calls.length) {
      run.idleTurns += 1;
      if (run.idleTurns > 8) throw new Error("Luna stopped requesting tools for 8 consecutive turns before reaching a terminal state.");
      response = await callOpenAI(openaiApiKey, {
        model,
        reasoning: { effort, summary: "auto", context: "all_turns" },
        previous_response_id: response.id,
        instructions,
        input: "Continue the mission now using the WebMCP tools. Do not give a progress summary and do not stop until a terminal end state is returned.",
        tools,
        tool_choice: "required",
        parallel_tool_calls: false,
        store: true
      }, tabId);
      continue;
    }

    run.idleTurns = 0;
    const outputs = [];
    for (const call of calls) {
      if (run.stopped) break;
      let args;
      try { args = JSON.parse(call.arguments || "{}"); } catch { args = {}; }
      if (call.name === "identify_agent") {
        const effortLabel = effort.replace(/^./, value => value.toUpperCase());
        args = { ...args, agentName: `${modelConfig.label} ${effortLabel} Agent`, model, effort };
      }
      run.calls += 1;
      emit(tabId, "agent-intent", { number: run.calls, name: call.name, text: describeIntent(call.name, args) });
      emit(tabId, "tool-call", { number: run.calls, name: call.name, args });
      let result;
      try {
        result = await executeWebMCPTool(tabId, call.name, args);
      } catch (error) {
        result = `TOOL EXECUTION ERROR: ${error.message}`;
      }
      const signature = `${call.name}:${stableStringify(args)}`;
      run.recentSignatures.push(signature);
      if (run.recentSignatures.length > 14) run.recentSignatures.shift();
      const repeats = run.recentSignatures.filter(value => value === signature).length;
      const target = String(args.target || args.object || args.document || args.item || "").trim().toLowerCase();
      const noProgress = /STATE CHANGE:\s*None|already (?:inspected|fully read)|exhausted/i.test(result);
      if (noProgress && target) {
        run.recentNoProgressTargets.push(target);
        if (run.recentNoProgressTargets.length > 12) run.recentNoProgressTargets.shift();
      }
      const targetStalls = target ? run.recentNoProgressTargets.filter(value => value === target).length : 0;
      if (targetStalls >= 3) {
        const advisory = `RUNNER RECOVERY: Actions involving '${target}' have produced no progress ${targetStalls} times. This target is closed for now. You MUST call get_available_actions next, then pursue a different target or use an inventory item on a known compatible target.`;
        result = `${result}\n\n${advisory}`;
        emit(tabId, "loop-warning", { name: call.name, repeats: targetStalls, text: advisory });
      } else if (repeats >= 3) {
        const advisory = `RUNNER RECOVERY: This exact action has repeated ${repeats} times recently. Stop repeating it. Re-check current room, inventory, and known clues, then choose a materially different action.`;
        result = `${result}\n\n${advisory}`;
        emit(tabId, "loop-warning", { name: call.name, repeats, text: advisory });
      } else if (run.calls % 25 === 0) {
        result = `${result}\n\nRUNNER CHECKPOINT: Audit what changed during the last 25 calls. If progress has stalled, review current room, inventory, and known clues before choosing the next distinct objective.`;
        emit(tabId, "progress-checkpoint", { calls: run.calls });
      }
      emit(tabId, "tool-result", { number: run.calls, name: call.name, result });
      outputs.push({ type: "function_call_output", call_id: call.call_id, output: result });
      if (isTerminal(call.name, result)) {
        finish(tabId, "terminal", result);
        return;
      }
    }
    if (run.stopped) break;
    response = await callOpenAI(openaiApiKey, {
      model,
      reasoning: { effort, summary: "auto", context: "all_turns" },
      previous_response_id: response.id,
      instructions,
      input: outputs,
      tools,
      tool_choice: "auto",
      parallel_tool_calls: false,
      store: true
    }, tabId);
  }
  finish(tabId, "stopped", "Run stopped by user.");
}

function emitReasoningSummary(tabId, response) {
  const text = (response.output || []).filter(item => item.type === "reasoning").flatMap(item => item.summary || []).map(item => item.text).filter(Boolean).join("\n");
  if (text) emit(tabId, "reasoning-summary", { text });
}

function stableStringify(value) {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function describeIntent(name, args) {
  const labels = {identify_agent:`Identifying as ${args.agentName||"the benchmark agent"}`,get_current_room:"Checking the current room",look_around:"Surveying the surroundings",get_spatial_state:"Checking position and heading",observe_direction:`Scanning ${args.direction||"a direction"}`,turn:`Turning ${args.direction||""} ${args.degrees||90}°`.trim(),navigate_to_landmark:`Approaching ${args.object||"a landmark"}`,move_to:`Moving to ${args.room||"another room"}`,inspect:`Inspecting ${args.object||"an object"}`,search:`Searching ${args.object||"an object"}`,read:`Reading ${args.document||"a record"}`,get_inventory:"Reviewing inventory",get_known_clues:"Reviewing collected evidence",use_item:`Using ${args.item||"an item"} on ${args.target||"a target"}`,enter_code:`Authenticating ${args.target||"a terminal"}`,interact:`Operating ${args.target||"a system"}`,submit_solution:"Submitting the incident theory",escape:"Attempting final escape"};
  return labels[name] || `Calling ${name}`;
}

function isTerminal(toolName, result) {
  const value = String(result || "");
  return /terminal end state|mission complete|run complete|successfully escaped|escape successful/i.test(value) ||
    (toolName === "escape" && /\bescaped\b/i.test(value) && !/not escaped|cannot escape|escape denied|failed/i.test(value));
}

function recordUsage(run, usage = {}) {
  const input = usage.input_tokens || 0;
  const cached = usage.input_tokens_details?.cached_tokens || 0;
  const output = usage.output_tokens || 0;
  run.inputTokens += input;
  run.cachedTokens += cached;
  run.outputTokens += output;
  const prices = MODEL_CONFIG[run.model] || MODEL_CONFIG["gpt-5.6-luna"];
  run.estimatedCost += ((input - cached) * prices.input + cached * prices.cached + output * prices.output) / 1_000_000;
  emit(run.tabId, "usage", usageSnapshot(run));
}

function usageSnapshot(run) {
  return {
    calls: run.calls,
    inputTokens: run.inputTokens,
    cachedTokens: run.cachedTokens,
    outputTokens: run.outputTokens,
    estimatedCost: run.estimatedCost,
    elapsedMs: Date.now() - run.startedAt
  };
}

function finish(tabId, status, message) {
  const run = runs.get(tabId);
  if (!run) return;
  run.status = status;
  emit(tabId, "run-finish", { status, message, ...usageSnapshot(run) });
}

function emit(tabId, type, payload) {
  const run = runs.get(tabId);
  if (run) {
    run.logs.push({ type, payload, at: Date.now() });
    if (run.logs.length > 500) run.logs.shift();
  }
  chrome.runtime.sendMessage({ source: "luna-webmcp", tabId, type, payload }).catch(() => {});
}

function serializableRun(run) {
  if (!run) return null;
  return { status: run.status, calls: run.calls, model: run.model, effort: run.effort, logs: run.logs, ...usageSnapshot(run) };
}
