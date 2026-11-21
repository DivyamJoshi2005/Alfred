import { useState, useEffect, useCallback } from 'react'
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Filter,
  RotateCcw,
  AlertTriangle
} from 'lucide-react'
import { schedule as scheduleApi } from '../lib/api'
import type { ScheduledPost } from '../lib/types'
import { cn, formatDisplayDate, formatDateTimeLocalInput, parseUtcDate } from '../lib/utils'
import { Modal } from '../components/Modal'

export function CalendarPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(true)
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Edit modal
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDateTime, setEditDateTime] = useState('')
  const [editTags, setEditTags] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [clearingFailed, setClearingFailed] = useState(false)

  const loadScheduledPosts = useCallback(async () => {
    try {
      const data = await scheduleApi.list()
      setPosts(data)
    } catch (err) {
      console.error('Failed to load schedule', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadScheduledPosts()
  }, [loadScheduledPosts])

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Cancel and remove this scheduled post?')) return
    try {
      await scheduleApi.delete(postId)
      setPosts(prev => prev.filter(p => p.id !== postId))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete post')
    }
  }

  const handleRetryPost = async (postId: string) => {
    setRetryingId(postId)
    try {
      const updated = await scheduleApi.retry(postId)
      setPosts(prev => prev.map(p => p.id === postId ? updated : p))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to retry scheduled upload')
    } finally {
      setRetryingId(null)
    }
  }

  const handleClearFailed = async () => {
    if (!window.confirm('Remove all failed posts from your queue?')) return
    setClearingFailed(true)
    try {
      await scheduleApi.clearFailed()
      setPosts(prev => prev.filter(p => p.status !== 'failed'))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to clear failed posts')
    } finally {
      setClearingFailed(false)
    }
  }

  const handleRetryAll = async () => {
    try {
      await scheduleApi.retryAll()
      await loadScheduledPosts()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to retry all posts')
    }
  }

  const handleOpenEdit = (post: ScheduledPost) => {
    setEditingPost(post)
    setEditTitle(post.title || '')
    setEditDescription(post.description || '')
    setEditTags(post.tags || '')
    // Format to yyyy-MM-ddThh:mm using local wall-clock time
    const dt = parseUtcDate(post.scheduled_at)
    setEditDateTime(formatDateTimeLocalInput(dt))
  }

  const handleSaveEdit = async () => {
    if (!editingPost) return
    setSavingEdit(true)
    try {
      const updated = await scheduleApi.update(editingPost.id, {
        title: editTitle,
        description: editDescription,
        tags: editTags,
        scheduled_at: new Date(editDateTime).toISOString(),
        status: editingPost.status === 'failed' ? 'scheduled' : undefined,
      })
      setPosts(prev => prev.map(p => p.id === editingPost.id ? updated : p))
      setEditingPost(null)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update schedule')
    } finally {
      setSavingEdit(false)
    }
  }

  const formatErrorMessage = (errorStr: string) => {
    if (!errorStr) return ''
    if (errorStr.includes('Executable doesn\'t exist') || errorStr.includes('chrome-headless-shell') || errorStr.includes('playwright install')) {
      return 'Browser engine setup was needed. Playwright Chromium has been downloaded and verified. Click "Retry Upload" to run.'
    }
    if (errorStr.includes('SESSION_EXPIRED') || errorStr.includes('not logged in') || errorStr.includes('connect your') || errorStr.includes('not authenticated')) {
      return 'Account not logged in: Please connect your account in Settings > Social Accounts first.'
    }
    // Clean ASCII banners
    const clean = errorStr.split('\n').filter(l => !l.includes('║') && !l.includes('╔') && !l.includes('╚')).join(' ').trim()
    return clean.slice(0, 300)
  }

  const filteredPosts = posts.filter(p => {
    if (platformFilter !== 'all' && p.platform !== platformFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    return true
  })

  // Group stats
  const scheduledCount = posts.filter(p => p.status === 'scheduled').length
  const uploadedCount = posts.filter(p => p.status === 'uploaded' || p.status === 'completed').length
  const failedCount = posts.filter(p => p.status === 'failed').length

  const getPlatformLabel = (platform: string) => {
    switch (platform) {
      case 'youtube': return 'YouTube Shorts'
      case 'instagram': return 'Instagram Reels'
      case 'twitter': return 'X (Twitter)'
      default: return platform
    }
  }

  const getPlatformBadgeClass = (platform: string) => {
    switch (platform) {
      case 'youtube': return 'bg-red-50 text-red-700 border-red-200'
      case 'instagram': return 'bg-pink-50 text-pink-700 border-pink-200'
      case 'twitter': return 'bg-sky-50 text-sky-700 border-sky-200'
      default: return 'bg-stone-50 text-stone-700 border-stone-200'
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-text">Content Calendar & Queue</h2>
        <p className="text-sm text-text-secondary mt-1">
          Review and manage your scheduled posts. Alfred will automatically post through your local browser profiles.
        </p>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-text-muted">
            <span>Upcoming Posts</span>
            <CalendarIcon size={16} className="text-accent" />
          </div>
          <p className="text-2xl font-bold text-text mt-2">{scheduledCount}</p>
          <p className="text-xs text-text-secondary mt-0.5">Queued in background schedule</p>
        </div>

        <div className="bg-surface rounded-xl border border-border p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-text-muted">
            <span>Published</span>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-text mt-2">{uploadedCount}</p>
          <p className="text-xs text-text-secondary mt-0.5">Successfully uploaded clips</p>
        </div>

        <div className="bg-surface rounded-xl border border-border p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-text-muted">
              <span>Needs Attention</span>
              <AlertCircle size={16} className={cn(failedCount > 0 ? "text-red-600" : "text-amber-600")} />
            </div>
            <p className="text-2xl font-bold text-text mt-2">{failedCount}</p>
            <p className="text-xs text-text-secondary mt-0.5">Failed attempts</p>
          </div>
          {failedCount > 0 && (
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
              <button
                onClick={handleRetryAll}
                className="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 text-xs font-medium bg-stone-900 text-white rounded-md hover:bg-stone-800 transition-colors shadow-xs"
              >
                <RotateCcw size={12} />
                Retry All
              </button>
              <button
                onClick={handleClearFailed}
                disabled={clearingFailed}
                className="inline-flex items-center justify-center gap-1 py-1 px-2 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-md transition-colors"
                title="Remove failed posts"
              >
                <Trash2 size={12} />
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface p-3.5 rounded-xl border border-border shadow-xs">
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-text-muted" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Platform:</span>
          <div className="flex items-center gap-1">
            {['all', 'youtube', 'instagram', 'twitter'].map(plat => (
              <button
                key={plat}
                onClick={() => setPlatformFilter(plat)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md font-medium transition-colors capitalize",
                  platformFilter === plat
                    ? "bg-accent-light text-accent font-semibold"
                    : "text-text-secondary hover:text-text hover:bg-stone-100"
                )}
              >
                {plat === 'all' ? 'All' : plat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Status:</span>
          <div className="flex items-center gap-1">
            {['all', 'scheduled', 'uploaded', 'failed'].map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md font-medium transition-colors capitalize",
                  statusFilter === st
                    ? "bg-stone-200 text-stone-900 font-semibold"
                    : "text-text-secondary hover:text-text hover:bg-stone-100"
                )}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Posts List */}
      {loading ? (
        <div className="p-12 text-center bg-surface rounded-xl border border-border">
          <Loader2 size={24} className="animate-spin text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-muted">Loading your schedule...</p>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="p-12 text-center bg-surface rounded-xl border border-border shadow-xs">
          <CalendarIcon size={36} className="text-text-muted mx-auto mb-3 opacity-60" />
          <p className="text-base font-semibold text-text">No posts scheduled</p>
          <p className="text-sm text-text-muted mt-1 max-w-md mx-auto">
            Go to the <span className="font-medium text-accent">Review</span> tab, approve a highlight clip, and tap "Schedule Post" to queue it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPosts.map((post) => {
            const formattedTime = formatDisplayDate(post.scheduled_at)

            return (
              <div
                key={post.id}
                className="bg-surface rounded-xl border border-border p-5 shadow-xs hover:border-stone-300 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold border", getPlatformBadgeClass(post.platform))}>
                        {getPlatformLabel(post.platform)}
                      </span>
                      <span className="text-xs font-medium text-text-secondary flex items-center gap-1">
                        <Clock size={12} className="text-text-muted" />
                        {formattedTime}
                      </span>
                      {post.status === 'scheduled' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          Scheduled
                        </span>
                      )}
                      {post.status === 'uploaded' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Published
                        </span>
                      )}
                      {post.status === 'failed' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                          Failed ({post.attempts} attempts)
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-semibold text-text truncate">
                      {post.title || 'Untitled Highlight'}
                    </h4>

                    {post.description && (
                      <p className="text-xs text-text-secondary line-clamp-2">
                        {post.description}
                      </p>
                    )}

                    {post.tags && (
                      <p className="text-xs text-accent font-medium">
                        {post.tags}
                      </p>
                    )}

                    {post.last_error && (
                      <div className="p-3 text-xs rounded-lg bg-red-50 text-red-800 border border-red-200/80 space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold text-red-900">
                          <AlertTriangle size={13} className="shrink-0 text-red-600" />
                          <span>Upload Issue</span>
                        </div>
                        <p className="leading-relaxed text-red-700">
                          {formatErrorMessage(post.last_error)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                    {post.status === 'failed' && (
                      <button
                        onClick={() => handleRetryPost(post.id)}
                        disabled={retryingId === post.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 transition-colors shadow-xs disabled:opacity-50"
                        title="Retry upload now"
                      >
                        {retryingId === post.id ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            Retrying...
                          </>
                        ) : (
                          <>
                            <RotateCcw size={13} />
                            Retry
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenEdit(post)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-stone-100 transition-colors"
                      title="Edit timing or caption"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-red-50 transition-colors"
                      title="Cancel post"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={Boolean(editingPost)}
        onClose={() => setEditingPost(null)}
        title="Edit Scheduled Post"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
              Publish Date & Time
            </label>
            <input
              type="datetime-local"
              value={editDateTime}
              onChange={(e) => setEditDateTime(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-border bg-white text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
              Post Headline / Title
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-border bg-white text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-border bg-white text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
              Tags
            </label>
            <input
              type="text"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-border bg-white text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setEditingPost(null)}
              className="px-3.5 py-2 text-xs font-medium rounded-lg text-text-secondary hover:bg-stone-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-text hover:bg-accent-hover transition-colors shadow-xs disabled:opacity-50"
            >
              {savingEdit ? <Loader2 size={13} className="animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
