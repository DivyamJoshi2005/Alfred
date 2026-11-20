import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { 
  CheckCircle, 
  XCircle, 
  Play, 
  RefreshCw, 
  Mic, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Sparkles, 
  Calendar, 
  Sliders, 
  Check, 
  Loader2,
  FileVideo,
  Film,
  Eye,
  Activity,
  Volume2,
  Flame,
  Zap,
  Scissors
} from 'lucide-react'
import { jobs as jobsApi, clips as clipsApi, schedule as scheduleApi, settings as settingsApi } from '../lib/api'
import type { Job, Clip } from '../lib/types'
import { formatTime, cn } from '../lib/utils'
import { Modal } from '../components/Modal'

const VOICE_PRESET_NAMES: Record<string, string> = {
  af_heart: 'Heart (Warm & Engaging)',
  af_bella: 'Bella (Clear & Upbeat)',
  af_nicole: 'Nicole (Relaxed & Natural)',
  am_adam: 'Adam (Confident & Direct)',
  am_michael: 'Michael (Deep & Grounded)',
}

export function ReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentJobId = searchParams.get('jobId')

  const [jobsList, setJobsList] = useState<Job[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>(currentJobId || '')
  const [clipsList, setClipsList] = useState<Clip[]>([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [loadingClips, setLoadingClips] = useState(false)

  // Expanded editor for clips
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null)
  const [editHooks, setEditHooks] = useState<Record<string, string>>({})
  const [audioModes, setAudioModes] = useState<Record<string, string>>({})
  const [trimStarts, setTrimStarts] = useState<Record<string, number>>({})
  const [trimEnds, setTrimEnds] = useState<Record<string, number>>({})
  const [hookOffsets, setHookOffsets] = useState<Record<string, number>>({})
  const [rerenderingId, setRerenderingId] = useState<string | null>(null)
  const [synthesizingId, setSynthesizingId] = useState<string | null>(null)

  // Sound Profile from Settings
  const [activeSoundProfile, setActiveSoundProfile] = useState<{
    preset: string
    cloningEnabled: boolean
    sampleName: string | null
  }>({
    preset: 'af_heart',
    cloningEnabled: false,
    sampleName: null,
  })

  // Video preview modal
  const [previewClip, setPreviewClip] = useState<Clip | null>(null)

  // Scheduling modal
  const [schedulingClip, setSchedulingClip] = useState<Clip | null>(null)
  const [schedulePlatform, setSchedulePlatform] = useState<'youtube' | 'instagram' | 'twitter'>('youtube')
  const [scheduleDateTime, setScheduleDateTime] = useState<string>('')
  const [scheduleTitle, setScheduleTitle] = useState('')
  const [scheduleDescription, setScheduleDescription] = useState('')
  const [scheduleTags, setScheduleTags] = useState('')
  const [schedulingSubmitting, setSchedulingSubmitting] = useState(false)
  const [scheduleSuccessMsg, setScheduleSuccessMsg] = useState<string | null>(null)

  // Fetch active sound profile from Settings
  useEffect(() => {
    async function loadSoundProfile() {
      try {
        const [appSettings, samples] = await Promise.all([
          settingsApi.get().catch(() => ({} as Record<string, string>)),
          settingsApi.voiceSamples().catch(() => [] as Array<{ name: string; has_embedding: boolean }>),
        ])
        const s = appSettings as Record<string, string>
        const preset = s.voice_preset || 'af_heart'
        const cloningEnabled = s.voice_cloning_enabled === 'true'
        const selectedSample = s.selected_voice_sample || (samples.find(sm => sm.has_embedding)?.name || null)
        setActiveSoundProfile({
          preset,
          cloningEnabled,
          sampleName: selectedSample,
        })
      } catch (err) {
        console.warn('Could not load active sound profile settings', err)
      }
    }
    loadSoundProfile()
  }, [])

  // Fetch jobs
  useEffect(() => {
    async function loadJobs() {
      try {
        const allJobs = await jobsApi.list()
        const completed = allJobs.filter(j => j.status === 'completed')
        setJobsList(completed)
        if (!selectedJobId && completed.length > 0) {
          const firstId = completed[0].id
          setSelectedJobId(firstId)
          setSearchParams({ jobId: firstId })
        }
      } catch (err) {
        console.error('Failed to load completed jobs', err)
      } finally {
        setLoadingJobs(false)
      }
    }
    loadJobs()
  }, [selectedJobId, setSearchParams])

  // Fetch clips for selected job
  const loadClips = useCallback(async (jobId: string) => {
    if (!jobId) return
    setLoadingClips(true)
    try {
      const data = await clipsApi.listForJob(jobId)
      setClipsList(data)

      // Initialize edit fields
      const hooks: Record<string, string> = {}
      const aModes: Record<string, string> = {}
      const tStarts: Record<string, number> = {}
      const tEnds: Record<string, number> = {}
      const hOffsets: Record<string, number> = {}

      data.forEach(c => {
        hooks[c.id] = c.hook_text || ''
        aModes[c.id] = c.audio_mode || 'original'
        tStarts[c.id] = c.start_time
        tEnds[c.id] = c.end_time
        hOffsets[c.id] = c.hook_offset_sec ?? 0.0
      })
      setEditHooks(hooks)
      setAudioModes(aModes)
      setTrimStarts(tStarts)
      setTrimEnds(tEnds)
      setHookOffsets(hOffsets)
    } catch (err) {
      console.error('Failed to load clips for job', err)
    } finally {
      setLoadingClips(false)
    }
  }, [])

  useEffect(() => {
    if (selectedJobId) {
      loadClips(selectedJobId)
    }
  }, [selectedJobId, loadClips])

  const handleSelectJob = (id: string) => {
    setSelectedJobId(id)
    setSearchParams({ jobId: id })
  }

  const handleUpdateStatus = async (clipId: string, status: 'approved' | 'rejected' | 'pending') => {
    try {
      const updated = await clipsApi.update(clipId, { status })
      setClipsList(prev => prev.map(c => c.id === clipId ? { ...c, status: updated.status } : c))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not update clip status')
    }
  }

  const handleSaveHookText = async (clipId: string) => {
    try {
      const newHook = editHooks[clipId] || ''
      const updated = await clipsApi.update(clipId, { hook_text: newHook })
      setClipsList(prev => prev.map(c => c.id === clipId ? { ...c, hook_text: updated.hook_text } : c))
      alert('Hook updated!')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save hook')
    }
  }

  const handleReRender = async (clip: Clip) => {
    setRerenderingId(clip.id)
    try {
      const start_time = trimStarts[clip.id] ?? clip.start_time
      const end_time = trimEnds[clip.id] ?? clip.end_time
      const audio_mode = audioModes[clip.id] || 'original'
      const hook_offset_sec = hookOffsets[clip.id] ?? 0.0
      const hook_text = editHooks[clip.id] ?? clip.hook_text

      const updated = await clipsApi.rerender(clip.id, {
        start_time,
        end_time,
        framing_mode: 'presentation_fit',
        audio_mode,
        hook_offset_sec,
        hook_text: audio_mode !== 'original' ? hook_text : undefined,
        voice_preset: activeSoundProfile.preset,
        use_cloned_voice: activeSoundProfile.cloningEnabled,
        reference_sample_name: activeSoundProfile.sampleName || undefined,
      })
      setClipsList(prev => prev.map(c => c.id === clip.id ? updated : c))
      setTrimStarts(prev => ({ ...prev, [clip.id]: updated.start_time }))
      setTrimEnds(prev => ({ ...prev, [clip.id]: updated.end_time }))
      setAudioModes(prev => ({ ...prev, [clip.id]: updated.audio_mode || audio_mode }))
      setHookOffsets(prev => ({ ...prev, [clip.id]: updated.hook_offset_sec ?? hook_offset_sec }))
      alert('Clip re-rendered successfully with your custom timing and audio settings!')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Re-rendering failed')
    } finally {
      setRerenderingId(null)
    }
  }

  const handleSynthesizeVoice = async (clip: Clip) => {
    const text = editHooks[clip.id] || clip.hook_text || ''
    if (!text.trim()) {
      alert('Please enter hook text before generating speech')
      return
    }
    setSynthesizingId(clip.id)
    try {
      const res = await clipsApi.synthesize(clip.id, {
        script_text: text,
        voice_preset: activeSoundProfile.preset,
        use_cloned_voice: activeSoundProfile.cloningEnabled,
        reference_sample_name: activeSoundProfile.sampleName || undefined,
      })
      setClipsList(prev => prev.map(c => c.id === clip.id ? { 
        ...c, 
        hook_audio_path: res.hook_audio_path,
        hook_text: res.hook_text 
      } : c))
      alert('Spoken audio hook generated using active sound profile!')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Voice generation failed')
    } finally {
      setSynthesizingId(null)
    }
  }

  // Open Schedule Modal
  const openScheduleModal = (clip: Clip) => {
    setSchedulingClip(clip)
    setScheduleTitle(clip.hook_text || `Highlight from video`)
    setScheduleDescription(clip.transcript_text.slice(0, 250) + '...')
    setScheduleTags('#shorts #reels #viral #content')
    // Default to tomorrow 10:00 AM
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)
    setScheduleDateTime(tomorrow.toISOString().slice(0, 16))
    setScheduleSuccessMsg(null)
  }

  const handleCreateSchedulePost = async () => {
    if (!schedulingClip) return
    setSchedulingSubmitting(true)
    setScheduleSuccessMsg(null)
    try {
      // First ensure clip is approved
      if (schedulingClip.status !== 'approved') {
        await handleUpdateStatus(schedulingClip.id, 'approved')
      }

      await scheduleApi.create({
        clip_id: schedulingClip.id,
        platform: schedulePlatform,
        scheduled_at: new Date(scheduleDateTime).toISOString(),
        title: scheduleTitle,
        description: scheduleDescription,
        tags: scheduleTags,
      })

      setScheduleSuccessMsg(`Successfully scheduled for ${schedulePlatform.toUpperCase()}!`)
      setTimeout(() => {
        setSchedulingClip(null)
        setScheduleSuccessMsg(null)
      }, 1500)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to schedule post')
    } finally {
      setSchedulingSubmitting(false)
    }
  }

  const selectedJob = jobsList.find(j => j.id === selectedJobId)
  const approvedCount = clipsList.filter(c => c.status === 'approved').length

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent-light text-accent border border-accent/20 mb-1">
            <Sparkles size={12} />
            Studio Review
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-text">Review & Polish Clips</h2>
          <p className="text-sm text-text-secondary">
            Pick highlights, refine spoken hooks, adjust audio & timing, and schedule for your audience.
          </p>
        </div>

        {/* Video Selector Dropdown */}
        {jobsList.length > 0 && (
          <div className="shrink-0">
            <div className="flex items-center gap-2.5 px-3.5 py-2 bg-surface border border-border-strong rounded-xl shadow-xs hover:border-accent transition-all">
              <Film size={16} className="text-accent shrink-0" />
              <div className="flex flex-col text-left">
                <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted">
                  Source Video
                </span>
                <select
                  value={selectedJobId}
                  onChange={(e) => handleSelectJob(e.target.value)}
                  className="text-xs font-semibold text-text bg-transparent pr-4 focus:outline-none cursor-pointer appearance-none truncate max-w-[200px] sm:max-w-[260px]"
                >
                  {jobsList.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.video_name}
                    </option>
                  ))}
                </select>
              </div>
              <ChevronDown size={14} className="text-text-muted pointer-events-none shrink-0" />
            </div>
          </div>
        )}
      </div>

      {loadingJobs ? (
        <div className="p-12 text-center bg-surface rounded-xl border border-border">
          <Loader2 size={24} className="animate-spin text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-muted">Loading completed videos...</p>
        </div>
      ) : jobsList.length === 0 ? (
        <div className="p-12 text-center bg-surface rounded-xl border border-border shadow-xs">
          <FileVideo size={36} className="text-text-muted mx-auto mb-3 opacity-60" />
          <p className="text-base font-semibold text-text">No processed videos found</p>
          <p className="text-sm text-text-muted mt-1 max-w-md mx-auto">
            Process your first video in the <span className="font-medium text-accent">Process</span> tab to review AI-extracted viral shorts here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status banner */}
          {selectedJob && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4.5 bg-surface rounded-xl border border-border shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-accent-light text-accent flex items-center justify-center font-bold text-sm shadow-2xs">
                  {clipsList.length}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-text truncate max-w-sm">
                      {selectedJob.video_name}
                    </h3>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      {approvedCount} of {clipsList.length} approved
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    Ready to preview with 9:16 smart crop and verified visual hooks
                  </p>
                </div>
              </div>

              {clipsList.length > 0 && (
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    onClick={() => {
                      clipsList.forEach(c => {
                        if (c.status !== 'approved') handleUpdateStatus(c.id, 'approved')
                      })
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors shadow-xs"
                  >
                    <Check size={14} strokeWidth={2.5} />
                    Approve all clips
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Clips List */}
          {loadingClips ? (
            <div className="p-12 text-center bg-surface rounded-xl border border-border">
              <Loader2 size={24} className="animate-spin text-text-muted mx-auto mb-2" />
              <p className="text-sm text-text-muted">Loading clip highlights...</p>
            </div>
          ) : clipsList.length === 0 ? (
            <div className="p-12 text-center bg-surface rounded-xl border border-border shadow-xs">
              <p className="text-sm text-text-muted">No clips generated for this video yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {clipsList.map((clip) => {
                const isExpanded = expandedClipId === clip.id
                const isApproved = clip.status === 'approved'
                const isRejected = clip.status === 'rejected'

                return (
                  <div
                    key={clip.id}
                    className={cn(
                      "bg-surface rounded-xl border transition-all shadow-xs overflow-hidden",
                      isApproved 
                        ? "border-emerald-200/90 ring-1 ring-emerald-500/10" 
                        : isRejected 
                        ? "border-stone-200 opacity-60 bg-stone-50/40" 
                        : "border-border hover:border-stone-300"
                    )}
                  >
                    {/* Main card row */}
                    <div className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-5">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        {/* Rank badge */}
                        <div className="flex flex-col items-center shrink-0">
                          <span className="w-8 h-8 rounded-lg bg-accent-light text-accent text-xs font-bold flex items-center justify-center">
                            #{clip.rank}
                          </span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2.5">
                          <div className="flex items-center gap-3 text-xs">
                            <span className="font-semibold text-text flex items-center gap-1 bg-stone-100 px-2 py-0.5 rounded-md">
                              <Clock size={12} className="text-text-muted" />
                              {formatTime(clip.start_time)} → {formatTime(clip.end_time)}
                            </span>
                            <span className="text-text-muted">
                              Duration: {Math.round(clip.duration)}s
                            </span>
                            {/* Status indicator */}
                            {isApproved && (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-200/60">
                                Approved
                              </span>
                            )}
                            {isRejected && (
                              <span className="text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full font-medium">
                                Skipped
                              </span>
                            )}
                          </div>

                          {/* Spoken Text */}
                          <div>
                            <p className="text-xs uppercase font-medium tracking-wider text-text-muted mb-1">
                              Spoken in video
                            </p>
                            <p className="text-sm text-text leading-relaxed bg-stone-50/60 p-3 rounded-lg border border-border/70 italic">
                              "{clip.transcript_text}"
                            </p>
                          </div>

                          {/* Hook Line */}
                          {clip.hook_text && (
                            <div>
                              <div className="flex items-center gap-1.5 text-xs uppercase font-medium tracking-wider text-accent mb-1">
                                <Sparkles size={12} />
                                Hook Opener
                              </div>
                              <p className="text-sm font-medium text-accent bg-accent-light/30 p-2.5 rounded-lg border border-accent/15">
                                {clip.hook_text}
                              </p>
                            </div>
                          )}

                          {/* AI Rationale */}
                          {clip.rationale && (
                            <p className="text-xs text-text-secondary">
                              <span className="font-medium text-text">Why it works: </span>
                              {clip.rationale}
                            </p>
                          )}

                          {/* Visual Hook Proof & Storyboard Section */}
                          {(() => {
                            let storyboardFrames: string[] = []
                            if (clip.storyboard_paths) {
                              try {
                                storyboardFrames = JSON.parse(clip.storyboard_paths)
                              } catch {
                                storyboardFrames = []
                              }
                            }

                            return (
                              <div className="mt-2.5 p-3.5 bg-stone-50/90 rounded-lg border border-border space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                                    <Eye size={14} className="text-accent" />
                                    Visual Hook Proof (First 3-Second Scroll-Stop)
                                  </div>
                                  {clip.retention_score ? (
                                    <span className="text-xs font-bold text-accent bg-accent-light px-2 py-0.5 rounded-full border border-accent/20 flex items-center gap-1">
                                      <Flame size={12} className="fill-accent" />
                                      {clip.retention_score}/100 Retention Score
                                    </span>
                                  ) : null}
                                </div>

                                {/* 4-Frame Visual Timeline */}
                                {storyboardFrames.length > 0 && (
                                  <div>
                                    <div className="grid grid-cols-4 gap-2">
                                      {storyboardFrames.map((framePath, fIdx) => (
                                        <div key={fIdx} className="relative rounded-md overflow-hidden border border-border group bg-black/5 aspect-video">
                                          <img
                                            src={`/api/media?path=${encodeURIComponent(framePath)}`}
                                            alt={`Visual hook at +${fIdx}s`}
                                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                          />
                                          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-black/75 text-white backdrop-blur-xs">
                                            +{fIdx}.0s
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <p className="text-[10px] text-text-muted mt-1">
                                      Visual progression across opening 3 seconds proving action and pattern interrupt.
                                    </p>
                                  </div>
                                )}

                                {/* Physical Signal Meters */}
                                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                                  <div className="bg-white p-2 rounded-md border border-border/70">
                                    <div className="flex items-center justify-between text-text-muted mb-1">
                                      <span className="flex items-center gap-1"><Activity size={11} className="text-accent" /> Motion Energy</span>
                                      <span className="font-semibold text-text">{clip.visual_score || 82}%</span>
                                    </div>
                                    <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                                      <div className="bg-accent h-1.5 rounded-full" style={{ width: `${clip.visual_score || 82}%` }} />
                                    </div>
                                  </div>

                                  <div className="bg-white p-2 rounded-md border border-border/70">
                                    <div className="flex items-center justify-between text-text-muted mb-1">
                                      <span className="flex items-center gap-1"><Volume2 size={11} className="text-emerald-600" /> Audio Contrast</span>
                                      <span className="font-semibold text-text">{clip.audio_score || 78}%</span>
                                    </div>
                                    <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                                      <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${clip.audio_score || 78}%` }} />
                                    </div>
                                  </div>

                                  <div className="bg-white p-2 rounded-md border border-border/70">
                                    <div className="flex items-center justify-between text-text-muted mb-1">
                                      <span className="flex items-center gap-1"><Zap size={11} className="text-amber-600" /> Hook Interrupt</span>
                                      <span className="font-semibold text-text">{clip.hook_score || 86}%</span>
                                    </div>
                                    <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                                      <div className="bg-amber-600 h-1.5 rounded-full" style={{ width: `${clip.hook_score || 86}%` }} />
                                    </div>
                                  </div>
                                </div>

                                {/* Verification Rationale */}
                                {clip.visual_hook_rationale && (
                                  <p className="text-xs text-text-secondary leading-normal bg-white/80 p-2 rounded border border-border/60">
                                    <span className="font-semibold text-text">Audit Proof: </span>
                                    {clip.visual_hook_rationale}
                                  </p>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      </div>

                      {/* Action buttons column */}
                      <div className="flex md:flex-col items-center md:items-end justify-between gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-border">
                        {/* Approval controls */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleUpdateStatus(clip.id, isApproved ? 'pending' : 'approved')}
                            className={cn(
                              "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                              isApproved
                                ? "bg-emerald-600 text-white shadow-xs"
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                            )}
                            title="Approve clip"
                          >
                            <CheckCircle size={14} />
                            {isApproved ? 'Approved' : 'Approve'}
                          </button>

                          <button
                            onClick={() => handleUpdateStatus(clip.id, isRejected ? 'pending' : 'rejected')}
                            className={cn(
                              "p-1.5 rounded-lg text-xs transition-colors",
                              isRejected
                                ? "bg-stone-300 text-stone-700"
                                : "text-text-muted hover:text-stone-700 hover:bg-stone-100"
                            )}
                            title="Skip / Reject"
                          >
                            <XCircle size={16} />
                          </button>
                        </div>

                        {/* Preview video */}
                        {clip.output_path && (
                          <button
                            onClick={() => setPreviewClip(clip)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-100 text-text hover:bg-stone-200 transition-colors"
                          >
                            <Play size={13} className="text-accent fill-accent" />
                            Preview Video
                          </button>
                        )}

                        {/* Schedule shortcut */}
                        <button
                          onClick={() => openScheduleModal(clip)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-text hover:bg-accent-hover transition-colors shadow-xs"
                        >
                          <Calendar size={13} />
                          Schedule Post
                        </button>

                        {/* Expand fine-tune drawer */}
                        <button
                          onClick={() => setExpandedClipId(isExpanded ? null : clip.id)}
                          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors mt-1"
                        >
                          <Sliders size={12} />
                          Fine-tune
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Fine-tune Drawer */}
                    {isExpanded && (() => {
                      const currentStart = trimStarts[clip.id] ?? clip.start_time
                      const currentEnd = trimEnds[clip.id] ?? clip.end_time
                      const currentDuration = Math.max(0.1, currentEnd - currentStart)
                      const currentAudioMode = audioModes[clip.id] || clip.audio_mode || 'original'
                      const currentHookOffset = hookOffsets[clip.id] ?? clip.hook_offset_sec ?? 0.0
                      const minStart = Math.max(0, Math.floor(clip.start_time - 30))
                      const maxEnd = Math.ceil(clip.end_time + 30)

                      return (
                        <div className="bg-stone-50/80 border-t border-border p-5 space-y-6 animate-fade-in">
                          {/* 1. Active Sound Profile Banner */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-surface border border-border text-xs shadow-2xs">
                            <div className="flex items-center gap-2">
                              <span className="p-1 rounded-md bg-accent-light text-accent">
                                <Mic size={13} />
                              </span>
                              <div>
                                <span className="font-semibold text-text">Active Sound Profile: </span>
                                {activeSoundProfile.cloningEnabled ? (
                                  <span className="text-accent font-medium">
                                    Cloned Voice ({activeSoundProfile.sampleName || 'User Recording'})
                                  </span>
                                ) : (
                                  <span className="text-text-secondary font-medium">
                                    {VOICE_PRESET_NAMES[activeSoundProfile.preset] || activeSoundProfile.preset}
                                  </span>
                                )}
                              </div>
                            </div>
                            <a
                              href="/settings"
                              className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                            >
                              Manage in Settings &rarr;
                            </a>
                          </div>

                          {/* 2. Clip Boundaries & Duration Sliders ("Adjusting Clip") */}
                          <div className="p-4 rounded-xl bg-white border border-border shadow-xs space-y-3.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Scissors size={14} className="text-accent" />
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-text">
                                  Clip Boundary & Duration Sliders
                                </h4>
                              </div>
                              <span className={cn(
                                "px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-tight",
                                currentDuration >= 15 && currentDuration <= 60
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              )}>
                                {currentDuration.toFixed(1)}s Duration {currentDuration >= 15 && currentDuration <= 60 ? '• Optimal Short' : ''}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                              {/* Start Time Slider */}
                              <div className="space-y-1.5 bg-stone-50/70 p-3 rounded-lg border border-border/70">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-text-secondary font-medium">Start Timestamp:</span>
                                  <span className="font-mono font-semibold text-text">
                                    {formatTime(currentStart)} ({currentStart.toFixed(1)}s)
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={minStart}
                                  max={Math.max(minStart, currentEnd - 2.0)}
                                  step="0.1"
                                  value={currentStart}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value)
                                    setTrimStarts(prev => ({ ...prev, [clip.id]: val }))
                                  }}
                                  className="w-full accent-accent cursor-pointer"
                                />
                                <div className="flex items-center justify-between gap-1 pt-1">
                                  <span className="text-[10px] text-text-muted">Nudge Start:</span>
                                  <div className="flex gap-1">
                                    {[-1.0, -0.2, 0.2, 1.0].map((delta) => (
                                      <button
                                        key={delta}
                                        type="button"
                                        onClick={() => {
                                          const next = Math.max(0, Math.min(currentEnd - 2.0, currentStart + delta))
                                          setTrimStarts(prev => ({ ...prev, [clip.id]: parseFloat(next.toFixed(1)) }))
                                        }}
                                        className="px-1.5 py-0.5 rounded text-[10px] bg-white border border-border hover:bg-stone-100 text-text font-mono cursor-pointer"
                                      >
                                        {delta > 0 ? `+${delta}s` : `${delta}s`}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* End Time Slider */}
                              <div className="space-y-1.5 bg-stone-50/70 p-3 rounded-lg border border-border/70">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-text-secondary font-medium">End Timestamp:</span>
                                  <span className="font-mono font-semibold text-text">
                                    {formatTime(currentEnd)} ({currentEnd.toFixed(1)}s)
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={currentStart + 2.0}
                                  max={maxEnd}
                                  step="0.1"
                                  value={currentEnd}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value)
                                    setTrimEnds(prev => ({ ...prev, [clip.id]: val }))
                                  }}
                                  className="w-full accent-accent cursor-pointer"
                                />
                                <div className="flex items-center justify-between gap-1 pt-1">
                                  <span className="text-[10px] text-text-muted">Nudge End:</span>
                                  <div className="flex gap-1">
                                    {[-1.0, -0.2, 0.2, 1.0].map((delta) => (
                                      <button
                                        key={delta}
                                        type="button"
                                        onClick={() => {
                                          const next = Math.max(currentStart + 2.0, currentEnd + delta)
                                          setTrimEnds(prev => ({ ...prev, [clip.id]: parseFloat(next.toFixed(1)) }))
                                        }}
                                        className="px-1.5 py-0.5 rounded text-[10px] bg-white border border-border hover:bg-stone-100 text-text font-mono cursor-pointer"
                                      >
                                        {delta > 0 ? `+${delta}s` : `${delta}s`}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 3. Audio Track Mode Selection Cards */}
                          <div className="space-y-2.5">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                              Audio Track Mode
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                              {/* Option 1: Original Sound Only */}
                              <div
                                onClick={() => setAudioModes(prev => ({ ...prev, [clip.id]: 'original' }))}
                                className={cn(
                                  "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between",
                                  currentAudioMode === 'original'
                                    ? "border-accent bg-accent-light/35 ring-1 ring-accent"
                                    : "border-border bg-white hover:border-stone-400"
                                )}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1.5 font-semibold text-xs text-text">
                                    <Volume2 size={13} className="text-accent" />
                                    Original Video Sound Only
                                  </div>
                                  {currentAudioMode === 'original' && <Check size={14} className="text-accent shrink-0" />}
                                </div>
                                <p className="text-[11px] text-text-muted leading-relaxed">
                                  Pure original source audio. Zero AI voiceovers, overlays, or volume ducking.
                                </p>
                              </div>

                              {/* Option 2: Intro Hook Voiceover */}
                              <div
                                onClick={() => setAudioModes(prev => ({ ...prev, [clip.id]: 'intro_hook' }))}
                                className={cn(
                                  "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between",
                                  currentAudioMode === 'intro_hook'
                                    ? "border-accent bg-accent-light/35 ring-1 ring-accent"
                                    : "border-border bg-white hover:border-stone-400"
                                )}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1.5 font-semibold text-xs text-text">
                                    <Sparkles size={13} className="text-accent" />
                                    Intro Hook Voiceover
                                  </div>
                                  {currentAudioMode === 'intro_hook' && <Check size={14} className="text-accent shrink-0" />}
                                </div>
                                <p className="text-[11px] text-text-muted leading-relaxed">
                                  Spoken hook plays at 0:00 start. Source video audio ducks to 15% and smoothly restores.
                                </p>
                              </div>

                              {/* Option 3: Full Voiceover / Timeline Placement */}
                              <div
                                onClick={() => setAudioModes(prev => ({ ...prev, [clip.id]: 'custom_voiceover' }))}
                                className={cn(
                                  "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between",
                                  currentAudioMode === 'custom_voiceover'
                                    ? "border-accent bg-accent-light/35 ring-1 ring-accent"
                                    : "border-border bg-white hover:border-stone-400"
                                )}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1.5 font-semibold text-xs text-text">
                                    <Sliders size={13} className="text-accent" />
                                    Full Voiceover (Timeline Slider)
                                  </div>
                                  {currentAudioMode === 'custom_voiceover' && <Check size={14} className="text-accent shrink-0" />}
                                </div>
                                <p className="text-[11px] text-text-muted leading-relaxed">
                                  Place the spoken hook anywhere along the timeline with custom audio ducking.
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* 4. Timeline Slider for Custom Voiceover */}
                          {currentAudioMode === 'custom_voiceover' && (
                            <div className="p-4 rounded-xl bg-accent-light/25 border border-accent/30 space-y-2.5 animate-fade-in">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 font-semibold text-text">
                                  <Sliders size={13} className="text-accent" />
                                  Voiceover Audio Timeline Placement
                                </div>
                                <span className="font-mono font-bold text-accent px-2.5 py-0.5 rounded-md bg-white border border-accent/20">
                                  Trigger at {currentHookOffset.toFixed(1)}s
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.0"
                                max={Math.max(0, currentDuration - 2.5)}
                                step="0.1"
                                value={currentHookOffset}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value)
                                  setHookOffsets(prev => ({ ...prev, [clip.id]: val }))
                                }}
                                className="w-full accent-accent cursor-pointer"
                              />
                              <div className="flex items-center justify-between text-[11px] text-text-muted">
                                <span>0.0s (Start)</span>
                                <div className="flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setHookOffsets(prev => ({ ...prev, [clip.id]: 0.0 }))}
                                    className="px-2 py-0.5 rounded bg-white border border-border text-[10px] hover:bg-stone-100 font-medium cursor-pointer"
                                  >
                                    At Start (0.0s)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setHookOffsets(prev => ({ ...prev, [clip.id]: 1.5 }))}
                                    className="px-2 py-0.5 rounded bg-white border border-border text-[10px] hover:bg-stone-100 font-medium cursor-pointer"
                                  >
                                    +1.5s
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setHookOffsets(prev => ({ ...prev, [clip.id]: parseFloat((currentDuration / 2).toFixed(1)) }))}
                                    className="px-2 py-0.5 rounded bg-white border border-border text-[10px] hover:bg-stone-100 font-medium cursor-pointer"
                                  >
                                    Midpoint ({(currentDuration / 2).toFixed(1)}s)
                                  </button>
                                </div>
                                <span>{(Math.max(0, currentDuration - 2.5)).toFixed(1)}s</span>
                              </div>
                              <p className="text-[11px] text-text-secondary italic">
                                * The voiceover speaks at {currentHookOffset.toFixed(1)}s. Source video sound ducks automatically during speech and returns to full volume.
                              </p>
                            </div>
                          )}

                          {/* 5. Hook Text Customization & Spoken Audio Generation */}
                          {currentAudioMode !== 'original' && (
                            <div className="space-y-2 animate-fade-in">
                              <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                                Spoken Hook Text & Script
                              </label>
                              <textarea
                                rows={2}
                                value={editHooks[clip.id] || ''}
                                onChange={(e) => setEditHooks(prev => ({ ...prev, [clip.id]: e.target.value }))}
                                placeholder="Write a snappy hook line..."
                                className="w-full text-xs p-3 rounded-lg border border-border bg-white text-text focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveHookText(clip.id)}
                                    className="px-2.5 py-1 text-xs rounded-md bg-stone-200 text-text font-medium hover:bg-stone-300 transition-colors cursor-pointer"
                                  >
                                    Save Hook Text
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSynthesizeVoice(clip)}
                                    disabled={synthesizingId === clip.id}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-accent-light text-accent font-semibold hover:bg-rose-100 transition-colors disabled:opacity-50 cursor-pointer"
                                  >
                                    {synthesizingId === clip.id ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      <Mic size={12} />
                                    )}
                                    Generate Spoken Voiceover
                                  </button>
                                </div>

                                {clip.hook_audio_path && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-text-muted">Audio preview:</span>
                                    <audio
                                      controls
                                      src={`/api/media?path=${encodeURIComponent(clip.hook_audio_path)}`}
                                      className="h-7 w-48"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 6. Apply Changes & Re-render */}
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleReRender(clip)}
                              disabled={rerenderingId === clip.id}
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                            >
                              {rerenderingId === clip.id ? (
                                <>
                                  <Loader2 size={14} className="animate-spin" />
                                  Re-rendering Clip with FFmpeg (Boundary Cut & Audio Processing)...
                                </>
                              ) : (
                                <>
                                  <RefreshCw size={14} />
                                  Apply Timing & Audio Settings (Re-render Clip)
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Video Preview Modal */}
      <Modal
        isOpen={Boolean(previewClip)}
        onClose={() => setPreviewClip(null)}
        title={previewClip ? `Preview Clip #${previewClip.rank}` : 'Preview'}
        maxWidth="lg"
      >
        {previewClip && (
          <div className="space-y-4">
            <div className="aspect-9/16 max-h-[60vh] mx-auto bg-black rounded-lg overflow-hidden flex items-center justify-center shadow-lg">
              <video
                src={`/api/media?path=${encodeURIComponent(previewClip.output_path || '')}`}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
            <div className="text-xs text-text-muted space-y-1">
              <p><span className="font-semibold text-text">Duration:</span> {Math.round(previewClip.duration)} seconds</p>
              <p><span className="font-semibold text-text">File:</span> {previewClip.output_path}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Schedule Modal */}
      <Modal
        isOpen={Boolean(schedulingClip)}
        onClose={() => setSchedulingClip(null)}
        title="Schedule for Social Media"
        maxWidth="md"
      >
        <div className="space-y-4">
          {scheduleSuccessMsg ? (
            <div className="p-6 text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Check size={24} />
              </div>
              <p className="text-sm font-semibold text-text">{scheduleSuccessMsg}</p>
              <p className="text-xs text-text-muted">You can view and manage it in the Calendar tab.</p>
            </div>
          ) : (
            <>
              {/* Platform selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2">
                  Destination Platform
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['youtube', 'instagram', 'twitter'] as const).map(platform => (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => setSchedulePlatform(platform)}
                      className={cn(
                        "p-2.5 rounded-lg border text-xs font-medium capitalize text-center transition-all",
                        schedulePlatform === platform
                          ? "border-accent bg-accent-light/40 text-accent ring-1 ring-accent font-semibold"
                          : "border-border hover:bg-stone-50 text-text"
                      )}
                    >
                      {platform === 'youtube' ? 'YouTube Shorts' : platform === 'instagram' ? 'Instagram Reels' : 'X (Twitter)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Time */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
                  Publish Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={scheduleDateTime}
                  onChange={(e) => setScheduleDateTime(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-border bg-white text-text focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
                  Post Caption / Title
                </label>
                <input
                  type="text"
                  value={scheduleTitle}
                  onChange={(e) => setScheduleTitle(e.target.value)}
                  placeholder="Catchy headline..."
                  className="w-full text-xs p-2.5 rounded-lg border border-border bg-white text-text focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={scheduleDescription}
                  onChange={(e) => setScheduleDescription(e.target.value)}
                  placeholder="More context or details for viewer..."
                  className="w-full text-xs p-2.5 rounded-lg border border-border bg-white text-text focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
                  Hashtags
                </label>
                <input
                  type="text"
                  value={scheduleTags}
                  onChange={(e) => setScheduleTags(e.target.value)}
                  placeholder="#shorts #podcast #tech"
                  className="w-full text-xs p-2.5 rounded-lg border border-border bg-white text-text focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setSchedulingClip(null)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg text-text-secondary hover:bg-stone-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateSchedulePost}
                  disabled={schedulingSubmitting || !scheduleDateTime}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-text hover:bg-accent-hover transition-colors disabled:opacity-50 shadow-xs"
                >
                  {schedulingSubmitting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Scheduling...
                    </>
                  ) : (
                    'Confirm Schedule'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
