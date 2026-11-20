import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  Sliders,
  Mic,
  Loader2,
  Check,
  Clock,
  Repeat,
  MonitorPlay,
  Smartphone,
  ZoomIn,
  Globe,
  Flag,
} from 'lucide-react'
import type { Clip } from '../lib/types'
import { formatTime, cn } from '../lib/utils'

interface ClipTimelineEditorProps {
  clip: Clip
  videoPath: string
  renderedPath?: string | null
  renderTimestamp?: number
  activeSoundProfile: {
    preset: string
    cloningEnabled: boolean
    sampleName: string | null
  }
  startTime: number
  endTime: number
  audioMode: string
  hookOffsetSec: number
  hookText: string
  onStartTimeChange: (time: number) => void
  onEndTimeChange: (time: number) => void
  onAudioModeChange: (mode: string) => void
  onHookOffsetChange: (offset: number) => void
  onHookTextChange: (text: string) => void
  onSaveHookText: () => Promise<void>
  onSynthesizeVoice: () => Promise<void>
  onRerender: () => Promise<void>
  isSynthesizing: boolean
  isRerendering: boolean
}

const VOICE_PRESET_NAMES: Record<string, string> = {
  af_heart: 'Heart (Warm & Engaging)',
  af_bella: 'Bella (Clear & Upbeat)',
  af_nicole: 'Nicole (Relaxed & Natural)',
  am_adam: 'Adam (Confident & Direct)',
  am_michael: 'Michael (Deep & Grounded)',
}

// Realistic video editing nudge steps:
// 1 frame at 30fps is ~0.033s; plus standard 1 second and 5 second jumps.
const REALISTIC_NUDGE_STEPS = [
  { label: '-5s', delta: -5.0, title: 'Step back 5 seconds' },
  { label: '-1s', delta: -1.0, title: 'Step back 1 second' },
  { label: '-1f', delta: -0.033, title: 'Step back 1 frame (1/30s)' },
  { label: '+1f', delta: 0.033, title: 'Step forward 1 frame (1/30s)' },
  { label: '+1s', delta: 1.0, title: 'Step forward 1 second' },
  { label: '+5s', delta: 5.0, title: 'Step forward 5 seconds' },
]

export function ClipTimelineEditor({
  clip,
  videoPath,
  renderedPath,
  renderTimestamp = 0,
  activeSoundProfile,
  startTime,
  endTime,
  audioMode,
  hookOffsetSec,
  hookText,
  onStartTimeChange,
  onEndTimeChange,
  onAudioModeChange,
  onHookOffsetChange,
  onHookTextChange,
  onSaveHookText,
  onSynthesizeVoice,
  onRerender,
  isSynthesizing,
  isRerendering,
}: ClipTimelineEditorProps) {
  const currentDuration = Math.max(0.1, endTime - startTime)

  // Overall video duration (detected from video element metadata or default)
  const [totalVideoDuration, setTotalVideoDuration] = useState<number>(Math.max(endTime + 60, 120))
  // Zoom mode: 'focus' (zoom around clip +/- 25s) or 'all' (whole video overview)
  const [zoomMode, setZoomMode] = useState<'focus' | 'all'>('focus')

  // Player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(startTime)
  const [isMuted, setIsMuted] = useState(false)
  const [isLooping, setIsLooping] = useState(true)
  const [previewMode, setPreviewMode] = useState<'live' | 'rendered'>('live')
  const [isDucked, setIsDucked] = useState(false)
  const [hookDuration, setHookDuration] = useState(3.0)

  // Dragging state on sequencer
  const [dragTarget, setDragTarget] = useState<'start' | 'end' | 'hook' | 'playhead' | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hookAudioRef = useRef<HTMLAudioElement | null>(null)
  const sequencerTrackRef = useRef<HTMLDivElement | null>(null)

  // Determine view span for sequencer
  const viewStart = zoomMode === 'all' ? 0 : Math.max(0, startTime - 25)
  const viewEnd = zoomMode === 'all' ? totalVideoDuration : Math.min(totalVideoDuration, endTime + 25)
  const viewSpan = Math.max(1, viewEnd - viewStart)

  // Load actual hook duration if audio exists
  useEffect(() => {
    if (clip.hook_audio_path) {
      const audio = new Audio(`/api/media?path=${encodeURIComponent(clip.hook_audio_path)}`)
      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          setHookDuration(Math.max(1.0, Math.round(audio.duration * 10) / 10))
        }
      }
    }
  }, [clip.hook_audio_path])

  // Constrain voice hook offset so it ALWAYS fits within the clip length!
  const maxHookOffset = Math.max(0, parseFloat((currentDuration - hookDuration).toFixed(1)))

  useEffect(() => {
    if (hookOffsetSec > maxHookOffset) {
      onHookOffsetChange(maxHookOffset)
    }
  }, [maxHookOffset, hookOffsetSec, onHookOffsetChange])

  // Storyboard frames for filmstrip
  const storyboardFrames: string[] = React.useMemo(() => {
    try {
      if (clip.storyboard_paths) {
        return JSON.parse(clip.storyboard_paths)
      }
    } catch {
      // ignore
    }
    return []
  }, [clip.storyboard_paths])

  // Active video source URL:
  // In 'live' mode: always streams pristine original video (100% clean audio, zero baked-in hook!)
  // In 'rendered' mode: streams rendered short with cache-busting timestamp
  const activeVideoSrc = React.useMemo(() => {
    if (previewMode === 'rendered' && renderedPath) {
      return `/api/media?path=${encodeURIComponent(renderedPath)}&t=${renderTimestamp || clip.created_at || '1'}`
    }
    // Live mode uses source video with zero baked-in voiceovers
    return `/api/media?path=${encodeURIComponent(videoPath)}`
  }, [previewMode, renderedPath, renderTimestamp, clip.created_at, videoPath])

  // Seek video directly: Allows moving ANYWHERE across the entire video freely!
  const seekVideo = useCallback(
    (targetTime: number) => {
      const clamped = Math.max(0, Math.min(totalVideoDuration, targetTime))
      setCurrentTime(clamped)
      if (videoRef.current) {
        if (previewMode === 'rendered') {
          // Rendered video is relative to clip start
          videoRef.current.currentTime = Math.max(0, Math.min(currentDuration, clamped - startTime))
        } else {
          // Master source video uses absolute timestamp
          videoRef.current.currentTime = clamped
        }
      }
    },
    [startTime, currentDuration, previewMode, totalVideoDuration]
  )

  // Re-position video when source or in-point changes
  useEffect(() => {
    seekVideo(startTime)
  }, [activeVideoSrc, startTime, seekVideo])

  // Handle video metadata loaded to capture true video duration
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration
      if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
        setTotalVideoDuration(Math.max(dur, endTime + 10))
      }
    }
  }

  // Toggle Play / Pause
  const handleTogglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
      if (hookAudioRef.current) hookAudioRef.current.pause()
      setIsPlaying(false)
      setIsDucked(false)
      videoRef.current.volume = isMuted ? 0 : 1.0
    } else {
      // If at or past end, restart from startTime
      if (currentTime >= endTime - 0.2) {
        seekVideo(startTime)
      }
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.warn('Play prevented:', err))
    }
  }

  // Live video time update handler
  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    const vTime = videoRef.current.currentTime
    const absTime = previewMode === 'rendered' ? startTime + vTime : vTime
    setCurrentTime(absTime)

    // Clip boundary limit when playing inside clip
    if (absTime >= endTime) {
      if (isLooping) {
        seekVideo(startTime)
        if (hookAudioRef.current) {
          hookAudioRef.current.currentTime = 0
        }
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
        if (hookAudioRef.current) hookAudioRef.current.pause()
        setIsDucked(false)
        videoRef.current.volume = isMuted ? 0 : 1.0
        return
      }
    }

    // Live Audio Routing & Ducking
    if (audioMode === 'original') {
      // 100% CLEAN ORIGINAL SOUND: Never play hook audio, never duck!
      if (hookAudioRef.current && !hookAudioRef.current.paused) {
        hookAudioRef.current.pause()
        hookAudioRef.current.currentTime = 0
      }
      if (videoRef.current.volume !== (isMuted ? 0 : 1.0)) {
        videoRef.current.volume = isMuted ? 0 : 1.0
      }
      if (isDucked) setIsDucked(false)
    } else if (previewMode === 'live' && clip.hook_audio_path && hookAudioRef.current) {
      // Intro Hook or Custom Voiceover in Live Edit Mode:
      const hookStart = startTime + hookOffsetSec
      const hookEnd = hookStart + hookDuration

      if (absTime >= hookStart && absTime < hookEnd) {
        if (!isDucked) {
          setIsDucked(true)
          if (!isMuted) videoRef.current.volume = 0.15 // Duck video volume to 15%
          const elapsed = absTime - hookStart
          if (Math.abs(hookAudioRef.current.currentTime - elapsed) > 0.25) {
            hookAudioRef.current.currentTime = Math.max(0, elapsed)
          }
          if (hookAudioRef.current.paused && isPlaying) {
            hookAudioRef.current.play().catch(() => {})
          }
        }
      } else {
        if (isDucked) {
          setIsDucked(false)
          if (!isMuted) videoRef.current.volume = 1.0
          if (!hookAudioRef.current.paused) {
            hookAudioRef.current.pause()
          }
        }
      }
    }
  }

  // Step by delta seconds
  const handleStep = (seconds: number) => {
    if (videoRef.current && isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    }
    seekVideo(currentTime + seconds)
  }

  // Mark current frame as Start (In-point)
  const handleMarkStart = () => {
    const newStart = Math.max(0, Math.min(endTime - 2.0, currentTime))
    const rounded = parseFloat(newStart.toFixed(2))
    onStartTimeChange(rounded)
    seekVideo(rounded)
  }

  // Mark current frame as End (Out-point)
  const handleMarkEnd = () => {
    const newEnd = Math.max(startTime + 2.0, Math.min(totalVideoDuration, currentTime))
    const rounded = parseFloat(newEnd.toFixed(2))
    onEndTimeChange(rounded)
    seekVideo(rounded)
  }

  // Helper to calculate time from pointer event on sequencer
  const getTimeFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sequencerTrackRef.current) return viewStart
    const rect = sequencerTrackRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return viewStart + ratio * viewSpan
  }

  // Drag on Sequencer
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const time = getTimeFromPointer(e)
    const tolerance = viewSpan * 0.03 // 3% grab tolerance

    // Check if clicked near Start Pointer
    if (Math.abs(time - startTime) <= tolerance) {
      setDragTarget('start')
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    // Check if clicked near End Pointer
    if (Math.abs(time - endTime) <= tolerance) {
      setDragTarget('end')
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    // Check if clicked inside Hook block
    if (audioMode !== 'original') {
      const hookStart = startTime + hookOffsetSec
      const hookEnd = hookStart + hookDuration
      if (time >= hookStart && time <= hookEnd) {
        setDragTarget('hook')
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }
    }

    // Otherwise, scrub playhead freely
    setDragTarget('playhead')
    e.currentTarget.setPointerCapture(e.pointerId)
    seekVideo(time)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragTarget) return
    const time = getTimeFromPointer(e)

    if (dragTarget === 'start') {
      const newStart = Math.max(0, Math.min(endTime - 2.0, time))
      const rounded = parseFloat(newStart.toFixed(2))
      onStartTimeChange(rounded)
      seekVideo(rounded)
    } else if (dragTarget === 'end') {
      const newEnd = Math.max(startTime + 2.0, Math.min(totalVideoDuration, time))
      const rounded = parseFloat(newEnd.toFixed(2))
      onEndTimeChange(rounded)
      seekVideo(rounded)
    } else if (dragTarget === 'hook') {
      const halfBlock = hookDuration / 2
      const targetOffset = Math.max(0, Math.min(maxHookOffset, time - startTime - halfBlock))
      const rounded = parseFloat(targetOffset.toFixed(1))
      onHookOffsetChange(rounded)
      seekVideo(startTime + rounded)
    } else if (dragTarget === 'playhead') {
      seekVideo(time)
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragTarget) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      setDragTarget(null)
    }
  }

  // Relative positions along the active sequencer view (0% - 100%)
  const toViewPct = (t: number) => {
    return Math.max(0, Math.min(100, ((t - viewStart) / viewSpan) * 100))
  }

  const startPct = toViewPct(startTime)
  const endPct = toViewPct(endTime)
  const playheadPct = toViewPct(currentTime)

  // Voice hook block relative to the clip span
  const hookLeftInClipPct = (hookOffsetSec / currentDuration) * 100
  const hookWidthInClipPct = Math.min(
    100 - hookLeftInClipPct,
    (hookDuration / currentDuration) * 100
  )

  return (
    <div className="bg-stone-900 border-t border-stone-800 text-stone-200 p-5 rounded-b-xl space-y-5 shadow-2xl animate-fade-in font-sans">
      {/* Hidden audio element for synchronized audio preview */}
      {clip.hook_audio_path && (
        <audio
          ref={hookAudioRef}
          src={`/api/media?path=${encodeURIComponent(clip.hook_audio_path)}`}
          preload="auto"
        />
      )}

      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-800 text-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent/20 text-accent ring-1 ring-accent/30">
            <MonitorPlay size={15} />
          </div>
          <div>
            <span className="font-semibold text-white tracking-wide">
              Live Video Preview & Active Sequencer
            </span>
            <span className="text-stone-400 ml-2">
              • Scrub freely across the video or slide Start & End handles below
            </span>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex rounded-lg bg-stone-800 p-0.5 border border-stone-700/60 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setPreviewMode('live')
                seekVideo(startTime)
              }}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer',
                previewMode === 'live'
                  ? 'bg-accent text-white shadow-xs font-semibold'
                  : 'text-stone-400 hover:text-white'
              )}
            >
              <MonitorPlay size={12} />
              Live Edit Preview
            </button>
            {renderedPath && (
              <button
                type="button"
                onClick={() => {
                  setPreviewMode('rendered')
                  seekVideo(startTime)
                }}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer',
                  previewMode === 'rendered'
                    ? 'bg-stone-700 text-white shadow-xs font-semibold'
                    : 'text-stone-400 hover:text-white'
                )}
              >
                <Smartphone size={12} />
                Rendered 9:16 Short
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-800 border border-stone-700 text-[11px] font-mono text-stone-300">
            <Clock size={12} className="text-accent" />
            <span>{formatTime(currentTime)}</span>
          </div>
        </div>
      </div>

      {/* Video Viewport Monitor */}
      <div className="relative rounded-xl overflow-hidden bg-black border border-stone-800 shadow-inner group flex items-center justify-center aspect-video max-h-[310px] mx-auto w-full max-w-3xl">
        <video
          ref={videoRef}
          src={activeVideoSrc}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
            if (!isLooping) setIsPlaying(false)
          }}
          playsInline
          className={cn(
            'w-full h-full',
            previewMode === 'rendered' ? 'object-contain' : 'object-cover'
          )}
        />

        {/* Live Audio Ducking Badge */}
        {isDucked && (
          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-rose-600/90 text-white text-[11px] font-bold tracking-wide backdrop-blur-md flex items-center gap-1.5 shadow-md animate-pulse">
            <Mic size={12} />
            Hook Speaking • Original Sound Ducked (15%)
          </div>
        )}

        {/* Audio Mode Badge */}
        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-black/70 text-stone-300 text-[10px] font-mono backdrop-blur-xs border border-white/10">
          {audioMode === 'original'
            ? 'Original Sound Only (Zero Voiceover)'
            : audioMode === 'intro_hook'
            ? 'Hook at Start (0:00)'
            : `Hook @ +${hookOffsetSec.toFixed(1)}s`}
        </div>

        {/* Center play icon when paused */}
        {!isPlaying && (
          <button
            type="button"
            onClick={handleTogglePlay}
            className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-accent/90 hover:bg-accent text-white flex items-center justify-center transition-transform hover:scale-110 shadow-lg cursor-pointer"
            title="Play preview"
          >
            <Play size={20} className="fill-white ml-0.5" />
          </button>
        )}

        {/* Bottom HUD */}
        <div className="absolute bottom-2 inset-x-2 px-3 py-1 rounded bg-black/65 backdrop-blur-xs flex items-center justify-between text-[11px] text-stone-300 font-mono">
          <span>Clip: {formatTime(startTime)} → {formatTime(endTime)}</span>
          <span className="text-accent font-semibold">{currentDuration.toFixed(1)}s Length</span>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* LIVE VIDEO SCRUBBER BAR: Move ANYWHERE across the video!     */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-3xl mx-auto space-y-1">
        <div className="flex items-center gap-2.5 p-2 rounded-xl bg-stone-800/90 border border-stone-700/80">
          <span className="font-mono text-[11px] text-emerald-400 font-bold min-w-[50px]">
            {formatTime(currentTime)}
          </span>

          {/* Continuous interactive scrub bar spanning entire video */}
          <div className="relative flex-1 flex items-center py-1">
            <input
              type="range"
              min={0}
              max={totalVideoDuration}
              step="0.033"
              value={currentTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                seekVideo(val)
              }}
              className="w-full accent-accent h-2 bg-stone-900 rounded-lg cursor-pointer"
              title="Drag or click anywhere to jump instantly to any point in the video"
            />
          </div>

          <span className="font-mono text-[11px] text-stone-400 min-w-[50px] text-right">
            {formatTime(totalVideoDuration)}
          </span>
        </div>

        {/* Transport Buttons Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-stone-800/70 border border-stone-700/60 text-xs">
          {/* Play & Jumps */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="p-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors shadow-xs cursor-pointer"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} className="fill-white" />}
            </button>
            <button
              type="button"
              onClick={() => seekVideo(startTime)}
              className="p-1.5 rounded-lg bg-stone-700 text-stone-200 hover:bg-stone-600 transition-colors cursor-pointer"
              title="Replay from clip start"
            >
              <RotateCcw size={13} />
            </button>

            {/* Step 1 frame buttons (0.033s at 30fps) */}
            <button
              type="button"
              onClick={() => handleStep(-1.0)}
              className="px-2 py-1 rounded bg-stone-700/80 hover:bg-stone-600 text-stone-200 text-[11px] font-mono cursor-pointer"
              title="Jump back 1 second"
            >
              -1s
            </button>
            <button
              type="button"
              onClick={() => handleStep(-0.033)}
              className="px-1.5 py-1 rounded bg-stone-700/80 hover:bg-stone-600 text-stone-200 text-[11px] font-mono cursor-pointer"
              title="Step back 1 frame (1/30 sec)"
            >
              -1f
            </button>
            <button
              type="button"
              onClick={() => handleStep(0.033)}
              className="px-1.5 py-1 rounded bg-stone-700/80 hover:bg-stone-600 text-stone-200 text-[11px] font-mono cursor-pointer"
              title="Step forward 1 frame (1/30 sec)"
            >
              +1f
            </button>
            <button
              type="button"
              onClick={() => handleStep(1.0)}
              className="px-2 py-1 rounded bg-stone-700/80 hover:bg-stone-600 text-stone-200 text-[11px] font-mono cursor-pointer"
              title="Jump forward 1 second"
            >
              +1s
            </button>
          </div>

          {/* Quick Mark In / Mark Out Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleMarkStart}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-700 hover:bg-emerald-700 hover:text-white text-stone-200 text-[11px] font-semibold transition-colors cursor-pointer"
              title="Set current playhead frame as clip Start point"
            >
              <Flag size={11} className="text-emerald-400" />
              Set Start Here
            </button>
            <button
              type="button"
              onClick={handleMarkEnd}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-700 hover:bg-emerald-700 hover:text-white text-stone-200 text-[11px] font-semibold transition-colors cursor-pointer"
              title="Set current playhead frame as clip End point"
            >
              <Flag size={11} className="text-emerald-400" />
              Set End Here
            </button>

            <button
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={cn(
                'px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer',
                isLooping
                  ? 'bg-accent/20 text-accent border border-accent/30 font-semibold'
                  : 'text-stone-400 hover:text-stone-200'
              )}
              title="Loop preview within clip boundaries"
            >
              <Repeat size={12} />
              Loop
            </button>

            <button
              type="button"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.muted = !isMuted
                  setIsMuted(!isMuted)
                }
              }}
              className="p-1.5 rounded-md text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ACTIVE SEQUENCER: Sliders & handles directly on the timeline! */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-3 select-none shadow-inner">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
              Active Sequencer
            </span>
            <span className="text-[11px] text-stone-400">
              • Drag the <span className="text-emerald-400 font-bold">START</span> and <span className="text-emerald-400 font-bold">END</span> handles or scrub anywhere
            </span>
          </div>

          {/* View Zoom Toggle */}
          <div className="flex items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={() => setZoomMode('focus')}
              className={cn(
                'px-2.5 py-0.5 rounded font-medium flex items-center gap-1 transition-colors cursor-pointer',
                zoomMode === 'focus'
                  ? 'bg-stone-800 text-white font-bold border border-stone-700'
                  : 'text-stone-400 hover:text-white'
              )}
            >
              <ZoomIn size={11} />
              Zoom on Clip (±25s)
            </button>
            <button
              type="button"
              onClick={() => setZoomMode('all')}
              className={cn(
                'px-2.5 py-0.5 rounded font-medium flex items-center gap-1 transition-colors cursor-pointer',
                zoomMode === 'all'
                  ? 'bg-stone-800 text-white font-bold border border-stone-700'
                  : 'text-stone-400 hover:text-white'
              )}
            >
              <Globe size={11} />
              Whole Video ({formatTime(totalVideoDuration)})
            </button>
          </div>
        </div>

        {/* Ruler Header */}
        <div className="relative h-4 border-b border-stone-800 text-[10px] font-mono text-stone-400">
          <div className="absolute left-0 top-0">{formatTime(viewStart)}</div>
          <div className="absolute left-1/4 top-0 -translate-x-1/2">
            {formatTime(viewStart + viewSpan * 0.25)}
          </div>
          <div className="absolute left-1/2 top-0 -translate-x-1/2">
            {formatTime(viewStart + viewSpan * 0.5)}
          </div>
          <div className="absolute left-3/4 top-0 -translate-x-1/2">
            {formatTime(viewStart + viewSpan * 0.75)}
          </div>
          <div className="absolute right-0 top-0">{formatTime(viewEnd)}</div>
        </div>

        {/* Interactive Timeline Track */}
        <div
          ref={sequencerTrackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative rounded-lg bg-stone-900 border border-stone-800 h-24 cursor-pointer touch-none overflow-hidden"
        >
          {/* Filmstrip storyboard background */}
          {storyboardFrames.length > 0 && (
            <div className="absolute inset-0 flex opacity-20 pointer-events-none">
              {storyboardFrames.map((frame, idx) => (
                <img
                  key={idx}
                  src={`/api/media?path=${encodeURIComponent(frame)}`}
                  alt=""
                  className="h-full flex-1 object-cover grayscale"
                />
              ))}
            </div>
          )}

          {/* Shaded Area BEFORE Start (Unselected footage) */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-black/75 z-10 pointer-events-none border-r border-stone-700"
            style={{ width: `${startPct}%` }}
          />

          {/* Shaded Area AFTER End (Unselected footage) */}
          <div
            className="absolute top-0 bottom-0 right-0 bg-black/75 z-10 pointer-events-none border-l border-stone-700"
            style={{ width: `${100 - endPct}%` }}
          />

          {/* Active Clip Region (Between Start and End) */}
          <div
            className="absolute top-0 bottom-0 z-15 border-y-2 border-emerald-500/80 bg-emerald-500/10 pointer-events-none flex flex-col justify-between p-1.5"
            style={{
              left: `${startPct}%`,
              width: `${Math.max(1, endPct - startPct)}%`,
            }}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-emerald-300 drop-shadow-xs">
              <span className="bg-black/60 px-1 rounded">Start: {formatTime(startTime)}</span>
              <span className="bg-black/60 px-1 rounded">End: {formatTime(endTime)}</span>
            </div>

            {/* Voice Hook Audio Block inside Active Clip Region */}
            {audioMode !== 'original' ? (
              <div
                className={cn(
                  'relative h-8 rounded-md p-1.5 flex items-center justify-between pointer-events-auto shadow-md border cursor-grab active:cursor-grabbing',
                  dragTarget === 'hook'
                    ? 'bg-rose-500 text-white ring-2 ring-white border-white'
                    : 'bg-gradient-to-r from-accent to-rose-600 text-white border-accent-light/40'
                )}
                style={{
                  left: `${hookLeftInClipPct}%`,
                  width: `${Math.max(10, hookWidthInClipPct)}%`,
                }}
                title="Drag to place spoken hook along the clip"
              >
                <div className="flex items-center gap-1 truncate text-[10px] font-bold">
                  <Mic size={11} className="shrink-0" />
                  <span className="truncate">
                    {hookText ? `"${hookText.slice(0, 20)}..."` : 'Voice Hook'}
                  </span>
                </div>
                <span className="text-[9px] font-mono bg-black/40 px-1 rounded shrink-0 ml-1">
                  {hookDuration.toFixed(1)}s
                </span>
              </div>
            ) : (
              <div className="h-6 rounded bg-stone-900/60 border border-dashed border-stone-700 flex items-center justify-center text-[10px] text-stone-400">
                Original video sound • No voiceover added
              </div>
            )}

            <div className="text-center text-[10px] font-bold text-emerald-400 bg-black/60 rounded px-1 self-center">
              {currentDuration.toFixed(1)}s Clip
            </div>
          </div>

          {/* Draggable START POINTER Handle */}
          <div
            className="absolute top-0 bottom-0 w-3 z-30 -ml-1.5 cursor-ew-resize flex flex-col items-center justify-center group"
            style={{ left: `${startPct}%` }}
            title={`Drag to adjust clip start (Currently ${formatTime(startTime)})`}
          >
            <div className="w-1.5 h-full bg-emerald-400 rounded-full shadow-lg group-hover:bg-emerald-300 transition-colors" />
            <div className="absolute top-0 px-1 py-0.5 rounded text-[9px] font-bold bg-emerald-500 text-black shadow-md -translate-y-1/2">
              START
            </div>
          </div>

          {/* Draggable END POINTER Handle */}
          <div
            className="absolute top-0 bottom-0 w-3 z-30 -ml-1.5 cursor-ew-resize flex flex-col items-center justify-center group"
            style={{ left: `${endPct}%` }}
            title={`Drag to adjust clip end (Currently ${formatTime(endTime)})`}
          >
            <div className="w-1.5 h-full bg-emerald-400 rounded-full shadow-lg group-hover:bg-emerald-300 transition-colors" />
            <div className="absolute top-0 px-1 py-0.5 rounded text-[9px] font-bold bg-emerald-500 text-black shadow-md -translate-y-1/2">
              END
            </div>
          </div>

          {/* Playhead Needle */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-accent z-40 pointer-events-none transition-all duration-75"
            style={{ left: `${playheadPct}%` }}
          >
            <div className="w-2.5 h-2.5 bg-accent -ml-1 -mt-0.5 rotate-45 rounded-2xs shadow-md" />
          </div>
        </div>

        {/* Micro-Nudge Toolbar directly below the Sequencer with realistic increments */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
          {/* Start Realistic Nudge */}
          <div className="flex items-center gap-1.5 bg-stone-900 px-2.5 py-1.5 rounded-lg border border-stone-800">
            <span className="text-stone-400 font-semibold text-[11px]">Start:</span>
            <span className="font-mono text-emerald-400 font-bold text-[11px] mr-1">
              {formatTime(startTime)}
            </span>
            <div className="flex gap-1">
              {REALISTIC_NUDGE_STEPS.map((step) => (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => {
                    const next = Math.max(0, Math.min(endTime - 2.0, startTime + step.delta))
                    const rounded = parseFloat(next.toFixed(2))
                    onStartTimeChange(rounded)
                    seekVideo(rounded)
                  }}
                  className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono text-[10px] border border-stone-700 cursor-pointer"
                  title={step.title}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clip Length Badge */}
          <span
            className={cn(
              'px-3 py-1 rounded-full text-xs font-bold tracking-tight',
              currentDuration >= 15 && currentDuration <= 60
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-amber-950 text-amber-300 border border-amber-800'
            )}
          >
            {currentDuration.toFixed(1)}s Clip {currentDuration >= 15 && currentDuration <= 60 ? '• Optimal Short' : ''}
          </span>

          {/* End Realistic Nudge */}
          <div className="flex items-center gap-1.5 bg-stone-900 px-2.5 py-1.5 rounded-lg border border-stone-800">
            <span className="text-stone-400 font-semibold text-[11px]">End:</span>
            <span className="font-mono text-emerald-400 font-bold text-[11px] mr-1">
              {formatTime(endTime)}
            </span>
            <div className="flex gap-1">
              {REALISTIC_NUDGE_STEPS.map((step) => (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => {
                    const next = Math.max(startTime + 2.0, Math.min(totalVideoDuration, endTime + step.delta))
                    const rounded = parseFloat(next.toFixed(2))
                    onEndTimeChange(rounded)
                    seekVideo(rounded)
                  }}
                  className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono text-[10px] border border-stone-700 cursor-pointer"
                  title={step.title}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* AUDIO TRACK OPTIONS (Clean, simple creator language)          */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400">
          Audio Track
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Card 1: Original */}
          <div
            onClick={() => {
              onAudioModeChange('original')
              if (hookAudioRef.current) {
                hookAudioRef.current.pause()
                hookAudioRef.current.currentTime = 0
              }
              if (videoRef.current) {
                videoRef.current.volume = isMuted ? 0 : 1.0
              }
              setIsDucked(false)
            }}
            className={cn(
              'p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between',
              audioMode === 'original'
                ? 'border-accent bg-accent/20 ring-1 ring-accent'
                : 'border-stone-800 bg-stone-850 hover:border-stone-700'
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
                <Volume2 size={14} className="text-accent" />
                Original Video Sound
              </div>
              {audioMode === 'original' && <Check size={14} className="text-accent" />}
            </div>
            <p className="text-[11px] text-stone-400 leading-normal">
              Plays original audio only. Zero voiceover and zero volume changes.
            </p>
          </div>

          {/* Card 2: Hook at Start */}
          <div
            onClick={() => {
              onAudioModeChange('intro_hook')
              onHookOffsetChange(0.0)
              seekVideo(startTime)
            }}
            className={cn(
              'p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between',
              audioMode === 'intro_hook'
                ? 'border-accent bg-accent/20 ring-1 ring-accent'
                : 'border-stone-800 bg-stone-850 hover:border-stone-700'
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
                <Sparkles size={14} className="text-accent" />
                Spoken Hook at Start (0:00)
              </div>
              {audioMode === 'intro_hook' && <Check size={14} className="text-accent" />}
            </div>
            <p className="text-[11px] text-stone-400 leading-normal">
              Hook plays at 0:00. Original sound lowers during voiceover.
            </p>
          </div>

          {/* Card 3: Custom Timing */}
          <div
            onClick={() => onAudioModeChange('custom_voiceover')}
            className={cn(
              'p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between',
              audioMode === 'custom_voiceover'
                ? 'border-accent bg-accent/20 ring-1 ring-accent'
                : 'border-stone-800 bg-stone-850 hover:border-stone-700'
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
                <Sliders size={14} className="text-accent" />
                Custom Hook Timing
              </div>
              {audioMode === 'custom_voiceover' && <Check size={14} className="text-accent" />}
            </div>
            <p className="text-[11px] text-stone-400 leading-normal">
              Drag the hook on the timeline to place it where you want.
            </p>
          </div>
        </div>
      </div>

      {/* Hook Placement Slider (when in Custom Timing) */}
      {audioMode === 'custom_voiceover' && (
        <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/30 space-y-2 animate-fade-in text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <Sliders size={13} className="text-accent" />
              Hook Position in Clip
            </div>
            <span className="font-mono font-bold text-accent px-2.5 py-0.5 rounded bg-stone-900 border border-accent/30">
              Speaks @ +{hookOffsetSec.toFixed(1)}s into clip
            </span>
          </div>

          <input
            type="range"
            min="0.0"
            max={maxHookOffset}
            step="0.1"
            value={hookOffsetSec}
            onChange={(e) => {
              const val = parseFloat(e.target.value)
              onHookOffsetChange(val)
              seekVideo(startTime + val)
            }}
            className="w-full accent-accent cursor-pointer h-1.5 bg-stone-700 rounded-lg"
          />

          <div className="flex items-center justify-between text-[10px] text-stone-400">
            <span>0.0s (Start)</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onHookOffsetChange(0.0)
                  seekVideo(startTime)
                }}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 cursor-pointer"
              >
                At Start (0.0s)
              </button>
              <button
                type="button"
                onClick={() => {
                  const val = Math.min(maxHookOffset, 1.5)
                  onHookOffsetChange(val)
                  seekVideo(startTime + val)
                }}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 cursor-pointer"
              >
                +1.5s
              </button>
              <button
                type="button"
                onClick={() => {
                  const val = Math.min(maxHookOffset, parseFloat((currentDuration / 2).toFixed(1)))
                  onHookOffsetChange(val)
                  seekVideo(startTime + val)
                }}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 cursor-pointer"
              >
                Midway ({(currentDuration / 2).toFixed(1)}s)
              </button>
            </div>
            <span>Max End ({maxHookOffset.toFixed(1)}s)</span>
          </div>
        </div>
      )}

      {/* Voice Profile Banner & Hook Text Script */}
      {audioMode !== 'original' && (
        <div className="space-y-3 p-3.5 rounded-xl bg-stone-800/40 border border-stone-800 text-xs animate-fade-in">
          {/* Active Sound Profile */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2">
              <Mic size={13} className="text-accent" />
              <span className="font-semibold text-stone-300">Voice Profile: </span>
              {activeSoundProfile.cloningEnabled ? (
                <span className="text-accent font-semibold">
                  Cloned Voice ({activeSoundProfile.sampleName || 'User Sample'})
                </span>
              ) : (
                <span className="text-stone-300">
                  {VOICE_PRESET_NAMES[activeSoundProfile.preset] || activeSoundProfile.preset}
                </span>
              )}
            </div>
            <a
              href="/settings"
              className="text-accent hover:underline font-semibold"
            >
              Change in Settings &rarr;
            </a>
          </div>

          {/* Hook Text Input */}
          <div className="space-y-2">
            <label className="block text-stone-400 font-semibold text-[11px] uppercase tracking-wider">
              Hook Spoken Text
            </label>
            <textarea
              rows={2}
              value={hookText}
              onChange={(e) => onHookTextChange(e.target.value)}
              placeholder="Write what the voiceover should say..."
              className="w-full text-xs p-3 rounded-lg border border-stone-700 bg-stone-900 text-white placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSaveHookText}
                  className="px-3 py-1 text-xs rounded-md bg-stone-800 text-stone-200 hover:bg-stone-700 transition-colors cursor-pointer"
                >
                  Save Text
                </button>
                <button
                  type="button"
                  onClick={onSynthesizeVoice}
                  disabled={isSynthesizing}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-accent text-white font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSynthesizing ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Mic size={12} />
                  )}
                  Generate Speech
                </button>
              </div>

              {clip.hook_audio_path && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-stone-400">Audio Preview:</span>
                  <audio
                    controls
                    src={`/api/media?path=${encodeURIComponent(clip.hook_audio_path)}`}
                    className="h-7 w-48 invert hue-rotate-180"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save & Re-render Clip Button */}
      <div className="pt-1">
        <button
          type="button"
          onClick={onRerender}
          disabled={isRerendering}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-all shadow-md disabled:opacity-50 cursor-pointer"
        >
          {isRerendering ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Re-rendering Clip with FFmpeg...
            </>
          ) : (
            <>
              <Sparkles size={14} />
              Save & Re-render Clip
            </>
          )}
        </button>
      </div>
    </div>
  )
}
