import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'
import { extname, basename, dirname } from 'node:path'

const BUCKET          = process.env.BUCKET_NAME       ?? 'cahill-media-library'
const CF_DOMAIN       = process.env.CLOUDFRONT_DOMAIN ?? null
const DISTRIBUTION_ID = process.env.DISTRIBUTION_ID   ?? null
const BASE_URL        = CF_DOMAIN
  ? `https://${CF_DOMAIN}`
  : `https://${BUCKET}.s3.amazonaws.com`
const OUT_KEY = 'library.json'

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a'])
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v'])

const s3 = new S3Client({})
const cf = DISTRIBUTION_ID ? new CloudFrontClient({}) : null

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function publicUrl(key) {
  return `${BASE_URL}/${key.split('/').map(encodeURIComponent).join('/')}`
}

function parseMusicKey(key) {
  const stripped = key.replace(/^music\//i, '')
  const dir   = dirname(stripped)
  const file  = basename(stripped, extname(stripped)).replace(/^\d+[\s.\-_]+/, '')
  const parts = dir === '.' ? [] : dir.split('/').filter(Boolean)
  return {
    artist: parts[0] ?? 'Unknown Artist',
    album:  parts[1] ?? parts[0] ?? 'Unknown Album',
    title:  file,
  }
}

async function listAllKeys() {
  const keys = []
  let token
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }))
    for (const obj of res.Contents ?? []) {
      if (obj.Key && obj.Key !== OUT_KEY) keys.push(obj.Key)
    }
    token = res.NextContinuationToken
  } while (token)
  return keys
}

export const handler = async () => {
  const keys = await listAllKeys()

  const music  = []
  const videos = []

  for (const key of keys) {
    const ext = extname(key).toLowerCase()

    if (AUDIO_EXTS.has(ext)) {
      const { artist, album, title } = parseMusicKey(key)
      music.push({
        id:       `music_${slugify(artist)}_${slugify(title)}`,
        title,
        artist,
        album,
        year:     null,
        genre:    null,
        duration: 0,
        src:      publicUrl(key),
        artwork:  null,
      })
    } else if (VIDEO_EXTS.has(ext)) {
      const name = basename(key, ext)
      videos.push({
        id:        `video_${slugify(name)}`,
        title:     name,
        type:      'movie',
        year:      null,
        duration:  0,
        src:       publicUrl(key),
        thumbnail: null,
      })
    }
  }

  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         OUT_KEY,
    Body:        JSON.stringify({ music, videos }, null, 2),
    ContentType: 'application/json',
  }))

  if (cf && DISTRIBUTION_ID) {
    await cf.send(new CreateInvalidationCommand({
      DistributionId: DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `scan-${Date.now()}`,
        Paths: { Quantity: 1, Items: ['/library.json'] },
      },
    }))
  }

  console.log(`Wrote library.json — ${music.length} tracks · ${videos.length} videos`)
  return { music: music.length, videos: videos.length }
}
