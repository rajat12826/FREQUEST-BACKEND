import { Server, Socket } from "socket.io";
import prisma from "./prismaSchema";

interface GamePlayer {
  id: string;
  name: string;
  score: number;
  streak: number;
  currentFrequency: number;
  isMatched: boolean;
}

const gameState = {
  targetFrequency: 440,
  players: new Map<string, GamePlayer>(),
};

const FREQUENCY_TOLERANCE = 100;
const SCORE_INCREMENT = 10;

export function setupGameHandlers(io: Server, socket: Socket) {
  // ✅ Start a new round
  socket.on("startRound", () => {
    gameState.targetFrequency = 200 + Math.random() * 600;
    console.log(`🎯 New round started! Target = ${Math.round(gameState.targetFrequency)} Hz`);

    io.emit("gameStateUpdate", {
      targetFrequency: gameState.targetFrequency,
      players: Object.fromEntries(gameState.players.entries()),
    });
  });

  // ✅ Submit frequency for scoring
  socket.on("submitFrequency", () => {
    const player = gameState.players.get(socket.id);
    if (!player) return;

    const isMatched =
      Math.abs(player.currentFrequency - gameState.targetFrequency) <
      FREQUENCY_TOLERANCE;

    player.isMatched = isMatched;

    if (isMatched) {
      player.streak++;
      player.score += SCORE_INCREMENT + player.streak;
    } else {
      player.streak = 0;
    }

    io.emit("gameStateUpdate", {
      targetFrequency: gameState.targetFrequency,
      players: Object.fromEntries(gameState.players.entries()),
    });
  });
}

// ✅ Add player
export async function addPlayer(socket: Socket, playerId: string) {
  const dbPlayer = await prisma.player.findUnique({ where: { id: playerId } });
  if (!dbPlayer) return;

  await prisma.player.update({
    where: { id: playerId },
    data: { status: "playing" },
  });

  const newPlayer: GamePlayer = {
    id: dbPlayer.id,
    name: dbPlayer.name,
    score: dbPlayer.score,
    streak: dbPlayer.streak,
    currentFrequency: 440,
    isMatched: false,
  };

  gameState.players.set(socket.id, newPlayer);
  console.log(`✅ Player ${dbPlayer.name} [${socket.id}] connected`);
}

// ✅ Remove player
export async function removePlayer(socket: Socket) {
  const player = gameState.players.get(socket.id);
  if (player) {
    console.log(`❌ Player ${player.name} [${socket.id}] disconnected`);
    await prisma.player.update({
      where: { id: player.id },
      data: { score: player.score, status: "offline" },
    });
    gameState.players.delete(socket.id);
  }
}

// ✅ Update frequency live (from MediaPipe)
export function updatePlayerFrequency(socket: Socket, frequency: number) {
  const player = gameState.players.get(socket.id);
  if (player) {
    player.currentFrequency = frequency;
  }
}
