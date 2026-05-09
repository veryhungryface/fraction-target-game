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
  level: number;
  levelIndex: number;
  levelTitle: string;
  objective: string;
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
  showRanking: boolean;
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

type FractionParts = {
  numerator: number;
  denominator: number;
};

const levelMeta = {
  1: { title: 'Lv1 단일 진분수', objective: '분수를 소수로 바꾸기' },
  2: { title: 'Lv2 가분수 · 대분수', objective: '정수부와 소수부 처리' },
  3: { title: 'Lv3 같은 분모 덧셈 · 뺄셈', objective: '계산 후 소수화' },
  4: { title: 'Lv4 약분 · 통분 감각', objective: '약분/통분 후 계산' },
  5: { title: 'Lv5 분수의 곱셈', objective: '곱셈과 약분' },
  6: { title: 'Lv6 분수의 나눗셈', objective: '역수 개념' },
  7: { title: 'Lv7 혼합 계산', objective: '여러 연산 조합과 연산순서' }
} satisfies Record<number, { title: string; objective: string }>;

export const questionBank: FractionQuestion[] = [
  ...level(1, [
    ['1/2', frac(1, 2)],
    ['1/4', frac(1, 4)],
    ['3/4', frac(3, 4)],
    ['1/5', frac(1, 5)],
    ['7/10', frac(7, 10)],
    ['3/5', frac(3, 5)],
    ['7/8', frac(7, 8)],
    ['9/20', frac(9, 20)],
    ['11/25', frac(11, 25)],
    ['17/50', frac(17, 50)]
  ]),
  ...level(2, [
    ['3/2', frac(3, 2)],
    ['5/4', frac(5, 4)],
    ['7/4', frac(7, 4)],
    ['9/5', frac(9, 5)],
    ['2 1/2', mixed(2, 1, 2)],
    ['3 3/4', mixed(3, 3, 4)],
    ['17/8', frac(17, 8)],
    ['4 7/10', mixed(4, 7, 10)],
    ['29/20', frac(29, 20)],
    ['7 13/25', mixed(7, 13, 25)]
  ]),
  ...level(3, [
    ['1/5 + 2/5', add(frac(1, 5), frac(2, 5))],
    ['3/8 + 1/8', add(frac(3, 8), frac(1, 8))],
    ['7/10 - 3/10', sub(frac(7, 10), frac(3, 10))],
    ['5/6 + 1/6', add(frac(5, 6), frac(1, 6))],
    ['11/12 - 5/12', sub(frac(11, 12), frac(5, 12))],
    ['7/9 + 5/9', add(frac(7, 9), frac(5, 9))],
    ['13/20 - 7/20', sub(frac(13, 20), frac(7, 20))],
    ['17/25 + 9/25', add(frac(17, 25), frac(9, 25))],
    ['29/40 - 11/40', sub(frac(29, 40), frac(11, 40))],
    ['31/50 + 17/50', add(frac(31, 50), frac(17, 50))]
  ]),
  ...level(4, [
    ['1/2 + 1/4', add(frac(1, 2), frac(1, 4))],
    ['2/3 + 1/6', add(frac(2, 3), frac(1, 6))],
    ['3/4 - 1/8', sub(frac(3, 4), frac(1, 8))],
    ['2/5 + 3/10', add(frac(2, 5), frac(3, 10))],
    ['5/6 - 1/3', sub(frac(5, 6), frac(1, 3))],
    ['7/8 + 3/16', add(frac(7, 8), frac(3, 16))],
    ['5/12 + 7/18', add(frac(5, 12), frac(7, 18))],
    ['11/15 - 2/9', sub(frac(11, 15), frac(2, 9))],
    ['13/20 + 7/25', add(frac(13, 20), frac(7, 25))],
    ['17/24 - 5/36', sub(frac(17, 24), frac(5, 36))]
  ]),
  ...level(5, [
    ['1/2 × 1/3', mul(frac(1, 2), frac(1, 3))],
    ['2/5 × 3/4', mul(frac(2, 5), frac(3, 4))],
    ['5/6 × 2/3', mul(frac(5, 6), frac(2, 3))],
    ['7/8 × 4/5', mul(frac(7, 8), frac(4, 5))],
    ['9/10 × 5/6', mul(frac(9, 10), frac(5, 6))],
    ['11/12 × 7/8', mul(frac(11, 12), frac(7, 8))],
    ['13/15 × 9/10', mul(frac(13, 15), frac(9, 10))],
    ['17/18 × 11/12', mul(frac(17, 18), frac(11, 12))],
    ['19/20 × 13/14', mul(frac(19, 20), frac(13, 14))],
    ['23/24 × 17/18', mul(frac(23, 24), frac(17, 18))]
  ]),
  ...level(6, [
    ['1/2 ÷ 1/4', div(frac(1, 2), frac(1, 4))],
    ['2/3 ÷ 1/6', div(frac(2, 3), frac(1, 6))],
    ['3/5 ÷ 2/5', div(frac(3, 5), frac(2, 5))],
    ['5/6 ÷ 1/3', div(frac(5, 6), frac(1, 3))],
    ['7/8 ÷ 2/3', div(frac(7, 8), frac(2, 3))],
    ['9/10 ÷ 3/5', div(frac(9, 10), frac(3, 5))],
    ['11/12 ÷ 5/8', div(frac(11, 12), frac(5, 8))],
    ['13/15 ÷ 7/10', div(frac(13, 15), frac(7, 10))],
    ['17/18 ÷ 11/12', div(frac(17, 18), frac(11, 12))],
    ['19/20 ÷ 13/15', div(frac(19, 20), frac(13, 15))]
  ]),
  ...level(7, [
    ['1/2 + 1/4 × 2', add(frac(1, 2), mul(frac(1, 4), frac(2, 1)))],
    ['3/4 - 1/2 + 1/8', add(sub(frac(3, 4), frac(1, 2)), frac(1, 8))],
    ['( 2/3 + 1/6 ) × 2', mul(add(frac(2, 3), frac(1, 6)), frac(2, 1))],
    ['5/6 - 1/3 ÷ 2', sub(frac(5, 6), div(frac(1, 3), frac(2, 1)))],
    ['3/4 × 2/5 + 1/2', add(mul(frac(3, 4), frac(2, 5)), frac(1, 2))],
    ['( 7/8 - 1/4 ) × 2/3', mul(sub(frac(7, 8), frac(1, 4)), frac(2, 3))],
    ['5/6 + 3/10 - 1/15', sub(add(frac(5, 6), frac(3, 10)), frac(1, 15))],
    ['( 11/12 + 5/18 ) ÷ 2', div(add(frac(11, 12), frac(5, 18)), frac(2, 1))],
    ['7/9 × 3/14 + 5/12', add(mul(frac(7, 9), frac(3, 14)), frac(5, 12))],
    ['( 13/15 - 2/9 ) × 5/8', mul(sub(frac(13, 15), frac(2, 9)), frac(5, 8)), true]
  ])
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
    title: '분수를 알라!',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    showRanking: true,
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
  const range = question.max - question.min;
  const spread = range * (question.boss ? 0.18 : 0.14);
  const normalish = (r1 + r2 - 1) * spread;
  const misconception =
    question.denominator >= 6 && r1 < 0.13
      ? -range * 0.16
      : question.numerator === 1 && r1 > 0.87
        ? range * 0.12
        : 0;

  return clamp(answer + normalish + misconception, question.min, question.max);
}

function level(levelNumber: number, items: Array<[string, FractionParts, boolean?]>): FractionQuestion[] {
  return items.map(([label, value, boss], index) => makeQuestion(levelNumber, index + 1, label, value, boss));
}

function makeQuestion(
  levelNumber: number,
  levelIndex: number,
  label: string,
  value: FractionParts,
  boss = false
): FractionQuestion {
  const normalized = frac(value.numerator, value.denominator);
  const answer = normalized.numerator / normalized.denominator;
  const meta = levelMeta[levelNumber as keyof typeof levelMeta];

  return {
    id: `lv${levelNumber}-${String(levelIndex).padStart(2, '0')}`,
    label,
    numerator: normalized.numerator,
    denominator: normalized.denominator,
    min: 0,
    max: answer <= 1 ? 1 : Math.ceil(answer),
    level: levelNumber,
    levelIndex,
    levelTitle: meta.title,
    objective: meta.objective,
    boss
  };
}

function frac(numerator: number, denominator: number): FractionParts {
  const sign = denominator < 0 ? -1 : 1;
  const gcd = greatestCommonDivisor(numerator, denominator);

  return {
    numerator: (sign * numerator) / gcd,
    denominator: Math.abs(denominator) / gcd
  };
}

function mixed(whole: number, numerator: number, denominator: number): FractionParts {
  return frac(whole * denominator + numerator, denominator);
}

function add(left: FractionParts, right: FractionParts): FractionParts {
  return frac(left.numerator * right.denominator + right.numerator * left.denominator, left.denominator * right.denominator);
}

function sub(left: FractionParts, right: FractionParts): FractionParts {
  return frac(left.numerator * right.denominator - right.numerator * left.denominator, left.denominator * right.denominator);
}

function mul(left: FractionParts, right: FractionParts): FractionParts {
  return frac(left.numerator * right.numerator, left.denominator * right.denominator);
}

function div(left: FractionParts, right: FractionParts): FractionParts {
  return frac(left.numerator * right.denominator, left.denominator * right.numerator);
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const rest = a % b;
    a = b;
    b = rest;
  }

  return a || 1;
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
