let tabId;
const $ = id => document.getElementById(id);

init();

const effortOptions = ["none", "low", "medium", "high", "xhigh", "max"];
$("model").addEventListener("change", () => { syncEfforts(); chrome.storage.local.set({ runnerModel: $("model").value, runnerEffort: $("effort").value }); });
$("effort").addEventListener("change", () => chrome.storage.local.set({ runnerEffort: $("effort").value }));
syncEfforts();

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  const key = await chrome.runtime.sendMessage({ type: "key-status" });
  setKeyState(key?.configured);
  const preferences = await chrome.storage.local.get(["runnerModel", "runnerEffort"]);
  if ([...$("model").options].some(option => option.value === preferences.runnerModel)) $("model").value = preferences.runnerModel;
  syncEfforts();
  if ([...$("effort").options].some(option => !option.disabled && option.value === preferences.runnerEffort)) $("effort").value = preferences.runnerEffort;
  const snapshot = await chrome.runtime.sendMessage({ type: "snapshot", tabId });
  if (snapshot?.run) restore(snapshot.run);
}

$("saveKey").addEventListener("click", async () => {
  const key = $("apiKey").value.trim();
  if (!key) return addEntry("error", "KEY", "Enter an OpenAI API key.");
  await chrome.runtime.sendMessage({ type: "save-key", key });
  $("apiKey").value = "";
  setKeyState(true);
  addEntry("result", "KEY", "API key saved locally in this Chrome profile.");
});

$("discover").addEventListener("click", discover);
$("start").addEventListener("click", async () => {
  if (!tabId) return addEntry("error", "TAB", "No active tab found.");
  const discovered = await discover();
  if (!discovered) return;
  setRunning(true);
  $("trace").innerHTML = "";
  const response = await chrome.runtime.sendMessage({
    type: "start",
    tabId,
    prompt: $("prompt").value.trim(),
    model: $("model").value,
    effort: $("effort").value
  });
  if (!response?.ok) {
    setRunning(false);
    addEntry("error", "START", response?.error || "Unable to start.");
  }
});

$("stop").addEventListener("click", () => chrome.runtime.sendMessage({ type: "stop", tabId }));
$("clear").addEventListener("click", () => { $("trace").innerHTML = '<p class="empty">Trace cleared.</p>'; });
$("export").addEventListener("click", async () => {const snapshot=await chrome.runtime.sendMessage({type:"snapshot",tabId});const blob=new Blob([JSON.stringify(snapshot?.run??{},null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`luna-webmcp-trace-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});

chrome.runtime.onMessage.addListener(message => {
  if (message.source !== "luna-webmcp" || message.tabId !== tabId) return;
  handleEvent(message.type, message.payload);
});

async function discover() {
  $("discover").disabled = true;
  const result = await chrome.runtime.sendMessage({ type: "discover", tabId });
  $("discover").disabled = false;
  if (!result?.ok) {
    $("toolCount").textContent = "0";
    addEntry("error", "DISCOVERY", result?.error || "Tool discovery failed.");
    return false;
  }
  $("toolCount").textContent = result.tools.length;
  addEntry("result", "DISCOVERY", `${result.tools.length} WebMCP tools found in the active tab.`);
  return true;
}

function handleEvent(type, payload) {
  if (type === "run-start") {
    setRunning(true);
    $("toolCount").textContent = payload.toolCount;
    addEntry("model", "RUN STARTED", `${payload.modelLabel || payload.model} · ${payload.effort} reasoning · unlimited tool calls`);
  } else if (type === "tool-call") {
    $("callCount").textContent = payload.number;
    addEntry("call", `CALL ${payload.number} · ${payload.name}`, JSON.stringify(payload.args, null, 2));
  } else if (type === "tool-result") {
    addEntry("result", `RESULT · ${payload.name}`, payload.result);
  } else if (type === "model-text") {
    addEntry("model", "MODEL", payload.text);
  } else if (type === "agent-intent") {
    $("intentCard").className = "intent-card active";
    $("intentText").textContent = payload.text;
  } else if (type === "reasoning-summary") {
    $("reasoningText").textContent = payload.text;
    addEntry("model", "HIGH-LEVEL REASONING", payload.text);
  } else if (type === "loop-warning") {
    $("intentCard").className = "intent-card warning";
    $("intentText").textContent = `Loop detected · ${payload.name} × ${payload.repeats}`;
    addEntry("error", "LOOP RECOVERY", payload.text);
  } else if (type === "progress-checkpoint") {
    addEntry("model", "PROGRESS CHECKPOINT", `${payload.calls} tool calls used. Luna was prompted to audit progress and choose a distinct objective.`);
  } else if (type === "usage") {
    updateUsage(payload);
  } else if (type === "rate-limit") {
    $("status").textContent = "WAITING";
    const seconds = Math.ceil(payload.waitMs / 1000);
    addEntry("model", `RATE LIMIT · RETRY ${payload.attempt}`, `Pausing for ${seconds}s, then retrying the same Luna request automatically. No game progress or model context has been discarded.`);
  } else if (type === "rate-limit-countdown") {
    $("status").textContent = `WAIT ${Math.ceil(payload.remainingMs / 1000)}s`;
  } else if (type === "rate-limit-resumed") {
    $("status").textContent = "RUNNING";
    addEntry("result", "RATE LIMIT CLEARED", "OpenAI accepted the request. The existing run is continuing.");
  } else if (type === "run-finish") {
    updateUsage(payload);
    setRunning(false, payload.status);
    addEntry(payload.status === "error" ? "error" : "finish", payload.status.toUpperCase(), payload.message);
    $("intentCard").className = "intent-card idle";
  }
}

function syncEfforts() {
  const select = $("effort"), previous = select.value;
  const allowed = $("model").value === "gpt-5.5" ? effortOptions.filter(value => value !== "max") : effortOptions;
  for (const option of select.options) option.disabled = !allowed.includes(option.value);
  if (!allowed.includes(previous)) select.value = "xhigh";
}

function addEntry(kind, title, content) {
  const empty = $("trace").querySelector(".empty");
  if (empty) empty.remove();
  const article = document.createElement("article");
  article.className = `entry ${kind}`;
  const head = document.createElement("header");
  head.textContent = title;
  const body = document.createElement(kind === "model" ? "p" : "pre");
  body.textContent = String(content ?? "");
  article.append(head, body);
  $("trace").append(article);
  $("trace").scrollTop = $("trace").scrollHeight;
}

function setKeyState(configured) {
  $("keyState").textContent = configured ? "SAVED LOCALLY" : "NOT SET";
  $("keyState").style.color = configured ? "#55f4ce" : "#f3b55e";
}

function setRunning(running, status = "idle") {
  $("start").disabled = running;
  $("stop").disabled = !running;
  $("model").disabled = running;
  $("effort").disabled = running;
  $("status").textContent = running ? "RUNNING" : status.toUpperCase();
  $("status").className = `status ${running ? "running" : status}`;
}

function updateUsage(usage) {
  $("callCount").textContent = usage.calls ?? $("callCount").textContent;
  $("inputTokens").textContent = Number(usage.inputTokens || 0).toLocaleString();
  $("outputTokens").textContent = Number(usage.outputTokens || 0).toLocaleString();
  $("cost").textContent = `$${Number(usage.estimatedCost || 0).toFixed(4)}`;
  const seconds = Math.floor((usage.elapsedMs || 0) / 1000);
  $("elapsed").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function restore(run) {
  // A restored run keeps the identity it started with. Reflect that immutable
  // identity in the selectors so the panel cannot misleadingly show a newer
  // preference while an older run is still active.
  if (run.model && [...$("model").options].some(option => option.value === run.model)) {
    $("model").value = run.model;
    syncEfforts();
  }
  if (run.effort && [...$("effort").options].some(option => option.value === run.effort)) {
    $("effort").value = run.effort;
  }
  setRunning(run.status === "running", run.status);
  updateUsage(run);
  addEntry("result", "RUN IDENTITY", `${run.model || "unspecified"} · ${run.effort || "unspecified"} reasoning`);
  if (run.logs?.length) {
    $("trace").innerHTML = "";
    for (const event of run.logs) handleEvent(event.type, event.payload);
  }
}
