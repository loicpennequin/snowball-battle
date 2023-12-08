"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";

import { useRouter, useSearchParams } from "next/navigation";
import { ScoreBoard } from "./scoreboard";
import { Button } from "@/components/ui/button";
import { UnplugIcon } from "lucide-react";
import Link from "next/link";
import { useGame } from "./useGame";

const KILL_LOG_DISPLAY_MAX = 3;

const DynamicPixiRenderer = dynamic(() => import("./PixiRenderer"), {
  ssr: false,
});
export default function Game() {
  const params = useSearchParams();
  const router = useRouter();

  const gameState = useGame({
    roomId: params.get("roomId")!,
    onGameOver: useCallback(
      (winner: string) => {
        router.push(`/game-over?winner=${winner}`);
      },
      [router]
    ),
    onDisconnect: useCallback(() => {
      router.push(`/disconnect`);
    }, [router]),
  });

  return (
    <main className="relative">
      {!!gameState.map.height && !!gameState.map.width && gameState.isReady && (
        <DynamicPixiRenderer gameState={gameState} />
      )}

      <div className="absolute top-4 right-4 select-none">
        <ScoreBoard scores={gameState.scores} myPlayerId={gameState.playerId} />
      </div>
      <div className="absolute top-4 left-4 flex gap-2">
        <Link href="/disconnect">
          <Button
            variant={"secondary"}
            className="flex gap-4 z-10 relative select-none"
          >
            <UnplugIcon /> Disconnect
          </Button>
        </Link>
        <div className="text-black bg-white border border-black rounded w-fit p-2 select-none">
          {gameState.latency} ms
        </div>
      </div>
      <div className="absolute top-4 flex justify-center w-full select-none">
        <div className="rounded-xl p-4 py-2 text-xs bg-gray-900 text-white">
          {Math.floor(gameState.remainingTime / 1000)} seconds remaining
        </div>
      </div>
      {gameState.killLog.length > 0 && (
        <div className="absolute top-16 flex justify-center w-full select-none">
          <div className="rounded-sm p-4 text-2xl text-white bg-gray-900/75">
            {gameState.killLog.map((log, idx) => {
              if (idx >= KILL_LOG_DISPLAY_MAX) return;
              return (
                <div key={log.id} className="flex justify-center gap-2">
                  <span className="text-red-500 font-extrabold">
                    {log.killer}
                  </span>
                  <span className="text-white"> killed </span>
                  <span className="text-blue-500 font-extrabold">
                    {log.victim}!
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
