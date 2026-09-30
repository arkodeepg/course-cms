import path from 'path';

// One map for every route that streams a file off the archive. The video route
// used to hardcode video/mp4, which lied about the ~160 avi, m4v, webm, flv and
// mov files in the library and stopped the playable ones from playing at all.
export const CONTENT_TYPES: Record<string, string> = {
  // documents
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.xls': 'application/vnd.ms-excel',
  '.epub': 'application/epub+zip',
  '.zip': 'application/zip',
  // audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  // video
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-asf',
  '.ts': 'video/mp2t',
  // text
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
  '.cube': 'application/octet-stream',
  '.xmp': 'application/rdf+xml',
  // images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

// Containers no browser will decode, whatever Content-Type they are sent with.
// Listed so the player can say so instead of showing a black rectangle.
export const UNPLAYABLE_VIDEO_EXTS = new Set(['.avi', '.flv', '.wmv', '.mkv']);

export function contentTypeFor(filePath: string, fallback = 'application/octet-stream'): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? fallback;
}

export function isUnplayableVideo(filePath: string): boolean {
  return UNPLAYABLE_VIDEO_EXTS.has(path.extname(filePath).toLowerCase());
}
