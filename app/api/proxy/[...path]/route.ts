export async function GET(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const pathStr = params.path.join('/')
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  
  const url = new URL(request.url)
  const queryString = url.search
  
  const response = await fetch(`${backendUrl}/${pathStr}${queryString}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
  })

  const data = await response.json()
  return Response.json(data, { status: response.status })
}

export async function POST(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const pathStr = params.path.join('/')
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  
  const contentType = request.headers.get('content-type')
  let body: any = null

  if (contentType?.includes('application/json')) {
    body = await request.json()
  } else if (contentType?.includes('multipart/form-data')) {
    body = await request.formData()
  }

  const response = await fetch(`${backendUrl}/${pathStr}`, {
    method: 'POST',
    headers: {
      ...(contentType && { 'Content-Type': contentType }),
      Authorization: request.headers.get('Authorization') || '',
    },
    body: contentType?.includes('multipart/form-data') ? body : JSON.stringify(body),
  })

  const data = await response.json()
  return Response.json(data, { status: response.status })
}

export async function PUT(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const pathStr = params.path.join('/')
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  
  const contentType = request.headers.get('content-type')
  let body: any = null

  if (contentType?.includes('application/json')) {
    body = await request.json()
  } else if (contentType?.includes('multipart/form-data')) {
    body = await request.formData()
  }

  const response = await fetch(`${backendUrl}/${pathStr}`, {
    method: 'PUT',
    headers: {
      ...(contentType && { 'Content-Type': contentType }),
      Authorization: request.headers.get('Authorization') || '',
    },
    body: contentType?.includes('multipart/form-data') ? body : JSON.stringify(body),
  })

  const data = await response.json()
  return Response.json(data, { status: response.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const pathStr = params.path.join('/')
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  
  const response = await fetch(`${backendUrl}/${pathStr}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('Authorization') || '',
    },
  })

  const data = await response.json()
  return Response.json(data, { status: response.status })
}

