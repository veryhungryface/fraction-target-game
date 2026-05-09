'use client';

import {
  Crosshair,
  Gauge,
  Plus,
  Play,
  QrCode,
  Radio,
  Send,
  Sparkles,
  Shuffle,
  Target,
  Timer,
  Trophy,
  UsersRound
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  fractionValue,
  getTeam,
  positionPct,
  questionBank,
  teams,
  type FractionQuestion,
  type RoomState,
  type Submission,
  type TeamId
} from '@/lib/fractionTarget';
import styles from './fraction-target.module.css';

type ViewMode = 'teacher' | 'student';
type ApiResponse = {
  room: RoomState;
  now: number;
};
type ApplyRoomOptions = {
  allowRoomChange?: boolean;
  preserveMissingPlayers?: boolean;
};

const defaultRoomCode = '4827';
const teacherStorageKey = 'fraction-target-teacher-id';

export default function FractionTargetPage() {
  const [roomCode, setRoomCode] = useState(defaultRoomCode);
  const [view, setView] = useState<ViewMode>('teacher');
  const [teacherId, setTeacherId] = useState('');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [serverNow, setServerNow] = useState(Date.now());
  const [origin, setOrigin] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const mutationSeqRef = useRef(0);
  const pendingMutationsRef = useRef(0);
  const completedTeacherClaimRef = useRef(false);

  const applyRoomPayload = useCallback((payload: ApiResponse, options: ApplyRoomOptions = {}) => {
    setRoom((current) => {
      if (!current) return payload.room;
      if (payload.room.code !== current.code) {
        return options.allowRoomChange === false ? current : payload.room;
      }
      if (payload.room.updatedAt < current.updatedAt) return current;

      return mergeRoomSnapshot(current, payload.room, options);
    });
    setServerNow(payload.now);
  }, []);

  const loadRoom = useCallback(async () => {
    if (pendingMutationsRef.current > 0) return;
    const mutationSeq = mutationSeqRef.current;
    const response = await fetch(`/api/fraction-target?room=${encodeURIComponent(roomCode)}`, {
      cache: 'no-store'
    });
    const payload = (await response.json()) as ApiResponse;
    if (pendingMutationsRef.current > 0 || mutationSeqRef.current !== mutationSeq) return;
    applyRoomPayload(payload);
  }, [applyRoomPayload, roomCode]);

  const postAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      if (pendingMutationsRef.current > 0) return;

      const mutationSeq = mutationSeqRef.current + 1;
      mutationSeqRef.current = mutationSeq;
      pendingMutationsRef.current += 1;
      setIsMutating(true);

      try {
        const response = await fetch('/api/fraction-target', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, roomCode, ...payload })
        });

        if (!response.ok) return;

        const nextPayload = (await response.json()) as ApiResponse;
        if (mutationSeqRef.current !== mutationSeq) return;
        applyRoomPayload(nextPayload, { preserveMissingPlayers: action !== 'reset' });
      } finally {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
        if (pendingMutationsRef.current === 0) setIsMutating(false);
      }
    },
    [applyRoomPayload, roomCode]
  );

  const createNewTeacherRoom = useCallback(() => {
    const nextRoomCode = createClientRoomCode(roomCode);
    mutationSeqRef.current += 1;
    pendingMutationsRef.current = 0;
    completedTeacherClaimRef.current = false;
    setIsMutating(false);
    setRoom(null);
    setRoomCode(nextRoomCode);
    setView('teacher');

    const url = new URL(window.location.href);
    url.searchParams.set('view', 'teacher');
    url.searchParams.set('room', nextRoomCode);
    window.history.pushState(null, '', url);
  }, [roomCode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramRoom = params.get('room');
    const paramView = params.get('view');
    const nextView: ViewMode = paramView === 'student' ? 'student' : 'teacher';

    setRoomCode(paramRoom?.trim() || (nextView === 'teacher' ? createClientRoomCode() : defaultRoomCode));
    setView(nextView);

    const storedTeacherId = window.localStorage.getItem(teacherStorageKey);
    const nextTeacherId = storedTeacherId || `teacher-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    window.localStorage.setItem(teacherStorageKey, nextTeacherId);
    setTeacherId(nextTeacherId);
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (view !== 'teacher' || !teacherId || !roomCode) return undefined;

    let mounted = true;

    async function claimRoom() {
      if (pendingMutationsRef.current > 0) return;
      const mutationSeq = mutationSeqRef.current;
      const allowReassign = !completedTeacherClaimRef.current;
      const response = await fetch('/api/fraction-target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claimRoom', roomCode, teacherId, allowReassign })
      });

      if (!response.ok || !mounted) return;

      const payload = (await response.json()) as ApiResponse;
      if (pendingMutationsRef.current > 0 || mutationSeqRef.current !== mutationSeq) return;
      applyRoomPayload(payload, { allowRoomChange: allowReassign });
      completedTeacherClaimRef.current = true;

      if (payload.room.code !== roomCode) {
        if (!allowReassign) return;
        setRoomCode(payload.room.code);
        const url = new URL(window.location.href);
        url.searchParams.set('view', 'teacher');
        url.searchParams.set('room', payload.room.code);
        window.history.replaceState(null, '', url);
      } else {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'teacher' || url.searchParams.get('room') !== roomCode) {
          url.searchParams.set('view', 'teacher');
          url.searchParams.set('room', roomCode);
          window.history.replaceState(null, '', url);
        }
      }
    }

    claimRoom().catch(() => undefined);
    const timer = window.setInterval(() => {
      claimRoom().catch(() => undefined);
    }, 15000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [applyRoomPayload, roomCode, teacherId, view]);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      if (!mounted) return;
      await loadRoom().catch(() => undefined);
    }

    poll();
    const timer = window.setInterval(poll, 900);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [loadRoom]);

  const studentUrl = useMemo(() => {
    if (!origin) return '';
    return `${origin}/fraction-target?view=student&room=${roomCode}`;
  }, [origin, roomCode]);

  return (
    <main className={styles.app} data-view={view}>
      {!room ? (
        <section className={styles.loadingPanel}>
          <Target size={42} />
          <strong>분수를 알라! 준비 중</strong>
        </section>
      ) : view === 'student' ? (
        <StudentScreen isMutating={isMutating} room={room} postAction={postAction} />
      ) : (
        <TeacherBoard
          isMutating={isMutating}
          onCreateNewRoom={createNewTeacherRoom}
          room={room}
          now={serverNow}
          studentUrl={studentUrl}
          postAction={postAction}
        />
      )}
    </main>
  );
}

function createClientRoomCode(exceptCode?: string): string {
  let nextCode = '';
  do {
    nextCode = String(1000 + Math.floor(Math.random() * 9000));
  } while (nextCode === exceptCode);

  return nextCode;
}

function mergeRoomSnapshot(current: RoomState, incoming: RoomState, options: ApplyRoomOptions): RoomState {
  const preserveMissingPlayers = options.preserveMissingPlayers ?? true;

  return {
    ...incoming,
    players: mergePlayers(current.players, incoming.players, preserveMissingPlayers),
    round: mergeRound(current.round, incoming.round, preserveMissingPlayers)
  };
}

function mergePlayers(
  currentPlayers: RoomState['players'],
  incomingPlayers: RoomState['players'],
  preserveMissingPlayers: boolean
): RoomState['players'] {
  if (!preserveMissingPlayers) return incomingPlayers;

  const merged = new Map(incomingPlayers.map((player) => [player.id, player]));
  currentPlayers.forEach((player) => {
    if (!player.isBot && !merged.has(player.id)) {
      merged.set(player.id, player);
    }
  });

  return Array.from(merged.values());
}

function mergeRound(
  currentRound: RoomState['round'],
  incomingRound: RoomState['round'],
  preserveMissingSubmissions: boolean
): RoomState['round'] {
  const sameRunningRound =
    currentRound.index === incomingRound.index &&
    currentRound.question.id === incomingRound.question.id &&
    Boolean(currentRound.startedAt && incomingRound.startedAt && currentRound.startedAt === incomingRound.startedAt);

  if (!sameRunningRound || !preserveMissingSubmissions) return incomingRound;

  const statusOrder = { lobby: 0, active: 1, revealed: 2 } satisfies Record<RoomState['round']['status'], number>;
  const keepCurrentStatus = statusOrder[incomingRound.status] < statusOrder[currentRound.status];

  return {
    ...incomingRound,
    status: keepCurrentStatus ? currentRound.status : incomingRound.status,
    revealedAt: keepCurrentStatus ? currentRound.revealedAt : incomingRound.revealedAt,
    submissions: mergeSubmissions(currentRound.submissions, incomingRound.submissions)
  };
}

function mergeSubmissions(currentSubmissions: Submission[], incomingSubmissions: Submission[]): Submission[] {
  const merged = new Map(incomingSubmissions.map((submission) => [submission.playerId, submission]));
  currentSubmissions.forEach((submission) => {
    if (!merged.has(submission.playerId)) {
      merged.set(submission.playerId, submission);
    }
  });

  return Array.from(merged.values()).sort((left, right) => left.submittedAt - right.submittedAt);
}

function TeacherBoard({
  isMutating,
  onCreateNewRoom,
  room,
  now,
  studentUrl,
  postAction
}: {
  isMutating: boolean;
  onCreateNewRoom: () => void;
  room: RoomState;
  now: number;
  studentUrl: string;
  postAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const round = room.round;
  const visibleSubmissions = getVisibleSubmissions(room, now);
  const fullSubmissions = round.submissions;
  const secondsLeft = getSecondsLeft(room, now);
  const answer = fractionValue(round.question);
  const submittedCount = visibleSubmissions.length;
  const playerCount = room.players.length;
  const showRanking = room.showRanking ?? true;
  const ranked = [...(round.status === 'revealed' ? fullSubmissions : visibleSubmissions)]
    .sort(
      (left, right) =>
        getAnswerDifference(left, round.question) - getAnswerDifference(right, round.question) ||
        left.submittedAt - right.submittedAt
    );

  return (
    <section className={styles.teacherWrap}>
      <div className={styles.teacherBoard} data-phase={round.status}>
        <div className={styles.boardTexture} />
        <header className={styles.boardHeader}>
          <div className={styles.brandLockup}>
            <span className={styles.logoMark}>
              <Target size={30} />
            </span>
            <div>
              <p>FRACTION DECIMAL TARGET</p>
              <h1>{room.title}</h1>
            </div>
          </div>

          <div className={styles.liveStats} aria-label="게임 상태">
            <StatPill icon={<UsersRound size={20} />} label="접속" value={`${playerCount}명`} />
            <StatPill icon={<Send size={20} />} label="제출" value={`${submittedCount}/${playerCount}`} />
            <StatPill icon={<Timer size={20} />} label="남은 시간" value={`${secondsLeft}초`} />
          </div>
        </header>

        {round.status === 'lobby' ? (
          <div className={styles.lobbyLayout}>
            <section className={styles.problemBankPanel}>
              <div className={styles.problemBankHeader}>
                <div>
                  <span>문제 선택</span>
                  <strong>레벨과 번호를 골라요.</strong>
                </div>
                <b>{questionBank.length}문제</b>
              </div>
              <QuestionPicker currentIndex={round.index} disabled={isMutating} postAction={postAction} />
            </section>

            <section className={styles.lobbyTopBar}>
              <div className={styles.lobbyQrBlock}>
                <div className={styles.qrHeader}>
                  <QrCode size={24} />
                  <span>방 코드 {room.code}</span>
                </div>
                {studentUrl ? (
                  <img
                    alt="학생 접속 QR"
                    className={styles.qrImage}
                    src={`/api/fraction-target/qr?text=${encodeURIComponent(studentUrl)}`}
                  />
                ) : (
                  <div className={styles.qrFallback} />
                )}
              </div>

              <div className={styles.lobbyActions}>
                <button
                  className={styles.primaryButton}
                  disabled={isMutating}
                  onClick={() => postAction('startRound')}
                  type="button"
                >
                  <Play size={24} /> 게임 시작
                </button>
                <button
                  className={styles.secondaryActionButton}
                  disabled={isMutating}
                  onClick={() => postAction('setQuestion', { value: getRandomQuestionIndex(round.index) })}
                  type="button"
                >
                  <Shuffle size={22} />
                  랜덤 문제
                </button>
                <button className={styles.secondaryActionButton} disabled={isMutating} onClick={onCreateNewRoom} type="button">
                  <Plus size={22} />
                  새 방 만들기
                </button>
              </div>
            </section>

          </div>
        ) : (
          <div className={styles.roundLayout}>
            <section className={styles.questionBanner}>
              <div>
                <p>
                  현재 문제 · {round.question.levelTitle} · {round.question.objective}
                </p>
                <h2>
                  <QuestionExpression label={round.question.label} compact />
                  <span>위치 찍기</span>
                </h2>
              </div>
              <div className={styles.answerBadge} data-visible={round.status === 'revealed'}>
                <Crosshair size={22} />
                {round.status === 'revealed' ? `정답 ${answer.toFixed(3)}` : '정답 숨김'}
              </div>
            </section>

            <NumberLine room={room} now={now} submissions={visibleSubmissions} />

            <aside className={styles.resultRail}>
              <div className={styles.resultCard}>
                <div className={styles.resultTitle}>
                  <Trophy size={22} />
                  <span>순위</span>
                  <button
                    aria-pressed={showRanking}
                    className={styles.rankToggle}
                    disabled={isMutating}
                    onClick={() => postAction('setRankingVisible', { value: !showRanking })}
                    type="button"
                  >
                    {showRanking ? '순위 공개' : '순위 비공개'}
                  </button>
                </div>
                {round.status === 'revealed' && showRanking ? (
                  <ol className={styles.rankList}>
                    {ranked.map((submission, index) => (
                      <li key={submission.playerId}>
                        <span style={{ '--team': getTeam(submission.team).color } as CSSProperties}>{index + 1}</span>
                        <strong>{submission.playerName}</strong>
                        <em>
                          차이 {formatDecimal(getAnswerDifference(submission, round.question))} · 제출{' '}
                          {formatElapsedTime(submission.submittedAt, round.startedAt)}
                        </em>
                        <b>{submission.score}점</b>
                      </li>
                    ))}
                  </ol>
                ) : round.status === 'revealed' ? (
                  <div className={styles.hiddenRank}>
                    <Radio size={30} />
                    <span>순위 비공개</span>
                  </div>
                ) : (
                  <div className={styles.hiddenRank}>
                    <Radio size={30} />
                    <span>제출 대기</span>
                  </div>
                )}
              </div>

              <TeamAverages submissions={round.status === 'revealed' ? fullSubmissions : visibleSubmissions} />

              <div className={styles.controlDock}>
                {round.status === 'active' ? (
                  <button className={styles.primaryButton} disabled={isMutating} onClick={() => postAction('reveal')} type="button">
                    <Sparkles size={23} /> 정답 공개
                  </button>
                ) : (
                  <button className={styles.primaryButton} disabled={isMutating} onClick={() => postAction('nextRound')} type="button">
                    <Play size={23} /> 다음 문제
                  </button>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}

function StudentScreen({
  isMutating,
  room,
  postAction,
  compact = false
}: {
  isMutating: boolean;
  room: RoomState;
  postAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  compact?: boolean;
}) {
  const [playerId, setPlayerId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<TeamId>('A');
  const [guess, setGuess] = useState(0.5);
  const round = room.round;
  const player = room.players.find((candidate) => candidate.id === playerId);
  const submission = round.submissions.find((candidate) => candidate.playerId === playerId);
  const answer = fractionValue(round.question);
  const guessPct = positionPct(guess, round.question.min, round.question.max);
  const answerPct = positionPct(answer, round.question.min, round.question.max);
  const answerDecimal = formatDecimal(answer);
  const answerSign = isTerminatingDecimal(round.question.numerator, round.question.denominator) ? '=' : '≈';
  const submittedDecimal = submission ? formatDecimal(submission.value) : '';
  const differenceDecimal = submission ? formatDecimal(Math.abs(answer - submission.value)) : '';
  const directionLabel = submission ? getDirectionLabel(submission.value, answer, differenceDecimal) : '';
  const divisionWork = createLongDivisionWork(round.question.numerator, round.question.denominator);

  useEffect(() => {
    const storedId = window.localStorage.getItem('fraction-target-player-id');
    const storedName = window.localStorage.getItem('fraction-target-player-name');
    const storedTeam = window.localStorage.getItem('fraction-target-player-team') as TeamId | null;

    if (storedId) setPlayerId(storedId);
    if (storedName) setStudentName(storedName);
    if (storedTeam && teams.some((team) => team.id === storedTeam)) setSelectedTeam(storedTeam);
  }, []);

  useEffect(() => {
    setGuess((round.question.min + round.question.max) / 2);
  }, [round.question.id, round.question.max, round.question.min]);

  async function joinRoom() {
    if (isMutating) return;
    const id = playerId || `student-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const name = studentName.trim() || '학생';
    setPlayerId(id);
    setStudentName(name);
    window.localStorage.setItem('fraction-target-player-id', id);
    window.localStorage.setItem('fraction-target-player-name', name);
    window.localStorage.setItem('fraction-target-player-team', selectedTeam);
    await postAction('join', { playerId: id, name, team: selectedTeam });
  }

  async function submitGuess() {
    if (isMutating) return;
    await postAction('submit', {
      playerId,
      name: studentName,
      team: selectedTeam,
      value: guess
    });
  }

  return (
    <section className={compact ? styles.studentWrapCompact : styles.studentWrap}>
      <div className={styles.phoneFrame}>
        <div className={styles.phoneSensor} />
        <header className={styles.phoneHeader}>
          <div>
            <p>소수 위치 찾기</p>
            <strong>분수를 알라!</strong>
          </div>
          <span style={{ '--team': getTeam(player?.team ?? selectedTeam).color } as CSSProperties}>
            {player ? getTeam(player.team).name : getTeam(selectedTeam).name}
          </span>
        </header>

        {!player ? (
          <div className={styles.joinCard}>
            <img alt="" src="/fraction-target/slider-mascot.svg" />
            <h2>방 코드 {room.code}</h2>
            <label>
              이름
              <input
                maxLength={10}
                onChange={(event) => setStudentName(event.target.value)}
                placeholder="예: 12 민준"
                value={studentName}
              />
            </label>
            <div className={styles.teamPicker} aria-label="팀 선택">
              {teams.map((team) => (
                <button
                  className={selectedTeam === team.id ? styles.selectedTeam : undefined}
                  key={team.id}
                  onClick={() => setSelectedTeam(team.id)}
                  style={{ '--team': team.color, '--team-soft': team.softColor } as CSSProperties}
                  type="button"
                >
                  {team.name}
                </button>
              ))}
            </div>
            <button className={styles.phonePrimary} disabled={isMutating} onClick={joinRoom} type="button">
              <Send size={20} /> 입장
            </button>
          </div>
        ) : round.status === 'active' && !submission ? (
          <div className={styles.playCard}>
            <div className={styles.mobileQuestion}>
              <span>
                {round.question.levelTitle} · {formatRange(round.question)}
              </span>
              <h2>
                <QuestionExpression label={round.question.label} compact />
                <em>은 어디일까?</em>
              </h2>
            </div>
            <div className={styles.sliderReadout}>
              <b>{formatDecimal(guess)}</b>
              <span>내가 찍은 값</span>
            </div>
            <label className={styles.sliderShell}>
              <span>{formatDecimal(round.question.min)}</span>
              <input
                aria-label="분수 위치 슬라이더"
                max={round.question.max}
                min={round.question.min}
                onChange={(event) => setGuess(Number(event.target.value))}
                step="0.001"
                style={{ '--guess': `${guessPct}%` } as CSSProperties}
                type="range"
                value={guess}
              />
              <span>{formatDecimal(round.question.max)}</span>
            </label>
            <div className={styles.landmarks}>
              {createTicks(round.question).map((tick) => (
                <span key={tick}>{formatTick(tick)}</span>
              ))}
            </div>
            <button className={styles.phonePrimary} disabled={isMutating} onClick={submitGuess} type="button">
              <Target size={21} /> 제출
            </button>
          </div>
        ) : round.status === 'revealed' && submission ? (
          <div className={styles.resultPhoneCard}>
            <div className={styles.solutionHeader}>
              <span>정답 공개</span>
              <strong>{submission.score}점</strong>
            </div>

            <section className={styles.decimalLesson}>
              <p>분수를 소수로 바꾸면</p>
              <h2>
                {formatResultFraction(round.question)} {answerSign} {answerDecimal}
              </h2>
              <LongDivisionBoard work={divisionWork} />
            </section>

            <div className={styles.errorMeters}>
              <span style={{ left: `${answerPct}%` }} />
              <b style={{ left: `${positionPct(submission.value, round.question.min, round.question.max)}%` }} />
            </div>

            <div className={styles.answerComparison}>
              <div>
                <span>정답</span>
                <strong>{answerDecimal}</strong>
              </div>
              <div>
                <span>내 답</span>
                <strong>{submittedDecimal}</strong>
              </div>
            </div>

            <div className={styles.differenceCard}>
              <span>두 값의 차이</span>
              <strong>
                |{answerDecimal} - {submittedDecimal}| = {differenceDecimal}
              </strong>
              <p>{directionLabel}</p>
            </div>
          </div>
        ) : (
          <div className={styles.waitCard}>
            <img alt="" src="/fraction-target/slider-mascot.svg" />
            <h2>{submission ? '제출 완료' : '기다리는 중'}</h2>
            <p>{submission ? '전자칠판에서 정답을 공개할 거예요.' : '선생님이 문제를 시작하면 슬라이더가 열려요.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function NumberLine({ room, now, submissions }: { room: RoomState; now: number; submissions: Submission[] }) {
  const round = room.round;
  const question = round.question;
  const answer = fractionValue(question);
  const answerPct = positionPct(answer, question.min, question.max);
  const ticks = createTicks(question);

  return (
    <section className={styles.numberLineStage}>
      <div className={styles.radarPulse} style={{ '--answer': `${answerPct}%` } as CSSProperties} />
      <div className={styles.numberLine}>
        {ticks.map((tick) => (
          <span
            className={styles.tick}
            key={tick}
            style={{ '--x': `${positionPct(tick, question.min, question.max)}%` } as CSSProperties}
          >
            <i />
            <b>{formatTick(tick)}</b>
          </span>
        ))}

        {submissions.map((submission, index) => (
          <span
            className={styles.answerDot}
            key={submission.playerId}
            style={
              {
                '--x': `${positionPct(submission.value, question.min, question.max)}%`,
                '--y': `${22 + ((index * 37) % 48)}%`,
                '--team': getTeam(submission.team).color,
                '--delay': `${Math.max(0, (submission.submittedAt - (round.startedAt ?? now)) / 1000)}s`
              } as CSSProperties
            }
            title={`${submission.playerName}: ${submission.value}`}
          />
        ))}

        {round.status === 'revealed' ? (
          <div className={styles.correctLine} style={{ '--x': `${answerPct}%` } as CSSProperties}>
            <span>정답</span>
          </div>
        ) : null}
      </div>
      <div className={styles.lineLabels}>
        <span>{formatDecimal(question.min)}</span>
        <span>{formatDecimal(question.max)}</span>
      </div>
    </section>
  );
}

function QuestionPicker({
  currentIndex,
  disabled,
  postAction
}: {
  currentIndex: number;
  disabled: boolean;
  postAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const currentQuestion = questionBank[currentIndex] ?? questionBank[0];
  const selectedLevel = currentQuestion.level;
  const selectedNumber = currentQuestion.levelIndex;
  const levels = Array.from(new Set(questionBank.map((question) => question.level))).sort((left, right) => left - right);
  const selectedLevelQuestions = questionBank
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question.level === selectedLevel)
    .sort((left, right) => left.question.levelIndex - right.question.levelIndex);

  const selectQuestion = (level: number, levelIndex: number) => {
    if (disabled) return;
    const nextIndex = questionBank.findIndex((question) => question.level === level && question.levelIndex === levelIndex);
    if (nextIndex >= 0) {
      void postAction('setQuestion', { value: nextIndex });
    }
  };

  return (
    <div className={styles.questionPicker}>
      <div className={styles.lobbyIllustration}>
        <img alt="학생들이 분수 수직선 슬라이더에 위치를 찍는 만화 장면" src="/fraction-target/classroom-slider-hero.png" />
        <div className={styles.lobbyIllustrationBadge}>
          <span>현재 선택</span>
          <strong>
            Lv{selectedLevel} · {selectedNumber}번
          </strong>
          <em>{currentQuestion.levelTitle}</em>
        </div>
      </div>

      <div className={styles.selectionDock}>
        <section className={styles.selectionRow}>
          <h3>레벨</h3>
          <div>
            {levels.map((level) => (
              <button
                aria-pressed={level === selectedLevel}
                disabled={disabled}
                key={level}
                onClick={() => selectQuestion(level, selectedNumber)}
                title={`Lv${level}`}
                type="button"
              >
                Lv{level}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.selectionRow}>
          <h3>문제 번호</h3>
          <div>
            {selectedLevelQuestions.map(({ question }) => (
              <button
                aria-pressed={question.levelIndex === selectedNumber}
                disabled={disabled}
                key={question.id}
                onClick={() => selectQuestion(selectedLevel, question.levelIndex)}
                title={`${question.label} = ${formatResultFraction(question)} = ${formatDecimal(fractionValue(question))}`}
                type="button"
              >
                {question.levelIndex}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function TeamAverages({ submissions }: { submissions: Submission[] }) {
  return (
    <div className={styles.teamAverages}>
      <div className={styles.resultTitle}>
        <Gauge size={22} />
        <span>팀 평균 오차</span>
      </div>
      {teams.map((team) => {
        const teamSubmissions = submissions.filter((submission) => submission.team === team.id);
        const average =
          teamSubmissions.length > 0
            ? teamSubmissions.reduce((sum, submission) => sum + submission.errorPct, 0) / teamSubmissions.length
            : null;
        const width = average === null ? 6 : Math.max(6, 100 - average * 4);

        return (
          <div className={styles.teamBar} key={team.id}>
            <span style={{ '--team': team.color } as CSSProperties}>{team.name}</span>
            <i>
              <b style={{ '--team': team.color, width: `${width}%` } as CSSProperties} />
            </i>
            <em>{average === null ? '-' : `${average.toFixed(1)}%`}</em>
          </div>
        );
      })}
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className={styles.statPill}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QuestionExpression({ label, compact = false }: { label: string; compact?: boolean }) {
  const tokens = label.replaceAll('(', ' ( ').replaceAll(')', ' ) ').trim().split(/\s+/);

  return (
    <span className={styles.questionExpression} data-compact={compact}>
      {tokens.map((token, index) => {
        if (/^\d+\/\d+$/.test(token)) {
          return <FractionBadge key={`${token}-${index}`} label={token} />;
        }

        return (
          <span className={styles.expressionToken} key={`${token}-${index}`}>
            {token}
          </span>
        );
      })}
    </span>
  );
}

function FractionBadge({ label }: { label: string }) {
  const [numerator, denominator] = label.split('/');

  return (
    <span className={styles.fractionBadge} aria-label={label}>
      <span>{numerator}</span>
      <i />
      <span>{denominator}</span>
    </span>
  );
}

type LongDivisionStep = {
  workingDividend: number;
  product: number;
  remainder: number;
  startColumn: number;
};

type LongDivisionWork = {
  numerator: number;
  divisor: number;
  integerPart: number;
  quotientDigits: number[];
  quotient: string;
  decimalPlaces: number;
  integerDigitCount: number;
  steps: LongDivisionStep[];
  hasMore: boolean;
};

function LongDivisionBoard({ work }: { work: LongDivisionWork }) {
  const columnWidth = 25;
  const bracketX = 78;
  const baseX = 112;
  const decimalPointX = baseX + (work.integerDigitCount - 0.5) * columnWidth;
  const digitX = (column: number) => baseX + column * columnWidth;
  const stepHeight = 58;
  const dividendY = 78;
  const firstStepY = 118;
  const bracketEndY = dividendY + 12;
  const finalY = firstStepY + Math.max(1, work.steps.length - 1) * stepHeight + 46;
  const viewHeight = finalY + 20;
  const totalDigitColumns = work.integerDigitCount + work.decimalPlaces;
  const viewWidth = Math.max(300, digitX(Math.max(totalDigitColumns - 1, work.integerDigitCount)) + 62);
  const dividendDigits = String(work.numerator).split('');
  const quotientIntegerDigits = String(work.integerPart).split('');
  const dividendIntegerStartColumn = Math.max(0, work.integerDigitCount - dividendDigits.length);
  const quotientIntegerStartColumn = Math.max(0, work.integerDigitCount - quotientIntegerDigits.length);

  return (
    <div className={styles.longDivisionBoard}>
      <p className={styles.longDivisionTitle}>
        {work.numerator} ÷ {work.divisor}
      </p>
      <svg
        aria-label={`${work.numerator} 나누기 ${work.divisor} 긴 나눗셈`}
        className={styles.longDivisionCanvas}
        role="img"
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      >
        {quotientIntegerDigits.map((digit, index) => (
          <text
            className={styles.longDivisionQuotientText}
            key={`qi-${digit}-${index}`}
            textAnchor="middle"
            x={digitX(quotientIntegerStartColumn + index)}
            y="34"
          >
            {digit}
          </text>
        ))}
        {work.decimalPlaces > 0 ? (
          <text className={styles.longDivisionQuotientText} textAnchor="middle" x={decimalPointX} y="34">
            .
          </text>
        ) : null}
        {work.quotientDigits.map((digit, index) => (
          <text
            className={styles.longDivisionQuotientText}
            key={`q-${digit}-${index}`}
            textAnchor="middle"
            x={digitX(work.integerDigitCount + index)}
            y="34"
          >
            {digit}
          </text>
        ))}
        {work.hasMore ? (
          <text
            className={styles.longDivisionQuotientText}
            textAnchor="middle"
            x={digitX(work.integerDigitCount + work.quotientDigits.length)}
            y="34"
          >
            …
          </text>
        ) : null}
        <line className={styles.longDivisionDivider} x1={bracketX} x2={viewWidth - 34} y1="52" y2="52" />
        <line className={styles.longDivisionDivider} x1={bracketX} x2={bracketX} y1="52" y2={bracketEndY} />
        <text className={styles.longDivisionNumber} textAnchor="end" x="66" y={dividendY}>
          {work.divisor}
        </text>
        {dividendDigits.map((digit, index) => (
          <text
            className={styles.longDivisionDividendText}
            key={`d-${digit}-${index}`}
            textAnchor="middle"
            x={digitX(dividendIntegerStartColumn + index)}
            y={dividendY}
          >
            {digit}
          </text>
        ))}
        {work.decimalPlaces > 0 ? (
          <text className={styles.longDivisionDividendText} textAnchor="middle" x={decimalPointX} y={dividendY}>
            .
          </text>
        ) : null}
        {Array.from({ length: work.decimalPlaces }).map((_, index) => (
          <text className={styles.longDivisionDividendText} key={`zero-${index}`} textAnchor="middle" x={digitX(work.integerDigitCount + index)} y={dividendY}>
            0
          </text>
        ))}
        {work.steps.map((step, index) => {
          const y = firstStepY + index * stepHeight;
          const startColumn = step.startColumn;
          const workingDigits = String(step.workingDividend).split('');
          const productDigits = String(step.product).split('');
          const stepDigitLength = Math.max(workingDigits.length, productDigits.length);
          const lineStartX = digitX(startColumn) - 12;
          const lineEndX = digitX(startColumn + stepDigitLength - 1) + 12;
          const showFinalZero = !work.hasMore && step.remainder === 0 && index === work.steps.length - 1;

          return (
            <g key={`${step.workingDividend}-${index}`}>
              {workingDigits.map((digit, digitIndex) => (
                <text
                  className={styles.longDivisionNumber}
                  key={`w-${digit}-${digitIndex}`}
                  textAnchor="middle"
                  x={digitX(startColumn + digitIndex)}
                  y={y}
                >
                  {digit}
                </text>
              ))}
              {productDigits.map((digit, digitIndex) => (
                <text
                  className={styles.longDivisionProduct}
                  key={`p-${digit}-${digitIndex}`}
                  textAnchor="middle"
                  x={digitX(startColumn + digitIndex)}
                  y={y + 26}
                >
                  {digit}
                </text>
              ))}
              <line className={styles.longDivisionSubline} x1={lineStartX} x2={lineEndX} y1={y + 35} y2={y + 35} />
              {showFinalZero ? (
                <text className={styles.longDivisionNumber} textAnchor="middle" x={digitX(startColumn + stepDigitLength - 1)} y={y + 61}>
                  0
                </text>
              ) : null}
            </g>
          );
        })}
        {work.hasMore ? (
          <text className={styles.longDivisionRemainder} textAnchor="start" x={digitX(work.integerDigitCount + work.quotientDigits.length)} y={finalY}>
            반복
          </text>
        ) : null}
      </svg>
      <p className={styles.longDivisionHint}>{work.hasMore ? '같은 나머지가 반복돼요.' : '나누어떨어져요'}</p>
    </div>
  );
}

function createLongDivisionWork(numerator: number, denominator: number): LongDivisionWork {
  const integerPart = Math.floor(numerator / denominator);
  let remainder = numerator % denominator;
  const digits: number[] = [];
  const steps: LongDivisionStep[] = [];
  const maxDigits = 3;
  const integerDigitCount = Math.max(String(numerator).length, String(integerPart).length, 1);

  if (integerPart > 0) {
    steps.push({
      workingDividend: numerator,
      product: integerPart * denominator,
      remainder,
      startColumn: Math.max(0, integerDigitCount - String(numerator).length)
    });
  }

  for (let index = 0; index < maxDigits && remainder !== 0; index += 1) {
    const workingDividend = remainder * 10;
    const digit = Math.floor(workingDividend / denominator);
    const product = digit * denominator;
    remainder = workingDividend - product;

    digits.push(digit);
    steps.push({
      workingDividend,
      product,
      remainder,
      startColumn: Math.max(0, integerDigitCount + index - String(workingDividend).length + 1)
    });
  }

  return {
    numerator,
    divisor: denominator,
    integerPart,
    quotientDigits: digits,
    quotient: digits.length > 0 ? `${integerPart}.${digits.join('')}${remainder === 0 ? '' : '...'}` : `${integerPart}`,
    decimalPlaces: digits.length,
    integerDigitCount,
    steps,
    hasMore: remainder !== 0
  };
}

function formatDecimal(value: number): string {
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function formatResultFraction(question: FractionQuestion): string {
  if (question.denominator === 1) return String(question.numerator);
  return `${question.numerator}/${question.denominator}`;
}

function formatRange(question: FractionQuestion): string {
  return `${formatDecimal(question.min)}~${formatDecimal(question.max)}`;
}

function createTicks(question: FractionQuestion): number[] {
  const { min, max } = question;

  if (max <= 1) return [0, 0.25, 0.5, 0.75, 1];
  if (max <= 3) return Array.from({ length: max * 2 + 1 }, (_, index) => min + index * 0.5);

  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function formatTick(value: number): string {
  if (value === 0.25) return '1/4';
  if (value === 0.5) return '1/2';
  if (value === 0.75) return '3/4';
  return formatDecimal(value);
}

function getAnswerDifference(submission: Submission, question: FractionQuestion): number {
  return Math.abs(fractionValue(question) - submission.value);
}

function getRandomQuestionIndex(currentIndex: number): number {
  if (questionBank.length <= 1) return currentIndex;

  let nextIndex = Math.floor(Math.random() * questionBank.length);
  if (nextIndex === currentIndex) {
    nextIndex = (nextIndex + 1) % questionBank.length;
  }

  return nextIndex;
}

function formatElapsedTime(submittedAt: number, startedAt: number | undefined): string {
  if (!startedAt) return '-';
  return `${Math.max(0, (submittedAt - startedAt) / 1000).toFixed(1)}초`;
}

function isTerminatingDecimal(numerator: number, denominator: number): boolean {
  let reducedDenominator = denominator / greatestCommonDivisor(numerator, denominator);

  while (reducedDenominator % 2 === 0) reducedDenominator /= 2;
  while (reducedDenominator % 5 === 0) reducedDenominator /= 5;

  return reducedDenominator === 1;
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

function getDirectionLabel(value: number, answer: number, difference: string): string {
  if (Math.abs(value - answer) < 0.0005) {
    return '정답 위치와 거의 같아요.';
  }

  return value < answer
    ? `내 답은 정답보다 왼쪽으로 ${difference}만큼 떨어져 있어요.`
    : `내 답은 정답보다 오른쪽으로 ${difference}만큼 떨어져 있어요.`;
}

function getVisibleSubmissions(room: RoomState, now: number): Submission[] {
  if (room.round.status !== 'active') return room.round.submissions;
  return room.round.submissions.filter((submission) => submission.submittedAt <= now);
}

function getSecondsLeft(room: RoomState, now: number): number {
  if (room.round.status !== 'active' || !room.round.startedAt) return room.round.durationSec;
  const elapsed = Math.floor((now - room.round.startedAt) / 1000);
  return Math.max(0, room.round.durationSec - elapsed);
}
