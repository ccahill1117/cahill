/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CDN_URL?: string
  readonly VITE_UPLOAD_URL?: string
  readonly VITE_UPLOAD_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
