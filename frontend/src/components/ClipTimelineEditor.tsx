import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  Sliders,
  Scissors,
  Mic,
  Loader2,
  Check,
  Clock,
  Repeat,
  MonitorPlay,
  Smartphone,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import type { Clip } from '../lib/types'
import { formatTime, cn } from '../lib/utils'

interface ClipTimelineEditorProps {
  clip: Clip
  videoPath: string
  renderedPath?: string | null
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

export function ClipTimelineEditor({
  clip,
  videoPath,
  renderedPath,
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

  // Player & Timeline state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(startTime)
  const [isMuted, setIsMuted] = useState(false)
  const [isLooping, setIsLooping] = useState(true)
  const [previewViewportMode, setPreviewViewportMode] = useState<'source' | 'rendered'>(
    renderedPath ? 'rendered' : 'source'
  )
  const [isDucked, setIsDucked] = useState(false)
  const [hookDuration, setHookDuration] = useState(3.0)
  const [isDraggingHookBlock, setIsDraggingHookBlock] = useState(false)
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hookAudioRef = useRef<HTMLAudioElement | null>(null)
  const timelineTrackRef = useRef<HTMLDivElement | null>(null)

  // Measure actual hook audio duration if available
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

  // Storyboard frames for Track V1
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

  // Select video source according to viewport mode
  const activeVideoSrc = React.useMemo(() => {
    if (previewViewportMode === 'rendered' && renderedPath) {
      return `/api/media?path=${encodeURIComponent(renderedPath)}`
    }
    return `/api/media?path=${encodeURIComponent(videoPath)}`
  }, [previewViewportMode, renderedPath, videoPath])

  // Seek video directly
  const seekVideo = useCallback(
    (targetTime: number) => {
      const clamped = Math.max(startTime, Math.min(endTime, targetTime))
      setCurrentTime(clamped)
      if (videoRef.current) {
        if (previewViewportMode === 'rendered') {
          // Rendered video starts at 0.0s
          videoRef.current.currentTime = Math.max(0, clamped - startTime)
        } else {
          // Source master video uses absolute timestamp
          videoRef.current.currentTime = clamped
        }
      }
    },
    [startTime, endTime, previewViewportMode]
  )

  // Initial video positioning on mount or src change
  useEffect(() => {
    seekVideo(startTime)
  }, [activeVideoSrc, startTime, seekVideo])

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
      // If at or near end, restart from startTime
      if (currentTime >= endTime - 0.2 || currentTime < startTime) {
        seekVideo(startTime)
      }
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.warn('Video play interrupted:', err))
    }
  }

  // Live video time update handler
  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    const vTime = videoRef.current.currentTime
    const absTime = previewViewportMode === 'rendered' ? startTime + vTime : vTime
    setCurrentTime(absTime)

    // Check end of clip bounds
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

    // Live Voiceover Audio Mixing & Ducking
    if (audioMode !== 'original' && clip.hook_audio_path && hookAudioRef.current) {
      const hookStart = startTime + hookOffsetSec
      const hookEnd = hookStart + hookDuration

      if (absTime >= hookStart && absTime < hookEnd) {
        if (!isDucked) {
          setIsDucked(true)
          if (!isMuted) videoRef.current.volume = 0.15 // Duck background video audio to 15%
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
          if (!isMuted) videoRef.current.volume = 1.0 // Restore video audio
          if (!hookAudioRef.current.paused) {
            hookAudioRef.current.pause()
          }
        }
      }
    } else {
      if (isDucked) {
        setIsDucked(false)
        if (!isMuted) videoRef.current.volume = 1.0
      }
    }
  }

  // Micro frame step
  const handleStep = (seconds: number) => {
    if (videoRef.current && isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    }
    seekVideo(currentTime + seconds)
  }

  // Dragging Voiceover Block on Track A1
  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!timelineTrackRef.current) return
    const rect = timelineTrackRef.current.getBoundingClientRect()
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const clickedSec = clickRatio * currentDuration

    // If user clicked near or on hook block, start drag
    const hookStart = hookOffsetSec
    const hookEnd = hookOffsetSec + hookDuration

    if (clickedSec >= hookStart - 0.5 && clickedSec <= hookEnd + 0.5) {
      setIsDraggingHookBlock(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    } else {
      // Seek playhead directly
      setIsDraggingPlayhead(true)
      e.currentTarget.setPointerCapture(e.pointerId)
      seekVideo(startTime + clickedSec)
    }
  }

  const handleTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!timelineTrackRef.current) return
    const rect = timelineTrackRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const timelineSec = ratio * currentDuration

    if (isDraggingHookBlock) {
      // Center the hook block at cursor, clamped strictly within [0, maxHookOffset]
      const halfBlock = hookDuration / 2
      const targetOffset = Math.max(0, Math.min(maxHookOffset, timelineSec - halfBlock))
      const rounded = parseFloat(targetOffset.toFixed(1))
      onHookOffsetChange(rounded)
      seekVideo(startTime + rounded)
    } else if (isDraggingPlayhead) {
      seekVideo(startTime + timelineSec)
    }
  }

  const handleTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingHookBlock || isDraggingPlayhead) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      setIsDraggingHookBlock(false)
      setIsDraggingPlayhead(false)
    }
  }

  // Relative playhead position (0% - 100%)
  const playheadPercent = Math.max(
    0,
    Math.min(100, ((currentTime - startTime) / currentDuration) * 100)
  )

  // Voice hook block layout
  const hookLeftPercent = (hookOffsetSec / currentDuration) * 100
  const hookWidthPercent = Math.min(
    100 - hookLeftPercent,
    (hookDuration / currentDuration) * 100
  )

  return (
    <div className="bg-stone-900/95 border-t border-stone-800 text-stone-200 p-5 rounded-b-xl space-y-6 shadow-2xl animate-fade-in font-sans">
      {/* Hidden audio element for synchronous live ducking during preview */}
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
              Live Preview & Timeline Deck
            </span>
            <span className="text-stone-400 ml-2">
              • Frame-accurate boundary trim & voiceover positioning
            </span>
          </div>
        </div>

        {/* Viewport switch: Source Master vs 9:16 Rendered */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {renderedPath && (
            <div className="inline-flex rounded-lg bg-stone-800 p-0.5 border border-stone-700/60 text-[11px]">
              <button
                type="button"
                onClick={() => setPreviewViewportMode('source')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5',
                  previewViewportMode === 'source'
                    ? 'bg-stone-700 text-white shadow-xs'
                    : 'text-stone-400 hover:text-white'
                )}
              >
                <MonitorPlay size={12} />
                Source Master
              </button>
              <button
                type="button"
                onClick={() => setPreviewViewportMode('rendered')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5',
                  previewViewportMode === 'rendered'
                    ? 'bg-accent text-white shadow-xs font-semibold'
                    : 'text-stone-400 hover:text-white'
                )}
              >
                <Smartphone size={12} />
                9:16 Short Cut
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-800 border border-stone-700 text-[11px] font-mono text-stone-300">
            <Clock size={12} className="text-accent" />
            <span>
              {formatTime(currentTime)} / {formatTime(endTime)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Studio Console Layout: Video Monitor + Timeline Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Video Viewport Monitor (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-2.5">
          <div className="relative rounded-xl overflow-hidden bg-black border border-stone-800 shadow-inner group flex items-center justify-center aspect-video max-h-[320px]">
            <video
              ref={videoRef}
              src={activeVideoSrc}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => {
                if (!isLooping) setIsPlaying(false)
              }}
              playsInline
              className={cn(
                'w-full h-full',
                previewViewportMode === 'rendered' ? 'object-contain' : 'object-cover'
              )}
            />

            {/* Overlays on Player */}
            {/* Live Audio Ducking Badge */}
            {isDucked && (
              <div className="absolute top-2.5 left-2.5 px-2 py-1 rounded-md bg-rose-600/90 text-white text-[10px] font-bold tracking-wide backdrop-blur-md flex items-center gap-1.5 shadow-md animate-pulse">
                <Mic size={11} />
                Hook Speech Active • Audio Ducked 15%
              </div>
            )}

            {/* Audio Mode Badge */}
            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-black/70 text-stone-300 text-[10px] font-mono backdrop-blur-xs border border-white/10">
              {audioMode === 'original'
                ? 'Clean Original Sound'
                : audioMode === 'intro_hook'
                ? 'Intro Hook (0:00)'
                : `Voiceover @ +${hookOffsetSec.toFixed(1)}s`}
            </div>

            {/* Big center play icon when paused */}
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

            {/* Bottom mini-hud */}
            <div className="absolute bottom-2 inset-x-2 px-2.5 py-1 rounded bg-black/60 backdrop-blur-xs flex items-center justify-between text-[10px] text-stone-300 font-mono">
              <span>Cut Range: {formatTime(startTime)} → {formatTime(endTime)}</span>
              <span className="text-accent font-semibold">{currentDuration.toFixed(1)}s Length</span>
            </div>
          </div>

          {/* Transport Controls Bar */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-stone-800/80 border border-stone-700/70 text-xs">
            <div className="flex items-center gap-1">
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
                title="Replay from clip in-point"
              >
                <RotateCcw size={13} />
              </button>
              <button
                type="button"
                onClick={() => handleStep(-0.2)}
                className="p-1.5 rounded-lg bg-stone-700/60 text-stone-300 hover:bg-stone-600 transition-colors cursor-pointer"
                title="Step backward -0.2s"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                onClick={() => handleStep(0.2)}
                className="p-1.5 rounded-lg bg-stone-700/60 text-stone-300 hover:bg-stone-600 transition-colors cursor-pointer"
                title="Step forward +0.2s"
              >
                <ChevronRight size={13} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsLooping(!isLooping)}
                className={cn(
                  'px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer',
                  isLooping
                    ? 'bg-accent/20 text-accent border border-accent/30 font-semibold'
                    : 'text-stone-400 hover:text-stone-200'
                )}
                title="Loop preview playback within trim boundaries"
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

        {/* Right: Multi-Track Timeline Sequencer Deck (7 cols on lg) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Active Sound Profile Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-stone-800/80 border border-stone-700 text-xs shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-accent/20 text-accent">
                <Mic size={13} />
              </span>
              <div>
                <span className="font-semibold text-stone-300">Active Sound Profile: </span>
                {activeSoundProfile.cloningEnabled ? (
                  <span className="text-accent font-semibold">
                    Cloned Voice ({activeSoundProfile.sampleName || 'User Sample'})
                  </span>
                ) : (
                  <span className="text-stone-300 font-medium">
                    {VOICE_PRESET_NAMES[activeSoundProfile.preset] || activeSoundProfile.preset}
                  </span>
                )}
              </div>
            </div>
            <a
              href="/settings"
              className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
            >
              Settings &rarr;
            </a>
          </div>

          {/* Timeline Sequencer Deck (Interactive Tracks V1 & A1) */}
          <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-2 select-none shadow-inner">
            <div className="flex items-center justify-between text-[11px] text-stone-400 pb-1">
              <span className="font-semibold text-stone-300 uppercase tracking-wider text-[10px]">
                Interactive Sequencer (Drag Voice Hook along Timeline)
              </span>
              <span className="font-mono text-accent">
                Cursor: +{((currentTime - startTime)).toFixed(1)}s / {currentDuration.toFixed(1)}s
              </span>
            </div>

            {/* Timecode Ruler */}
            <div className="relative h-4 border-b border-stone-800 text-[9px] font-mono text-stone-400">
              <div className="absolute left-0 top-0">0.0s</div>
              <div className="absolute left-1/4 top-0 -translate-x-1/2">
                {(currentDuration * 0.25).toFixed(1)}s
              </div>
              <div className="absolute left-1/2 top-0 -translate-x-1/2">
                {(currentDuration * 0.5).toFixed(1)}s
              </div>
              <div className="absolute left-3/4 top-0 -translate-x-1/2">
                {(currentDuration * 0.75).toFixed(1)}s
              </div>
              <div className="absolute right-0 top-0">{currentDuration.toFixed(1)}s</div>
            </div>

            {/* Timeline Multi-Track Container */}
            <div
              ref={timelineTrackRef}
              onPointerDown={handleTrackPointerDown}
              onPointerMove={handleTrackPointerMove}
              onPointerUp={handleTrackPointerUp}
              className="relative rounded-lg bg-stone-900 border border-stone-800 p-1.5 space-y-2 cursor-pointer touch-none overflow-hidden"
              style={{ minHeight: '84px' }}
            >
              {/* Vertical Playhead Needle */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-accent z-30 pointer-events-none transition-all duration-75"
                style={{ left: `${playheadPercent}%` }}
              >
                <div className="w-2.5 h-2.5 bg-accent -ml-1 -mt-0.5 rotate-45 rounded-2xs shadow-md" />
              </div>

              {/* Track V1: Video Clip Track */}
              <div className="relative h-10 rounded-md bg-stone-800/90 border border-stone-700/60 overflow-hidden flex items-center px-2">
                {/* Background filmstrip frames */}
                {storyboardFrames.length > 0 && (
                  <div className="absolute inset-0 flex opacity-25 pointer-events-none">
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
                <div className="relative z-10 flex items-center justify-between w-full text-[10px] font-semibold text-stone-200">
                  <span className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-xs">
                    <Scissors size={10} className="text-accent" />
                    V1 Video • In: {formatTime(startTime)}
                  </span>
                  <span className="bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-xs font-mono">
                    Out: {formatTime(endTime)} ({currentDuration.toFixed(1)}s)
                  </span>
                </div>
              </div>

              {/* Track A1: Voice Hook Voiceover Track */}
              {audioMode !== 'original' ? (
                <div className="relative h-9 rounded-md bg-stone-950/80 border border-stone-800/80 overflow-hidden">
                  {/* Draggable Voiceover Hook Block */}
                  <div
                    className={cn(
                      'absolute top-0.5 bottom-0.5 rounded-md p-1.5 flex items-center justify-between z-20 shadow-md transition-shadow cursor-grab active:cursor-grabbing border',
                      isDraggingHookBlock
                        ? 'bg-rose-500 text-white ring-2 ring-white border-white'
                        : 'bg-gradient-to-r from-accent to-rose-600 text-white border-accent-light/30'
                    )}
                    style={{
                      left: `${hookLeftPercent}%`,
                      width: `${Math.max(12, hookWidthPercent)}%`,
                    }}
                    title="Drag to position spoken voiceover hook along the clip timeline"
                  >
                    <div className="flex items-center gap-1 truncate text-[10px] font-bold">
                      <Mic size={11} className="shrink-0" />
                      <span className="truncate">
                        {hookText ? `"${hookText.slice(0, 24)}..."` : 'Spoken Hook'}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono bg-black/40 px-1 rounded shrink-0 ml-1">
                      {hookDuration.toFixed(1)}s
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-6 rounded-md bg-stone-800/30 border border-dashed border-stone-700/40 flex items-center justify-center text-[10px] text-stone-400">
                  Original sound mode active • Zero AI voiceover overlay
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-stone-400 pt-0.5">
              <span>* Click or scrub anywhere on the sequencer to preview that frame live.</span>
              {audioMode !== 'original' && (
                <span className="text-accent font-medium">
                  Voice hook clamped within clip (Max offset: {maxHookOffset.toFixed(1)}s)
                </span>
              )}
            </div>
          </div>

          {/* Clip Boundary Sliders ("Adjusting Clip" Bounds) */}
          <div className="p-3.5 rounded-xl bg-stone-800/60 border border-stone-700/70 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Scissors size={13} className="text-accent" />
                Clip Boundaries (Start & End Trimming)
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-bold',
                  currentDuration >= 15 && currentDuration <= 60
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/70'
                    : 'bg-amber-950 text-amber-400 border border-amber-800/70'
                )}
              >
                {currentDuration.toFixed(1)}s Duration{' '}
                {currentDuration >= 15 && currentDuration <= 60 ? '• Optimal Short' : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Start Slider */}
              <div className="p-2.5 rounded-lg bg-stone-900 border border-stone-700/60 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-stone-400">Start Time:</span>
                  <span className="font-mono text-white font-semibold">
                    {formatTime(startTime)} ({startTime.toFixed(1)}s)
                  </span>
                </div>
                <input
                  type="range"
                  min={Math.max(0, Math.floor(startTime - 25))}
                  max={Math.max(0, endTime - 2.0)}
                  step="0.1"
                  value={startTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value)
                    onStartTimeChange(val)
                    seekVideo(val) // Live visual frame preview!
                  }}
                  className="w-full accent-accent cursor-pointer h-1.5 bg-stone-700 rounded-lg"
                />
                <div className="flex items-center justify-between pt-1 text-[10px]">
                  <span className="text-stone-400">Nudge:</span>
                  <div className="flex gap-1">
                    {[-1.0, -0.2, 0.2, 1.0].map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        onClick={() => {
                          const next = Math.max(0, Math.min(endTime - 2.0, startTime + delta))
                          const rounded = parseFloat(next.toFixed(1))
                          onStartTimeChange(rounded)
                          seekVideo(rounded)
                        }}
                        className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono border border-stone-700 cursor-pointer"
                      >
                        {delta > 0 ? `+${delta}s` : `${delta}s`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* End Slider */}
              <div className="p-2.5 rounded-lg bg-stone-900 border border-stone-700/60 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-stone-400">End Time:</span>
                  <span className="font-mono text-white font-semibold">
                    {formatTime(endTime)} ({endTime.toFixed(1)}s)
                  </span>
                </div>
                <input
                  type="range"
                  min={startTime + 2.0}
                  max={Math.ceil(endTime + 25)}
                  step="0.1"
                  value={endTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value)
                    onEndTimeChange(val)
                    seekVideo(val) // Live visual frame preview!
                  }}
                  className="w-full accent-accent cursor-pointer h-1.5 bg-stone-700 rounded-lg"
                />
                <div className="flex items-center justify-between pt-1 text-[10px]">
                  <span className="text-stone-400">Nudge:</span>
                  <div className="flex gap-1">
                    {[-1.0, -0.2, 0.2, 1.0].map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        onClick={() => {
                          const next = Math.max(startTime + 2.0, endTime + delta)
                          const rounded = parseFloat(next.toFixed(1))
                          onEndTimeChange(rounded)
                          seekVideo(rounded)
                        }}
                        className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono border border-stone-700 cursor-pointer"
                      >
                        {delta > 0 ? `+${delta}s` : `${delta}s`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Audio Track Mode Selection Cards */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400">
              Audio Routing Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Option 1: Original */}
              <div
                onClick={() => onAudioModeChange('original')}
                className={cn(
                  'p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between',
                  audioMode === 'original'
                    ? 'border-accent bg-accent/20 ring-1 ring-accent'
                    : 'border-stone-700/80 bg-stone-800/40 hover:border-stone-600'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
                    <Volume2 size={13} className="text-accent" />
                    Original Sound
                  </div>
                  {audioMode === 'original' && <Check size={14} className="text-accent" />}
                </div>
                <p className="text-[10px] text-stone-400 leading-normal">
                  Pure source audio. Zero AI speech or ducking.
                </p>
              </div>

              {/* Option 2: Intro Hook */}
              <div
                onClick={() => {
                  onAudioModeChange('intro_hook')
                  onHookOffsetChange(0.0)
                  seekVideo(startTime)
                }}
                className={cn(
                  'p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between',
                  audioMode === 'intro_hook'
                    ? 'border-accent bg-accent/20 ring-1 ring-accent'
                    : 'border-stone-700/80 bg-stone-800/40 hover:border-stone-600'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
                    <Sparkles size={13} className="text-accent" />
                    Intro Hook (0:00)
                  </div>
                  {audioMode === 'intro_hook' && <Check size={14} className="text-accent" />}
                </div>
                <p className="text-[10px] text-stone-400 leading-normal">
                  Voiceover plays at 0:00 with video audio ducked.
                </p>
              </div>

              {/* Option 3: Custom Voiceover */}
              <div
                onClick={() => onAudioModeChange('custom_voiceover')}
                className={cn(
                  'p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between',
                  audioMode === 'custom_voiceover'
                    ? 'border-accent bg-accent/20 ring-1 ring-accent'
                    : 'border-stone-700/80 bg-stone-800/40 hover:border-stone-600'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
                    <Sliders size={13} className="text-accent" />
                    Timeline Voiceover
                  </div>
                  {audioMode === 'custom_voiceover' && <Check size={14} className="text-accent" />}
                </div>
                <p className="text-[10px] text-stone-400 leading-normal">
                  Position voice hook anywhere on the timeline.
                </p>
              </div>
            </div>
          </div>

          {/* Voiceover Placement Slider (when in custom_voiceover) */}
          {audioMode === 'custom_voiceover' && (
            <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/30 space-y-2 animate-fade-in text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Sliders size={13} className="text-accent" />
                  Voiceover Start Placement Slider
                </div>
                <span className="font-mono font-bold text-accent px-2 py-0.5 rounded bg-stone-900 border border-accent/30">
                  Starts @ +{hookOffsetSec.toFixed(1)}s into clip
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
                  seekVideo(startTime + val) // Live frame preview of where the hook hits!
                }}
                className="w-full accent-accent cursor-pointer h-1.5 bg-stone-700 rounded-lg"
              />

              <div className="flex items-center justify-between text-[10px] text-stone-400">
                <span>0.0s (Clip Start)</span>
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
                <span>{maxHookOffset.toFixed(1)}s (Max End)</span>
              </div>
            </div>
          )}

          {/* Hook Text Script & Spoken Audio Generation */}
          {audioMode !== 'original' && (
            <div className="space-y-2 animate-fade-in text-xs">
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400">
                Spoken Hook Script & Voiceover Text
              </label>
              <textarea
                rows={2}
                value={hookText}
                onChange={(e) => onHookTextChange(e.target.value)}
                placeholder="Write a viral spoken hook line..."
                className="w-full text-xs p-3 rounded-lg border border-stone-700 bg-stone-900 text-white placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onSaveHookText}
                    className="px-2.5 py-1 text-xs rounded-md bg-stone-800 text-stone-200 hover:bg-stone-700 transition-colors cursor-pointer"
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
                    Generate Spoken Hook
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
          )}

          {/* Apply Changes & Re-Render Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={onRerender}
              disabled={isRerendering}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-all shadow-md disabled:opacity-50 cursor-pointer"
            >
              {isRerendering ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Re-rendering Clip with FFmpeg (Boundary Cut & Audio Processing)...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Apply Timing & Audio Settings (Re-render Clip)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
