import { NextRequest, NextResponse } from 'next/server';
import { getFractionTargetStore, normalizeName, normalizeTeacherId } from '@/lib/fractionTargetStore';
import { type TeamId } from '@/lib/fractionTarget';

const defaultRoomCode = '4827';

type RequestBody = {
  action?: string;
  roomCode?: string;
  teacherId?: string;
  playerId?: string;
  name?: string;
  team?: TeamId;
  value?: number | boolean;
  allowReassign?: boolean;
};

export async function GET(request: NextRequest) {
  try {
    const room = await getFractionTargetStore().getRoom(request.nextUrl.searchParams.get('room') ?? undefined);

    return NextResponse.json({ room, now: Date.now() });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const now = Date.now();

  try {
    const store = getFractionTargetStore();

    if (body.action === 'claimRoom') {
      const room = await store.claimRoom(
        body.roomCode,
        normalizeTeacherId(body.teacherId, now),
        body.allowReassign !== false,
        now
      );

      return NextResponse.json({ room, now });
    }

    switch (body.action) {
      case 'join': {
        const playerId = body.playerId?.trim() || `student-${now}`;
        const room = await store.join(body.roomCode, playerId, normalizeName(body.name, '학생'), body.team);
        return NextResponse.json({ room, now });
      }

      case 'seedDemo': {
        const room = await store.seedDemo(body.roomCode);
        return NextResponse.json({ room, now });
      }

      case 'clearDemo': {
        const room = await store.clearDemo(body.roomCode);
        return NextResponse.json({ room, now });
      }

      case 'startRound': {
        const room = await store.startRound(body.roomCode, now);
        return NextResponse.json({ room, now });
      }

      case 'submit': {
        const value = typeof body.value === 'number' ? body.value : undefined;
        if (value === undefined) {
          return NextResponse.json({ error: 'value is required' }, { status: 400 });
        }

        const room = await store.submit(body.roomCode, {
          playerId: body.playerId,
          name: body.name,
          team: body.team,
          value,
          now
        });
        return NextResponse.json({ room, now });
      }

      case 'reveal': {
        const room = await store.reveal(body.roomCode, now);
        return NextResponse.json({ room, now });
      }

      case 'nextRound': {
        const room = await store.nextRound(body.roomCode);
        return NextResponse.json({ room, now });
      }

      case 'reset': {
        const room = await store.reset(body.roomCode ?? defaultRoomCode, now);
        return NextResponse.json({ room, now });
      }

      case 'setRankingVisible': {
        const room = await store.setRankingVisible(body.roomCode, body.value !== false);
        return NextResponse.json({ room, now });
      }

      case 'setQuestion': {
        const room = await store.setQuestion(body.roomCode, Number(body.value));
        return NextResponse.json({ room, now });
      }

      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (error) {
    return handleRouteError(error);
  }
}

function handleRouteError(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500;
  const message = error instanceof Error ? error.message : 'Unexpected fraction-target error';

  console.error('fraction-target api error:', error);
  return NextResponse.json({ error: message }, { status: Number.isFinite(status) ? status : 500 });
}
