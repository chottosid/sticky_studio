import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import { getSourceLocation } from '@/lib/data';
import { signedSourceUrl } from '@/lib/source-storage';

// Opens a stored source. Signing happens on click, so a page left open never holds an expired link.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!(await verifySessionToken(session))) {
    return NextResponse.json({ message: 'Sign in to open sources.' }, { status: 401 });
  }

  const location = await getSourceLocation((await params).id);
  if (!location) return NextResponse.json({ message: 'Source not found.' }, { status: 404 });

  try {
    const url = location.storagePath ? await signedSourceUrl(location.storagePath) : location.sourceUrl;
    if (!url) return NextResponse.json({ message: 'Source not found.' }, { status: 404 });
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Could not open source:', error);
    return NextResponse.json({ message: 'The source could not be opened. Try again.' }, { status: 502 });
  }
}
