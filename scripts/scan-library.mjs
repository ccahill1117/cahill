#!/usr/bin/env node
/**
 * scan-library.mjs
 *
 * Lists objects in the cahill-media-library S3 bucket, builds library entries
 * from the key path, and writes public/library.json.
 *
 * Usage:
 *   npm run scan-library
 *   # or
 *   node scripts/scan-library.mjs
 *
 * Requires AWS credentials with s3:ListBucket on cahill-media-library.
 * Run `aws configure` if you haven't already.
 *
 * Expected key structure (either works):
 *   music/Artist/Album/01 - Track.mp3
 *   Artist/Album/01 - Track.mp3
 *
 * For video:
 *   video/Movie Title (2024).mp4
 *   video/Show/S01E01 - Episode.mkv
 */

import { writeFile } from 'node:fs/promises'
import { join, extname, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const OUT  = join(ROOT, 'public', 'library.json')

const BUCKET   = 'cahill-media-library'
const BASE_URL = `https://${BUCKET}.s3.amazonaws.com`

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a'])
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v'])

const s3 = new S3Client({})

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

/** List all keys in the bucket, paginating as needed. */
async function listAllKeys() {
  const keys = []
  let token
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: token,
    }))
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
    }
    token = res.NextContinuationToken
  } while (token)
  return keys
}

/**
 * Parse artist/album/title from an S3 key.
 * Strips a leading "music/" prefix if present, then reads folder depth:
 *   Artist/Album/track  → { artist, album, title }
 *   Artist/track        → { artist, album: artist, title }
 *   track               → { artist: 'Unknown', album: 'Unknown', title }
 */
function parseMusicKey(key) {
  // strip optional leading "music/" segment
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Scanning s3://${BUCKET} …\n`)

  let keys
  try {
    keys = await listAllKeys()
  } catch (err) {
    console.error('Failed to list bucket. Check your AWS credentials and region.')
    console.error(err.message)
    process.exit(1)
  }

  console.log(`  Found ${keys.length} objects\n`)

  const music  = []
  const videos = []

  for (const key of keys) {
    const ext = extname(key).toLowerCase()
    const url = `${BASE_URL}/${encodeURIComponent(key).replace(/%2F/g, '/')}`

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
        src:      url,
        artwork:  null,
      })
      console.log(`  ♪  ${artist} — ${title}`)
    } else if (VIDEO_EXTS.has(ext)) {
      const name = basename(key, ext)
      videos.push({
        id:        `video_${slugify(name)}`,
        title:     name,
        type:      'movie',
        year:      null,
        duration:  0,
        src:       url,
        thumbnail: null,
      })
      console.log(`  ▶  ${name}`)
    }
  }

  await writeFile(OUT, JSON.stringify({ music, videos }, null, 2))
  console.log(`\n✓  Wrote library.json — ${music.length} tracks · ${videos.length} videos`)
}

main().catch(err => { console.error(err); process.exit(1) })
