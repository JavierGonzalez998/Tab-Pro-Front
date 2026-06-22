const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

async function request(path: string, options: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

// ponytail: minimal fetch wrapper, add interceptors if needed later
export const api = {
  get: (path: string, token?: string) => request(path, { method: 'GET' }, token),
  post: (path: string, body?: unknown, token?: string) =>
    request(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }, token),
  del: (path: string, token?: string) => request(path, { method: 'DELETE' }, token),
  putForm: (path: string, body: FormData, token?: string) =>
    request(path, { method: 'PUT', body }, token),
}
