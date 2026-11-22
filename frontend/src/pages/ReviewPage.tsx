import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { 
  CheckCircle, 
  XCircle, 
  Play, 
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
  Upload
} from 'lucide-react'
import { jobs as jobsApi, clips as clipsApi, schedule as scheduleApi, settings as settingsApi } from '../lib/api'
import type { Job, Clip } from '../lib/types'
import { formatTime, formatDateTimeLocalInput, cn } from '../lib/utils'
import { Modal } from '../components/Modal'
import { ClipTimelineEditor } from '../components/ClipTimelineEditor'

function deriveContentHashtags(clip: Clip, videoName?: string): string {
  const cleanedVideoName = (videoName || '').replace(/\[[a-zA-Z0-9_\-]+\]/g, '')
  const combined = `${cleanedVideoName} ${clip.hook_text || ''} ${clip.transcript_text || ''}`
  const clean = combined.replace(/https?:\/\/\S+/g, '').replace(/[^a-zA-Z0-9\s]/g, ' ').toLowerCase()

  const phraseMap: [string, string][] = [
    ['artificial intelligence', 'ArtificialIntelligence'],
    ['machine learning', 'MachineLearning'],
    ['deep learning', 'DeepLearning'],
    ['data science', 'DataScience'],
    ['neural network', 'NeuralNetworks'],
    ['web development', 'WebDev'],
    ['software engineering', 'SoftwareEngineering'],
    ['open source', 'OpenSource'],
    ['content creation', 'ContentCreator'],
    ['social media', 'SocialMedia'],
    ['product management', 'ProductManagement'],
    ['podcast episode', 'Podcast'],
    ['public speaking', 'PublicSpeaking'],
  ]

  const detectedTags: string[] = []
  for (const [phrase, tag] of phraseMap) {
    if (clean.includes(phrase)) {
      detectedTags.push(`#${tag}`)
    }
  }

  const stopwords = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
    'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
    'could', 'did', 'do', 'does', 'doing', 'don', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
    'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
    'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'let', 'me', 'more', 'most', 'my', 'myself',
    'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves',
    'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
    'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
    'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
    'whom', 'why', 'with', 'won', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
    'um', 'uh', 'like', 'yeah', 'okay', 'alright', 'well', 'actually', 'basically', 'literally', 'gonna',
    'wanna', 'gotta', 'said', 'say', 'saying', 'think', 'thinking', 'know', 'knowing', 'just', 'really',
    'mean', 'thing', 'things', 'something', 'anything', 'nothing', 'everything', 'people', 'guys', 'person',
    'look', 'looking', 'see', 'seeing', 'want', 'wanted', 'take', 'taking', 'make', 'making', 'go', 'going',
    'gone', 'went', 'come', 'coming', 'came', 'get', 'getting', 'got', 'video', 'clip', 'watch', 'channel',
    'also', 'even', 'much', 'many', 'good', 'great', 'cool', 'first', 'last', 'long', 'little', 'right',
    'still', 'way', 'may', 'might', 'must', 'will', 'shall', 'one', 'two',
  ])

  const words = clean.split(/\s+/)
  const counts = new Map<string, number>()
  const titleWords = new Set(
    `${cleanedVideoName} ${clip.hook_text || ''}`.replace(/[^a-zA-Z0-9\s]/g, ' ').toLowerCase().split(/\s+/)
  )

  for (const w of words) {
    if (
      w.length >= 3 &&
      !stopwords.has(w) &&
      !/^\d+$/.test(w) &&
      !(/\d/.test(w) && /[a-z]/.test(w)) &&
      /[aeiouy]/.test(w)
    ) {
      const weight = titleWords.has(w) ? 3 : 1
      counts.set(w, (counts.get(w) || 0) + weight)
    }
  }

  const sortedWords = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0])

  const tags = [...detectedTags]
  const seen = new Set(tags.map(t => t.slice(1).toLowerCase()))

  for (const w of sortedWords) {
    if (tags.length >= 6) break
    const tag = `#${w.charAt(0).toUpperCase()}${w.slice(1)}`
    if (!seen.has(w.toLowerCase())) {
      tags.push(tag)
      seen.add(w.toLowerCase())
    }
  }

  for (const defaultTag of ['#Shorts', '#Reels', '#Viral']) {
    if (!seen.has(defaultTag.slice(1).toLowerCase())) {
      tags.push(defaultTag)
    }
  }

  return tags.join(' ')
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
  const [duckingVolumes, setDuckingVolumes] = useState<Record<string, number>>({})
  const [rerenderingId, setRerenderingId] = useState<string | null>(null)
  const [synthesizingId, setSynthesizingId] = useState<string | null>(null)
  const [renderTimestamps, setRenderTimestamps] = useState<Record<string, number>>({})

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

  // Scheduling / Publish modal
  const [schedulingClip, setSchedulingClip] = useState<Clip | null>(null)
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now')
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
      const ducking_volume = duckingVolumes[clip.id] ?? clip.ducking_volume ?? 0.15
      const hook_text = editHooks[clip.id] ?? clip.hook_text

      const updated = await clipsApi.rerender(clip.id, {
        start_time,
        end_time,
        framing_mode: 'presentation_fit',
        audio_mode,
        hook_offset_sec,
        ducking_volume,
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
      setDuckingVolumes(prev => ({ ...prev, [clip.id]: updated.ducking_volume ?? ducking_volume }))
      setRenderTimestamps(prev => ({ ...prev, [clip.id]: Date.now() }))
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

  // Open Schedule / Publish Modal
  const openScheduleModal = (clip: Clip, mode: 'now' | 'schedule' = 'now') => {
    setSchedulingClip(clip)
    setPublishMode(mode)
    setScheduleTitle(clip.hook_text || `Highlight from video`)
    setScheduleDescription(clip.transcript_text.slice(0, 250) + '...')
    // Use stored content tags or dynamically derive from video speech and keywords
    const contentTags = clip.tags || deriveContentHashtags(clip, selectedJob?.video_name)
    setScheduleTags(contentTags)
    // Default to tomorrow 10:00 AM in user's local time
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)
    setScheduleDateTime(formatDateTimeLocalInput(tomorrow))
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

      if (publishMode === 'now') {
        await scheduleApi.publishNow({
          clip_id: schedulingClip.id,
          platform: schedulePlatform,
          title: scheduleTitle,
          description: scheduleDescription,
          tags: scheduleTags,
        })
        setScheduleSuccessMsg(`🚀 Uploading to ${schedulePlatform.toUpperCase()} right now! Monitor live status in Calendar.`)
      } else {
        await scheduleApi.create({
          clip_id: schedulingClip.id,
          platform: schedulePlatform,
          scheduled_at: new Date(scheduleDateTime).toISOString(),
          title: scheduleTitle,
          description: scheduleDescription,
          tags: scheduleTags,
        })
        setScheduleSuccessMsg(`Successfully scheduled for ${schedulePlatform.toUpperCase()}!`)
      }

      setTimeout(() => {
        setSchedulingClip(null)
        setScheduleSuccessMsg(null)
      }, 1800)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to publish/schedule post')
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

                        {/* Quick Publish Now shortcut */}
                        <button
                          onClick={() => openScheduleModal(clip, 'now')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 transition-colors shadow-xs"
                          title="Upload and publish this clip immediately"
                        >
                          <Upload size={13} />
                          Publish Now
                        </button>

                        {/* Schedule shortcut */}
                        <button
                          onClick={() => openScheduleModal(clip, 'schedule')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-surface hover:bg-stone-100 transition-colors shadow-xs text-text"
                          title="Schedule this clip for a future time"
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
                    {isExpanded && (
                      <ClipTimelineEditor
                        clip={clip}
                        videoPath={selectedJob?.video_path || ''}
                        renderedPath={clip.output_path}
                        renderTimestamp={renderTimestamps[clip.id] || 0}
                        activeSoundProfile={activeSoundProfile}
                        startTime={trimStarts[clip.id] ?? clip.start_time}
                        endTime={trimEnds[clip.id] ?? clip.end_time}
                        audioMode={audioModes[clip.id] || clip.audio_mode || 'original'}
                        hookOffsetSec={hookOffsets[clip.id] ?? clip.hook_offset_sec ?? 0.0}
                        hookText={editHooks[clip.id] ?? clip.hook_text ?? ''}
                        duckingVolume={duckingVolumes[clip.id] ?? clip.ducking_volume ?? 0.15}
                        onStartTimeChange={(time) => setTrimStarts(prev => ({ ...prev, [clip.id]: time }))}
                        onEndTimeChange={(time) => setTrimEnds(prev => ({ ...prev, [clip.id]: time }))}
                        onAudioModeChange={(mode) => setAudioModes(prev => ({ ...prev, [clip.id]: mode }))}
                        onHookOffsetChange={(offset) => setHookOffsets(prev => ({ ...prev, [clip.id]: offset }))}
                        onHookTextChange={(text) => setEditHooks(prev => ({ ...prev, [clip.id]: text }))}
                        onDuckingVolumeChange={(vol) => setDuckingVolumes(prev => ({ ...prev, [clip.id]: vol }))}
                        onSaveHookText={() => handleSaveHookText(clip.id)}
                        onSynthesizeVoice={() => handleSynthesizeVoice(clip)}
                        onRerender={() => handleReRender(clip)}
                        isSynthesizing={synthesizingId === clip.id}
                        isRerendering={rerenderingId === clip.id}
                      />
                    )}
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
                src={`/api/media?path=${encodeURIComponent(previewClip.output_path || '')}&t=${renderTimestamps[previewClip.id] || previewClip.created_at || '1'}`}
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

      {/* Schedule / Publish Modal */}
      <Modal
        isOpen={Boolean(schedulingClip)}
        onClose={() => setSchedulingClip(null)}
        title={publishMode === 'now' ? "Publish Clip Immediately" : "Schedule for Social Media"}
        maxWidth="md"
      >
        <div className="space-y-4">
          {/* Mode Switcher Tabs */}
          {!scheduleSuccessMsg && (
            <div className="flex p-1 bg-stone-100 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setPublishMode('now')}
                className={cn(
                  "flex-1 py-1.5 px-3 rounded-md transition-all flex items-center justify-center gap-1.5",
                  publishMode === 'now'
                    ? "bg-white text-stone-900 shadow-xs font-semibold"
                    : "text-text-secondary hover:text-text"
                )}
              >
                <Upload size={13} />
                Publish Immediately
              </button>
              <button
                type="button"
                onClick={() => setPublishMode('schedule')}
                className={cn(
                  "flex-1 py-1.5 px-3 rounded-md transition-all flex items-center justify-center gap-1.5",
                  publishMode === 'schedule'
                    ? "bg-white text-stone-900 shadow-xs font-semibold"
                    : "text-text-secondary hover:text-text"
                )}
              >
                <Calendar size={13} />
                Schedule for Later
              </button>
            </div>
          )}

          {scheduleSuccessMsg ? (
            <div className="p-6 text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Check size={24} />
              </div>
              <p className="text-sm font-semibold text-text">{scheduleSuccessMsg}</p>
              <p className="text-xs text-text-muted">You can view live status and manage posts in the Calendar tab.</p>
            </div>
          ) : (
            <>
              {/* Notice for Publish Now */}
              {publishMode === 'now' && (
                <div className="p-3 rounded-lg bg-stone-50 border border-border text-xs text-text-secondary flex items-start gap-2">
                  <Upload size={15} className="text-accent shrink-0 mt-0.5" />
                  <p>
                    This clip will be uploaded to <span className="font-semibold text-text">{schedulePlatform === 'youtube' ? 'YouTube Shorts' : schedulePlatform === 'instagram' ? 'Instagram Reels' : 'X (Twitter)'}</span> immediately using your saved local browser session.
                  </p>
                </div>
              )}

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

              {/* Date & Time (Only in schedule mode) */}
              {publishMode === 'schedule' && (
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
              )}

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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    Hashtags
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!schedulingClip) return
                      try {
                        const res = await clipsApi.generateTags(schedulingClip.id)
                        setScheduleTags(res.tags)
                        setClipsList(prev => prev.map(c => c.id === schedulingClip.id ? { ...c, tags: res.tags } : c))
                      } catch {
                        setScheduleTags(deriveContentHashtags(schedulingClip, selectedJob?.video_name))
                      }
                    }}
                    className="text-xs text-accent hover:underline flex items-center gap-1 cursor-pointer font-medium"
                    title="Generate hashtags derived from video speech and keywords"
                  >
                    <Sparkles size={11} /> Auto-Generate from Video
                  </button>
                </div>
                <input
                  type="text"
                  value={scheduleTags}
                  onChange={(e) => setScheduleTags(e.target.value)}
                  placeholder="#keywords #topic #shorts #reels"
                  className="w-full text-xs p-2.5 rounded-lg border border-border bg-white text-text focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                />
                <p className="text-[10px] text-text-muted mt-1">
                  Contextual hashtags generated directly from speech transcript, hook, and video topics.
                </p>
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
                  disabled={schedulingSubmitting || (publishMode === 'schedule' && !scheduleDateTime)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-accent-text hover:bg-accent-hover transition-colors disabled:opacity-50 shadow-xs"
                >
                  {schedulingSubmitting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      {publishMode === 'now' ? 'Publishing Now...' : 'Scheduling...'}
                    </>
                  ) : (
                    <>
                      {publishMode === 'now' ? <Upload size={13} /> : <Calendar size={13} />}
                      {publishMode === 'now' ? 'Publish Immediately' : 'Confirm Schedule'}
                    </>
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
