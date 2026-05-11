import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
  type RoundState,
  type Submission,
  type TeamId
} from '@/lib/fractionTarget';

const defaultRoomCode = '4827';
const teacherRoomTtlMs = 5 * 60 * 1000;
const localMemoryFallbackEnabled = process.env.NODE_ENV !== 'production';

type RoomRow = {
  code: string;
  title: string;
  teacher_id: string | null;
  teacher_last_seen_at: string | null;
  show_ranking: boolean;
  round_id: string;
  round_index: number;
  round_status: RoomState['round']['status'];
  round_started_at: string | null;
  round_revealed_at: string | null;
  round_duration_sec: number;
  created_at: string;
  updated_at: string;
};

type PlayerRow = {
  room_code: string;
  id: string;
  name: string;
  team: TeamId;
  total_score: number;
  streak: number;
  is_bot: boolean;
  last_guess: number | string | null;
  last_error_pct: number | string | null;
  last_score: number | null;
};

type SubmissionRow = {
  room_code: string;
  round_id: string;
  player_id: string;
  player_name: string;
  team: TeamId;
  value: number | string;
  error_pct: number | string;
  score: number;
  submitted_at: string;
};

type SupabaseConfig = {
  url: string;
  serviceKey: string;
};

type FractionTargetStore = {
  getRoom(code?: string): Promise<RoomState>;
  claimRoom(preferredCode: string | undefined, teacherId: string, allowReassign: boolean, now: number): Promise<RoomState>;
  join(roomCode: string | undefined, playerId: string, name: string, team?: TeamId): Promise<RoomState>;
  seedDemo(roomCode: string | undefined): Promise<RoomState>;
  clearDemo(roomCode: string | undefined): Promise<RoomState>;
  startRound(roomCode: string | undefined, now: number): Promise<RoomState>;
  submit(
    roomCode: string | undefined,
    payload: { playerId?: string; name?: string; team?: TeamId; value: number; now: number }
  ): Promise<RoomState>;
  reveal(roomCode: string | undefined, now: number): Promise<RoomState>;
  nextRound(roomCode: string | undefined): Promise<RoomState>;
  reset(roomCode: string | undefined, now: number): Promise<RoomState>;
  setRankingVisible(roomCode: string | undefined, value: boolean): Promise<RoomState>;
  setQuestion(roomCode: string | undefined, index: number): Promise<RoomState>;
};

let supabaseClient: SupabaseClient | null = null;
let warnedAboutMemoryFallback = false;

export function getFractionTargetStore(): FractionTargetStore {
  const config = getSupabaseConfig();

  if (config) {
    return new SupabaseFractionTargetStore(config);
  }

  if (!localMemoryFallbackEnabled) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for fraction-target.'
    );
  }

  if (!warnedAboutMemoryFallback) {
    warnedAboutMemoryFallback = true;
    console.warn('fraction-target: Supabase env is missing; using local in-memory fallback for development only.');
  }

  return memoryFractionTargetStore;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) return null;

  return { url, serviceKey };
}

function getSupabaseClient(config: SupabaseConfig): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(config.url, config.serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return supabaseClient;
}

class SupabaseFractionTargetStore implements FractionTargetStore {
  private supabase: SupabaseClient;

  constructor(config: SupabaseConfig) {
    this.supabase = getSupabaseClient(config);
  }

  async getRoom(code = defaultRoomCode): Promise<RoomState> {
    const normalized = normalizeRoomCode(code);
    await this.ensureRoom(normalized);
    return this.buildRoom(normalized);
  }

  async claimRoom(
    preferredCode = defaultRoomCode,
    teacherId: string,
    allowReassign: boolean,
    now: number
  ): Promise<RoomState> {
    const preferredRoom = await this.getRoom(preferredCode);
    const targetCode =
      isRoomClaimedByOther(preferredRoom, teacherId, now) && allowReassign
        ? await this.createAvailableRoomCode(now)
        : preferredRoom.code;

    if (isRoomClaimedByOther(preferredRoom, teacherId, now) && !allowReassign) {
      return preferredRoom;
    }

    await this.ensureRoom(targetCode);
    await this.updateRoom(targetCode, {
      teacher_id: teacherId,
      teacher_last_seen_at: toIso(now),
      updated_at: toIso(now)
    });

    return this.buildRoom(targetCode);
  }

  async join(roomCode: string | undefined, playerId: string, name: string, team?: TeamId): Promise<RoomState> {
    const code = await this.ensureRoom(normalizeRoomCode(roomCode));
    const existingPlayers = await this.getPlayerRows(code);
    const existing = existingPlayers.find((player) => player.id === playerId);
    const nextTeam = team ?? existing?.team ?? teamFromCount(existingPlayers.length);

    await this.upsertPlayer(code, {
      id: playerId,
      name,
      team: nextTeam,
      totalScore: existing?.total_score ?? 0,
      streak: existing?.streak ?? 0,
      isBot: existing?.is_bot ?? false,
      lastGuess: numberOrUndefined(existing?.last_guess),
      lastErrorPct: numberOrUndefined(existing?.last_error_pct),
      lastScore: existing?.last_score ?? undefined
    });

    await this.touchRoom(code);
    return this.buildRoom(code);
  }

  async seedDemo(roomCode: string | undefined): Promise<RoomState> {
    const code = await this.ensureRoom(normalizeRoomCode(roomCode));
    const players = (await this.getPlayerRows(code)).map(playerFromRow);
    const seeded = seedDemoPlayers(players);

    await Promise.all(
      seeded
        .filter((player) => player.isBot || !players.some((candidate) => candidate.id === player.id))
        .map((player) => this.upsertPlayer(code, player))
    );

    await this.touchRoom(code);
    return this.buildRoom(code);
  }

  async clearDemo(roomCode: string | undefined): Promise<RoomState> {
    const code = await this.ensureRoom(normalizeRoomCode(roomCode));

    const { error: deletePlayersError } = await this.supabase
      .from('fraction_target_players')
      .delete()
      .eq('room_code', code)
      .eq('is_bot', true);

    if (deletePlayersError) throw deletePlayersError;

    await this.touchRoom(code);
    return this.buildRoom(code);
  }

  async startRound(roomCode: string | undefined, now: number): Promise<RoomState> {
    const code = await this.ensureRoom(normalizeRoomCode(roomCode));
    const roomRow = await this.getRoomRow(code);
    if (roomRow.round_status !== 'lobby') return this.buildRoom(code);

    const question = questionBank[roomRow.round_index] ?? questionBank[0];
    const startedAt = toIso(now);

    await this.updateRoom(code, {
      round_status: 'active',
      round_started_at: startedAt,
      round_revealed_at: null,
      round_duration_sec: question.boss ? 30 : 25,
      updated_at: startedAt
    });

    await this.deleteSubmissions(code, roomRow.round_id);

    const bots = (await this.getPlayerRows(code)).map(playerFromRow).filter((player) => player.isBot);
    for (const bot of bots) {
      await this.saveSubmission(code, roomRow.round_id, bot, botGuess(question, bot.id), botSubmittedAt(now, bot.id));
    }

    return this.buildRoom(code);
  }

  async submit(
    roomCode: string | undefined,
    payload: { playerId?: string; name?: string; team?: TeamId; value: number; now: number }
  ): Promise<RoomState> {
    const code = await this.ensureRoom(normalizeRoomCode(roomCode));
    const roomRow = await this.getRoomRow(code);

    if (roomRow.round_status !== 'active') {
      throw createApiError('round is not active', 409);
    }

    const playerId = payload.playerId?.trim() || `student-${payload.now}`;
    const existingPlayers = await this.getPlayerRows(code);
    let player = existingPlayers.map(playerFromRow).find((candidate) => candidate.id === playerId);

    if (!player) {
      player = {
        id: playerId,
        name: normalizeName(payload.name, '학생'),
        team: payload.team ?? teamFromCount(existingPlayers.length),
        totalScore: 0,
        streak: 0
      };
      await this.upsertPlayer(code, player);
    }

    await this.saveSubmission(code, roomRow.round_id, player, payload.value, payload.now);
    return this.buildRoom(code);
  }

  async reveal(roomCode: string | undefined, now: number): Promise<RoomState> {
    const code = await this.ensureRoom(normalizeRoomCode(roomCode));
    const roomRow = await this.getRoomRow(code);
    if (roomRow.round_status !== 'active') return this.buildRoom(code);

    await this.updateRoom(code, {
      round_status: 'revealed',
      round_revealed_at: toIso(now),
      updated_at: toIso(now)
    });

    return this.buildRoom(code);
  }

  async nextRound(roomCode: string | undefined): Promise<RoomState> {
    const code = await this.ensureRoom(normalizeRoomCode(roomCode));
    const roomRow = await this.getRoomRow(code);
    if (roomRow.round_status !== 'revealed') return this.buildRoom(code);

    const nextRound = createNextRound(roomRow.round_index);
    await this.updateRoom(code, {
      round_id: randomUUID(),
      round_index: nextRound.index,
      round_status: nextRound.status,
      round_started_at: null,
      round_revealed_at: null,
      round_duration_sec: nextRound.durationSec,
      updated_at: toIso(Date.now())
    });

    return this.buildRoom(code);
  }

  async reset(roomCode: string | undefined, now: number): Promise<RoomState> {
    const code = await this.ensureRoom(normalizeRoomCode(roomCode));
    const roomRow = await this.getRoomRow(code);
    const initial = createInitialRoom(code);

    const { error: deleteSubmissionsError } = await this.supabase
      .from('fraction_target_submissions')
      .delete()
      .eq('room_code', code);
    if (deleteSubmissionsError) throw deleteSubmissionsError;

    const { error: deletePlayersError } = await this.supabase.from('fraction_target_players').delete().eq('room_code', code);
    if (deletePlayersError) throw deletePlayersError;

    await this.updateRoom(code, {
      teacher_id: roomRow.teacher_id,
      teacher_last_seen_at: toIso(now),
      show_ranking: roomRow.show_ranking,
      round_id: randomUUID(),
      round_index: initial.round.index,
      round_status: initial.round.status,
      round_started_at: null,
      round_revealed_at: null,
      round_duration_sec: initial.round.durationSec,
      updated_at: toIso(now)
    });

    return this.buildRoom(code);
  }

  async setRankingVisible(roomCode: string | undefined, value: boolean): Promise<RoomState> {
    const code = await this.ensureRoom(normalizeRoomCode(roomCode));
    await this.updateRoom(code, {
      show_ranking: value,
      updated_at: toIso(Date.now())
    });
    return this.buildRoom(code);
  }

  async setQuestion(roomCode: string | undefined, index: number): Promise<RoomState> {
    const code = await this.ensureRoom(normalizeRoomCode(roomCode));
    const roomRow = await this.getRoomRow(code);
    if (roomRow.round_status !== 'lobby') return this.buildRoom(code);

    const question = questionBank[index];
    if (!question) return this.buildRoom(code);

    await this.updateRoom(code, {
      round_id: randomUUID(),
      round_index: index,
      round_status: 'lobby',
      round_started_at: null,
      round_revealed_at: null,
      round_duration_sec: question.boss ? 30 : 25,
      updated_at: toIso(Date.now())
    });

    return this.buildRoom(code);
  }

  private async ensureRoom(code: string): Promise<string> {
    const normalized = normalizeRoomCode(code);
    const existing = await this.findRoomRow(normalized);
    if (existing) return normalized;

    const now = new Date().toISOString();
    const { error } = await this.supabase.from('fraction_target_rooms').insert({
      code: normalized,
      title: '분수를 알라!',
      round_id: randomUUID(),
      round_index: 0,
      round_status: 'lobby',
      round_duration_sec: 25,
      created_at: now,
      updated_at: now
    });

    if (error && error.code !== '23505') throw error;
    return normalized;
  }

  private async createAvailableRoomCode(now: number): Promise<string> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      const room = await this.findRoomRow(code);
      if (!room || !isRoomRowClaimed(room, now)) return code;
    }

    return String(1000 + (now % 9000));
  }

  private async buildRoom(code: string): Promise<RoomState> {
    const roomRow = await this.getRoomRow(code);
    const players = (await this.getPlayerRows(code)).map(playerFromRow);
    const submissions = (await this.getSubmissionRows(code, roomRow.round_id)).map(submissionFromRow);
    const question = questionBank[roomRow.round_index] ?? questionBank[0];

    return {
      code: roomRow.code,
      title: roomRow.title,
      createdAt: dateMs(roomRow.created_at),
      updatedAt: dateMs(roomRow.updated_at),
      teacherId: roomRow.teacher_id ?? undefined,
      teacherLastSeenAt: optionalDateMs(roomRow.teacher_last_seen_at),
      showRanking: roomRow.show_ranking,
      questionBank,
      players,
      round: {
        index: roomRow.round_index,
        status: roomRow.round_status,
        question,
        startedAt: optionalDateMs(roomRow.round_started_at),
        revealedAt: optionalDateMs(roomRow.round_revealed_at),
        durationSec: roomRow.round_duration_sec,
        submissions
      }
    };
  }

  private async saveSubmission(
    code: string,
    roundId: string,
    player: Player,
    value: number,
    submittedAt: number
  ): Promise<void> {
    const roomRow = await this.getRoomRow(code);
    const question = questionBank[roomRow.round_index] ?? questionBank[0];
    const currentPlayer = (await this.getPlayerRow(code, player.id)) ?? playerToRow(code, player);
    const previous = await this.getSubmissionRow(code, roundId, player.id);
    const submission = createSubmission(playerFromRow(currentPlayer), question, value, submittedAt);
    const scoreDelta = submission.score - (previous?.score ?? 0);
    const nextTotal = Math.max(0, currentPlayer.total_score + scoreDelta);
    const nextStreak = submission.score >= (question.boss ? 180 : 90) ? currentPlayer.streak + 1 : 0;

    await this.upsertSubmission(code, roundId, submission);
    await this.upsertPlayer(code, {
      ...playerFromRow(currentPlayer),
      name: submission.playerName,
      team: submission.team,
      totalScore: nextTotal,
      streak: nextStreak,
      lastGuess: submission.value,
      lastErrorPct: submission.errorPct,
      lastScore: submission.score
    });
    await this.touchRoom(code, submittedAt);
  }

  private async findRoomRow(code: string): Promise<RoomRow | null> {
    const { data, error } = await this.supabase
      .from('fraction_target_rooms')
      .select('*')
      .eq('code', code)
      .maybeSingle<RoomRow>();

    if (error) throw error;
    return data;
  }

  private async getRoomRow(code: string): Promise<RoomRow> {
    const row = await this.findRoomRow(code);
    if (!row) {
      await this.ensureRoom(code);
      return this.getRoomRow(code);
    }
    return row;
  }

  private async getPlayerRows(code: string): Promise<PlayerRow[]> {
    const { data, error } = await this.supabase
      .from('fraction_target_players')
      .select('*')
      .eq('room_code', code)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as PlayerRow[];
  }

  private async getPlayerRow(code: string, playerId: string): Promise<PlayerRow | null> {
    const { data, error } = await this.supabase
      .from('fraction_target_players')
      .select('*')
      .eq('room_code', code)
      .eq('id', playerId)
      .maybeSingle<PlayerRow>();

    if (error) throw error;
    return data;
  }

  private async getSubmissionRows(code: string, roundId: string): Promise<SubmissionRow[]> {
    const { data, error } = await this.supabase
      .from('fraction_target_submissions')
      .select('*')
      .eq('room_code', code)
      .eq('round_id', roundId)
      .order('submitted_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as SubmissionRow[];
  }

  private async getSubmissionRow(code: string, roundId: string, playerId: string): Promise<SubmissionRow | null> {
    const { data, error } = await this.supabase
      .from('fraction_target_submissions')
      .select('*')
      .eq('room_code', code)
      .eq('round_id', roundId)
      .eq('player_id', playerId)
      .maybeSingle<SubmissionRow>();

    if (error) throw error;
    return data;
  }

  private async updateRoom(code: string, values: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.from('fraction_target_rooms').update(values).eq('code', code);
    if (error) throw error;
  }

  private async touchRoom(code: string, now = Date.now()): Promise<void> {
    await this.updateRoom(code, { updated_at: toIso(now) });
  }

  private async upsertPlayer(code: string, player: Player): Promise<void> {
    const { error } = await this.supabase.from('fraction_target_players').upsert(playerToRow(code, player), {
      onConflict: 'room_code,id'
    });
    if (error) throw error;
  }

  private async upsertSubmission(code: string, roundId: string, submission: Submission): Promise<void> {
    const { error } = await this.supabase.from('fraction_target_submissions').upsert(
      {
        room_code: code,
        round_id: roundId,
        player_id: submission.playerId,
        player_name: submission.playerName,
        team: submission.team,
        value: submission.value,
        error_pct: submission.errorPct,
        score: submission.score,
        submitted_at: toIso(submission.submittedAt),
        updated_at: toIso(Date.now())
      },
      { onConflict: 'room_code,round_id,player_id' }
    );

    if (error) throw error;
  }

  private async deleteSubmissions(code: string, roundId: string): Promise<void> {
    const { error } = await this.supabase
      .from('fraction_target_submissions')
      .delete()
      .eq('room_code', code)
      .eq('round_id', roundId);

    if (error) throw error;
  }
}

const memoryRooms = new Map<string, RoomState>();

const memoryFractionTargetStore: FractionTargetStore = {
  async getRoom(code = defaultRoomCode) {
    return getMemoryRoom(code);
  },
  async claimRoom(preferredCode = defaultRoomCode, teacherId, allowReassign, now) {
    const preferredRoom = getMemoryRoom(preferredCode);

    if (isRoomClaimedByOther(preferredRoom, teacherId, now)) {
      if (!allowReassign) return preferredRoom;

      const nextRoom = getMemoryRoom(createMemoryAvailableRoomCode(now));
      nextRoom.teacherId = teacherId;
      nextRoom.teacherLastSeenAt = now;
      nextRoom.updatedAt = now;
      return nextRoom;
    }

    preferredRoom.teacherId = teacherId;
    preferredRoom.teacherLastSeenAt = now;
    preferredRoom.updatedAt = now;
    return preferredRoom;
  },
  async join(roomCode, playerId, name, team) {
    const room = getMemoryRoom(roomCode);
    const existing = room.players.find((player) => player.id === playerId);
    const nextTeam = team ?? existing?.team ?? teamFromCount(room.players.length);

    if (existing) {
      existing.name = name;
      existing.team = nextTeam;
    } else {
      room.players.push({ id: playerId, name, team: nextTeam, totalScore: 0, streak: 0 });
    }

    room.updatedAt = Date.now();
    return room;
  },
  async seedDemo(roomCode) {
    const room = getMemoryRoom(roomCode);
    room.players = seedDemoPlayers(room.players);
    room.updatedAt = Date.now();
    return room;
  },
  async clearDemo(roomCode) {
    const room = getMemoryRoom(roomCode);
    const botIds = new Set(room.players.filter((player) => player.isBot).map((player) => player.id));
    room.players = room.players.filter((player) => !player.isBot);
    room.round.submissions = room.round.submissions.filter((submission) => !botIds.has(submission.playerId));
    room.updatedAt = Date.now();
    return room;
  },
  async startRound(roomCode, now) {
    const room = getMemoryRoom(roomCode);
    if (room.round.status !== 'lobby') return room;

    room.round = {
      ...room.round,
      status: 'active',
      startedAt: now,
      revealedAt: undefined,
      durationSec: room.round.question.boss ? 30 : 25,
      submissions: []
    };

    room.players
      .filter((player) => player.isBot)
      .forEach((player) => addMemorySubmission(room, player, botGuess(room.round.question, player.id), botSubmittedAt(now, player.id)));

    room.updatedAt = now;
    return room;
  },
  async submit(roomCode, payload) {
    const room = getMemoryRoom(roomCode);
    if (room.round.status !== 'active') throw createApiError('round is not active', 409);

    let player = room.players.find((candidate) => candidate.id === payload.playerId);
    if (!player) {
      player = {
        id: payload.playerId?.trim() || `student-${payload.now}`,
        name: normalizeName(payload.name, '학생'),
        team: payload.team ?? teamFromCount(room.players.length),
        totalScore: 0,
        streak: 0
      };
      room.players.push(player);
    }

    addMemorySubmission(room, player, payload.value, payload.now);
    room.updatedAt = payload.now;
    return room;
  },
  async reveal(roomCode, now) {
    const room = getMemoryRoom(roomCode);
    if (room.round.status === 'active') {
      room.round.status = 'revealed';
      room.round.revealedAt = now;
      room.updatedAt = now;
    }
    return room;
  },
  async nextRound(roomCode) {
    const room = getMemoryRoom(roomCode);
    if (room.round.status === 'revealed') {
      room.round = createNextRound(room.round.index);
      room.updatedAt = Date.now();
    }
    return room;
  },
  async reset(roomCode, now) {
    const room = getMemoryRoom(roomCode);
    const resetRoom = createInitialRoom(room.code);
    resetRoom.teacherId = room.teacherId;
    resetRoom.teacherLastSeenAt = now;
    resetRoom.showRanking = room.showRanking;
    memoryRooms.set(room.code, resetRoom);
    return resetRoom;
  },
  async setRankingVisible(roomCode, value) {
    const room = getMemoryRoom(roomCode);
    room.showRanking = value;
    room.updatedAt = Date.now();
    return room;
  },
  async setQuestion(roomCode, index) {
    const room = getMemoryRoom(roomCode);
    const question = questionBank[index];
    if (room.round.status === 'lobby' && question) {
      room.round = {
        index,
        status: 'lobby',
        question,
        durationSec: question.boss ? 30 : 25,
        submissions: []
      };
      room.updatedAt = Date.now();
    }
    return room;
  }
};

function getMemoryRoom(code = defaultRoomCode): RoomState {
  const normalized = normalizeRoomCode(code);
  const existing = memoryRooms.get(normalized);
  if (existing) return existing;

  const room = createInitialRoom(normalized);
  memoryRooms.set(normalized, room);
  return room;
}

function createMemoryAvailableRoomCode(now: number): string {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const room = memoryRooms.get(code);
    if (!room || !isRoomClaimed(room, now)) return code;
  }

  return String(1000 + (now % 9000));
}

function addMemorySubmission(room: RoomState, player: Player, value: number, submittedAt: number): void {
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

function playerToRow(roomCode: string, player: Player): PlayerRow {
  return {
    room_code: roomCode,
    id: player.id,
    name: player.name,
    team: player.team,
    total_score: player.totalScore,
    streak: player.streak,
    is_bot: Boolean(player.isBot),
    last_guess: player.lastGuess ?? null,
    last_error_pct: player.lastErrorPct ?? null,
    last_score: player.lastScore ?? null
  };
}

function playerFromRow(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    totalScore: row.total_score,
    streak: row.streak,
    isBot: row.is_bot,
    lastGuess: numberOrUndefined(row.last_guess),
    lastErrorPct: numberOrUndefined(row.last_error_pct),
    lastScore: row.last_score ?? undefined
  };
}

function submissionFromRow(row: SubmissionRow): Submission {
  return {
    playerId: row.player_id,
    playerName: row.player_name,
    team: row.team,
    value: Number(row.value),
    errorPct: Number(row.error_pct),
    score: row.score,
    submittedAt: dateMs(row.submitted_at)
  };
}

function isRoomRowClaimed(room: RoomRow, now: number): boolean {
  const lastSeen = optionalDateMs(room.teacher_last_seen_at) ?? dateMs(room.updated_at);
  return Boolean(room.teacher_id && now - lastSeen < teacherRoomTtlMs);
}

function isRoomClaimed(room: RoomState, now: number): boolean {
  return Boolean(room.teacherId && now - (room.teacherLastSeenAt ?? room.updatedAt) < teacherRoomTtlMs);
}

function isRoomClaimedByOther(room: RoomState, teacherId: string, now: number): boolean {
  return Boolean(room.teacherId && room.teacherId !== teacherId && isRoomClaimed(room, now));
}

function normalizeRoomCode(code: string | undefined): string {
  const normalized = code?.trim();
  return normalized || defaultRoomCode;
}

export function normalizeTeacherId(value: string | undefined, now: number): string {
  const normalized = value?.trim().slice(0, 80);
  return normalized || `teacher-${now}-${Math.floor(Math.random() * 10000)}`;
}

export function normalizeName(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().slice(0, 10);
  return normalized || fallback;
}

function teamFromCount(count: number): TeamId {
  return (['A', 'B', 'C', 'D'] as TeamId[])[count % 4];
}

function dateMs(value: string): number {
  return new Date(value).getTime();
}

function optionalDateMs(value: string | null): number | undefined {
  return value ? dateMs(value) : undefined;
}

function toIso(value: number): string {
  return new Date(value).toISOString();
}

function numberOrUndefined(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return Number(value);
}

function createApiError(message: string, status: number): Error & { status?: number } {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}
