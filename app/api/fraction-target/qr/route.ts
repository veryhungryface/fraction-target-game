import { NextRequest } from 'next/server';
import QRCode from 'qrcode';

export async function GET(request: NextRequest) {
  const text = request.nextUrl.searchParams.get('text') ?? 'http://localhost:3012/fraction-target';
  const svg = await QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    color: {
      dark: '#13201f',
      light: '#ffffff'
    },
    width: 360
  });

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
