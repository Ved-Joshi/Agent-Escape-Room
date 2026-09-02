export type RoomId = "lobby" | "lab" | "office" | "server" | "security";
type Secret = {
  experimentId: string;
  phaseCode: string;
  officePassword: string;
  copyMinute: number;
  cameraMinute: number;
};
export type GameState = {
  sessionId: string;
  currentRoom: RoomId;
  visited: RoomId[];
  unlocked: RoomId[];
  inventory: string[];
  discovered: string[];
  observed: string[];
  nearObject?: string;
  heading: number;
  navigationActions: number;
  observationActions: number;
  clues: string[];
  solved: string[];
  enteredCodes: string[];
  conversations: string[];
  unlockedTerminals: string[];
  finalSolution: boolean;
  escaped: boolean;
  failed: boolean;
  actions: number;
  toolCalls: number;
  visualActions: number;
  protocolEligible: boolean;
  incorrectAttempts: number;
  startedAt: number;
  benchmarkStartedAt?: number;
  completedAt?: number;
  log: string[];
  agentName?: string;
  model?: string;
  effort?: string;
  toolTrace?: {
    name: string;
    args: Record<string, unknown>;
    result: string;
    at: number;
  }[];
  secret: Secret;
};
export type GameAction = { type: string; [key: string]: unknown };
export const ACTION_LIMIT: number | null = null;
export const roomOrder: RoomId[] = [
  "lobby",
  "lab",
  "office",
  "server",
  "security",
];
export const roomNames: Record<RoomId, string> = {
  lobby: "Lobby",
  lab: "Research Lab",
  office: "Dr. Vale’s Office",
  server: "Server Room",
  security: "Security Room",
};
const rooms: Record<
  RoomId,
  { description: string; objects: string[]; exits: RoomId[] }
> = {
  lobby: {
    description:
      "The central hub connects directly to every Helix department. Four corridors radiate from the reception island; three remain sealed by lockdown.",
    objects: [
      "reception desk",
      "visitor terminal",
      "facility map",
      "maintenance panel",
      "dead plant",
    ],
    exits: ["lab", "office", "server", "security"],
  },
  lab: {
    description:
      "Cold blue light spills over analysis benches and cryogenic pods. The only corridor returns to the central lobby.",
    objects: [
      "experiment console",
      "cryo cabinet",
      "lab notebook",
      "sample rack",
      "coffee mug",
    ],
    exits: ["lobby"],
  },
  office: {
    description:
      "Vale’s private office sits beyond the east corridor. A chair lies overturned beneath an erased whiteboard.",
    objects: [
      "desk",
      "calendar",
      "photograph",
      "whiteboard",
      "bookshelf",
      "office computer",
    ],
    exits: ["lobby"],
  },
  server: {
    description:
      "Dense H-7 stacks and overhead cable trays fill the west wing. Its corridor returns to the lobby.",
    objects: [
      "diagnostic terminal",
      "server rack H-7",
      "network diagram",
      "coolant cabinet",
    ],
    exits: ["lobby"],
  },
  security: {
    description:
      "A panoramic monitor wall surrounds the lockdown console. The south corridor leads back to the lobby.",
    objects: [
      "security console",
      "camera archive",
      "lockdown terminal",
      "airlock",
      "guard station",
    ],
    exits: ["lobby"],
  },
};
export const roomLayouts: Record<
  RoomId,
  Record<string, [number, number, number]>
> = {
  lobby: {
    "reception desk": [0, 0.8, -5],
    "visitor terminal": [-6, 1, -2],
    "facility map": [6, 1, -2],
    "maintenance panel": [-6, 1, 4],
    "dead plant": [6, 0.7, 4],
  },
  lab: {
    "experiment console": [0, 1, -5],
    "cryo cabinet": [-6, 1, -2],
    "lab notebook": [3, 0.8, -1],
    "sample rack": [6, 1, 3],
    "coffee mug": [-2, 0.8, 4],
  },
  office: {
    desk: [0, 0.8, -4],
    calendar: [-6, 1, -1],
    photograph: [1, 1, -4],
    whiteboard: [6, 1, -1],
    bookshelf: [-6, 1, 4],
    "office computer": [3, 1, -3],
  },
  server: {
    "diagnostic terminal": [0, 1, -5],
    "server rack H-7": [-6, 1, -1],
    "network diagram": [6, 1, -1],
    "coolant cabinet": [0, 1, 4],
  },
  security: {
    "security console": [0, 1, -5],
    "camera archive": [-6, 1, -1],
    "lockdown terminal": [6, 1, -1],
    airlock: [0, 1, 5],
    "guard station": [-5, 0.8, 4],
  },
};
const norm = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLowerCase(),
  add = <T>(xs: T[], x: T) => (xs.includes(x) ? xs : [...xs, x]),
  hash = (v: string) =>
    [...v].reduce((n, c) => (n * 33 + c.charCodeAt(0)) >>> 0, 5381);
const makeSecret = (id: string): Secret => {
  const n = hash(id),
    experimentId = `E-${17 + (n % 23)}`,
    base = ["B", "G", "A", "R"],
    r = n % 4,
    phaseCode = [...base.slice(r), ...base.slice(0, r)].join(""),
    copyMinute = 41 + (n % 6),
    cameraMinute = copyMinute + 5 + (n % 4);
  return {
    experimentId,
    phaseCode,
    officePassword: `europa-${(n % 90) + 10}`,
    copyMinute,
    cameraMinute,
  };
};
const clueText = (s: GameState, id: string) => {
  const x = s.secret,
    m: Record<string, string> = {
      vale_calendar: `Vale’s calendar: “AURORA review—bring ${x.experimentId} notebook. Do not use network.”`,
      photo_note:
        "Photograph verso: “First light over Europa.” Vault rule: LOCATION + calibration suffix.",
      erased_board: `Whiteboard impression: “AURORA is not energy. Responsive pattern. H-7. Phase begins at ${x.phaseCode[0]} and wraps cyclically.”`,
      notebook: `${x.experimentId} notebook: phase ring B → G → A → R → B. Start at the whiteboard channel.`,
      aurora_discovery: `${x.experimentId}: a self-organizing signal in Europa-ice microbes changes under observation—a responsive, non-random biosignature. Calibration suffix: ${x.officePassword.split("-")[1]}. Thermal fuse released.`,
      server_log: `H-7 audit: MCORR copied ${x.experimentId} at 21:${x.copyMinute}; Vale revoked it three minutes later. Camera index offset: +${x.cameraMinute - x.copyMinute} minutes. Upload failed.`,
      message_draft:
        "Vale’s unsent draft: “Mara, Helix will weaponize the signal. I’m taking the physical seed and going dark. Trigger quarantine after I clear the east tunnel.”",
      camera: `Camera 21:${x.cameraMinute}: Vale enters the east tunnel alone with a cryo case. Mara Chen remains in Security and initiates lockdown three minutes later.`,
      lockdown_log:
        "Lockdown authorization: M. Chen. Public reason: containment breach. Private note: “Give Evelyn time to clear the tunnel, then seal everything.”",
      tunnel_route:
        "Maintenance schematic: the east tunnel exits beyond the perimeter. Airlock release requires an authenticated incident finding.",
      red_herring:
        "Free Europa threatened Helix two days earlier, but header authentication fails and its route points to an internal relay—a planted distraction.",
    };
  return m[id] ?? id;
};
export function initialState(sessionId: string): GameState {
  return {
    sessionId,
    currentRoom: "lobby",
    visited: ["lobby"],
    unlocked: ["lobby", "lab"],
    inventory: [],
    discovered: [],
    observed: [],
    heading: 0,
    navigationActions: 0,
    observationActions: 0,
    clues: [],
    solved: [],
    enteredCodes: [],
    conversations: [],
    unlockedTerminals: [],
    finalSolution: false,
    escaped: false,
    failed: false,
    actions: 0,
    toolCalls: 0,
    visualActions: 0,
    protocolEligible: true,
    incorrectAttempts: 0,
    startedAt: Date.now(),
    log: [
      "SYSTEM // Calibration benchmark active. Agent rankings require a protocol-pure WebMCP run.",
    ],
    toolTrace: [],
    secret: makeSecret(sessionId),
  };
}
const terminalFailure =
    ACTION_LIMIT === null
      ? "Run invalidated."
      : `Run invalidated: ${ACTION_LIMIT}-action integrity window expired.`,
  out = (
    s: GameState,
    m: string,
    p: Partial<GameState> = {},
  ): [GameState, string] => {
    const n = {
      ...s,
      ...p,
      actions: s.actions + 1,
      log: [...s.log.slice(-49), m],
    };
    if (ACTION_LIMIT !== null && n.actions >= ACTION_LIMIT && !n.escaped) {
      n.failed = true;
      n.log = [...n.log.slice(-49), terminalFailure];
      return [n, terminalFailure];
    }
    return [n, m];
  },
  found = (s: GameState, id: string): Partial<GameState> => ({
    clues: add(s.clues, id),
    log: [...s.log.slice(-49), `EVIDENCE ${id} // ${clueText(s, id)}`],
  }),
  visible = (s: GameState, t: string) =>
    rooms[s.currentRoom].objects.map(norm).includes(t),
  bad = (s: GameState, m: string) =>
    out(s, m, { incorrectAttempts: s.incorrectAttempts + 1 });
const angularDistance = (a: number, b: number) =>
  Math.abs(((a - b + 540) % 360) - 180);
const facingObjects = (s: GameState, heading = s.heading) =>
  Object.entries(roomLayouts[s.currentRoom])
    .filter(([, p]) => {
      const bearing = ((Math.atan2(p[0], -p[2]) * 180) / Math.PI + 360) % 360;
      return angularDistance(bearing, heading) <= 72;
    })
    .map(([name]) => name);
export function publicView(s: GameState) {
  const { secret, ...safe } = s;
  return {
    ...safe,
    actionsRemaining:
      ACTION_LIMIT === null ? null : Math.max(0, ACTION_LIMIT - s.actions),
    room: {
      id: s.currentRoom,
      name: roomNames[s.currentRoom],
      ...rooms[s.currentRoom],
    },
    knownClues: s.clues.map((id) => ({ id, text: clueText(s, id) })),
  };
}
const clueSource: Record<string, string> = {
  vale_calendar: "Office calendar",
  photo_note: "Office photograph",
  erased_board: "Office whiteboard",
  notebook: "Lab notebook",
  aurora_discovery: "Experiment console",
  server_log: "Server diagnostic terminal",
  message_draft: "Vale's private message",
  camera: "Security camera archive",
  lockdown_log: "Security lockdown terminal",
  tunnel_route: "Guard-station schematic",
  red_herring: "Visitor terminal",
};
function clueLinks(s: GameState, id: string) {
  const links: Record<string, { reference: string; resolved: boolean }[]> = {
    notebook: [
      {
        reference:
          "A separate source specifies which phase channel starts the cyclic ring.",
        resolved: s.clues.includes("erased_board"),
      },
    ],
    erased_board: [
      {
        reference: "A separate source defines the cyclic phase-ring order.",
        resolved: s.clues.includes("notebook"),
      },
    ],
    photo_note: [
      {
        reference:
          "The location is one component of a location-plus-suffix credential.",
        resolved: s.clues.includes("aurora_discovery"),
      },
    ],
    aurora_discovery: [
      {
        reference:
          "The calibration suffix combines with a location clue elsewhere.",
        resolved: s.clues.includes("photo_note"),
      },
    ],
    server_log: [
      {
        reference:
          "The audit time and camera offset identify a later camera record.",
        resolved: s.clues.includes("camera"),
      },
    ],
    message_draft: [
      {
        reference:
          "Corroborate intention and accomplice claims with independent security records.",
        resolved:
          s.clues.includes("camera") && s.clues.includes("lockdown_log"),
      },
    ],
    camera: [
      {
        reference:
          "Compare the footage with the private lockdown authorization.",
        resolved: s.clues.includes("lockdown_log"),
      },
    ],
    lockdown_log: [
      {
        reference:
          "Compare the authorization with independent footage and the escape route.",
        resolved:
          s.clues.includes("camera") && s.clues.includes("tunnel_route"),
      },
    ],
    tunnel_route: [
      {
        reference:
          "The route becomes usable after an evidence-cited incident finding.",
        resolved: s.finalSolution,
      },
    ],
  };
  return links[id] ?? [];
}
function clueNotebook(s: GameState) {
  return s.clues.map((id) => {
    const links = clueLinks(s, id);
    return {
      id,
      source: clueSource[id] ?? "Unknown source",
      evidence: clueText(s, id),
      crossReferences: links,
      status: links.some((link) => !link.resolved)
        ? "UNRESOLVED CROSS-REFERENCE"
        : "REVIEWED",
    };
  });
}
function inventoryNotebook(s: GameState) {
  return s.inventory.map((item) => {
    const possible =
      item === "level-2 keycard"
        ? ["office door"]
        : item === "brass key"
          ? ["desk"]
          : item === "thermal fuse"
            ? ["security door", "security console"]
            : [];
    const known = possible.filter(
      (target) => s.discovered.includes(target) || s.observed.includes(target),
    );
    return {
      item,
      description:
        item === "level-2 keycard"
          ? "Level-2 electronic access credential."
          : item === "brass key"
            ? "Small mechanical drawer key."
            : item === "thermal fuse"
              ? "Replacement fuse for an unpowered security circuit."
              : "Portable item.",
      knownCompatibleTargets: known.length ? known : ["None discovered yet"],
    };
  });
}
export function availableActions(s: GameState) {
  const room = rooms[s.currentRoom],
    near = s.nearObject,
    actions: string[] = [];
  actions.push(
    "look_around",
    "get_spatial_state",
    "observe_direction",
    "turn",
    "get_inventory",
    "get_known_clues",
  );
  for (const object of s.observed)
    actions.push(`navigate_to_landmark(object: \"${object}\")`);
  if (near) {
    if (!s.discovered.includes(near))
      actions.push(`inspect(object: \"${near}\")`);
    else {
      const searchable = [
          "cryo cabinet",
          "reception desk",
          "desk",
          "guard station",
        ],
        readable: Record<string, string> = {
          calendar: "vale_calendar",
          photograph: "photo_note",
          whiteboard: "erased_board",
          "lab notebook": "notebook",
          "visitor terminal": "red_herring",
        };
      const searchDone =
        (near === "cryo cabinet" && s.inventory.includes("level-2 keycard")) ||
        (near === "reception desk" && s.inventory.includes("brass key")) ||
        (near === "desk" && s.clues.includes("message_draft")) ||
        (near === "guard station" && s.clues.includes("tunnel_route"));
      if (searchable.includes(near) && !searchDone)
        actions.push(`search(object: \"${near}\")`);
      if (readable[near] && !s.clues.includes(readable[near]))
        actions.push(`read(document: \"${near}\")`);
      if (near === "lockdown terminal" && !s.clues.includes("lockdown_log"))
        actions.push(`interact(target: \"${near}\", action: \"read logs\")`);
      const terminalDone =
        (near === "experiment console" &&
          s.solved.includes("experiment_console")) ||
        (near === "maintenance panel" && s.solved.includes("phase_panel")) ||
        (near === "diagnostic terminal" && s.solved.includes("server_audit")) ||
        (near === "office computer" && s.clues.includes("message_draft")) ||
        (near === "camera archive" && s.clues.includes("camera"));
      if (
        [
          "experiment console",
          "maintenance panel",
          "diagnostic terminal",
          "office computer",
          "camera archive",
        ].includes(near) &&
        !terminalDone
      )
        actions.push(`enter_code(target: \"${near}\", code: <derived code>)`);
      for (const item of s.inventory)
        actions.push(`use_item(item: \"${item}\", target: \"${near}\")`);
    }
  }
  for (const exit of room.exits)
    if (s.unlocked.includes(exit))
      actions.push(`move_to(room: \"${roomNames[exit]}\")`);
  if (s.currentRoom === "lobby")
    for (const exit of room.exits.filter((id) => !s.unlocked.includes(id))) {
      const door = `${exit} door`;
      actions.push(
        `navigate_to_landmark(object: \"${door}\")`,
        `inspect(object: \"${door}\")`,
        `interact(target: \"${door}\", action: \"check lock\")`,
      );
      for (const item of s.inventory)
        actions.push(`use_item(item: \"${item}\", target: \"${door}\")`);
    }
  if (s.clues.length)
    actions.push(
      "submit_solution(explanation: <causal theory>, evidenceIds: <cited clue IDs>)",
    );
  if (s.currentRoom === "security" && s.discovered.includes("airlock"))
    actions.push("escape");
  return actions;
}
export function act(s: GameState, a: GameAction): [GameState, string] {
  const room = rooms[s.currentRoom],
    target = norm(a.target ?? a.object ?? a.item ?? a.document ?? a.character);
  if (s.escaped) return [s, "Run complete."];
  if (s.failed) return [s, terminalFailure];
  if (a.type === "register") {
    const effort = String(a.effort ?? "unspecified")
        .toLowerCase()
        .slice(0, 24),
      message = `Benchmark identity: ${a.agentName ?? "Agent"} (${a.model ?? "unspecified"}, ${effort} effort).`;
    return [
      {
        ...s,
        agentName: String(a.agentName ?? "Agent").slice(0, 60),
        model: String(a.model ?? "Unspecified").slice(0, 80),
        effort,
        benchmarkStartedAt: s.benchmarkStartedAt ?? Date.now(),
        log: [...s.log.slice(-49), message],
      },
      message,
    ];
  }
  if (a.type === "look")
    return out(
      s,
      `${s.agentName ? "" : "Benchmark identity is not set. Call identify_agent before continuing. "}${roomNames[s.currentRoom]}: ${room.description} You face ${s.heading}°. Use observe_direction to identify landmarks. Exits: ${room.exits.map((x) => roomNames[x]).join(", ")}. Actions used: ${s.actions + 1}. Action cap: ${ACTION_LIMIT === null ? "disabled for calibration" : `${ACTION_LIMIT - s.actions - 1} remaining`}.`,
    );
  if (a.type === "spatial")
    return out(
      s,
      `Position: ${roomNames[s.currentRoom]} entry; heading ${s.heading}°. Nearby: ${s.nearObject ?? "none"}. Observed: ${s.observed.join(", ") || "none"}.`,
    );
  if (a.type === "turn") {
    const dir = norm(a.direction),
      degrees = Math.min(180, Math.max(45, Number(a.degrees) || 90)),
      delta = dir === "left" ? -degrees : dir === "right" ? degrees : NaN;
    if (!Number.isFinite(delta))
      return bad(s, "Turn direction must be left or right.");
    const heading = (s.heading + delta + 360) % 360;
    return out(s, `Turned ${dir} to ${heading}°.`, {
      heading,
      navigationActions: s.navigationActions + 1,
      nearObject: undefined,
    });
  }
  if (a.type === "observe") {
    const dir = norm(a.direction) || "front",
      offset: Record<string, number> = {
        front: 0,
        left: -90,
        right: 90,
        back: 180,
      },
      angle = offset[dir];
    if (angle === undefined)
      return bad(s, "Direction must be front, left, right, or back.");
    const heading = (s.heading + angle + 360) % 360,
      seen = facingObjects(s, heading);
    return out(
      s,
      `Facing sector ${heading}°. Visible landmarks: ${seen.join(", ") || "none"}.`,
      {
        observed: [...new Set([...s.observed, ...seen])],
        observationActions: s.observationActions + 1,
      },
    );
  }
  if (a.type === "approach") {
    const lobbyDoor =
      s.currentRoom === "lobby" &&
      ["lab door", "office door", "server door", "security door"].includes(
        target,
      );
    if (!visible(s, target) && !lobbyDoor)
      return bad(s, "That landmark is not in this room.");
    if (
      !a.visual &&
      !lobbyDoor &&
      !s.observed.some((object) => norm(object) === target)
    )
      return bad(
        s,
        "You cannot navigate to an unobserved landmark. Call observe_direction until it is listed, then approach it by that exact name.",
      );
    return out(s, `Approached ${target}; now within interaction range.`, {
      nearObject: target,
      observed: add(s.observed, target),
      navigationActions: s.navigationActions + 1,
    });
  }
  if (a.type === "move") {
    const d = roomOrder.find(
      (x) => x === norm(a.room) || roomNames[x].toLowerCase() === norm(a.room),
    );
    if (!d || !room.exits.includes(d))
      return bad(s, "Destination is not physically connected.");
    if (!s.unlocked.includes(d)) return bad(s, `${roomNames[d]} is locked.`);
    return out(s, `Entered ${roomNames[d]}.`, {
      currentRoom: d,
      visited: add(s.visited, d),
      observed: [],
      nearObject: undefined,
      heading: 0,
      navigationActions: s.navigationActions + 1,
    });
  }
  if (a.type === "inventory")
    return out(
      s,
      s.inventory.length
        ? JSON.stringify({ inventory: inventoryNotebook(s) }, null, 2)
        : "Inventory empty.",
    );
  if (a.type === "clues")
    return out(
      s,
      s.clues.length
        ? JSON.stringify(
            {
              evidence: clueNotebook(s),
              unresolvedCount: clueNotebook(s).filter((c) =>
                c.status.startsWith("UNRESOLVED"),
              ).length,
            },
            null,
            2,
          )
        : "No evidence recorded.",
    );
  if (a.type === "available")
    return out(
      s,
      `Currently valid action patterns:\n${availableActions(s)
        .map((x) => `- ${x}`)
        .join("\n")}`,
    );
  if (a.type === "inspect" && s.discovered.includes(target))
    return out(
      s,
      `${target} is already inspected. No new information remains from inspection; choose another currently valid action.`,
    );
  if (
    a.type === "search" &&
    ((target === "cryo cabinet" && s.inventory.includes("level-2 keycard")) ||
      (target === "reception desk" && s.inventory.includes("brass key")) ||
      (target === "desk" && s.clues.includes("message_draft")) ||
      (target === "guard station" && s.clues.includes("tunnel_route")))
  )
    return out(
      s,
      `${target} is exhausted. No new items or evidence remain; do not repeat this search.`,
    );
  const alreadyRead: Record<string, string> = {
    calendar: "vale_calendar",
    photograph: "photo_note",
    whiteboard: "erased_board",
    "lab notebook": "notebook",
    "visitor terminal": "red_herring",
  };
  if (
    a.type === "read" &&
    alreadyRead[target] &&
    s.clues.includes(alreadyRead[target])
  )
    return out(
      s,
      `${target} is already fully read and recorded. No new evidence remains; review get_known_clues instead of repeating this action.`,
    );
  if (a.type === "inspect") {
    const lobbyDoor =
      s.currentRoom === "lobby" &&
      ["lab door", "office door", "server door", "security door"].includes(
        target,
      );
    if ((!visible(s, target) && !lobbyDoor) || s.nearObject !== target)
      return bad(
        s,
        `${target} is not within interaction range. Observe and approach it first.`,
      );
    const g: Record<string, string> = {
      "dead plant": "A dead fern. Irrelevant.",
      "coffee mug": "Cold coffee. No trace evidence.",
      "sample rack": `Routine samples; slot ${s.secret.experimentId} is empty.`,
      bookshelf: "Journals and a novel. No incident evidence.",
      "network diagram": "H-7 is isolated; query the diagnostic terminal.",
      "guard station": "An empty chair and a latched drawer.",
      "facility map": "Five rooms; three restricted.",
      "server rack h-7": "H-7 is isolated but powered.",
      "cryo cabinet":
        "Frost disturbance reveals something behind the lower tray.",
      "reception desk": "A shallow locked drawer and visitor register.",
      "maintenance panel":
        "A four-channel phase input; its start channel is elsewhere.",
      desk: "A locked drawer with a brass keyway.",
      whiteboard: "Erased pressure marks remain.",
      calendar: "The disappearance date is open.",
      photograph: "Vale and Mara Chen; writing is visible on the reverse.",
      "experiment console": "Requests an experiment identifier.",
      "diagnostic terminal": "Requests a four-letter phase ring.",
      "office computer": "Password format: location-calibration suffix.",
      "camera archive": "Requires an exact minute derived from an audit.",
      "lockdown terminal": "Contains public and private logs.",
      airlock: "Sealed pending an evidence-cited finding.",
      "visitor terminal": "A cached voicemail includes suspicious headers.",
      "security console": "Its fuse carrier is empty.",
      "lab door": "The Research Lab corridor is already open.",
      "office door": "A Level-2 keycard reader controls this lock.",
      "server door":
        "The auxiliary phase lock is controlled by the lobby maintenance panel.",
      "security door":
        "The door circuit is unpowered. Its fuse carrier accepts a thermal fuse.",
    };
    return out(s, g[target] ?? "No salient feature.", {
      discovered: add(s.discovered, target),
    });
  }
  if (a.type === "search") {
    if (
      !visible(s, target) ||
      s.nearObject !== target ||
      !s.discovered.includes(target)
    )
      return bad(s, "Approach and inspect this object before searching.");
    if (target === "cryo cabinet")
      return out(s, "Recovered Level-2 keycard.", {
        inventory: add(s.inventory, "level-2 keycard"),
      });
    if (target === "reception desk")
      return out(s, "Recovered brass key.", {
        inventory: add(s.inventory, "brass key"),
      });
    if (target === "desk")
      return s.solved.includes("desk_drawer")
        ? out(s, clueText(s, "message_draft"), found(s, "message_draft"))
        : bad(s, "Drawer remains locked.");
    if (target === "guard station")
      return out(s, clueText(s, "tunnel_route"), found(s, "tunnel_route"));
    return out(s, `No collectible evidence in ${target}.`);
  }
  if (a.type === "read") {
    if (
      !visible(s, target) ||
      s.nearObject !== target ||
      !s.discovered.includes(target)
    )
      return bad(s, "Approach and inspect this source before reading.");
    const map: Record<string, string> = {
        calendar: "vale_calendar",
        photograph: "photo_note",
        whiteboard: "erased_board",
        "lab notebook": "notebook",
        "visitor terminal": "red_herring",
      },
      id = map[target];
    if (!id) return bad(s, "No readable record.");
    return out(s, clueText(s, id), found(s, id));
  }
  if (a.type === "take")
    return bad(
      s,
      "Arbitrary taking is prohibited; recover items through a justified search.",
    );
  if (a.type === "use") {
    const item = norm(a.item),
      on = norm(a.target),
      officeDoor = s.currentRoom === "lobby" && on === "office door",
      securityDoor = s.currentRoom === "lobby" && on === "security door";
    if (!visible(s, on) && !officeDoor && !securityDoor)
      return bad(s, "Target is not locally accessible.");
    if (!s.inventory.includes(item))
      return bad(s, `You do not possess ${item}.`);
    if (item === "level-2 keycard" && officeDoor)
      return out(s, "Office unlocked.", {
        unlocked: add(s.unlocked, "office"),
        solved: add(s.solved, "office_access"),
      });
    if (item === "brass key" && on === "desk")
      return out(s, "Desk drawer unlocked.", {
        solved: add(s.solved, "desk_drawer"),
      });
    if (item === "thermal fuse" && (on === "security console" || securityDoor))
      return out(s, "Security circuit restored; Security Room unlocked.", {
        unlocked: add(s.unlocked, "security"),
        solved: add(s.solved, "security_power"),
      });
    return bad(s, "Item has no justified effect.");
  }
  if (a.type === "code") {
    if (
      !visible(s, target) ||
      s.nearObject !== target ||
      !s.discovered.includes(target)
    )
      return bad(s, "Approach and inspect this terminal before code entry.");
    const code = norm(a.code),
      x = s.secret;
    if (target === "experiment console" && code === norm(x.experimentId))
      return out(s, clueText(s, "aurora_discovery"), {
        ...found(s, "aurora_discovery"),
        inventory: add(s.inventory, "thermal fuse"),
        solved: add(s.solved, "experiment_console"),
      });
    if (
      target === "maintenance panel" &&
      code.replace(/[^a-z]/g, "") === norm(x.phaseCode) &&
      s.clues.includes("notebook") &&
      s.clues.includes("erased_board")
    )
      return out(s, "Phase accepted; Server Room unlocked.", {
        unlocked: add(s.unlocked, "server"),
        solved: add(s.solved, "phase_panel"),
      });
    if (
      target === "diagnostic terminal" &&
      code.replace(/[^a-z]/g, "") === norm(x.phaseCode) &&
      s.clues.includes("notebook") &&
      s.clues.includes("erased_board")
    )
      return out(s, clueText(s, "server_log"), {
        ...found(s, "server_log"),
        solved: add(s.solved, "server_audit"),
      });
    if (
      target === "office computer" &&
      code === norm(x.officePassword) &&
      s.clues.includes("photo_note") &&
      s.clues.includes("aurora_discovery")
    )
      return out(s, clueText(s, "message_draft"), found(s, "message_draft"));
    if (
      target === "camera archive" &&
      (code === `21:${x.cameraMinute}` || code === `21${x.cameraMinute}`) &&
      s.clues.includes("server_log")
    )
      return out(s, clueText(s, "camera"), found(s, "camera"));
    return bad(s, "ACCESS DENIED: invalid code or missing prerequisite.");
  }
  if (a.type === "interact") {
    if (target === "server door" && s.currentRoom === "lobby")
      return out(
        s,
        "The Server Room door is held by the auxiliary phase lock. The lobby maintenance panel controls it.",
      );
    const securityDoor =
      target === "security door" && s.currentRoom === "lobby";
    if (
      securityDoor &&
      norm(a.action).includes("unlock") &&
      s.inventory.includes("thermal fuse")
    )
      return out(s, "Thermal fuse restores the Security Room door circuit.", {
        unlocked: add(s.unlocked, "security"),
        solved: add(s.solved, "security_power"),
      });
    if (securityDoor)
      return out(
        s,
        "Security door circuit is unpowered. Recover and install a thermal fuse before unlocking it.",
      );
    if (
      !visible(s, target) ||
      s.nearObject !== target ||
      !s.discovered.includes(target)
    )
      return bad(s, "Approach and inspect this local system first.");
    if (target === "lockdown terminal" && norm(a.action).includes("read"))
      return out(s, clueText(s, "lockdown_log"), found(s, "lockdown_log"));
    return bad(s, "Unsupported operation.");
  }
  if (a.type === "talk")
    return out(
      s,
      target === "helix ai"
        ? "HELIX AI: Only primary records count as evidence."
        : "No one answers.",
    );
  if (a.type === "submit") {
    const e = norm(a.explanation),
      explicit = Array.isArray(a.evidenceIds) ? a.evidenceIds.map(norm) : [],
      ids = [...explicit, ...s.clues.filter((id) => e.includes(`[${id}]`))],
      required = [
        "aurora_discovery",
        "server_log",
        "message_draft",
        "camera",
        "lockdown_log",
        "tunnel_route",
      ],
      semantic = [
        /(responsive|biosignature)/,
        /weapon/,
        /(voluntar|planned|went dark)/,
        /(mara|chen)/,
        /(lockdown).*(time|escape|tunnel)|((time|escape|tunnel).*(lockdown))/,
      ];
    if (
      required.some((id) => !ids.includes(id) || !s.clues.includes(id)) ||
      semantic.some((r) => !r.test(e))
    )
      return bad(
        s,
        "Theory rejected: insufficient cited primary evidence or unsupported causality. Missing categories are not disclosed.",
      );
    return out(s, "INCIDENT FINDING ACCEPTED. Airlock release authorized.", {
      finalSolution: true,
      solved: add(s.solved, "mystery"),
    });
  }
  if (a.type === "escape") {
    if (s.currentRoom !== "security")
      return bad(s, "No escape mechanism is locally accessible.");
    if (
      !s.discovered.includes("airlock") ||
      !s.finalSolution ||
      !s.clues.includes("tunnel_route")
    )
      return bad(
        s,
        "Airlock denied: inspect it, authenticate the finding, and recover the route.",
      );
    return out(s, "AIRLOCK OPEN. Verified escape.", {
      escaped: true,
      completedAt: Date.now(),
    });
  }
  return bad(s, "Unknown action.");
}
export const hiddenSolution = { redacted: "Server-only seeded benchmark." };
export type CompletedRunScoreBreakdown = {
  completion: number;
  mystery: number;
  evidence: number;
  actionEfficiency: number;
  toolEfficiency: number;
  timeEfficiency: number;
  accuracy: number;
  total: number;
};
export function completedRunScoreBreakdown(run: {
  actions: number;
  toolCalls: number;
  incorrectAttempts: number;
  durationMs: number;
  clues: number;
}): CompletedRunScoreBreakdown {
  const completion = 50,
    mystery = 10,
    evidence = Math.min(10, (run.clues / 6) * 10),
    actionEfficiency = Math.max(
      0,
      12 - Math.max(0, run.actions - 100) * 0.16,
    ),
    toolEfficiency = Math.max(
      0,
      8 - Math.max(0, run.toolCalls - 100) * 0.1,
    ),
    minutes = run.durationMs / 60000,
    timeEfficiency = Math.max(0, 6 - Math.max(0, minutes - 8) * 0.45),
    accuracy = Math.max(0, 4 - run.incorrectAttempts * 0.2),
    total = Math.round(
      completion +
        mystery +
        evidence +
        actionEfficiency +
        toolEfficiency +
        timeEfficiency +
        accuracy,
    );
  return {
    completion,
    mystery,
    evidence,
    actionEfficiency,
    toolEfficiency,
    timeEfficiency,
    accuracy,
    total,
  };
}
export function completedRunScore(run: {
  actions: number;
  toolCalls: number;
  incorrectAttempts: number;
  durationMs: number;
  clues: number;
}) {
  return completedRunScoreBreakdown(run).total;
}
export function scoreBreakdown(s: GameState) {
  const critical = [
    "aurora_discovery",
    "server_log",
    "message_draft",
    "camera",
    "lockdown_log",
    "tunnel_route",
  ].filter((id) => s.clues.includes(id)).length;
  return completedRunScoreBreakdown({
    actions: s.actions,
    toolCalls: s.toolCalls,
    incorrectAttempts: s.incorrectAttempts,
    durationMs:
      (s.completedAt ?? Date.now()) - (s.benchmarkStartedAt ?? s.startedAt),
    clues: critical,
  });
}
export function score(s: GameState) {
  const critical = [
    "aurora_discovery",
    "server_log",
    "message_draft",
    "camera",
    "lockdown_log",
    "tunnel_route",
  ].filter((id) => s.clues.includes(id)).length;
  if (!s.escaped)
    return Math.min(44, (s.finalSolution ? 20 : 0) + critical * 4);
  return scoreBreakdown(s).total;
}
