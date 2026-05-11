# 분수를 알라!

QR로 참여하는 초등 수학 분수 소수 위치 게임입니다. 교사는 전자칠판에서 큰 수직선과 QR 코드를 보여주고, 학생은 휴대폰 슬라이더로 계산 결과의 위치를 제출합니다.

## 실행

```bash
npm install
npm run dev
```

로컬에서 Supabase DB 기반으로 테스트하려면 `.env.local`에 아래 값을 넣습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

Supabase 환경 변수가 없으면 로컬 개발에서는 임시 메모리 저장소로 동작합니다. Vercel 배포 환경에서는 위 환경 변수가 반드시 필요합니다.

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:3012/fraction-target?view=teacher
```

학생 화면은 교사용 화면의 QR을 찍거나 아래처럼 접속합니다.

```text
http://localhost:3012/fraction-target?view=student&room=4827
```

## 포함 기능

- 교사용 가로형 전자칠판 화면
- 학생용 QR 접속 및 이름/팀 입력
- 문제별 수직선 범위에 맞춘 분수/계산 결과 위치 슬라이더 제출
- 정답 공개, 답변 분포, 순위 공개 토글, 제출 시간, 팀 평균
- 분수를 소수로 바꾸는 나눗셈 알고리즘 시각화
- Lv1~Lv7, 총 70문제
- 문제별 정답 범위 자동 조절
- Supabase DB 기반 방/학생/제출 상태 저장

## Supabase 테이블

분수 콘텐츠 통신은 아래 세 테이블을 사용합니다.

- `fraction_target_rooms`: 방 PIN, 교사 점유, 현재 라운드 상태
- `fraction_target_players`: 학생 이름, 팀, 누적 점수
- `fraction_target_submissions`: 현재 라운드별 학생 제출값과 점수

마이그레이션 SQL은 `supabase/migrations/20260511022000_fraction_target_rooms.sql`에 있습니다.
