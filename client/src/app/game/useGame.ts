import io, { Socket } from "socket.io-client";
import { createDraft, finishDraft } from "immer";
import { USE_LOCAL_WS } from "@/config";
import { getConnectionInfo } from "@/api/room";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { getNickname, getSantaColor } from "@/lib/utils";
import { SantaColor } from "@/lib/player-options";
import { UP, DOWN, LEFT, RIGHT, NONE, MoveDirection } from "@common/input";
import { ConnectionInfoV2 } from "@hathora/cloud-sdk-typescript/dist/sdk/models/shared";

export type Player = {
  id: string;
  x: number;
  nickname: string;
  santaColor: SantaColor;
  y: number;
  isLeft: boolean;
  kills: number;
  deaths: number;
  canFire: boolean;
};

export type Snowball = {
  id: number;
  x: number;
  y: number;
};

export type Score = {
  kills: number;
  deaths: number;
  player: string;
  nickname: string;
  santaColor: SantaColor;
};

export type KillLog = {
  id: string;
  victim: string;
  killer: string;
};

export type GameState = {
  isReady: boolean;
  playerId: string;
  players: Player[];
  snowballs: Snowball[];
  scores: Score[];
  remainingTime: number;
  latency: number;
  killLog: KillLog[];
  map: {
    width: number;
    height: number;
    ground: ({ id: number } | null)[][];
    decal: ({ id: number } | null)[][];
  };
};
const keyDirectionMap = new Map<string, MoveDirection>([
  ["KeyW", UP],
  ["KeyS", DOWN],
  ["KeyD", RIGHT],
  ["KeyA", LEFT],
]);

const SERVER_TICK_RATE = 20;
const KILL_LOG_TIMEOUT = 1000;

function calculateInterpolationFactor(frameRate) {
  const effectiveTickRate = Math.max(SERVER_TICK_RATE, 1);
  const idealFrameTime = 1 / frameRate;
  const interpolationFactor = idealFrameTime * effectiveTickRate;
  return Math.min(Math.max(interpolationFactor, 0), 1);
}

const getWebsocketUrl = (roomId: string, info: ConnectionInfoV2) =>
  `${USE_LOCAL_WS ? "ws://" : "wss://"}${info.exposedPort?.host}:${
    info.exposedPort?.port
  }?roomId=${roomId}&nickname=${getNickname()}&santa=${getSantaColor()}`;

type Listener = () => void;

const createGameStore = (
  roomId: string,
  onDisconnect: () => void,
  onGameOver: (winner: string) => void
) => {
  const listeners: Listener[] = [];
  const runListeners = () => {
    for (let listener of listeners) {
      listener();
    }
  };

  let pingStart = Date.now();

  let pingInterval: ReturnType<typeof setInterval>;

  let gameState: GameState = {
    isReady: false,
    playerId: "",
    players: [],
    snowballs: [],
    scores: [],
    remainingTime: 0,
    latency: 0,
    killLog: [],
    map: {
      width: 0,
      height: 0,
      ground: [],
      decal: [],
    },
  };

  const update = (updater: (state: GameState) => void) => {
    const draft = createDraft(gameState);
    updater(draft);
    gameState = finishDraft(draft);
    runListeners();
  };

  const setupEvents = (socket: Socket) => {
    const cleanup = () => {
      clearInterval(pingInterval);
      socket.disconnect();
    };

    socket.on("connect", () => {
      update((gameState) => {
        gameState.playerId = socket.id;
        gameState.isReady = true;
      });
    });

    socket.on("disconnect", () => {
      cleanup();
      onDisconnect();
    });

    socket.on("map", (loadedMap: GameState["map"]) => {
      update((gameState) => {
        gameState.map = loadedMap;
      });
    });

    socket.on("end", (winner: string) => {
      cleanup();
      onGameOver(winner);

      runListeners();
    });

    socket.on("players", (serverPlayers: Player[]) => {
      update((gameState) => {
        serverPlayers.forEach((serverPlayer, idx) => {
          if (gameState.players[idx]) {
            Object.assign(gameState.players[idx], serverPlayer);
          } else {
            gameState.players.push(serverPlayer);
          }
        });
      });
    });

    socket.on("snowballs", (serverSnowballs: Snowball[]) => {
      update((gameState) => {
        gameState.snowballs = serverSnowballs;
      });
    });

    socket.on(
      "death",
      ({ victim, killer }: { victim: Player; killer: Player }) => {
        const id = Math.random().toString(16).slice(2);
        update((gameState) => {
          const entry = {
            id,
            victim: victim.nickname,
            killer: killer.nickname,
          };
          gameState.killLog.push(entry);
        });

        // @FIXME  should probably be handled in react land as a toast-like feature
        setTimeout(() => {
          update((gameState) => {
            gameState.killLog = gameState.killLog.filter(
              (log) => log.id !== id
            );
          });
        }, KILL_LOG_TIMEOUT);
      }
    );

    socket.on("remaining", (time: number) => {
      update((gameState) => {
        gameState.remainingTime = time;
      });
    });
  };

  const setupControls = (socket: Socket) => {
    let currentMoveDirection = NONE;
    window.addEventListener("keydown", (e) => {
      const direction = keyDirectionMap.get(e.code);
      if (direction) {
        currentMoveDirection |= direction;
      }
      socket.emit("inputs", currentMoveDirection);
    });

    window.addEventListener("keyup", (e) => {
      const direction = keyDirectionMap.get(e.code);
      if (direction) {
        currentMoveDirection &= ~direction;
      }
      socket.emit("inputs", currentMoveDirection);
    });

    window.addEventListener("click", (e) => {
      const canvas = document.querySelector("canvas")!; // @FIXME pepega
      const angle = Math.atan2(
        e.clientY - canvas.height / 2 - 16,
        e.clientX - canvas.width / 2 - 16
      );
      socket.emit("snowball", angle);
    });
  };

  return {
    init() {
      getConnectionInfo(roomId).then((info) => {
        const socket = io(getWebsocketUrl(roomId, info), {
          transports: ["websocket"],
          upgrade: false,
        });

        pingInterval = setInterval(() => {
          pingStart = Date.now();
          socket.emit("ping");
        }, 1000);

        socket.on("pong", () => {
          update((gameState) => {
            gameState.latency = Date.now() - pingStart;
          });
        });

        setupEvents(socket);
        setupControls(socket);
      });
    },
    subscribe(listener: Listener) {
      listeners.push(listener);

      return () => listeners.splice(listeners.indexOf(listener), 1);
    },

    getSnapshot() {
      return gameState;
    },
  };
};

export function useGame({
  roomId,
  onGameOver,
  onDisconnect,
}: {
  roomId: string;
  onGameOver: (winner: string) => void;
  onDisconnect: () => void;
}) {
  const store = useRef(createGameStore(roomId, onDisconnect, onGameOver));
  const gameState = useSyncExternalStore(
    store.current.subscribe,
    store.current.getSnapshot,
    store.current.getSnapshot
  );

  useEffect(() => {
    store.current.init();
  }, []);

  return gameState;
}
