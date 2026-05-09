import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '분수를 알라!',
  description: 'QR로 참여하는 초등 분수 소수 위치 게임'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
