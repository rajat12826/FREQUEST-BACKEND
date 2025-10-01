import { Server, Socket } from 'socket.io';
import prisma from './prismaSchema';

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
  roundActive: false,
};

const FREQUENCY_TOLERANCE = 150;
const SCORE_INCREMENT = 10;

export function setupGameSockets(io: Server, socket: Socket) {

  // Start round
  socket.on('startRound', () => {
    if (!gameState.roundActive) {
      gameState.targetFrequency = 256 + Math.random() * (2048 - 256);
      gameState.roundActive = true;

      // Reset all player matches
      gameState.players.forEach(p => p.isMatched = false);

      io.emit('gameStateUpdate', {
        event: 'startRound',
        roundActive: true,
        targetFrequency: gameState.targetFrequency,
        players: Object.fromEntries(gameState.players.entries()),
      });

      console.log('🎯 New target frequency:', Math.round(gameState.targetFrequency));
    }
  });

  // Submit round
  socket.on('submitRound', async () => {
    if (!gameState.roundActive) return;

    for (const player of gameState.players.values()) {
      const isMatched = Math.abs(player.currentFrequency - gameState.targetFrequency) < FREQUENCY_TOLERANCE;
      player.isMatched = isMatched;

      if (isMatched) {
        player.streak++;
        player.score += SCORE_INCREMENT + player.streak;
      } else {
        player.streak = 0;
      }

      await prisma.player.update({
        where: { id: player.id },
        data: { score: player.score, streak: player.streak },
      });
    }

    gameState.roundActive = false;

    io.emit('gameStateUpdate', {
      event: 'submitRound',
      roundActive: false,
      players: Object.fromEntries(gameState.players.entries()),
    });
  });

  // Player frequency update
  socket.on('playerUpdate', ({ frequency }: { frequency: number }) => {
    const player = gameState.players.get(socket.id);
    if (player) player.currentFrequency = frequency;
  });
}

export async function addPlayer(socket: Socket, playerId: string) {
  const dbPlayer = await prisma.player.findUnique({ where: { id: playerId } });
  if (!dbPlayer) return;

  await prisma.player.update({ where: { id: playerId }, data: { status: 'playing' } });

  const newPlayer: GamePlayer = {
    id: dbPlayer.id,
    name: dbPlayer.name,
    score: dbPlayer.score,
    streak: dbPlayer.streak,
    currentFrequency: 440,
    isMatched: false,
  };

  gameState.players.set(socket.id, newPlayer);
  console.log(`Player ${dbPlayer.name} [${socket.id}] connected.`);
}

export async function removePlayer(socket: Socket) {
  const player = gameState.players.get(socket.id);
  if (player) {
    console.log(`Player ${player.name} [${socket.id}] disconnected.`);
    await prisma.player.update({
      where: { id: player.id },
      data: { score: player.score, status: 'offline' },
    });
    gameState.players.delete(socket.id);
  }
}
