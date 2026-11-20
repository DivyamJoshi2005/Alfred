import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Upload, 
  Film, 
  Clock, 
  Trash2, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  FolderSearch,
  Sparkles,
  FileVideo,
  Mic,
  Activity,
  Check,
  Eye,
} from 'lucide-react'
import { jobs as jobsApi } from '../lib/api'
import type { Job, LocalVideo, WSMessage } from '../lib/types'
import { formatSize, timeAgo, cn } from '../lib/utils'

interface ProcessPageProps {
  wsEvents: WSMessage[]
}

interface ProgressState {
  phase: string
  progress: number
  message: string
  clipIndex?: number
  clipTotal?: number
}

const ACTIVE_STATUSES = [
  'queued', 
  'processing', 
  'transcribing', 
  'analyzing', 
  'generating_hooks', 
  'cropping', 
  'rendering'
]

const PIPELINE_STAGES = [
  { id: 'transcribing', label: 'Audio & Speech', desc: 'Whisper 16kHz speech transcription', icon: Mic },
  { id: 'analyzing', label: 'Multimodal Scan', desc: 'Visual motion & audio dynamics', icon: Activity },
  { id: 'generating_hooks', label: 'Hook Discovery', desc: 'Llama 3.2 viral hook generation', icon: Sparkles },
  { id: 'cropping', label: 'Smart 9:16 Crop', desc: 'YOLOv8 face tracking & auto-crop', icon: Eye },
  { id: 'rendering', label: 'Short Assembly', desc: 'FFmpeg 9:16 vertical video export', icon: Film },
]

export function ProcessPage({ wsEvents }: ProcessPageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [jobsList, setJobsList] = useState<Job[]>([])
  const [localVideos, setLocalVideos] = useState<LocalVideo[]>([])
  const [videoPath, setVideoPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [filter, setFilter] = useState<'all' | 'processing' | 'completed'>('all')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [jobProgressMap, setJobProgressMap] = useState<Record<string, ProgressState>>({})

  const fetchJobs = useCallback(async () => {
    try {
      const data = await jobsApi.list()
      setJobsList(data)
    } catch (err: unknown) {
      console.error('Failed to load jobs', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLocalVideos = useCallback(async () => {
    try {
      const data = await jobsApi.localVideos()
      setLocalVideos(data)
    } catch (err: unknown) {
      console.error('Failed to scan local videos', err)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
    fetchLocalVideos()
  }, [fetchJobs, fetchLocalVideos])

  // Polling fallback every 2.5s while any job is in active processing
  useEffect(() => {
    const hasActiveJob = jobsList.some(j => ACTIVE_STATUSES.includes(j.status))
    if (!hasActiveJob) return

    const interval = setInterval(() => {
      fetchJobs()
    }, 2500)
    return () => clearInterval(interval)
  }, [jobsList, fetchJobs])

  // Track websocket progress updates
  useEffect(() => {
    if (!wsEvents.length) return
    const latest = wsEvents[wsEvents.length - 1]

    if (latest.type === 'progress') {
      setJobProgressMap(prev => ({
        ...prev,
        [latest.job_id]: {
          phase: latest.phase,
          progress: latest.progress,
          message: latest.message,
          clipIndex: latest.clip_index,
          clipTotal: latest.clip_total,
        }
      }))
    } else if (latest.type === 'job_status') {
      fetchJobs()
    }
  }, [wsEvents, fetchJobs])

  const handleStartProcessing = async (targetPath: string) => {
    if (!targetPath.trim()) {
      setErrorMsg('Please select or enter a video file path')
      return
    }

    setErrorMsg(null)
    setSubmitting(true)
    try {
      const newJob = await jobsApi.create(targetPath.trim())
      setVideoPath('')
      setJobsList(prev => [newJob, ...prev])
      await fetchJobs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not start processing'
      setErrorMsg(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteJob = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Delete this job and its generated clips?')) return
    try {
      await jobsApi.delete(jobId)
      setJobsList(prev => prev.filter(j => j.id !== jobId))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete job')
    }
  }

  const handleFileUpload = async (file: File) => {
    const validExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm']
    const hasValidExt = validExts.some(ext => file.name.toLowerCase().endsWith(ext))
    if (!hasValidExt) {
      setErrorMsg('Unsupported file: ' + file.name + '. Please choose an MP4, MOV, MKV, AVI, or WebM video.')
      return
    }

    setErrorMsg(null)
    setUploadingFileName(file.name)
    setUploadProgress(0)

    try {
      const newJob = await jobsApi.upload(file, (pct) => {
        setUploadProgress(pct)
      })
      setJobsList(prev => [newJob, ...prev.filter(j => j.id !== newJob.id)])
      await fetchJobs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setErrorMsg(msg)
    } finally {
      setUploadingFileName(null)
      setUploadProgress(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      handleFileUpload(file)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      handleFileUpload(file)
      e.target.value = ''
    }
  }

  const activeJob = jobsList.find(j => ACTIVE_STATUSES.includes(j.status))
  const activeProgress = activeJob ? jobProgressMap[activeJob.id] : undefined

  // Determine current active pipeline stage index (0 to 4)
  const getStageIndex = (status: string, phase?: string) => {
    const p = phase || status
    if (p === 'transcribing') return 0
    if (p === 'analyzing') return 1
    if (p === 'generating_hooks') return 2
    if (p === 'cropping') return 3
    if (p === 'rendering') return 4
    return 0
  }

  const currentStageIdx = activeJob 
    ? getStageIndex(activeJob.status, activeProgress?.phase) 
    : 0

  const filteredJobs = jobsList.filter(j => {
    if (filter === 'processing') return ACTIVE_STATUSES.includes(j.status)
    if (filter === 'completed') return j.status === 'completed'
    return true
  })

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-text">Process Video</h2>
        <p className="text-sm text-text-secondary mt-1">
          Drop any long recording, podcast, or travel vlog to transcribe speech, detect visual hooks, and render 9:16 shorts automatically.
        </p>
      </div>

      {/* ── LIVE PIPELINE PROCESSING HUB ──────────────────────── */}
      {activeJob && (
        <div className="bg-surface rounded-2xl border-2 border-accent/30 p-6 shadow-md space-y-6 relative overflow-hidden bg-gradient-to-b from-accent-light/30 via-white to-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent text-accent-text flex items-center justify-center shadow-xs">
                <Loader2 size={22} className="animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
                  </span>
                  <h3 className="text-base font-bold text-text truncate max-w-md">
                    {activeJob.video_name}
                  </h3>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  Pipeline actively processing on your hardware (100% offline)
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-2xl font-black text-accent font-mono">
                {activeProgress ? Math.round(activeProgress.progress) : 5}%
              </span>
              <p className="text-[11px] text-text-muted font-medium">Estimated completion in ~1-2 min</p>
            </div>
          </div>

          {/* Large Animated Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-accent flex items-center gap-1.5">
                <Sparkles size={14} />
                {activeProgress?.message || 'Repurposing video highlights...'}
              </span>
              {activeProgress?.clipTotal && (
                <span className="text-text-secondary font-mono">
                  Clip {activeProgress.clipIndex || 1} of {activeProgress.clipTotal}
                </span>
              )}
            </div>
            <div className="w-full bg-stone-100 rounded-full h-3 overflow-hidden p-0.5 border border-border/80">
              <div
                className="bg-accent h-full rounded-full transition-all duration-300 ease-out shadow-xs"
                style={{ width: `${Math.max(6, activeProgress?.progress || 8)}%` }}
              />
            </div>
          </div>

          {/* 5-Stage Interactive Stepper */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-border/70">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isPast = idx < currentStageIdx
              const isCurrent = idx === currentStageIdx
              const Icon = stage.icon

              return (
                <div
                  key={stage.id}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all",
                    isCurrent
                      ? "bg-white border-accent ring-2 ring-accent/20 shadow-xs"
                      : isPast
                      ? "bg-emerald-50/60 border-emerald-200"
                      : "bg-stone-50/40 border-border/60 opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-xs",
                      isCurrent
                        ? "bg-accent text-accent-text"
                        : isPast
                        ? "bg-emerald-600 text-white"
                        : "bg-stone-200 text-stone-600"
                    )}>
                      {isPast ? <Check size={14} /> : isCurrent ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                    </div>
                    <span className="text-[10px] font-mono text-text-muted">0{idx + 1}</span>
                  </div>
                  <p className="text-xs font-bold text-text truncate">{stage.label}</p>
                  <p className="text-[10px] text-text-muted mt-0.5 truncate">{stage.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main Input Card */}
      <div className="bg-surface rounded-xl border border-border p-6 shadow-xs space-y-6">
        <div>
          <label className="block text-sm font-medium text-text mb-2">
            Select or enter video file
          </label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={videoPath}
                onChange={(e) => setVideoPath(e.target.value)}
                placeholder="/path/to/podcast_episode_12.mp4 or select from discovered list"
                className="w-full px-4 py-2.5 text-sm bg-stone-50/60 border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
              />
            </div>
            <button
              onClick={() => handleStartProcessing(videoPath)}
              disabled={submitting || !videoPath.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-accent-text text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Start Processing
                </>
              )}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-error-light text-error border border-error/20">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Drag and Drop Box */}
        <div
          onClick={() => {
            if (uploadProgress === null) fileInputRef.current?.click()
          }}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer group",
            dragActive 
              ? "border-accent bg-accent-light/30 scale-[1.01]" 
              : "border-border-strong/70 hover:border-accent bg-stone-50/50 hover:bg-stone-50"
          )}
        >
          {uploadProgress !== null ? (
            <div className="space-y-3 py-3 max-w-sm mx-auto">
              <Loader2 size={28} className="animate-spin text-accent mx-auto" />
              <div>
                <p className="text-sm font-semibold text-text truncate">
                  Uploading {uploadingFileName}...
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {uploadProgress}% transferred to Alfred Studio
                </p>
              </div>
              <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden shadow-inner">
                <div
                  className="bg-accent h-2 rounded-full transition-all duration-200 ease-out"
                  style={{ width: `${Math.max(6, uploadProgress)}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 mx-auto rounded-full bg-accent-light text-accent flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Upload size={22} strokeWidth={1.8} />
              </div>
              <p className="text-sm font-semibold text-text">
                Drop your video file here, or <span className="text-accent underline underline-offset-2">browse files</span>
              </p>
              <p className="text-xs text-text-muted mt-1">
                Supports MP4, MOV, MKV, AVI, and WebM (any length or size)
              </p>
            </>
          )}
        </div>

        {/* Local Discovered Videos */}
        {localVideos.length > 0 && (
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-3">
              <FolderSearch size={16} className="text-text-secondary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Discovered in your workspace ({localVideos.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {localVideos.map((vid, idx) => (
                <div
                  key={idx}
                  onClick={() => setVideoPath(vid.path)}
                  className={cn(
                    "flex flex-col justify-between p-3.5 rounded-lg border text-left transition-all cursor-pointer group",
                    videoPath === vid.path
                      ? "border-accent bg-accent-light/20 ring-1 ring-accent"
                      : "border-border bg-white hover:border-stone-400 hover:bg-stone-50/50 shadow-xs"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <FileVideo size={18} className="text-accent shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text truncate group-hover:text-accent transition-colors">
                        {vid.name}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5 truncate">
                        {vid.folder}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/60 text-xs text-text-secondary">
                    <span>{formatSize(vid.size_mb)}</span>
                    <span className="text-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      Select video <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Jobs Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text">Repurposing Pipeline</h3>
            <p className="text-xs text-text-muted">Jobs you have run or are currently processing</p>
          </div>

          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg text-xs font-medium">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-md transition-colors",
                filter === 'all' ? "bg-white text-text shadow-xs" : "text-text-secondary hover:text-text"
              )}
            >
              All ({jobsList.length})
            </button>
            <button
              onClick={() => setFilter('processing')}
              className={cn(
                "px-3 py-1.5 rounded-md transition-colors",
                filter === 'processing' ? "bg-white text-text shadow-xs" : "text-text-secondary hover:text-text"
              )}
            >
              Active
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={cn(
                "px-3 py-1.5 rounded-md transition-colors",
                filter === 'completed' ? "bg-white text-text shadow-xs" : "text-text-secondary hover:text-text"
              )}
            >
              Completed
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center bg-surface rounded-xl border border-border">
            <Loader2 size={24} className="animate-spin text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-muted">Loading your jobs...</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-12 text-center bg-surface rounded-xl border border-border shadow-xs">
            <Film size={32} className="text-text-muted mx-auto mb-3 opacity-60" />
            <p className="text-sm font-medium text-text">No videos processed yet</p>
            <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
              Pick a video above to let Alfred transcribe speech, detect highlights, and generate vertical clips.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => {
              const liveProgress = jobProgressMap[job.id]
              const isJobActive = ACTIVE_STATUSES.includes(job.status)

              return (
                <div
                  key={job.id}
                  className={cn(
                    "bg-surface rounded-xl border p-5 shadow-xs transition-all",
                    isJobActive 
                      ? "border-accent/40 ring-1 ring-accent/20 bg-accent-light/10" 
                      : "border-border hover:border-stone-300"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                        isJobActive ? "bg-accent-light text-accent" : "bg-stone-100 text-text-secondary"
                      )}>
                        {isJobActive ? <Loader2 size={20} className="animate-spin" /> : <Film size={20} />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-text truncate">
                          {job.video_name}
                        </h4>
                        <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {timeAgo(job.created_at)}
                          </span>
                          <span className="truncate max-w-xs">{job.video_path}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Status Badges */}
                      {job.status === 'completed' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={13} />
                          Ready to review
                        </span>
                      )}
                      {isJobActive && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                          <Loader2 size={13} className="animate-spin" />
                          {job.status === 'queued' ? 'Queued' : 
                           job.status === 'transcribing' ? 'Transcribing Speech' :
                           job.status === 'analyzing' ? 'Multimodal Scan' :
                           job.status === 'generating_hooks' ? 'Discovering Hooks' :
                           job.status === 'cropping' ? 'Smart 9:16 Crop' :
                           job.status === 'rendering' ? 'Assembling Clips' : 'Processing'}
                        </span>
                      )}
                      {job.status === 'failed' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          <AlertCircle size={13} />
                          Failed
                        </span>
                      )}

                      {/* Review Button */}
                      {job.status === 'completed' && (
                        <button
                          onClick={() => navigate(`/review?jobId=${job.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-text text-xs font-medium hover:bg-accent-hover transition-colors shadow-xs"
                        >
                          Review Clips
                          <ArrowRight size={13} />
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={(e) => handleDeleteJob(job.id, e)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-red-50 transition-colors"
                        title="Delete job"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Realtime progress bar if actively running */}
                  {isJobActive && (
                    <div className="mt-4 pt-3 border-t border-border/60 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-accent flex items-center gap-1.5">
                          <Loader2 size={12} className="animate-spin" />
                          {liveProgress?.message || 'Processing video pipeline...'}
                        </span>
                        <span className="font-mono font-bold text-text">
                          {liveProgress ? Math.round(liveProgress.progress) : 5}%
                        </span>
                      </div>
                      <div className="w-full bg-stone-200/80 rounded-full h-2 overflow-hidden shadow-inner">
                        <div
                          className="bg-accent h-2 rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${Math.max(6, liveProgress?.progress || 8)}%` }}
                        />
                      </div>
                      {liveProgress?.clipTotal && (
                        <p className="text-xs text-text-muted mt-1 font-mono">
                          Rendering clip {liveProgress.clipIndex || 1} of {liveProgress.clipTotal}
                        </p>
                      )}
                    </div>
                  )}

                  {job.error_msg && (
                    <div className="mt-3 p-2.5 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 flex items-start gap-2">
                      <AlertCircle size={14} className="text-red-600 shrink-0 mt-0.5" />
                      <span className="font-mono">{job.error_msg}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
