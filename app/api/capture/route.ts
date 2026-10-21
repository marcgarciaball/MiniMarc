import { connection } from 'next/server';
import { captureOptions, handleCapture } from '@/lib/capture/handler';
import { captureRouteDeps } from '@/lib/capture/server';

export async function POST(request: Request) {
  await connection();
  return handleCapture(request, captureRouteDeps);
}

export async function OPTIONS(request: Request) {
  await connection();
  return captureOptions(request);
}
