# 분수를 알라!

QR로 참여하는 초등 수학 분수 소수 위치 게임입니다. 교사는 전자칠판에서 큰 수직선과 QR 코드를 보여주고, 학생은 휴대폰 슬라이더로 계산 결과의 위치를 제출합니다.

## 실행

```bash
npm install
npm run dev
```

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
- 정답 공개, 답변 분포, TOP 5, 팀 평균
- 분수를 소수로 바꾸는 나눗셈 알고리즘 시각화
- Lv1~Lv7, 총 70문제
- 문제별 정답 범위 자동 조절
