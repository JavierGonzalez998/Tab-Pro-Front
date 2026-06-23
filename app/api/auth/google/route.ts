import { redirect } from 'next/navigation'

export async function GET() {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  redirect(`${backendUrl}/api/auth/google`)
}
