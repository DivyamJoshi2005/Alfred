/** Format seconds into mm:ss */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Format file size in MB */
export function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(1)} MB`
}

/** Parse an API date string (UTC) accurately into a local Date object */
export function parseUtcDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date()
  let s = String(dateStr).trim().replace(' ', 'T')
  // If no timezone suffix (Z, +HH:MM, or -HH:MM), treat as UTC
  if (!s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    s += 'Z'
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? new Date() : d
}

/** Convert a Date object to local YYYY-MM-DDTHH:mm string for HTML5 <input type="datetime-local"> */
export function formatDateTimeLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Format an API date string to human-readable local time (e.g. "Nov 22, 10:00 AM") */
export function formatDisplayDate(dateStr: string | null | undefined): string {
  const d = parseUtcDate(dateStr)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Relative time (e.g. "2 hours ago") */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - parseUtcDate(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return parseUtcDate(dateStr).toLocaleDateString()
}

/** Capitalize first letter */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** cn() — merge class names, skipping falsy values */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
