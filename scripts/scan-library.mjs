#!/usr/bin/env node
/**
 * scan-library.mjs
 *
 * Scans public/media/music and public/media/video, reads ID3 tags where
 * possible, and writes public/library.json.
 *
 * Usage:
 *   node scripts/scan-library.mjs
 *
 * For richer metadata (ID3 tags from MP3/FLAC/etc) make sure music-metadata
 * is installed:
 *   npm install --save-dev music-metadata
 *
 * Drop media files into:
 *   public/media/music/   ← MP3, FLAC, AAC, WAV, OGG, M4A
 *   public/media/video/   ← MP4, MKV, MOV, AVI, WEBM, M4V
 *
 * Sub-folders are supported. Artist/album folder structure is respected:
 *   public/media/music/Radiohead/OK Computer/01 - Airbag.mp3
 */

import { readdir, writeFile } from 'node:fs/promises'
import { join, extname, basename, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT       = join(__dirname, '..')
const PUBLIC     = join(ROOT, 'public')
const MUSIC_DIR  = join(PUBLIC, 'media', 'music')
const VIDEO_DIR  = join(PUBLIC, 'media', 'video')
const OUT        = join(PUBLIC, 'library.json')

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a'])
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v'])

// ─── Helpers ────────────────────────────────────────────────────────────────

async function walk(dir, exts) {
  const results = []
  if (!existsSync(dir)) return results
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) results.push(...await walk(full, exts))
    else if (exts.has(extname(entry.name).toLowerCase())) results.push(full)
  }
  return results
}

function toPublicPath(abs) {
  return '/' + relative(PUBLIC, abs).replace(/\\/g, '/')
}

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

/** Best-effort parse from folder structure: Artist/Album/Track.mp3 */
function parseFromPath(file) {
  const parts = relative(MUSIC_DIR, dirname(file)).split(/[\\/]/).filter(Boolean)
  const name  = basename(file, extname(file)).replace(/^\d+[\s.\-_]+/, '') // strip track number
  return {
    artist: parts[0] ?? 'Unknown Artist',
    album:  parts[1] ?? 'Unknown Album',
    title:  name,
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Optional: richer metadata via music-metadata
  let mm = null
  try {
    mm = await import('music-metadata')
    console.log('✓ music-metadata available — reading ID3 tags\n')
  } catch {
    console.log('ℹ  music-metadata not found — falling back to filename/folder parsing')
    console.log('   For ID3 tags: npm install --save-dev music-metadata\n')
  }

  // ── Music ────────────────────────────────────────────────────────────────

  const musicFiles = await walk(MUSIC_DIR, AUDIO_EXTS)
  const music = []

  for (const file of musicFiles) {
    const fromPath = parseFromPath(file)
    let entry = {
      id:       `music_${slugify(fromPath.artist)}_${slugify(fromPath.title)}`,
      title:    fromPath.title,
      artist:   fromPath.artist,
      album:    fromPath.album,
      year:     null,
      genre:    null,
      duration: 0,
      src:      toPublicPath(file),
      artwork:  null,
    }

    if (mm) {
      try {
        const meta = await mm.parseFile(file, { duration: true })
        const c = meta.common
        entry = {
          ...entry,
          title:    c.title    ?? fromPath.title,
          artist:   (c.artist ?? c.albumartist) ?? fromPath.artist,
          album:    c.album    ?? fromPath.album,
          year:     c.year     ?? null,
          genre:    c.genre?.[0] ?? null,
          duration: Math.round(meta.format.duration ?? 0),
        }
      } catch {
        console.warn(`  ⚠  Could not parse tags: ${basename(file)}`)
      }
    }

    music.push(entry)
    console.log(`  ♪  ${entry.artist} — ${entry.title}`)
  }

  // ── Video ────────────────────────────────────────────────────────────────

  const videoFiles = await walk(VIDEO_DIR, VIDEO_EXTS)
  const videos = []

  for (const file of videoFiles) {
    const name = basename(file, extname(file))
    videos.push({
      id:        `video_${slugify(name)}`,
      title:     name,
      type:      'movie',    // 'movie' | 'episode' | 'clip'
      year:      null,
      duration:  0,
      src:       toPublicPath(file),
      thumbnail: null,
    })
    console.log(`  ▶  ${name}`)
  }

  // ── Write ────────────────────────────────────────────────────────────────

  await writeFile(OUT, JSON.stringify({ music, videos }, null, 2))
  console.log(`\n✓  Wrote library.json — ${music.length} tracks · ${videos.length} videos`)
}

main().catch(err => { console.error(err); process.exit(1) })
