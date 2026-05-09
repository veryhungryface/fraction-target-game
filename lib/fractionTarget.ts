export type TeamId = 'A' | 'B' | 'C' | 'D';
export type RoundStatus = 'lobby' | 'active' | 'revealed';

export type TeamConfig = {
  id: TeamId;
  name: string;
  color: string;
  softColor: string;
};

export type FractionQuestion = {
  id: string;
  label: string;
  numerator: number;
  denominator: number;
  min: number;
  max: number;
  boss?: boolean;
};

export type Player = {
  id: string;
  name: string;
  team: TeamId;
  totalScore: number;
  streak: number;
  isBot?: boolean;
  lastGuess?: number;
  lastErrorPct?: number;
  lastScore?: number;
};

export type Submission = {
  playerId: string;
  playerName: string;
  team: TeamId;
  value: number;
  errorPct: number;
  score: number;
  submittedAt: number;
};

export type RoundState = {
  index: number;
  status: RoundStatus;
  question: FractionQuestion;
  startedAt?: number;
  revealedAt?: number;
  durationSec: number;
  submissions: Submission[];
};

export type RoomState = {
  code: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  teacherId?: string;
  teacherLastSeenAt?: number;
  questionBank: FractionQuestion[];
  players: Player[];
  round: RoundState;
};

export const teams: TeamConfig[] = [
  { id: 'A', name: 'A팀', color: '#00a7a5', softColor: '#d9fbf4' },
  { id: 'B', name: 'B팀', color: '#f45d48', softColor: '#ffe5df' },
  { id: 'C', name: 'C팀', color: '#f5b82e', softColor: '#fff3c4' },
  { id: 'D', name: 'D팀', color: '#536dff', softColor: '#e4e8ff' }
];

export const questionBank: FractionQuestion[] = [
  { id: 'q-1-2', label: '1/2', numerator: 1, denominator: 2, min: 0, max: 1 },
  { id: 'q-1-4', label: '1/4', numerator: 1, denominator: 4, min: 0, max: 1 },
  { id: 'q-3-4', label: '3/4', numerator: 3, denominator: 4, min: 0, max: 1 },
  { id: 'q-2-3', label: '2/3', numerator: 2, denominator: 3, min: 0, max: 1 },
  { id: 'q-5-6', label: '5/6', numerator: 5, denominator: 6, min: 0, max: 1 },
  { id: 'q-7-8', label: '7/8', numerator: 7, denominator: 8, min: 0, max: 1, boss: true }
];

const botNames = [
  '민준',
  '서연',
  '도윤',
  '하린',
  '지우',
  '유찬',
  '서아',
  '준호',
  '예린',
  '현우',
  '다은',
  '시우',
  '나윤',
  '건우',
  '수빈',
  '태오',
  '윤서',
  '지호',
  '채원',
  '은우',
  '아린',
  '민서',
  '주원',
  '소율'
];

export function createInitialRoom(code = '4827'): RoomState {
  return {
    code,
    title: '딱 거기! 분수 과녁',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    questionBank,
    players: [],
    round: {
      index: 0,
      status: 'lobby',
      question: questionBank[0],
      durationSec: 25,
      submissions: []
    }
  };
}

export function getTeam(teamId: TeamId): TeamConfig {
  return teams.find((team) => team.id === teamId) ?? teams[0];
}

export function fractionValue(question: FractionQuestion): number {
  return question.numerator / question.denominator;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function positionPct(value: number, min: number, max: number): number {
  return ((value - min) / (max - min)) * 100;
}

export function scoreGuess(value: number, question: FractionQuestion): { errorPct: number; score: number } {
  const answer = fractionValue(question);
  const errorRatio = Math.abs(value - answer) / (question.max - question.min);
  const errorPct = Number((errorRatio * 100).toFixed(1));

  if (errorRatio <= 0.02) return { errorPct, score: question.boss ? 200 : 100 };
  if (errorRatio <= 0.05) return { errorPct, score: question.boss ? 180 : 90 };
  if (errorRatio <= 0.1) return { errorPct, score: question.boss ? 150 : 75 };
  if (errorRatio <= 0.2) return { errorPct, score: question.boss ? 100 : 50 };
  return { errorPct, score: question.boss ? 40 : 20 };
}

export function createSubmission(
  player: Player,
  question: FractionQuestion,
  value: number,
  submittedAt = Date.now()
): Submission {
  const safeValue = clamp(value, question.min, question.max);
  const { errorPct, score } = scoreGuess(safeValue, question);

  return {
    playerId: player.id,
    playerName: player.name,
    team: player.team,
    value: Number(safeValue.toFixed(4)),
    errorPct,
    score,
    submittedAt
  };
}

export function seedDemoPlayers(existingPlayers: Player[]): Player[] {
  const knownIds = new Set(existingPlayers.map((player) => player.id));
  const bots = botNames
    .map<Player>((name, index) => ({
      id: `bot-${index + 1}`,
      name,
      team: teams[index % teams.length].id,
      totalScore: 0,
      streak: 0,
      isBot: true
    }))
    .filter((player) => !knownIds.has(player.id));

  return [...existingPlayers, ...bots];
}

export function nextQuestionIndex(currentIndex: number): number {
  return (currentIndex + 1) % questionBank.length;
}

export function createNextRound(currentIndex: number): RoundState {
  const index = nextQuestionIndex(currentIndex);

  return {
    index,
    status: 'lobby',
    question: questionBank[index],
    durationSec: questionBank[index].boss ? 30 : 25,
    submissions: []
  };
}

export function botGuess(question: FractionQuestion, playerId: string): number {
  const hash = hashString(`${question.id}-${playerId}`);
  const r1 = pseudoRandom(hash);
  const r2 = pseudoRandom(hash + 17);
  const answer = fractionValue(question);
  const spread = question.boss ? 0.24 : 0.2;
  const normalish = (r1 + r2 - 1) * spread;
  const misconception =
    question.denominator >= 6 && r1 < 0.13 ? -0.22 : question.numerator === 1 && r1 > 0.87 ? 0.16 : 0;

  return clamp(answer + normalish + misconception, question.min, question.max);
}

export function botSubmittedAt(startedAt: number, playerId: string): number {
  const hash = hashString(`time-${playerId}-${startedAt}`);
  return startedAt + 2600 + Math.floor(pseudoRandom(hash) * 17000);
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}
