import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get('allo_session')?.value;
    const session = cookie ? await verifySession(cookie) : null;

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        email: session.email,
        role: session.role,
        name: session.name,
      },
    });
  } catch (error) {
    console.error('[GET /api/auth/session] Error:', error);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
