"use client";
import {
  BaseTexture,
  BlurFilter,
  DisplayObject,
  ISpritesheetData,
  Spritesheet,
  Sprite as PixiSprite,
} from "pixi.js";
import { Stage, Container, Sprite, Text, useApp } from "@pixi/react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { GameState, Player } from "./useGame";
import mapMetaJSON from "@/assets/snowy-sheet.json";
import { PixiViewport } from "./Viewport";
import { SANTA_COLORS, getIconDetails } from "@/lib/player-options";
import { Viewport } from "pixi-viewport";

const SNOWBALL_RADIUS = 5;
const COLS = mapMetaJSON.imagewidth / mapMetaJSON.tilewidth;
const ROWS = mapMetaJSON.imageheight / mapMetaJSON.tileheight;

// player sprites
// temporary until we integrante AnimatedSprites
const iconMap = new Map<string, string>();
SANTA_COLORS.forEach((color) => {
  const { image, label } = getIconDetails(color);
  iconMap.set(label, `/${image}`);
});

function getPlayerIcon(player: Player) {
  const iconKey = player.santaColor;
  const icon = iconMap.get(iconKey);
  if (!icon) {
    throw new Error(`Could not find icon for ${iconKey}`);
  }
  return icon;
}

const MAP_ATLAS: ISpritesheetData = {
  frames: Object.fromEntries(
    Array.from({ length: ROWS }, (_, y) =>
      Array.from({ length: COLS }, (_, x) => [
        `tile-${y * ROWS + x}`,
        {
          frame: {
            x: x * mapMetaJSON.tilewidth,
            y: y * mapMetaJSON.tilewidth,
            w: mapMetaJSON.tilewidth,
            h: mapMetaJSON.tileheight,
          },
          sourceSize: { w: mapMetaJSON.tilewidth, h: mapMetaJSON.imageheight },
          spriteSourceSize: {
            x: 0,
            y: 0,
            w: mapMetaJSON.tilewidth,
            h: mapMetaJSON.imageheight,
          },
        },
      ])
    ).flat()
  ),
  meta: {
    image: "/snowy-sheet.png",
    size: { w: mapMetaJSON.imagewidth, h: mapMetaJSON.imageheight },
    scale: "1",
  },
};

export default function PixiRenderer({ gameState }: { gameState: GameState }) {
  return (
    <Stage width={window.innerWidth} height={window.innerHeight}>
      <PixiApp gameState={gameState} />
    </Stage>
  );
}

const PixiApp = ({ gameState }: { gameState: GameState }) => {
  const app = useApp();

  const viewportRef = useRef<Viewport>(null);
  const playerRef = useRef<PixiSprite | null>(null);

  const [mapTextures, setMapTextures] = useState<any>();
  useEffect(() => {
    const mapSpritesheet = new Spritesheet(
      BaseTexture.from(MAP_ATLAS.meta.image!),
      MAP_ATLAS
    );

    mapSpritesheet.parse().then(() => {
      setMapTextures(mapSpritesheet.textures);
      if (playerRef.current) {
        viewportRef.current?.follow(playerRef.current);
      }
    });
  }, []);

  return (
    <PixiViewport
      ref={viewportRef}
      screenWidth={app.view.width}
      screenHeight={app.view.height}
      worldHeight={gameState.map.height * mapMetaJSON.tileheight}
      worldWidth={gameState.map.width * mapMetaJSON.tilewidth}
    >
      {!!mapTextures && (
        <>
          {gameState.map.ground.map((row, y) => {
            row.map((col, x) =>
              col ? (
                <Sprite
                  key={`${x}:${y}`}
                  texture={mapTextures[`tile-${col.id}`]}
                  anchor={0.5}
                  x={x * mapMetaJSON.tilewidth}
                  y={y * mapMetaJSON.tileheight}
                />
              ) : null
            );
          })}
          {gameState.map.decal.map((row, y) => {
            row.map((col, x) =>
              col ? (
                <Sprite
                  key={`${x}:${y}`}
                  texture={mapTextures[`tile-${col.id}`]}
                  anchor={0.5}
                  x={x * mapMetaJSON.tilewidth}
                  y={y * mapMetaJSON.tileheight}
                />
              ) : null
            );
          })}
        </>
      )}
      {gameState.players.map((player) => (
        <Sprite
          ref={(node) => {
            if (player.id === gameState.playerId) {
              playerRef.current = node;
            }
          }}
          key={player.id}
          image={getPlayerIcon(player)}
          scale={{ x: player.isLeft ? -1 : 1, y: 1 }}
          anchor={0.5}
          x={player.x}
          y={player.y}
        />
      ))}
    </PixiViewport>
  );
};
