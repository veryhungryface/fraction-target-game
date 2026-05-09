import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '딱 거기! 분수 과녁',
  description: 'QR로 참여하는 초등 분수 수직선 감각 게임'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
