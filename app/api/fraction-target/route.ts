import { NextRequest, NextResponse } from 'next/server';
import {
  botGuess,
  botSubmittedAt,
  createInitialRoom,
  createNextRound,
  createSubmission,
  questionBank,
  seedDemoPlayers,
  type Player,
  type RoomState,
  type TeamId
} from '@/lib/fractionTarget';

type StoredRooms = Map<string, RoomState>;

declare global {
  // eslint-disable-next-line no-var
  var __fractionTargetRooms: StoredRooms | undefined;
}

const rooms = globalThis.__fractionTargetRooms ?? new Map<string, RoomState>();
globalThis.__fractionTargetRooms = rooms;

type RequestBody = {
  action?: string;
  roomCode?: string;
  playerId?: string;
  name?: string;
  team?: TeamId;
  value?: number;
};

export async function GET(request: NextRequest) {
  const room = getRoom(request.nextUrl.searchParams.get('room') ?? undefined);

  return NextResponse.json({ room, now: Date.now() });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const room = getRoom(body.roomCode);
  const now = Date.now();

  switch (body.action) {
    case 'join': {
      const playerId = body.playerId?.trim() || `student-${now}`;
      const existing = room.players.find((player) => player.id === playerId);
      const name = normalizeName(body.name, existing?.name ?? '학생');
      const team = body.team ?? existing?.team ?? teamFromCount(room.players.length);

      if (existing) {
        existing.name = name;
        existing.team = team;
      } else {
        room.players.push({
          id: playerId,
          name,
          team,
          totalScore: 0,
          streak: 0
        });
      }
      break;
    }

    case 'seedDemo': {
      room.players = seedDemoPlayers(room.players);
      break;
    }

    case 'clearDemo': {
      const botIds = new Set(room.players.filter((player) => player.isBot).map((player) => player.id));
      room.players = room.players.filter((player) => !player.isBot);
      room.round.submissions = room.round.submissions.filter((submission) => !botIds.has(submission.playerId));
      break;
    }

    case 'startRound': {
      const startedAt = now;
      room.round = {
        ...room.round,
        status: 'active',
        startedAt,
        revealedAt: undefined,
        durationSec: room.round.question.boss ? 30 : 25,
        submissions: []
      };

      room.players
        .filter((player) => player.isBot)
        .forEach((player) => {
          addSubmission(room, player, botGuess(room.round.question, player.id), botSubmittedAt(startedAt, player.id));
        });
      break;
    }

    case 'submit': {
      if (room.round.status !== 'active') {
        return NextResponse.json({ error: 'round is not active' }, { status: 409 });
      }

      const value = typeof body.value === 'number' ? body.value : undefined;
      if (value === undefined) {
        return NextResponse.json({ error: 'value is required' }, { status: 400 });
      }

      let player = room.players.find((candidate) => candidate.id === body.playerId);
      if (!player) {
        player = {
          id: body.playerId?.trim() || `student-${now}`,
          name: normalizeName(body.name, '학생'),
          team: body.team ?? teamFromCount(room.players.length),
          totalScore: 0,
          streak: 0
        };
        room.players.push(player);
      }

      addSubmission(room, player, value, now);
      break;
    }

    case 'reveal': {
      room.round.status = 'revealed';
      room.round.revealedAt = now;
      break;
    }

    case 'nextRound': {
      room.round = createNextRound(room.round.index);
      break;
    }

    case 'reset': {
      rooms.set(room.code, createInitialRoom(room.code));
      return NextResponse.json({ room: rooms.get(room.code), now });
    }

    case 'setQuestion': {
      const index = Number(body.value);
      const question = questionBank[index];
      if (question) {
        room.round = {
          index,
          status: 'lobby',
          question,
          durationSec: question.boss ? 30 : 25,
          submissions: []
        };
      }
      break;
    }

    default:
      return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  }

  room.updatedAt = now;
  return NextResponse.json({ room, now });
}

function getRoom(code = '4827'): RoomState {
  const normalized = code.trim() || '4827';
  const existing = rooms.get(normalized);

  if (existing) return existing;

  const room = createInitialRoom(normalized);
  rooms.set(normalized, room);
  return room;
}

function normalizeName(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().slice(0, 10);
  return normalized || fallback;
}

function teamFromCount(count: number): TeamId {
  return (['A', 'B', 'C', 'D'] as TeamId[])[count % 4];
}

function addSubmission(room: RoomState, player: Player, value: number, submittedAt: number) {
  const previous = room.round.submissions.find((submission) => submission.playerId === player.id);
  if (previous) {
    player.totalScore = Math.max(0, player.totalScore - previous.score);
  }

  const submission = createSubmission(player, room.round.question, value, submittedAt);
  room.round.submissions = [
    ...room.round.submissions.filter((candidate) => candidate.playerId !== player.id),
    submission
  ].sort((left, right) => left.submittedAt - right.submittedAt);

  player.totalScore += submission.score;
  player.lastGuess = submission.value;
  player.lastErrorPct = submission.errorPct;
  player.lastScore = submission.score;
  player.streak = submission.score >= (room.round.question.boss ? 180 : 90) ? player.streak + 1 : 0;
}
