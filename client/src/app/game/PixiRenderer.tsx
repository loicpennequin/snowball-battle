"use client";
import { BlurFilter } from "pixi.js";
import { Stage, Container, Sprite, Text } from "@pixi/react";
import { useMemo } from "react";

const TILE_SIZE = 32;
const SNOWBALL_RADIUS = 5;

export const PixiRenderer = () => {
  const blurFilter = useMemo(() => new BlurFilter(4), []);

  return (
    <Stage width={window.innerWidth} height={window.innerHeight}>
      <Container x={400} y={330}>
        <Text text="Hello World" anchor={{ x: 0.5, y: 0.5 }} />
      </Container>
    </Stage>
  );
};
