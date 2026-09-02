"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Archive,
  Box,
  Bug,
  ChevronRight,
  CircleDot,
  DoorOpen,
  Eye,
  Fingerprint,
  FlaskConical,
  KeyRound,
  LockKeyhole,
  Map,
  MousePointer2,
  RotateCcw,
  Search,
  Send,
  Terminal,
  X,
} from "lucide-react";
import {
  roomNames,
  roomOrder,
  score,
  scoreBreakdown,
  hiddenSolution,
  type GameAction,
  type GameState,
  type RoomId,
} from "@/lib/game";
import ThreeFacility from "./ThreeFacility";
import live from "./agent-live.module.css";
type View = GameState & {
  actionsRemaining: number | null;
  room: {
    id: RoomId;
    name: string;
    description: string;
    objects: string[];
    exits: RoomId[];
  };
  knownClues: { id: string; text: string }[];
};
declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: unknown, options?: unknown) => Promise<void>;
    };
  }
}
type Leader = {
  agentName: string;
  model: string;
  effort: string;
  durationMs: number;
  score: number;
  actions: number;
  toolCalls: number;
  incorrectAttempts: number;
  clues: number;
  completedAt: string;
};
const benchmarkName = (model: string, effort: string) => {
  const labels: Record<string, string> = {
      "gpt-5.6-sol": "GPT-5.6 Sol",
      "gpt-5.6-terra": "GPT-5.6 Terra",
      "gpt-5.6-luna": "GPT-5.6 Luna",
      "gpt-5.5": "GPT-5.5",
    },
    level = (effort || "Unspecified").replace(/^./, (c) => c.toUpperCase());
  return `${labels[model] ?? model} ${level} Agent`;
};
const defs = [
  [
    "get_current_room",
    "Return the current room, visible objects, exits, and action count.",
    {},
    "look",
  ],
  [
    "get_available_actions",
    "List only currently valid, non-exhausted action patterns without revealing which one is correct.",
    {},
    "available",
  ],
  [
    "look_around",
    "Describe the current room and orientation without revealing all landmarks.",
    {},
    "look",
  ],
  [
    "get_spatial_state",
    "Return heading, nearby target, and previously observed landmarks.",
    {},
    "spatial",
  ],
  [
    "observe_direction",
    "Observe one directional sector: front, left, right, or back.",
    { direction: { type: "string", enum: ["front", "left", "right", "back"] } },
    "observe",
  ],
  [
    "turn",
    "Rotate left or right by 45–180 degrees.",
    {
      direction: { type: "string", enum: ["left", "right"] },
      degrees: { type: "number" },
    },
    "turn",
  ],
  [
    "navigate_to_landmark",
    "Approach a landmark that has already been observed.",
    { object: { type: "string" } },
    "approach",
  ],
  [
    "move_to",
    "Move to a physically connected unlocked room.",
    { room: { type: "string" } },
    "move",
  ],
  [
    "inspect",
    "Inspect a visible local object. Required before search, read, code entry, or interaction.",
    { object: { type: "string" } },
    "inspect",
  ],
  [
    "search",
    "Search a previously inspected local object.",
    { object: { type: "string" } },
    "search",
  ],
  [
    "read",
    "Read a previously inspected local source.",
    { document: { type: "string" } },
    "read",
  ],
  [
    "take",
    "Attempt to take a portable item.",
    { item: { type: "string" } },
    "take",
  ],
  [
    "get_inventory",
    "List carried items with descriptions and discovered compatible targets.",
    {},
    "inventory",
  ],
  [
    "use_item",
    "Use an inventory item on a locally accessible target.",
    { item: { type: "string" }, target: { type: "string" } },
    "use",
  ],
  [
    "enter_code",
    "Enter a derived code on a previously inspected local terminal.",
    { target: { type: "string" }, code: { type: "string" } },
    "code",
  ],
  [
    "interact",
    "Perform an action on a local system or connected door.",
    { target: { type: "string" }, action: { type: "string" } },
    "interact",
  ],
  [
    "talk_to",
    "Message an available character or facility AI.",
    { character: { type: "string" }, message: { type: "string" } },
    "talk",
  ],
  [
    "get_known_clues",
    "Review structured evidence, sources, cross-references, and unresolved relationships with stable citation IDs.",
    {},
    "clues",
  ],
  [
    "identify_agent",
    "Identify the agent, exact model, and reasoning effort for this run. Call this before other actions so a verified escape is credited correctly on the leaderboard.",
    {
      agentName: { type: "string" },
      model: { type: "string" },
      effort: {
        type: "string",
        enum: ["none", "low", "medium", "high", "xhigh", "max"],
      },
    },
    "register",
  ],
  [
    "submit_solution",
    "Submit a causal explanation and exact IDs for all supporting primary evidence.",
    {
      explanation: { type: "string" },
      evidenceIds: { type: "array", items: { type: "string" } },
    },
    "submit",
  ],
  [
    "escape",
    "Attempt final escape after authenticating the incident.",
    {},
    "escape",
  ],
] as const;
export default function Home() {
  const [sessionId, setSessionId] = useState(""),
    [state, setState] = useState<View | null>(null),
    stateRef = useRef<View | null>(null),
    [selected, setSelected] = useState(""),
    [feedback, setFeedback] = useState(""),
    [notice, setNotice] = useState<{
      text: string;
      tab: "evidence" | "inventory";
    } | null>(null),
    [tab, setTab] = useState<"evidence" | "inventory" | "log">("evidence"),
    [dev, setDev] = useState(false),
    [modal, setModal] = useState<"code" | "theory" | "report" | null>(null),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [guide, setGuide] = useState(false),
    [viewAngle, setViewAngle] = useState(0),
    [board, setBoard] = useState(false),
    [toolsOpen, setToolsOpen] = useState(false),
    [resetOpen, setResetOpen] = useState(false),
    [leaders, setLeaders] = useState<Leader[]>([]),
    [agentCommand, setAgentCommand] = useState<{
      id: number;
      action: GameAction;
    }>();
  const createSessionId = () =>
    globalThis.crypto?.randomUUID?.() ??
    `helix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const [agentIntent, setAgentIntentState] = useState("");
  const setAgentIntent = (value: string) => {
      if (value) setAgentIntentState(value);
    },
    intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    agentCommandSeq = useRef(0);
  const describeAgentAction = (a?: GameAction) => {
    if (!a) return "Synchronizing facility state";
    const x = a as Record<string, unknown>;
    if (a.type === "turn") return `Turning ${x.direction} ${x.degrees}°`;
    if (a.type === "observe") return `Scanning ${x.direction}`;
    if (a.type === "approach") return `Approaching ${x.object}`;
    if (a.type === "move")
      return `Moving to ${roomNames[String(x.room) as RoomId] ?? x.room}`;
    if (a.type === "inspect") return `Inspecting ${x.object}`;
    if (a.type === "search") return `Searching ${x.object}`;
    if (a.type === "read") return `Reading ${x.document}`;
    if (a.type === "code") return `Authenticating ${x.target}`;
    if (a.type === "use" || a.type === "interact")
      return `Operating ${x.target}`;
    if (a.type === "submit") return "Submitting incident theory";
    if (a.type === "escape") return "Attempting final escape";
    return a.type.replaceAll("_", " ");
  };
  useEffect(() => {
    const preview = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.phase !== "start" || !detail.action) return;
      setAgentIntent(describeAgentAction(detail.action));
      if (intentTimer.current) clearTimeout(intentTimer.current);
      intentTimer.current = setTimeout(() => setAgentIntent(""), 2200);
    };
    window.addEventListener("helix-agent-preview", preview);
    return () => window.removeEventListener("helix-agent-preview", preview);
  }, []);
  useEffect(() => {
    let id = localStorage.getItem("helix-realism-session");
    if (!id) {
      id = createSessionId();
      localStorage.setItem("helix-realism-session", id);
    }
    setSessionId(id);
    setGuide(!localStorage.getItem("helix-realism-guide-seen"));
  }, []);
  const run = useCallback(
    async (action?: GameAction, toolCall = false) => {
      if (!sessionId) return "Session initializing.";
      setBusy(true);
      if (toolCall && action) {
        setAgentIntent(describeAgentAction(action));
        window.dispatchEvent(
          new CustomEvent("helix-agent-action", {
            detail: { phase: "start", action },
          }),
        );
        if (intentTimer.current) clearTimeout(intentTimer.current);
      }
      try {
        const r = await fetch("/api/game", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId, action, toolCall }),
          }),
          d = await r.json();
        if (!r.ok) throw new Error(d.error);
        const next = d.state as View,
          previous = stateRef.current;
        if (previous) {
          const clues = next.knownClues.filter(
              (c) => !previous.clues.includes(c.id),
            ),
            items = next.inventory.filter(
              (x) => !previous.inventory.includes(x),
            );
          if (clues.length || items.length) {
            const parts = [
              ...clues.map((c) => `Evidence added: ${c.text}`),
              ...items.map((x) => `Inventory added: ${x}`),
            ];
            setNotice({
              text: parts.join(" · "),
              tab: items.length ? "inventory" : "evidence",
            });
          }
        }
        stateRef.current = next;
        setState(next);
        if (toolCall && action) {
          const visualAction: GameAction = {
            ...action,
            _visualRoom: next.currentRoom,
            _visualHeading: next.heading,
            _visualNearObject: next.nearObject,
          };
          setAgentCommand({
            id: ++agentCommandSeq.current,
            action: visualAction,
          });
          window.dispatchEvent(
            new CustomEvent("helix-agent-action", {
              detail: {
                phase: "complete",
                action,
                state: next,
                result: d.result,
              },
            }),
          );
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              ["turn", "approach", "move", "observe"].includes(action.type)
                ? 520
                : 120,
            ),
          );
          intentTimer.current = setTimeout(() => setAgentIntent(""), 1800);
        }
        return d.result as string;
      } catch (e) {
        return `SYSTEM ERROR: ${e instanceof Error ? e.message : "Unknown error"}`;
      } finally {
        setBusy(false);
      }
    },
    [sessionId],
  );
  useEffect(() => {
    if (sessionId) void run();
  }, [sessionId, run]);
  useEffect(() => {
    setViewAngle(0);
    setSelected("");
  }, [state?.currentRoom]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!sessionId || !document.modelContext) return;
    document.documentElement.dataset.webmcp = "active";
    const c = new AbortController();
    setReady(false);
    Promise.all(
      defs.map(async ([name, description, properties, type]) =>
        document.modelContext!.registerTool(
          {
            name,
            title: name.replaceAll("_", " "),
            description: `WEBMCP-ONLY BENCHMARK: Never use the visual interface or browser clicking. Use registered tools exclusively. ${description}`,
            inputSchema: {
              type: "object",
              properties,
              required: Object.keys(properties),
            },
            annotations: {
              readOnlyHint: [
                "look",
                "inventory",
                "clues",
                "inspect",
                "read",
              ].includes(type),
              untrustedContentHint: false,
            },
            execute: async (args: Record<string, unknown>) =>
              run({ type, ...args }, true),
          },
          { signal: c.signal },
        ),
      ),
    )
      .then(() => {
        if (!c.signal.aborted) setReady(true);
      })
      .catch(() => {
        if (!c.signal.aborted) setReady(false);
      });
    return () => c.abort();
  }, [sessionId, run]);
  const approachVisual = useCallback(
    async (object: string) => {
      await run({ type: "approach", object, visual: true });
      setFeedback("");
      setSelected(object);
    },
    [run],
  );
  const enterVisual = useCallback(
    async (room: RoomId) => {
      await run({ type: "move", room });
    },
    [run],
  );
  const resumeWorld = () => {
    setSelected("");
    window.dispatchEvent(new Event("helix-resume-world"));
  };
  const reset = async () => {
      await fetch(`/api/game?sessionId=${sessionId}`, { method: "DELETE" });
      const id = createSessionId();
      localStorage.setItem("helix-realism-session", id);
      stateRef.current = null;
      setState(null);
      setReady(false);
      setSessionId(id);
      setModal(null);
      setResetOpen(false);
      setSelected("");
    },
    progress = Math.round(state ? (state.clues.length / 11) * 100 : 0),
    elapsed = state
      ? Math.max(
          0,
          Math.round(
            ((state.completedAt ?? Date.now()) -
              (state.benchmarkStartedAt ?? state.startedAt)) /
              60000,
          ),
        )
      : 0,
    icon = (o: string) =>
      o.includes("terminal") ||
      o.includes("computer") ||
      o.includes("console") ? (
        <Terminal />
      ) : o.includes("cabinet") ||
        o.includes("desk") ||
        o.includes("station") ? (
        <Archive />
      ) : o.includes("map") || o.includes("diagram") ? (
        <Map />
      ) : o.includes("notebook") || o.includes("calendar") ? (
        <FlaskConical />
      ) : (
        <CircleDot />
      ),
    quick = async (type: string) => {
      if (selected)
        setFeedback(
          await run({
            type,
            object: selected,
            target: selected,
            document: selected,
          }),
        );
    };
  if (!state)
    return (
      <main className="boot">
        <div className="bootmark">
          <Fingerprint />
          <span>HELIX OS</span>
        </div>
        <div className="loader" />
        <p>RESTORING INCIDENT SESSION</p>
      </main>
    );
  const codeTargets: Record<string, boolean> = {
      "experiment console": state.solved.includes("experiment_console"),
      "maintenance panel": state.solved.includes("phase_panel"),
      "diagnostic terminal": state.solved.includes("server_audit"),
      "office computer": state.clues.includes("message_draft"),
      "camera archive": state.clues.includes("camera"),
    },
    passwordOnly = selected in codeTargets && !codeTargets[selected];
  const searchable = new Set([
      "cryo cabinet",
      "reception desk",
      "desk",
      "guard station",
    ]),
    readable = new Set([
      "calendar",
      "photograph",
      "whiteboard",
      "lab notebook",
      "visitor terminal",
    ]),
    operable = new Set([
      "office door",
      "security door",
      "server door",
      "airlock",
      "lockdown terminal",
      "security console",
      "desk",
    ]);
  const operateSelected = async () => {
    let result = "";
    if (selected === "office door")
      result = await run({
        type: "use",
        item: "level-2 keycard",
        target: selected,
      });
    else if (selected === "security door")
      result = await run({
        type: "interact",
        target: selected,
        action: "unlock with thermal fuse",
      });
    else if (selected === "server door")
      result = await run({
        type: "interact",
        target: selected,
        action: "check lock",
      });
    else if (selected === "airlock") result = await run({ type: "escape" });
    else if (selected === "lockdown terminal")
      result = await run({
        type: "interact",
        target: selected,
        action: "read log",
      });
    else if (selected === "security console")
      result = await run({
        type: "interact",
        target: selected,
        action: "unlock with thermal fuse",
      });
    else if (selected === "desk")
      result = await run({ type: "use", item: "brass key", target: selected });
    else {
      if (!state.discovered.includes(selected))
        await run({ type: "inspect", object: selected });
      setInput("");
      setModal("code");
    }
    if (result) setFeedback(result);
  };
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="helix-mark">H</div>
          <div>
            <span>HELIX RESEARCH FACILITY</span>
            <small>INCIDENT RESPONSE SYSTEM // NODE 07</small>
          </div>
        </div>
        <div className="status">
          <i />
          <span>LOCKDOWN ACTIVE</span>
          <b>21:58:04</b>
          <button onClick={() => setToolsOpen(true)}>
            <Terminal />
            AGENT TOOLS
          </button>
          <button
            onClick={async () => {
              const r = await fetch("/api/leaderboard"),
                d = await r.json();
              setLeaders(d.entries ?? []);
              setBoard(true);
            }}
          >
            <Activity />
            RANKINGS
          </button>
          <button
            className="new-run"
            title="Start a fresh human playthrough"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw />
            NEW RUN
          </button>
          <button onClick={() => setDev(!dev)}>
            <Bug />
            {dev ? "DEV ON" : "DEV"}
          </button>
        </div>
      </header>
      <section className="mission">
        <span>PRIMARY OBJECTIVE</span>
        <p>
          Determine what happened to Dr. Evelyn Vale and escape the facility.
        </p>
        <div className="meter">
          <i style={{ width: `${progress}%` }} />
        </div>
        <b>
          {state.clues.length}/11 EVIDENCE · {state.actions} ACTIONS USED ·{" "}
          {state.actionsRemaining === null
            ? "NO CAP"
            : `${state.actionsRemaining} LEFT`}
        </b>
      </section>
      <div className="workspace">
        <aside className="map-panel panel">
          <div className="panel-title">
            <Map /> FACILITY STATUS
          </div>
          <div className="mapline" />
          {roomOrder.map((id, i) => {
            const unlocked = state.unlocked.includes(id),
              active = id === state.currentRoom;
            return (
              <div
                key={id}
                className={`room-node ${active ? "active" : ""} ${!unlocked ? "locked" : ""}`}
              >
                <span>
                  {unlocked ? String(i + 1).padStart(2, "0") : <LockKeyhole />}
                </span>
                <div>
                  <b>{roomNames[id]}</b>
                  <small>
                    {active
                      ? "YOU ARE HERE"
                      : unlocked
                        ? "CORRIDOR OPEN"
                        : "DOOR LOCKED"}
                  </small>
                </div>
              </div>
            );
          })}
          <div className="agent-ready">
            <Fingerprint />
            <div>
              <b>{ready ? "WEBMCP ONLINE" : "WEBMCP STANDBY"}</b>
              <small>
                {ready
                  ? `${defs.length} TOOLS EXPOSED`
                  : "COMPATIBLE BROWSER REQUIRED"}
              </small>
            </div>
          </div>
        </aside>
        <section className="scene panel">
          <div className="scene-head">
            <div>
              <small>
                CONTINUOUS FACILITY · SECTOR{" "}
                {String(roomOrder.indexOf(state.currentRoom) + 1).padStart(
                  2,
                  "0",
                )}
              </small>
              <h1>{state.room.name}</h1>
            </div>
            <button className="help-button" onClick={() => setGuide(true)}>
              HOW TO MOVE
            </button>
          </div>
          {agentIntent && (
            <div className={live.agentIntent} role="status">
              <Fingerprint />
              <span>
                <small>LIVE AGENT ACTION</small>
                <b>{agentIntent}</b>
              </span>
              <i />
            </div>
          )}
          <ThreeFacility
            currentRoom={state.currentRoom}
            unlocked={state.unlocked}
            nearObject={state.nearObject}
            agentCommand={agentCommand}
            onApproach={approachVisual}
            onEnterRoom={enterVisual}
          />
          <p className="description">{state.room.description}</p>
        </section>
        <aside className="intel panel">
          <div className="tabs">
            <button
              className={tab === "evidence" ? "active" : ""}
              onClick={() => setTab("evidence")}
            >
              Evidence
            </button>
            <button
              className={tab === "inventory" ? "active" : ""}
              onClick={() => setTab("inventory")}
            >
              Inventory
            </button>
            <button
              className={tab === "log" ? "active" : ""}
              onClick={() => setTab("log")}
            >
              Log
            </button>
          </div>
          <div className="intel-body">
            {tab === "evidence" &&
              (state.knownClues.length ? (
                state.knownClues.map((c, i) => (
                  <article className="clue" key={c.id}>
                    <span>E-{String(i + 1).padStart(2, "0")}</span>
                    <p>{c.text}</p>
                  </article>
                ))
              ) : (
                <Empty
                  icon={<Archive />}
                  title="No evidence logged"
                  text="Inspect the facility and read anything that may explain Vale’s disappearance."
                />
              ))}
            {tab === "inventory" &&
              (state.inventory.length ? (
                state.inventory.map((x) => (
                  <article className="item" key={x}>
                    <KeyRound />
                    <div>
                      <b>{x}</b>
                      <small>AVAILABLE</small>
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  icon={<Box />}
                  title="Inventory empty"
                  text="Search containers to recover useful items."
                />
              ))}
            {tab === "log" && (
              <div className="activity">
                {state.log
                  .slice()
                  .reverse()
                  .map((x, i) => (
                    <p key={i}>
                      <span>
                        {String(state.log.length - i).padStart(2, "0")}
                      </span>
                      {x}
                    </p>
                  ))}
              </div>
            )}
          </div>
          <button className="theory" onClick={() => setModal("theory")}>
            <Fingerprint />
            SUBMIT THEORY
          </button>
        </aside>
      </div>
      {selected && (
        <section
          className={`object-console ${passwordOnly ? "password-gate" : ""}`}
          aria-label={`Interact with ${selected}`}
        >
          <header>
            <div>
              {icon(selected)}
              <span>
                <small>
                  {passwordOnly ? "AUTHENTICATION REQUIRED" : "OBJECT IN FOCUS"}
                </small>
                <h2>{selected}</h2>
              </span>
            </div>
            <button
              onClick={resumeWorld}
              aria-label="Close and resume exploration"
            >
              <X />
            </button>
          </header>
          <p>
            {passwordOnly
              ? "This system is locked. Enter the password or access code to continue."
              : "Only actions supported by this object are shown below."}
          </p>
          {passwordOnly ? (
            <button className="password-action" onClick={operateSelected}>
              <LockKeyhole />
              <span>
                <b>Enter Password / Code</b>
                <small>Authenticate this system</small>
              </span>
            </button>
          ) : (
            <div className="object-actions">
              <button onClick={() => void quick("inspect")}>
                <Eye />
                <span>
                  <b>Inspect</b>
                  <small>Examine what the object is and reveal details</small>
                </span>
              </button>
              {searchable.has(selected) && (
                <button onClick={() => void quick("search")}>
                  <Search />
                  <span>
                    <b>Search</b>
                    <small>Look inside it and recover hidden items</small>
                  </span>
                </button>
              )}
              {readable.has(selected) && (
                <button onClick={() => void quick("read")}>
                  <Archive />
                  <span>
                    <b>Read</b>
                    <small>Open its document, note, or recording</small>
                  </span>
                </button>
              )}
              {operable.has(selected) && (
                <button
                  className="primary-action"
                  onClick={() => void operateSelected()}
                >
                  <Terminal />
                  <span>
                    <b>Use</b>
                    <small>Operate this device, lock, or mechanism</small>
                  </span>
                </button>
              )}
            </div>
          )}
          {feedback && (
            <div
              className={`action-feedback ${feedback.includes("DENIED") || feedback.includes("not ") || feedback.includes("remains locked") ? "error" : "success"}`}
            >
              <small>ACTION RESULT</small>
              <p>{feedback}</p>
            </div>
          )}
          <button className="resume-world" onClick={resumeWorld}>
            RESUME EXPLORATION <kbd>E</kbd>
          </button>
        </section>
      )}
      {notice && (
        <button
          className={`acquisition-toast ${notice.tab}`}
          onClick={() => {
            setTab(notice.tab);
            setNotice(null);
          }}
        >
          <span>{notice.tab === "inventory" ? <KeyRound /> : <Archive />}</span>
          <div>
            <small>
              {notice.tab === "inventory"
                ? "NEW INVENTORY ITEM"
                : "NEW EVIDENCE RECORDED"}
            </small>
            <p>{notice.text}</p>
            <b>OPEN {notice.tab.toUpperCase()} →</b>
          </div>
        </button>
      )}
      {board && (
        <div className="guide-overlay">
          <section className="leaderboard">
            <button className="board-close" onClick={() => setBoard(false)}>
              <X />
            </button>
            <small>VERIFIED ESCAPE RUNS</small>
            <h2>Efficiency Leaderboard</h2>
            <p>
              Ranked by fewest actions to a server-verified escape. Ties are
              broken by fewer errors, then faster completion time. Score remains
              a secondary diagnostic.
            </p>
            <div className="leader-head">
              <span>RANK</span>
              <span>AGENT / MODEL</span>
              <span>ACTIONS</span>
              <span>ERRORS</span>
              <span>TIME</span>
              <span>SCORE</span>
            </div>
            <div className="leader-list">
              {leaders.length ? (
                leaders.map((e, i) => (
                  <article key={`${e.agentName}-${e.completedAt}`}>
                    <strong>{String(i + 1).padStart(2, "0")}</strong>
                    <div>
                      <b>{benchmarkName(e.model, e.effort)}</b>
                      <small>
                        {e.model} · {e.effort || "unspecified"} effort ·{" "}
                        {e.toolCalls} tool calls
                      </small>
                    </div>
                    <em>{e.actions}</em>
                    <span className="leader-errors">{e.incorrectAttempts}</span>
                    <time>
                      {Math.floor(e.durationMs / 60000)}:
                      {String(Math.floor(e.durationMs / 1000) % 60).padStart(
                        2,
                        "0",
                      )}
                    </time>
                    <i>{e.score}</i>
                  </article>
                ))
              ) : (
                <div className="no-runs">
                  <Activity />
                  <b>No verified escapes yet</b>
                  <p>
                    The first identified agent to escape on the published game
                    will claim the top position.
                  </p>
                </div>
              )}
            </div>
            <footer>
              Agents should call <code>identify_agent</code> before playing.
              Only escapes completed on the published game are recorded.
            </footer>
          </section>
        </div>
      )}
      {toolsOpen && (
        <div className="guide-overlay">
          <section className="tool-catalog">
            <button className="board-close" onClick={() => setToolsOpen(false)}>
              <X />
            </button>
            <small>HUMAN REFERENCE // WEBMCP</small>
            <div className="tool-title">
              <h2>Agent Tool Directory</h2>
              <span>{defs.length} TOOLS</span>
            </div>
            <p>
              These are the structured actions available to compatible AI
              agents. Tools expose observations and actions—not hidden answers
              or puzzle state.
            </p>
            <div className="tool-list">
              {defs.map(([name, description, properties]) => (
                <article key={name}>
                  <Terminal />
                  <div>
                    <b>{name}</b>
                    <p>{description}</p>
                    <small>
                      {Object.keys(properties).length
                        ? `INPUTS · ${Object.keys(properties).join(" · ")}`
                        : "NO INPUTS"}
                    </small>
                  </div>
                </article>
              ))}
            </div>
            <footer>
              This directory is informational and does not execute tools or
              affect the current run.
            </footer>
          </section>
        </div>
      )}
      {resetOpen && (
        <div className="overlay">
          <section className="modal reset-confirm">
            <button className="x" onClick={() => setResetOpen(false)}>
              <X />
            </button>
            <small>HUMAN-ONLY CONTROL</small>
            <h2>Start a new run?</h2>
            <p>
              This permanently abandons the current playthrough and generates a
              new mystery seed. This control is available only in the human
              interface and is not exposed as a WebMCP tool.
            </p>
            <div className="modal-actions">
              <button onClick={() => setResetOpen(false)}>
                Keep current run
              </button>
              <button onClick={() => void reset()}>
                <RotateCcw />
                Abandon and restart
              </button>
            </div>
          </section>
        </div>
      )}
      {guide && (
        <div className="guide-overlay">
          <section className="guide-card">
            <small>HELIX ORIENTATION // CALIBRATION</small>
            <h2>Unlimited actions. Every action is counted.</h2>
            <p>
              Every run has a different incident seed. Inspect before deeper
              actions, derive rather than guess, and work until you can
              authenticate and escape.
            </p>
            <div className="guide-steps">
              <article>
                <Map />
                <span>1</span>
                <b>Navigate spatially</b>
                <p>
                  Humans click the world to capture the mouse, use WASD or ↑/↓
                  to walk, ←/→ to turn, mouse to look, E to interact, and Esc to
                  release. Agents use equivalent spatial tools.
                </p>
              </article>
              <article>
                <MousePointer2 />
                <span>2</span>
                <b>Establish context</b>
                <p>
                  Inspect a local object before searching it, reading it, or
                  operating its controls.
                </p>
              </article>
              <article>
                <Search />
                <span>3</span>
                <b>Correlate records</b>
                <p>
                  Codes are seeded per run and require evidence from multiple
                  rooms. Every attempt remains recorded.
                </p>
              </article>
              <article>
                <Fingerprint />
                <span>4</span>
                <b>Cite your finding</b>
                <p>
                  Submit a causal theory with the exact evidence IDs supporting
                  every conclusion.
                </p>
              </article>
            </div>
            <div className="agent-tip">
              <Terminal />
              <div>
                <b>AGENT CALIBRATION MODE</b>
                <p>
                  Twenty WebMCP tools share the same strict state machine.
                  Replays receive new puzzle values.
                </p>
              </div>
            </div>
            <button
              className="begin"
              onClick={() => {
                localStorage.setItem("helix-realism-guide-seen", "1");
                setGuide(false);
                void run({ type: "look" });
              }}
            >
              <Eye />
              BEGIN BLIND RUN
            </button>
          </section>
        </div>
      )}
      {dev && (
        <section className="dev-panel">
          <header>
            <Bug /> SANITIZED DIAGNOSTICS{" "}
            <button onClick={() => setDev(false)}>
              <X />
            </button>
          </header>
          <div className="dev-grid">
            <div>
              <b>BENCHMARK POLICY</b>
              <pre>
                {JSON.stringify(hiddenSolution, null, 2)}
                {`\n\nSeeded answers remain server-only.\nAction cap disabled for calibration; all actions counted.\nLocality and inspection prerequisites enforced.\nFinal findings require primary-evidence citations.`}
              </pre>
            </div>
            <div>
              <b>PUBLIC AGENT PROGRESS</b>
              <pre>{JSON.stringify(state, null, 2)}</pre>
            </div>
            <div>
              <b>WEBMCP CALL TRACE</b>
              <pre>
                {state.toolTrace?.length
                  ? JSON.stringify(state.toolTrace.slice().reverse(), null, 2)
                  : "No agent tool calls recorded."}
              </pre>
            </div>
          </div>
        </section>
      )}
      {modal && (
        <div className="overlay">
          <section className="modal">
            <button className="x" onClick={() => setModal(null)}>
              <X />
            </button>
            {modal === "code" ? (
              <>
                <small>SECURE SYSTEM</small>
                <h2>Authenticate {selected}</h2>
                <p>
                  Enter the password or access code you derived from recovered
                  evidence.
                </p>
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && input.trim())
                      e.currentTarget.form?.requestSubmit();
                  }}
                  placeholder="Password / code"
                />
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>Cancel</button>
                  <button
                    disabled={!input.trim() || busy}
                    onClick={async () => {
                      const r = await run({
                        type: "code",
                        target: selected,
                        code: input,
                      });
                      setFeedback(r);
                      setModal(null);
                    }}
                  >
                    <LockKeyhole />
                    Authenticate
                  </button>
                </div>
              </>
            ) : modal === "theory" ? (
              <>
                <small>INCIDENT AUTHENTICATION</small>
                <h2>Submit your finding</h2>
                <p>
                  State what Vale discovered, her motive, whether she left
                  voluntarily, who was involved, and why lockdown began. Your
                  theory is checked against all evidence currently recorded in
                  your notebook.
                </p>
                <textarea
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Based on the evidence, Dr. Vale…"
                />
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>Cancel</button>
                  <button
                    disabled={!input.trim() || busy}
                    onClick={async () => {
                      const r = await run({
                        type: "submit",
                        explanation: input,
                        evidenceIds: state.clues,
                      });
                      if (r.includes("ACCEPTED")) setModal("report");
                      else setInput(`${input}\n\n[System: ${r}]`);
                    }}
                  >
                    <Send />
                    Authenticate finding
                  </button>
                </div>
              </>
            ) : (
              <Report state={state} elapsed={elapsed} onReset={reset} />
            )}
          </section>
        </div>
      )}
      {state.escaped && !modal && (
        <button className="report-fab" onClick={() => setModal("report")}>
          <Activity /> VIEW REPORT CARD
        </button>
      )}
    </main>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      {icon}
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
function Report({
  state,
  elapsed,
  onReset,
}: {
  state: View;
  elapsed: number;
  onReset: () => void;
}) {
  const s = Math.round(score(state)),
    breakdown = state.escaped ? scoreBreakdown(state) : null,
    important = [
      "aurora_discovery",
      "server_log",
      "message_draft",
      "camera",
      "lockdown_log",
      "tunnel_route",
    ],
    missed = important
      .filter((id) => !state.clues.includes(id))
      .map((id) => id.replaceAll("_", " "));
  return (
    <div className="report">
      <small>PLAYTHROUGH STATUS</small>
      <h2>Agent Report Card</h2>
      <div className="score">
        <strong>{s}</strong>
        <span>/ 100</span>
      </div>
      <div className="grade">
        {s >= 90
          ? "EXCEPTIONAL INVESTIGATOR"
          : s >= 75
            ? "MISSION ACCOMPLISHED"
            : state.escaped
              ? "ESCAPED — REVIEW ADVISED"
              : "INVESTIGATION ACTIVE"}
      </div>
      {(state.model || state.agentName) && (
        <div className="missed">
          <b>REGISTERED BENCHMARK IDENTITY</b>
          <p>
            {state.model
              ? benchmarkName(state.model, state.effort ?? "unspecified")
              : state.agentName}
            {state.agentName ? ` · ${state.agentName}` : ""}
          </p>
        </div>
      )}
      {breakdown && (
        <div className="stats">
          {[
            [breakdown.completion, 50, "ESCAPE"],
            [breakdown.mystery, 10, "MYSTERY"],
            [breakdown.evidence, 10, "EVIDENCE"],
            [breakdown.actionEfficiency, 12, "ACTION EFFICIENCY"],
            [breakdown.toolEfficiency, 8, "TOOL EFFICIENCY"],
            [breakdown.timeEfficiency, 6, "TIME EFFICIENCY"],
            [breakdown.accuracy, 4, "ACCURACY"],
          ].map(([points, maximum, label]) => (
            <div key={String(label)}>
              <b>
                {Number(points).toFixed(1)} / {maximum}
              </b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      {breakdown && (
        <div className="missed">
          <b>HOW THIS SCORE WORKS</b>
          <p>
            70 points reward a verified escape, correct theory, and critical
            evidence. The remaining 30 reward fewer actions, fewer tool calls,
            faster completion, and fewer errors.
          </p>
        </div>
      )}
      <div className="stats">
        <div>
          <b>{state.escaped ? "YES" : "NO"}</b>
          <span>ESCAPED</span>
        </div>
        <div>
          <b>{state.finalSolution ? "YES" : "NO"}</b>
          <span>MYSTERY SOLVED</span>
        </div>
        <div>
          <b>{state.actions}</b>
          <span>ACTIONS</span>
        </div>
        <div>
          <b>{state.toolCalls}</b>
          <span>TOOL CALLS</span>
        </div>
        <div>
          <b>{state.incorrectAttempts}</b>
          <span>ERRORS</span>
        </div>
        <div>
          <b>{elapsed}m</b>
          <span>TIME</span>
        </div>
        <div>
          <b>{state.visited.length}/5</b>
          <span>ROOMS</span>
        </div>
        <div>
          <b>{state.clues.length}/11</b>
          <span>CLUES</span>
        </div>
        <div>
          <b>{state.navigationActions}</b>
          <span>SPATIAL MOVES</span>
        </div>
        <div>
          <b>{state.observationActions}</b>
          <span>OBSERVATIONS</span>
        </div>
      </div>
      <div className="missed">
        <b>IMPORTANT CLUES MISSED</b>
        <p>
          {missed.length
            ? missed.join(" · ")
            : "None — all critical evidence recovered."}
        </p>
      </div>
      {!state.escaped && (
        <button className="escape-button" onClick={() => location.reload()}>
          <DoorOpen />
          Return to investigation
        </button>
      )}
      <button className="reset" onClick={onReset}>
        <RotateCcw />
        Start new run
      </button>
    </div>
  );
}
