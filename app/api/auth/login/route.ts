import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, signSession } from '@/lib/auth';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = LoginSchema.parse(body);

    // 1. Fetch user from database
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // 2. Verify hashed password
    const passwordValid = await verifyPassword(input.password, user.password);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // 3. Sign the session token
    const token = await signSession({
      email: user.email,
      role: user.role,
      name: user.name,
    });

    // 4. Construct response and set secure cookie
    const response = NextResponse.json({
      success: true,
      user: {
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });

    response.cookies.set('allo_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 2 * 60 * 60, // 2 hours in seconds
    });

    return response;
  } catch (error) {
    console.error('[POST /api/auth/login] Error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', issues: error.issues },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
