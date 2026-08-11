import { ref } from 'vue'

const UPLOAD_URL    = import.meta.env.VITE_UPLOAD_URL as string | undefined
const UPLOAD_SECRET = import.meta.env.VITE_UPLOAD_SECRET as string | undefined

export function useVideoUpload() {
  const uploading = ref(false)
  const progress  = ref(0)
  const error     = ref<string | null>(null)

  async function upload(file: File) {
    if (!UPLOAD_URL || !UPLOAD_SECRET) {
      error.value = 'Upload is not configured — run scripts/deploy-upload-presign.sh and set VITE_UPLOAD_URL / VITE_UPLOAD_SECRET in .env.local'
      return false
    }

    uploading.value = true
    progress.value = 0
    error.value = null

    try {
      const presignRes = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-upload-secret': UPLOAD_SECRET,
        },
        body: JSON.stringify({ filename: file.name }),
      })

      if (!presignRes.ok) {
        const body = await presignRes.json().catch(() => ({}) as { error?: string })
        throw new Error(body.error ?? `Could not get upload URL (HTTP ${presignRes.status})`)
      }

      const { url, contentType } = (await presignRes.json()) as { url: string; contentType: string }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        xhr.setRequestHeader('content-type', contentType)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) progress.value = Math.round((e.loaded / e.total) * 100)
        }
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (HTTP ${xhr.status})`))
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.send(file)
      })

      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Upload failed'
      return false
    } finally {
      uploading.value = false
    }
  }

  return { upload, uploading, progress, error }
}
