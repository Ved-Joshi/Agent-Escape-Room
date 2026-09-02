"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { roomNames, roomOrder, type GameAction, type RoomId } from "@/lib/game";
type AgentCommand = { id: number; action: GameAction };
type Props = {
  currentRoom: RoomId;
  unlocked: RoomId[];
  nearObject?: string;
  agentCommand?: AgentCommand;
  onApproach: (object: string) => void;
  onEnterRoom: (room: RoomId) => void;
};
const centers: Record<RoomId, [number, number]> = {
  lobby: [0, 0],
  lab: [0, -27],
  office: [27, 0],
  server: [-27, 0],
  security: [0, 27],
};
const layouts: Record<RoomId, Record<string, [number, number, number]>> = {
  lobby: {
    "reception desk": [0, 0.8, -4],
    "visitor terminal": [-5, 1, -2],
    "facility map": [5, 1, -2],
    "maintenance panel": [-5, 1, 4],
    "dead plant": [5, 0.7, 4],
  },
  lab: {
    "experiment console": [0, 1, -5],
    "cryo cabinet": [-5, 1, -2],
    "lab notebook": [3, 0.8, -1],
    "sample rack": [5, 1, 3],
    "coffee mug": [-2, 0.8, 4],
  },
  office: {
    desk: [0, 0.8, -4],
    calendar: [-5, 1, -1],
    photograph: [1, 1, -4],
    whiteboard: [5, 1, -1],
    bookshelf: [-5, 1, 4],
    "office computer": [3, 1, -3],
  },
  server: {
    "diagnostic terminal": [0, 1, -5],
    "server rack H-7": [-5, 1, -1],
    "network diagram": [5, 1, -1],
    "coolant cabinet": [0, 1, 4],
  },
  security: {
    "security console": [0, 1, -5],
    "camera archive": [-5, 1, -1],
    "lockdown terminal": [5, 1, -1],
    airlock: [0, 1, 5],
    "guard station": [-5, 0.8, 4],
  },
};

export default function ThreeFacility({
  currentRoom,
  unlocked,
  nearObject,
  agentCommand,
  onApproach,
  onEnterRoom,
}: Props) {
  const initialCenter = centers[currentRoom],
    cameraPose = useRef({
      x: initialCenter[0],
      y: 1.68,
      z: initialCenter[1] + 6,
      yaw: 0,
      pitch: 0,
    }),
    host = useRef<HTMLDivElement>(null),
    statusRef = useRef<HTMLElement>(null),
    roomRef = useRef(currentRoom),
    unlockedRef = useRef(unlocked),
    enterRef = useRef(onEnterRoom),
    approachRef = useRef(onApproach),
    commandHandlerRef = useRef<((action: GameAction) => void) | null>(null),
    latestCommandRef = useRef(agentCommand),
    processedCommandRef = useRef(0),
    [fallback, setFallback] = useState(false),
    setMessage = (value: string) => {
      if (statusRef.current) statusRef.current.textContent = value;
    };
  useEffect(() => {
    roomRef.current = currentRoom;
    enterRef.current = onEnterRoom;
    approachRef.current = onApproach;
  }, [currentRoom, onEnterRoom, onApproach]);
  useEffect(() => {
    unlockedRef.current = unlocked;
  }, [unlocked]);
  useEffect(() => {
    latestCommandRef.current = agentCommand;
    if (
      agentCommand &&
      agentCommand.id > processedCommandRef.current &&
      commandHandlerRef.current
    ) {
      processedCommandRef.current = agentCommand.id;
      commandHandlerRef.current(agentCommand.action);
    }
  }, [agentCommand]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const unlockedSet = new Set(unlockedRef.current);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010507);
    scene.fog = new THREE.FogExp2(0x02080a, 0.018);
    const camera = new THREE.PerspectiveCamera(
      70,
      el.clientWidth / el.clientHeight,
      0.1,
      140,
    );
    camera.position.set(
      cameraPose.current.x,
      cameraPose.current.y,
      cameraPose.current.z,
    );
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        depth: true,
        stencil: false,
        powerPreference: "high-performance",
      });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
    renderer.setSize(el.clientWidth, el.clientHeight, false);
    renderer.shadowMap.enabled = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    el.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xa8e7df, 0x10191b, 1.28));
    const emergency = new THREE.PointLight(0xf3ad55, 48, 46);
    emergency.position.set(0, 4, 0);
    scene.add(emergency);
    for (const [id, [x, z]] of Object.entries(centers) as [
      RoomId,
      [number, number],
    ][]) {
      const color =
        id === "office" ? 0xffc878 : id === "security" ? 0xa6fff4 : 0x87e8df;
      const light = new THREE.PointLight(
        color,
        id === "server" ? 32 : 40,
        21,
        1.55,
      );
      light.position.set(x, 4.1, z);
      scene.add(light);
    }
    const dustPositions = new Float32Array(900);
    for (let i = 0; i < dustPositions.length; i += 3) {
      dustPositions[i] = (Math.random() - 0.5) * 70;
      dustPositions[i + 1] = Math.random() * 4.8;
      dustPositions[i + 2] = (Math.random() - 0.5) * 70;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(dustPositions, 3),
    );
    scene.add(
      new THREE.Points(
        dustGeometry,
        new THREE.PointsMaterial({
          color: 0x9fd8d0,
          size: 0.018,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
        }),
      ),
    );
    const loader = new THREE.TextureLoader(),
      wayfindingTex = loader.load(
        "/materials/facility-wayfinding-hologram.png",
      ),
      biosignatureTex = loader.load(
        "/materials/europa-biosignature-display.png",
      ),
      securityTex = loader.load("/materials/security-operations-wall.png"),
      wallTex = loader.load("/materials/wall.png"),
      floorTex = loader.load("/materials/floor.png"),
      glassTex = loader.load("/materials/glass.png");
    for (const t of [wallTex, floorTex, glassTex]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
    }
    wallTex.repeat.set(3, 2);
    floorTex.repeat.set(5, 5);
    glassTex.repeat.set(2, 2);
    const wallMat = new THREE.MeshStandardMaterial({
        map: wallTex,
        color: 0x69817f,
        roughness: 0.58,
        metalness: 0.48,
      }),
      floorMat = new THREE.MeshStandardMaterial({
        map: floorTex,
        color: 0x75817f,
        roughness: 0.76,
        metalness: 0.22,
      }),
      dark = new THREE.MeshStandardMaterial({
        color: 0x293c40,
        roughness: 0.4,
        metalness: 0.67,
      }),
      metal = new THREE.MeshStandardMaterial({
        color: 0x617c79,
        roughness: 0.28,
        metalness: 0.76,
      }),
      cyan = new THREE.MeshStandardMaterial({
        map: glassTex,
        color: 0x75eadc,
        emissive: 0x0c8078,
        emissiveIntensity: 1.75,
        roughness: 0.2,
        metalness: 0.4,
      }),
      amber = new THREE.MeshStandardMaterial({
        color: 0xffbd65,
        emissive: 0x8a4e19,
        emissiveIntensity: 1.8,
      }),
      glass = new THREE.MeshStandardMaterial({
        color: 0xb0fff6,
        transparent: true,
        opacity: 0.29,
        roughness: 0.18,
        metalness: 0.12,
        depthWrite: false,
      });
    const mesh = (
      g: THREE.BufferGeometry,
      m: THREE.Material,
      x: number,
      y: number,
      z: number,
      name?: string,
    ) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = o.receiveShadow = true;
      if (name) o.userData.object = name;
      scene.add(o);
      return o;
    };
    const box = (
      w: number,
      h: number,
      d: number,
      m: THREE.Material,
      x: number,
      y: number,
      z: number,
      name?: string,
    ) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, name);
    const screen = (
      texture: THREE.Texture,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      rotationY = 0,
    ) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const panel = mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
        x,
        y,
        z,
      );
      panel.rotation.y = rotationY;
      return panel;
    };
    const labels: THREE.Sprite[] = [];
    const label = (
      text: string,
      x: number,
      y: number,
      z: number,
      scale = 3.4,
      room?: RoomId,
    ) => {
      const c = document.createElement("canvas");
      c.width = 768;
      c.height = 144;
      const q = c.getContext("2d")!;
      q.fillStyle = "#02090bf2";
      q.roundRect(6, 6, 756, 132, 18);
      q.fill();
      q.shadowColor = "#42ffe3";
      q.shadowBlur = 12;
      q.strokeStyle = "#72ffe9";
      q.lineWidth = 5;
      q.stroke();
      q.shadowBlur = 0;
      q.fillStyle = "#f0fffc";
      q.font = "700 37px ui-monospace, monospace";
      q.textAlign = "center";
      q.textBaseline = "middle";
      q.fillText(text.toUpperCase(), 384, 74, 704);
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(
        2,
        renderer.capabilities.getMaxAnisotropy(),
      );
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const s = new THREE.Sprite(material);
      s.position.set(x, y, z);
      s.scale.set(scale, 0.64, 1);
      s.renderOrder = 100;
      s.userData.room = room;
      labels.push(s);
      scene.add(s);
      return s;
    };
    const shell = (id: RoomId) => {
      const [cx, cz] = centers[id];
      box(16, 0.18, 16, floorMat, cx, -0.1, cz);
      box(16, 0.18, 16, dark, cx, 5.05, cz);
      const wallZ = (z: number, gap: boolean) =>
          gap
            ? [-5.25, 5.25].forEach((x) =>
                box(5.5, 5, 0.22, wallMat, cx + x, 2.5, cz + z),
              )
            : box(16, 5, 0.22, wallMat, cx, 2.5, cz + z),
        wallX = (x: number, gap: boolean) =>
          gap
            ? [-5.25, 5.25].forEach((z) =>
                box(0.22, 5, 5.5, wallMat, cx + x, 2.5, cz + z),
              )
            : box(0.22, 5, 16, wallMat, cx + x, 2.5, cz);
      wallZ(-8, id === "lobby");
      wallZ(8, id === "lobby" || id === "lab");
      wallX(-8, id === "lobby" || id === "office");
      wallX(8, id === "lobby" || id === "server");
      if (id === "security") wallZ(-8, true);
      const light = box(7, 0.08, 0.25, cyan, cx, 4.9, cz);
      light.castShadow = false;
      const names: { [K in RoomId]: string } = {
        lobby: "HELIX CENTRAL LOBBY",
        lab: "AURORA RESEARCH LAB",
        office: "DR. VALE · OFFICE",
        server: "H-7 SERVER CORE",
        security: "SECURITY CONTROL",
      };
      label(names[id], cx, 3.8, cz - 7.75, 4.8, id);
    };
    (Object.keys(centers) as RoomId[]).forEach(shell);
    const corridor = (x: number, z: number, w: number, d: number) => {
      box(w, 0.16, d, floorMat, x, -0.08, z);
      box(w, 0.16, d, dark, x, 5, z);
      if (w > d) {
        box(w, 5, 0.18, wallMat, x, 2.5, z - d / 2);
        box(w, 5, 0.18, wallMat, x, 2.5, z + d / 2);
      } else {
        box(0.18, 5, d, wallMat, x - w / 2, 2.5, z);
        box(0.18, 5, d, wallMat, x + w / 2, 2.5, z);
      }
    };
    corridor(0, -13.5, 5, 11);
    corridor(13.5, 0, 11, 5);
    corridor(-13.5, 0, 11, 5);
    corridor(0, 13.5, 5, 11);
    for (const z of [-16, -13, -10, 10, 13, 16]) {
      box(4.7, 0.12, 0.18, metal, 0, 4.65, z);
      box(2.7, 0.05, 0.12, cyan, 0, 4.55, z);
    }
    for (const x of [-16, -13, -10, 10, 13, 16]) {
      box(0.18, 0.12, 4.7, metal, x, 4.65, 0);
      box(0.12, 0.05, 2.7, cyan, x, 4.55, 0);
    }
    for (const [id, [cx, cz]] of Object.entries(centers) as [
      RoomId,
      [number, number],
    ][]) {
      for (const offset of [-6, -3, 0, 3, 6]) {
        box(0.12, 0.18, 15.5, metal, cx + offset, 4.72, cz);
        if (id === "server" || id === "lab") {
          const pipe = mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 14, 10),
            id === "lab" ? cyan : amber,
            cx + offset / 2,
            4.45,
            cz,
          );
          pipe.rotation.x = Math.PI / 2;
        }
      }
    }
    const doorTargets: { id: RoomId; x: number; z: number; rot: number }[] = [
      { id: "lab", x: 0, z: -19, rot: 0 },
      { id: "office", x: 19, z: 0, rot: Math.PI / 2 },
      { id: "server", x: -19, z: 0, rot: Math.PI / 2 },
      { id: "security", x: 0, z: 19, rot: 0 },
    ];
    const targets: THREE.Object3D[] = [],
      blockers: THREE.Object3D[] = [],
      doorMeshes = new Map<RoomId, THREE.Object3D>();
    doorTargets.forEach((d) => {
      const locked = !unlockedSet.has(d.id);
      const door = box(
        d.rot ? 0.35 : 4.6,
        4.2,
        d.rot ? 4.6 : 0.35,
        amber,
        d.x,
        2.1,
        d.z,
        `${d.id} door`,
      );
      door.visible = locked;
      doorMeshes.set(d.id, door);
      targets.push(door);
      blockers.push(door);
      for (const side of [-1, 1])
        box(
          d.rot ? 0.3 : 1.2,
          4,
          d.rot ? 1.2 : 0.3,
          metal,
          d.x + (d.rot ? 0 : side * 1.75),
          2,
          d.z + (d.rot ? side * 1.75 : 0),
        );
      label(
        `${d.id} · ACCESS`,
        d.x,
        3.3,
        d.z + (d.rot ? 0 : 0.3),
        2.5,
        "lobby",
      );
    });
    const objectBase = (id: RoomId, name: string) => {
      const [cx, cz] = centers[id],
        [lx, y, lz] = layouts[id][name],
        x = cx + lx,
        z = cz + lz;
      return {
        x,
        y,
        z,
        add: (o: THREE.Object3D) => {
          o.userData.object = name;
          targets.push(o);
        },
      };
    };
    // Lobby: curved reception island, holographic directory, access stations and living detail.
    {
      const [cx, cz] = centers.lobby,
        b = objectBase("lobby", "reception desk"),
        desk = mesh(
          new THREE.CylinderGeometry(
            3.2,
            3.5,
            1.15,
            32,
            1,
            false,
            0,
            Math.PI * 1.5,
          ),
          metal,
          cx,
          0.65,
          cz - 4,
          "reception desk",
        );
      b.add(desk);
      box(2.4, 1.5, 0.35, cyan, cx, 1.8, cz - 4);
      for (const x of [-4.8, 4.8]) {
        box(0.7, 1.1, 1.8, dark, cx + x, 0.55, cz + 1);
        box(0.4, 0.3, 1.1, cyan, cx + x, 1.15, cz + 1);
      }
      const map = box(
        3.4,
        2.2,
        0.18,
        cyan,
        cx + 5,
        1.8,
        cz - 2,
        "facility map",
      );
      targets.push(map);
      const visitor = box(
        1.1,
        2.1,
        0.8,
        dark,
        cx - 5,
        1.05,
        cz - 2,
        "visitor terminal",
      );
      targets.push(visitor);
      box(0.75, 0.55, 0.08, cyan, cx - 5, 1.5, cz - 1.55);
      const panel = box(
        1.2,
        1.7,
        0.3,
        dark,
        cx - 5,
        1.2,
        cz + 4,
        "maintenance panel",
      );
      targets.push(panel);
      for (let i = 0; i < 4; i++)
        box(
          0.13,
          0.4,
          0.08,
          i % 2 ? cyan : amber,
          cx - 5.35 + i * 0.24,
          1.25,
          cz + 4.17,
        );
      const plant = mesh(
        new THREE.CylinderGeometry(0.5, 0.65, 0.7, 18),
        dark,
        cx + 5,
        0.35,
        cz + 4,
        "dead plant",
      );
      targets.push(plant);
      for (let i = 0; i < 7; i++) {
        const branch = mesh(
          new THREE.CylinderGeometry(0.03, 0.08, 1.5, 7),
          new THREE.MeshStandardMaterial({ color: 0x334b3b }),
          cx + 5,
          0.9,
          cz + 4,
        );
        branch.rotation.z = (i - 3) * 0.22;
        branch.rotation.y = i;
      }
    }
    // Lab: benches, illuminated experiment rig, glass cryogenic pods and sample storage.
    {
      const [cx, cz] = centers.lab;
      for (const x of [-3, 3]) {
        box(5.2, 0.18, 1.7, metal, cx + x, 0.9, cz + 1.5);
        for (const dx of [-2, 2])
          box(0.16, 0.9, 1.4, dark, cx + x + dx, 0.45, cz + 1.5);
      }
      const consoleObj = box(
        3.2,
        1.4,
        1.2,
        dark,
        cx,
        0.8,
        cz - 5,
        "experiment console",
      );
      targets.push(consoleObj);
      box(2.6, 0.7, 0.08, cyan, cx, 1.35, cz - 4.37);
      for (const x of [-5, -3.7]) {
        const pod = mesh(
          new THREE.CylinderGeometry(0.8, 0.9, 3.2, 24),
          glass,
          cx + x,
          1.65,
          cz - 2,
          x === -5 ? "cryo cabinet" : undefined,
        );
        if (x === -5) targets.push(pod);
        mesh(
          new THREE.TorusGeometry(0.86, 0.12, 8, 24),
          metal,
          cx + x,
          0.25,
          cz - 2,
        ).rotation.x = Math.PI / 2;
        mesh(
          new THREE.TorusGeometry(0.86, 0.12, 8, 24),
          metal,
          cx + x,
          3.05,
          cz - 2,
        ).rotation.x = Math.PI / 2;
      }
      const notebook = box(
        0.8,
        0.08,
        1.05,
        amber,
        cx + 3,
        1.04,
        cz - 1,
        "lab notebook",
      );
      targets.push(notebook);
      const rack = box(
        2.2,
        2.3,
        0.75,
        metal,
        cx + 5,
        1.15,
        cz + 3,
        "sample rack",
      );
      targets.push(rack);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++)
          mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10),
            glass,
            cx + 4.45 + x * 0.35,
            0.7 + y * 0.42,
            cz + 2.55,
          ).rotation.x = Math.PI / 2;
      const mug = mesh(
        new THREE.CylinderGeometry(0.22, 0.19, 0.36, 16),
        dark,
        cx - 2,
        1.18,
        cz + 4,
        "coffee mug",
      );
      targets.push(mug);
    }
    // Office: executive desk, monitor, chair, shelves, whiteboard and personal evidence.
    {
      const [cx, cz] = centers.office;
      const desk = box(5, 0.3, 2.2, metal, cx, 0.85, cz - 4, "desk");
      targets.push(desk);
      for (const x of [-2, 2]) box(0.25, 0.8, 1.7, dark, cx + x, 0.4, cz - 4);
      const pc = box(
        2.3,
        1.35,
        0.16,
        dark,
        cx + 3,
        1.7,
        cz - 3,
        "office computer",
      );
      targets.push(pc);
      box(2.05, 1.08, 0.06, cyan, cx + 3, 1.7, cz - 2.9);
      const chair = mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 0.22, 20),
        dark,
        cx,
        0.7,
        cz - 1.8,
      );
      chair.rotation.z = 0.25;
      box(1.3, 1.6, 0.18, dark, cx, 1.35, cz - 2);
      const board = box(
        0.2,
        2.7,
        4.7,
        new THREE.MeshStandardMaterial({ color: 0xd2d8d1, roughness: 0.35 }),
        cx + 5,
        1.8,
        cz - 1,
        "whiteboard",
      );
      targets.push(board);
      const shelf = box(1.1, 3.4, 4.4, dark, cx - 5, 1.7, cz + 4, "bookshelf");
      targets.push(shelf);
      for (let y = 0; y < 4; y++)
        for (let z = 0; z < 5; z++)
          box(
            0.65,
            0.42,
            0.1,
            z % 2 ? amber : cyan,
            cx - 4.4,
            0.45 + y * 0.75,
            cz + 2.4 + z * 0.62,
          );
      const photo = box(
        0.9,
        0.65,
        0.08,
        amber,
        cx + 1,
        1.12,
        cz - 4,
        "photograph",
      );
      targets.push(photo);
      const cal = box(0.15, 1.7, 1.25, cyan, cx - 5, 1.6, cz - 1, "calendar");
      targets.push(cal);
    }
    // Server: dense illuminated racks, cable trays, diagnostic station and cooling machinery.
    {
      const [cx, cz] = centers.server;
      for (const x of [-5, -2, 2, 5]) {
        const rack = box(
          1.9,
          3.8,
          2.2,
          dark,
          cx + x,
          1.9,
          cz + 1,
          x === -5 ? "server rack H-7" : undefined,
        );
        if (x === -5) targets.push(rack);
        for (let y = 0; y < 8; y++) {
          box(1.55, 0.22, 0.08, metal, cx + x, 0.45 + y * 0.4, cz - 0.13);
          for (let l = 0; l < 4; l++)
            box(
              0.06,
              0.06,
              0.04,
              (l + y) % 3 ? cyan : amber,
              cx + x - 0.55 + l * 0.35,
              0.45 + y * 0.4,
              cz - 0.18,
            );
        }
      }
      for (const x of [-4, 0, 4]) box(0.28, 0.18, 13, metal, cx + x, 4.65, cz);
      const terminal = box(
        2.8,
        1.35,
        1.2,
        dark,
        cx,
        0.7,
        cz - 5,
        "diagnostic terminal",
      );
      targets.push(terminal);
      box(2.3, 0.62, 0.08, cyan, cx, 1.25, cz - 4.37);
      const network = box(
        3.6,
        2.4,
        0.16,
        cyan,
        cx + 5,
        1.7,
        cz - 1,
        "network diagram",
      );
      targets.push(network);
      const coolant = mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 2.8, 24),
        metal,
        cx,
        1.4,
        cz + 4,
        "coolant cabinet",
      );
      targets.push(coolant);
    }
    // Security: panoramic monitor wall, curved command console, guard station and mechanical airlock.
    {
      const [cx, cz] = centers.security;
      for (let i = -3; i <= 3; i++) {
        const screen = box(
          1.8,
          1.15,
          0.15,
          cyan,
          cx + i * 1.9,
          2.5,
          cz - 7.65,
          i === -3 ? "camera archive" : undefined,
        );
        if (i === -3) targets.push(screen);
      }
      const consoleObj = mesh(
        new THREE.CylinderGeometry(4.5, 4.8, 1.15, 32, 1, false, 0, Math.PI),
        dark,
        cx,
        0.65,
        cz - 4.2,
        "security console",
      );
      targets.push(consoleObj);
      for (let i = -2; i <= 2; i++)
        box(
          1.15,
          0.48,
          0.06,
          i === 0 ? amber : cyan,
          cx + i * 1.1,
          1.18,
          cz - 3.55,
        );
      const lock = box(
        1.4,
        2.2,
        0.55,
        dark,
        cx + 5,
        1.2,
        cz - 1,
        "lockdown terminal",
      );
      targets.push(lock);
      box(1.05, 1.35, 0.07, cyan, cx + 5, 1.35, cz - 0.7);
      const guard = box(
        2.8,
        0.22,
        1.5,
        metal,
        cx - 5,
        0.8,
        cz + 4,
        "guard station",
      );
      targets.push(guard);
      const air = mesh(
        new THREE.TorusGeometry(2.2, 0.42, 14, 40),
        metal,
        cx,
        2.35,
        cz + 7.55,
        "airlock",
      );
      air.rotation.x = Math.PI / 2;
      targets.push(air);
      box(3.4, 3.6, 0.28, dark, cx, 2.2, cz + 7.72);
    }
    screen(wayfindingTex, 5, 1.8, -1.88, 3.15, 1.78);
    screen(biosignatureTex, 0, 2.45, -34.72, 6.8, 3.82);
    screen(biosignatureTex, 30, 1.7, -2.88, 2.05, 1.15);
    screen(securityTex, -22, 1.75, -0.88, 3.35, 1.88);
    screen(securityTex, 0, 2.55, 19.46, 12.2, 3.35);
    for (const id of Object.keys(layouts) as RoomId[]) {
      const [cx, cz] = centers[id];
      Object.entries(layouts[id]).forEach(([name, [x, y, z]]) =>
        label(
          `E  ·  ${name}`,
          cx + x,
          Math.min(4.25, y + 2.25),
          cz + z,
          2.65,
          id,
        ),
      );
    }
    const raycaster = new THREE.Raycaster(),
      keys = new Set<string>();
    let yaw = cameraPose.current.yaw,
      pitch = cameraPose.current.pitch,
      frame = 0,
      last = performance.now(),
      candidate: THREE.Object3D | null = null,
      candidateProposal: THREE.Object3D | null = null,
      candidateProposalFrames = 0,
      lastHudText = "",
      lastHudAt = 0,
      targetYaw: number | null = null,
      targetPosition: THREE.Vector3 | null = null,
      targetFov = 70,
      agentVisualizationUntil = 0;
    const centerEntries = Object.entries(centers) as [
      RoomId,
      [number, number],
    ][];
    const insideWorld = (p: THREE.Vector3) => {
      for (const [, [x, z]] of centerEntries) {
        if (Math.abs(p.x - x) < 7.45 && Math.abs(p.z - z) < 7.45) return true;
      }
      return (
        (Math.abs(p.x) < 2.35 && Math.abs(p.z) < 20) ||
        (Math.abs(p.z) < 2.35 && Math.abs(p.x) < 20)
      );
    };
    const collision = (p: THREE.Vector3) => {
      if (!insideWorld(p)) return true;
      for (const b of blockers) {
        if (!b.visible) continue;
        if (
          Math.abs(p.x - b.position.x) < 2.5 &&
          Math.abs(p.z - b.position.z) < 2.5
        )
          return true;
      }
      return false;
    };
    const locate = (p: THREE.Vector3): RoomId => {
      let best: RoomId = "lobby",
        distance = Infinity;
      for (const [id, [x, z]] of centerEntries) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < distance) {
          distance = d;
          best = id;
        }
      }
      return best;
    };
    const engage = (target: THREE.Object3D) => {
      const name = target.userData.object as string;
      approachRef.current(name);
      setMessage(`INSPECTING · ${name.toUpperCase()}`);
      if (document.pointerLockElement === renderer.domElement)
        document.exitPointerLock();
    };
    const down = (e: KeyboardEvent) => {
        if (document.pointerLockElement !== renderer.domElement) return;
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "KeyW",
            "KeyA",
            "KeyS",
            "KeyD",
          ].includes(e.code)
        )
          e.preventDefault();
        keys.add(e.code);
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "KeyW",
            "KeyA",
            "KeyS",
            "KeyD",
          ].includes(e.code)
        ) {
          targetYaw = null;
          targetPosition = null;
        }
        if (e.code === "KeyE" && candidate) engage(candidate);
      },
      up = (e: KeyboardEvent) => keys.delete(e.code);
    const move = (e: MouseEvent) => {
        if (document.pointerLockElement !== renderer.domElement) return;
        targetYaw = null;
        yaw -= e.movementX * 0.0023;
        pitch = Math.max(-1.05, Math.min(1.05, pitch - e.movementY * 0.0023));
      },
      capture = () => {
        if (document.pointerLockElement === renderer.domElement && candidate) {
          engage(candidate);
          return;
        }
        renderer.domElement.requestPointerLock();
        setMessage("AIM AT A LABEL · CLICK OR PRESS E TO INTERACT");
      },
      resume = () => {
        renderer.domElement.requestPointerLock();
        setMessage("EXPLORATION RESUMED · AIM AT AN OBJECT");
      };
    const resolveRoom = (raw: unknown): RoomId | undefined => {
        const value = String(raw ?? "")
          .trim()
          .toLowerCase();
        return roomOrder.find(
          (id) => id === value || roomNames[id].toLowerCase() === value,
        );
      },
      arrivalFor = (
        room: RoomId,
        from: RoomId,
      ): { x: number; z: number; yaw: number } => {
        if (room === "lab") return { x: 0, z: -21.5, yaw: 0 };
        if (room === "security") return { x: 0, z: 21.5, yaw: Math.PI };
        if (room === "office") return { x: 21.5, z: 0, yaw: -Math.PI / 2 };
        if (room === "server") return { x: -21.5, z: 0, yaw: Math.PI / 2 };
        if (from === "lab") return { x: 0, z: -5.5, yaw: Math.PI };
        if (from === "security") return { x: 0, z: 5.5, yaw: 0 };
        if (from === "office") return { x: 5.5, z: 0, yaw: Math.PI / 2 };
        if (from === "server") return { x: -5.5, z: 0, yaw: -Math.PI / 2 };
        return { x: 0, z: 5.5, yaw: 0 };
      },
      facePoint = (x: number, z: number, from = camera.position) => {
        targetYaw = Math.atan2(-(x - from.x), -(z - from.z));
        pitch = 0;
      },
      doorPoints: Record<string, [number, number]> = {
        "lab door": [0, -19],
        "office door": [19, 0],
        "server door": [-19, 0],
        "security door": [0, 19],
      },
      approachNamed = (raw: string, authoritativeRoom?: RoomId) => {
        const name = raw.toLowerCase(),
          room = authoritativeRoom ?? roomRef.current,
          local = layouts[room]?.[name];
        let x: number, z: number;
        if (local) {
          const [cx, cz] = centers[room];
          x = cx + local[0];
          z = cz + local[2];
        } else if (doorPoints[name]) {
          [x, z] = doorPoints[name];
        } else return false;
        if (locate(camera.position) !== room) {
          const recovery = arrivalFor(room, locate(camera.position));
          camera.position.set(recovery.x, 1.68, recovery.z);
          yaw = recovery.yaw;
        }
        const [cx, cz] = centers[room],
          outwardX = x - cx,
          outwardZ = z - cz,
          fallbackX = camera.position.x - x,
          fallbackZ = camera.position.z - z,
          useFallback = Math.hypot(outwardX, outwardZ) < 0.5,
          dx = useFallback ? fallbackX : -outwardX,
          dz = useFallback ? fallbackZ : -outwardZ,
          length = Math.max(0.001, Math.hypot(dx, dz));
        targetPosition = new THREE.Vector3(
          x + (dx / length) * 3.4,
          1.68,
          z + (dz / length) * 3.4,
        );
        facePoint(x, z, targetPosition);
        return true;
      },
      animateAgentAction = (raw: GameAction) => {
        const a = raw as Record<string, unknown>;
        const authoritativeRoom = resolveRoom(a._visualRoom) ?? roomRef.current,
          authoritativeHeading = Number(a._visualHeading),
          authoritativeNear = String(a._visualNearObject ?? "").toLowerCase();
        agentVisualizationUntil = performance.now() + 2500;
        targetFov = 70;
        keys.clear();
        if (a.type === "turn") {
          targetYaw = Number.isFinite(authoritativeHeading)
            ? (-authoritativeHeading * Math.PI) / 180
            : yaw;
          setMessage(
            `AGENT TURNING ${String(a.direction).toUpperCase()} · ${a.degrees}°`,
          );
        } else if (a.type === "observe") {
          const logicalYaw = Number.isFinite(authoritativeHeading)
              ? (-authoritativeHeading * Math.PI) / 180
              : yaw,
            offset =
              a.direction === "left"
                ? Math.PI / 2
                : a.direction === "right"
                  ? -Math.PI / 2
                  : a.direction === "back"
                    ? Math.PI
                    : 0;
          targetYaw = logicalYaw + offset;
          setMessage(`AGENT SCANNING ${String(a.direction).toUpperCase()}`);
        } else if (a.type === "move") {
          const from = locate(camera.position),
            arrival = arrivalFor(authoritativeRoom, from);
          if (from !== authoritativeRoom) {
            targetPosition = new THREE.Vector3(arrival.x, 1.68, arrival.z);
            targetYaw = arrival.yaw;
            roomRef.current = authoritativeRoom;
          }
          setMessage(
            `AGENT MOVING · ${roomNames[authoritativeRoom].toUpperCase()}`,
          );
        } else if (["look", "spatial"].includes(String(a.type))) {
          if (Number.isFinite(authoritativeHeading))
            targetYaw = (-authoritativeHeading * Math.PI) / 180;
          setMessage("AGENT SYNCHRONIZING SPATIAL STATE");
        } else {
          const objectName = String(
              a.object ??
                a.document ??
                a.target ??
                (a.type === "escape" ? "airlock" : ""),
            ).toLowerCase(),
            verbs: Record<string, string> = {
              approach: "APPROACHING",
              inspect: "INSPECTING",
              search: "SEARCHING",
              read: "READING",
              use: "USING ITEM AT",
              code: "AUTHENTICATING",
              interact: "OPERATING",
            },
            verb = verbs[String(a.type)] ?? "ACTING ON";
          if (
            objectName &&
            authoritativeNear === objectName &&
            approachNamed(objectName, authoritativeRoom)
          ) {
            targetFov = a.type === "approach" ? 68 : 65;
            setMessage(`AGENT ${verb} · ${objectName.toUpperCase()}`);
          } else
            setMessage(
              `AGENT ACTION · ${String(a.type).replaceAll("_", " ").toUpperCase()}`,
            );
        }
      };
    const visualQueue: GameAction[] = [];
    let visualCommandActive = false,
      visualHoldUntil = 0;
    commandHandlerRef.current = (action) => {
      visualQueue.push(action);
      setMessage(
        `AGENT QUEUE · ${visualQueue.length} ACTION${visualQueue.length === 1 ? "" : "S"} PENDING`,
      );
    };
    const pendingCommand = latestCommandRef.current;
    if (pendingCommand && pendingCommand.id > processedCommandRef.current) {
      processedCommandRef.current = pendingCommand.id;
      visualQueue.push(pendingCommand.action);
    }
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("mousemove", move);
    addEventListener("helix-resume-world", resume);
    renderer.domElement.addEventListener("click", capture);
    const aimCenter = new THREE.Vector2(0, 0),
      worldPos = new THREE.Vector3(),
      forward = new THREE.Vector3(),
      right = new THREE.Vector3(),
      nextPosition = new THREE.Vector3(),
      viewProjection = new THREE.Matrix4(),
      viewFrustum = new THREE.Frustum(),
      nearbyTargets: THREE.Object3D[] = [];
    let lastInteractionCheck = 0;
    const updateInteractionTarget = (now: number) => {
      if (now - lastInteractionCheck < 90) return;
      lastInteractionCheck = now;
      for (const [id, door] of doorMeshes)
        door.visible = !unlockedRef.current.includes(id);
      nearbyTargets.length = 0;
      for (const target of targets) {
        if (!target.visible) continue;
        target.getWorldPosition(worldPos);
        if (worldPos.distanceToSquared(camera.position) < 100)
          nearbyTargets.push(target);
      }
      raycaster.setFromCamera(aimCenter, camera);
      const hit = raycaster.intersectObjects(nearbyTargets, false)[0];
      let chosen: THREE.Object3D | null = null;
      let chosenDistance = Infinity;
      if (hit && hit.distance < 7.25) {
        chosen = hit.object;
        chosenDistance = hit.distance;
      }
      if (!chosen) {
        for (const target of nearbyTargets) {
          target.getWorldPosition(worldPos);
          const horizontal = Math.hypot(
            worldPos.x - camera.position.x,
            worldPos.z - camera.position.z,
          );
          if (horizontal < 3.4 && horizontal < chosenDistance) {
            chosen = target;
            chosenDistance = horizontal;
          }
        }
      }
      if (chosen === candidateProposal) candidateProposalFrames++;
      else {
        candidateProposal = chosen;
        candidateProposalFrames = 1;
      }
      if (candidateProposalFrames >= 2) candidate = candidateProposal;
      renderer.domElement.style.cursor = candidate ? "pointer" : "crosshair";
      camera.updateMatrixWorld();
      viewProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      viewFrustum.setFromProjectionMatrix(viewProjection);
      const visibleRoom = locate(camera.position);
      for (const sprite of labels) {
        sprite.visible =
          sprite.userData.room === visibleRoom &&
          viewFrustum.containsPoint(sprite.position);
      }
    };
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(0.045, (now - last) / 1000);
      last = now;
      if (
        visualCommandActive &&
        targetYaw === null &&
        targetPosition === null &&
        now >= visualHoldUntil
      ) {
        visualCommandActive = false;
        targetFov = 70;
      }
      if (!visualCommandActive && visualQueue.length) {
        const nextCommand = visualQueue.shift()!;
        visualCommandActive = true;
        visualHoldUntil = now + 320;
        animateAgentAction(nextCommand);
      }
      if (targetYaw !== null) {
        const delta =
          ((((targetYaw - yaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) %
            (Math.PI * 2)) -
          Math.PI;
        yaw += delta * Math.min(1, dt * 10);
        if (Math.abs(delta) < 0.008) {
          yaw = targetYaw;
          targetYaw = null;
        }
      }
      if (targetPosition) {
        camera.position.lerp(targetPosition, Math.min(1, dt * 10));
        if (camera.position.distanceTo(targetPosition) < 0.08) {
          camera.position.copy(targetPosition);
          targetPosition = null;
        }
      }
      if (Math.abs(camera.fov - targetFov) > 0.02) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
        camera.updateProjectionMatrix();
      }
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      nextPosition.copy(camera.position);
      const speed = (keys.has("ShiftLeft") ? 6 : 3.7) * dt;
      if (keys.has("ArrowLeft")) yaw += 1.7 * dt;
      if (keys.has("ArrowRight")) yaw -= 1.7 * dt;
      if (keys.has("KeyW") || keys.has("ArrowUp"))
        nextPosition.addScaledVector(forward, speed);
      if (keys.has("KeyS") || keys.has("ArrowDown"))
        nextPosition.addScaledVector(forward, -speed);
      if (keys.has("KeyA")) nextPosition.addScaledVector(right, -speed);
      if (keys.has("KeyD")) nextPosition.addScaledVector(right, speed);
      nextPosition.x = Math.max(-35, Math.min(35, nextPosition.x));
      nextPosition.z = Math.max(-35, Math.min(35, nextPosition.z));
      if (!collision(nextPosition)) camera.position.copy(nextPosition);
      camera.rotation.set(pitch, yaw, 0, "YXZ");
      cameraPose.current.x = camera.position.x;
      cameraPose.current.y = camera.position.y;
      cameraPose.current.z = camera.position.z;
      cameraPose.current.yaw = yaw;
      cameraPose.current.pitch = pitch;
      updateInteractionTarget(now);
      if (candidate && now >= agentVisualizationUntil) {
        candidate.getWorldPosition(worldPos);
        const stableDistance = Math.hypot(
            worldPos.x - camera.position.x,
            worldPos.z - camera.position.z,
          ),
          hudText = `READY · E OR CLICK · ${String(candidate.userData.object).toUpperCase()} · ${stableDistance.toFixed(1)}m`;
        if (hudText !== lastHudText && now - lastHudAt > 180) {
          lastHudText = hudText;
          lastHudAt = now;
          setMessage(hudText);
        }
      }
      const zone = locate(camera.position);
      if (
        zone !== roomRef.current &&
        Math.hypot(
          camera.position.x - centers[zone][0],
          camera.position.z - centers[zone][1],
        ) < 8
      ) {
        roomRef.current = zone;
        if (now >= agentVisualizationUntil) enterRef.current(zone);
      }
      renderer.render(scene, camera);
    };
    animate(performance.now());
    const resize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight, false);
    };
    addEventListener("resize", resize);
    return () => {
      commandHandlerRef.current = null;
      cancelAnimationFrame(frame);
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("mousemove", move);
      removeEventListener("helix-resume-world", resume);
      removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("click", capture);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const materials = mesh.material
          ? Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
          : [];
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
      });
      renderer.renderLists.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el)
        el.removeChild(renderer.domElement);
    };
  }, []);
  if (fallback) {
    const exits =
        currentRoom === "lobby"
          ? (["lab", "office", "server", "security"] as RoomId[])
          : (["lobby"] as RoomId[]),
      lockedDoors =
        currentRoom === "lobby"
          ? exits.filter((id) => !unlocked.includes(id))
          : [];
    return (
      <div className="three-shell world world-fallback">
        <div className="fallback-brief">
          <small>ACCESSIBLE FACILITY VIEW</small>
          <h2>{roomNames[currentRoom]}</h2>
          <p>
            3D rendering is unavailable in this browser. Use the same room
            landmarks and doors below.
          </p>
        </div>
        <div className="fallback-landmarks">
          {Object.keys(layouts[currentRoom]).map((name) => (
            <button key={name} onClick={() => onApproach(name)}>
              <span>INTERACT</span>
              <b>{name}</b>
              <small>Approach and examine</small>
            </button>
          ))}
          {lockedDoors.map((id) => (
            <button key={`${id}-door`} onClick={() => onApproach(`${id} door`)}>
              <span>LOCKED ACCESS</span>
              <b>{roomNames[id]} door</b>
              <small>Inspect or use an access item</small>
            </button>
          ))}
        </div>
        <div className="fallback-exits">
          {exits.map((id) => (
            <button
              key={id}
              disabled={!unlocked.includes(id)}
              onClick={() => onEnterRoom(id)}
            >
              {unlocked.includes(id)
                ? `ENTER ${roomNames[id]}`
                : `${roomNames[id]} · LOCKED`}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="three-shell world">
      <div ref={host} className="three-canvas" />
      <div className="three-hud">
        <div className="control-rail">
          <span className="control-intro">CLICK WORLD TO CONTROL</span>
          <span>
            <i>
              <kbd>W</kbd>
              <kbd>↑</kbd>
            </i>
            MOVE
          </span>
          <span>
            <i>
              <kbd>A</kbd>
              <kbd>D</kbd>
            </i>
            STRAFE
          </span>
          <span>
            <i>
              <kbd>←</kbd>
              <kbd>→</kbd>
            </i>
            TURN
          </span>
          <span>
            <i className="mouse-icon">●</i>LOOK
          </span>
          <span className="interact-control">
            <i>
              <kbd>E</kbd>
            </i>
            INTERACT
          </span>
          <span>
            <i>
              <kbd>ESC</kbd>
            </i>
            RELEASE
          </span>
        </div>
        <b ref={statusRef} className="interaction-status">
          CLICK TO CAPTURE MOUSE · WASD TO MOVE · E TO INTERACT
        </b>
      </div>
      <div className="crosshair">+</div>
      <div className="world-room">
        {currentRoom.toUpperCase()}
        <small>{nearObject ? `NEAR · ${nearObject}` : "EXPLORING"}</small>
      </div>
    </div>
  );
}
