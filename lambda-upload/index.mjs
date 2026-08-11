import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'

const BUCKET       = process.env.BUCKET_NAME ?? 'cahill-media-library'
const UPLOAD_SECRET = process.env.UPLOAD_SECRET

const CONTENT_TYPES = {
  '.mp4':  'video/mp4',
  '.mkv':  'video/x-matroska',
  '.mov':  'video/quicktime',
  '.avi':  'video/x-msvideo',
  '.webm': 'video/webm',
  '.m4v':  'video/x-m4v',
}

const s3 = new S3Client({})

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function sanitizeFilename(name) {
  const ext = extname(name).toLowerCase()
  const base = name
    .slice(0, name.length - ext.length)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 80)
  return { base: base || 'video', ext }
}

export const handler = async (event) => {
  const headers = event.headers ?? {}
  const secret = headers['x-upload-secret'] ?? headers['X-Upload-Secret']

  if (!UPLOAD_SECRET || secret !== UPLOAD_SECRET) {
    return json(401, { error: 'unauthorized' })
  }

  let payload
  try {
    payload = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, { error: 'invalid JSON body' })
  }

  const { filename } = payload
  if (!filename || typeof filename !== 'string') {
    return json(400, { error: 'filename is required' })
  }

  const { base, ext } = sanitizeFilename(filename)
  const contentType = CONTENT_TYPES[ext]
  if (!contentType) {
    return json(400, { error: `unsupported extension "${ext}"` })
  }

  const key = `video/${base}-${randomUUID().slice(0, 8)}${ext}`

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  )

  return json(200, { url, key, contentType })
}
