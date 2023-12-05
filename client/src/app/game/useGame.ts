import io, { Socket } from "socket.io-client";
import { USE_LOCAL_WS } from "@/config";
import { getConnectionInfo } from "@/api/room";
import { Score } from "./page";
import { MutableRefObject, useEffect, useRef, useState } from "react";
import { getNickname, getSantaColor } from "@/lib/utils";
import { SANTA_COLORS, SantaColor, getIconDetails } from "@/lib/player-options";
import { UP, DOWN, LEFT, RIGHT, NONE, MoveDirection } from "@common/input";
import { keyBy, differenceBy, intersectionBy } from "lodash-es";
import { ConnectionInfoV2 } from "@hathora/cloud-sdk-typescript/dist/sdk/models/shared";

type Player = {
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

type Snowball = {
  id: number;
  x: number;
  y: number;
};

type GameState = {
  playerId: string;
  players: Player[];
  snowballs: Snowball[];
  map: {
    ground: any[];
    decal: any[];
  };
};
const keyDirectionMap = new Map<string, MoveDirection>([
  ["KeyW", UP],
  ["KeyS", DOWN],
  ["KeyD", RIGHT],
  ["KeyA", LEFT],
]);

const SERVER_TICK_RATE = 20;

function calculateInterpolationFactor(frameRate) {
  const effectiveTickRate = Math.max(SERVER_TICK_RATE, 1);
  const idealFrameTime = 1 / frameRate;
  const interpolationFactor = idealFrameTime * effectiveTickRate;
  return Math.min(Math.max(interpolationFactor, 0), 1);
}

const getWebsocketUrl = (roomId: string, info?: ConnectionInfoV2) =>
  `${USE_LOCAL_WS ? "ws://" : "wss://"}${info?.exposedPort?.host}:${
    info?.exposedPort?.port
  }?roomId=${roomId}&nickname=${getNickname()}&santa=${getSantaColor()}`;

export const useSocket = (roomId: string) => {
  const socket = useRef(
    io(getWebsocketUrl(roomId), {
      transports: ["websocket"],
      upgrade: false,
    })
  );

  useEffect(() => {
    getConnectionInfo(roomId).then((info) => {
      const url = getWebsocketUrl(roomId, info);

      // @ts-ignore https://github.com/socketio/socket.io/discussions/4246#discussioncomment-1952661
      socket.current.io.uri = url;
      socket.current.disconnect().connect();
    });
  }, [roomId]);

  return socket;
};

export function useGame({
  roomId,
  onScoresUpdated,
  onGameOver,
  onDisconnect,
  onTimeLeft,
  onDeath,
  playerIdRef,
  setLatency,
}: {
  roomId: string;
  onScoresUpdated: (newScores: Score[]) => void;
  onGameOver: (winner: string) => void;
  onDisconnect: () => void;
  onTimeLeft: (timeLeft: number) => void;
  onDeath: (victimName: string, killerName: string) => void;
  setLatency: (latency: number) => void;
  playerIdRef: MutableRefObject<any>;
}) {
  let isRunning = true;

  const socket = useSocket(roomId);

  const [gameState, setGameState] = useState<GameState>({
    playerId: socket.current.id,
    players: [],
    snowballs: [],
    map: {
      ground: [],
      decal: [],
    },
  });

  const playerInterpolations = new Map<
    string,
    {
      x: number;
      y: number;
    }
  >();
  const snowballInterpolations = new Map<
    number,
    {
      x: number;
      y: number;
    }
  >();

  let pingStart = Date.now();
  let pingInterval = setInterval(() => {
    pingStart = Date.now();
    socket.current.emit("ping");
  }, 1000);

  useEffect(() => {
    const _socket = socket.current;

    const onConnect = () => {
      playerIdRef.current = socket.current.id;
      setGameState((prevState) => ({
        ...prevState,
        playerId: socket.current.id,
      }));
    };

    const onMap = (loadedMap: GameState["map"]) => {
      setGameState((prevState) => ({
        ...prevState,
        map: {
          ground: loadedMap.ground,
          decal: loadedMap.decal,
        },
      }));
    };
    const onEnd = (winner: string) => {
      socket.current.disconnect();
      onGameOver(winner);
    };

    const refreshScores = () => {
      const newScores: Score[] = gameState.players.map((player) => ({
        kills: player.kills,
        deaths: player.deaths,
        player: player.id,
        nickname: player.nickname,
        santaColor: player.santaColor,
      }));
      onScoresUpdated(newScores);
    };

    const onPlayers = (serverPlayers: Player[]) => {
      // Players can be the full list of players or just a delta
      const diff = differenceBy(
        serverPlayers as Player[],
        gameState.players,
        "id"
      );
      const intersection = keyBy(
        intersectionBy(serverPlayers, gameState.players, "id"),
        "id"
      );

      setGameState((prevState) => ({
        ...prevState,
        players: prevState.players
          .map((player) => {
            const newPlayer = intersection[player.id];
            if (newPlayer) return { ...player, ...newPlayer };

            return player;
          })
          .concat(diff),
      }));
    };

    const onSnowballs = (serverSnowballs) => {
      setGameState((prevState) => ({
        ...prevState,
        snowballs: serverSnowballs,
      }));
    };

    const onPlayerDeath = ({
      victim,
      killer,
    }: {
      victim: Player;
      killer: Player;
    }) => {
      onDeath(victim.nickname, killer.nickname);
    };

    const onPong = () => {
      setLatency(Date.now() - pingStart);
    };

    _socket.on("connect", onConnect);
    _socket.on("refresh", refreshScores);
    _socket.on("map", onMap);
    _socket.on("end", onEnd);
    _socket.once("players", refreshScores);
    _socket.on("players", onPlayers);
    _socket.on("snowballs", onSnowballs);
    _socket.on("death", onPlayerDeath);
    _socket.on("disconnect", onDisconnect);
    _socket.on("remaining", onTimeLeft);
    _socket.on("pong", onPong);

    return () => {
      _socket.off("connect", onConnect);
      _socket.off("refresh", refreshScores);
      _socket.off("map", onMap);
      _socket.off("end", onEnd);
      _socket.off("players", refreshScores);
      _socket.off("players", onPlayers);
      _socket.off("snowballs", onSnowballs);
      _socket.off("death", onPlayerDeath);
      _socket.off("disconnect", onDisconnect);
      _socket.off("remaining", onTimeLeft);
      _socket.off("pong", onPong);
    };
  }, [
    gameState.players,
    onDeath,
    onDisconnect,
    onGameOver,
    onScoresUpdated,
    onTimeLeft,
    pingStart,
    playerIdRef,
    setLatency,
    socket,
  ]);

  useEffect(() => {
    let currentMoveDirection = NONE;
    window.addEventListener("keydown", (e) => {
      const direction = keyDirectionMap.get(e.code);
      if (direction) {
        currentMoveDirection |= direction;
        // walkSnow.play();
      }
      socket.current.emit("inputs", currentMoveDirection);
    });

    window.addEventListener("keyup", (e) => {
      const direction = keyDirectionMap.get(e.code);
      if (direction) {
        currentMoveDirection &= ~direction;
      }
      socket.current.emit("inputs", currentMoveDirection);
    });

    // window.addEventListener("click", (e) => {
    //   const angle = Math.atan2(
    //     e.clientY - canvasEl.height / 2 - 16,
    //     e.clientX - canvasEl.width / 2 - 16
    //   );
    //   socket.emit("snowball", angle);
    // });
  }, [socket]);

  let lastUpdate = Date.now();
  function loop() {
    const delta = Date.now() - lastUpdate;
    const interpolationFactor = calculateInterpolationFactor(
      Math.floor(1000 / delta)
    );

    const maxIntDist = 100;

    for (const player of players) {
      const interpolation = playerInterpolations.get(player.id);

      const startX = interpolation ? interpolation.x : player.x;
      const startY = interpolation ? interpolation.y : player.y;

      playerInterpolations.set(player.id, {
        x:
          Math.abs(player.x - startX) > maxIntDist
            ? player.x
            : startX + interpolationFactor * (player.x - startX),
        y:
          Math.abs(player.y - startY) > maxIntDist
            ? player.y
            : startY + interpolationFactor * (player.y - startY),
      });
    }
    for (const snowball of snowballs) {
      const interpolation = snowballInterpolations.get(snowball.id);

      const startX = interpolation ? interpolation.x : snowball.x;
      const startY = interpolation ? interpolation.y : snowball.y;

      snowballInterpolations.set(snowball.id, {
        x:
          Math.abs(snowball.x - startX) > maxIntDist
            ? snowball.x
            : startX + interpolationFactor * (snowball.x - startX),
        y:
          Math.abs(snowball.y - startY) > maxIntDist
            ? snowball.y
            : startY + interpolationFactor * (snowball.y - startY),
      });
    }

    const myPlayer = players.find((player) => player.id === socket.id);
    let cameraX = 0;
    let cameraY = 0;
    if (myPlayer) {
      const interpolation = playerInterpolations.get(myPlayer.id)!;
      cameraX = Math.floor(interpolation.x - canvasEl.width / 2);
      cameraY = Math.floor(interpolation.y - canvasEl.height / 2);
    }

    canvas.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const TILES_IN_ROW = 8;

    // ground
    for (let row = 0; row < groundMap.length; row++) {
      for (let col = 0; col < groundMap[0].length; col++) {
        let { id } = groundMap[row][col];
        const imageRow = Math.floor(id / TILES_IN_ROW);
        const imageCol = id % TILES_IN_ROW;
        canvas.drawImage(
          mapImage,
          imageCol * TILE_SIZE,
          imageRow * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
          col * TILE_SIZE - cameraX,
          row * TILE_SIZE - cameraY,
          TILE_SIZE,
          TILE_SIZE
        );
      }
    }

    // decals
    for (let row = 0; row < decalMap.length; row++) {
      for (let col = 0; col < decalMap[0].length; col++) {
        let { id } = decalMap[row][col] ?? { id: undefined };
        const imageRow = Math.floor(id / TILES_IN_ROW);
        const imageCol = id % TILES_IN_ROW;

        canvas.drawImage(
          mapImage,
          imageCol * TILE_SIZE,
          imageRow * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
          col * TILE_SIZE - cameraX,
          row * TILE_SIZE - cameraY,
          TILE_SIZE,
          TILE_SIZE
        );
      }
    }

    for (const player of players) {
      const interpolation = playerInterpolations.get(player.id)!;
      canvas.drawImage(
        getPlayerIcon(player),
        interpolation.x - cameraX,
        interpolation.y - cameraY
      );
    }

    for (const snowball of snowballs) {
      const interpolation = snowballInterpolations.get(snowball.id)!;
      canvas.fillStyle = "#ff0039";
      canvas.beginPath();
      canvas.arc(
        interpolation.x - cameraX,
        interpolation.y - cameraY,
        SNOWBALL_RADIUS,
        0,
        2 * Math.PI
      );
      canvas.fill();
    }

    // canvas.drawImage(
    //   getMyPlayer()?.canFire ? crosshairArmed : crosshair,
    //   mouseX - 16,
    //   mouseY - 16
    // );

    lastUpdate = Date.now();

    if (isRunning) {
      window.requestAnimationFrame(loop);
    }
  }

  window.requestAnimationFrame(loop);

  return {
    cleanup() {
      clearInterval(pingInterval);
      isRunning = false;
      socket.disconnect();
    },
  };
}
