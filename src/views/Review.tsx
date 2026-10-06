import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobStore } from '../stores/jobStore';
import { useClipStore } from '../stores/clipStore';
import { api } from '../services/api';
import type { Clip, FramingMode, AudioMode } from '../types/job';
import {
  VideoIcon,
  CheckIcon,
  CrossIcon,
  EditIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
  ScissorsIcon,
  MicrophoneIcon,
} from '../components/Icons';

export default function Review() {
  const navigate = useNavigate();
  const { jobs, fetchJobs } = useJobStore();
  const { clips, activeClipIndex, loading, fetchClips, updateClip, rerenderClip, setActiveClip } = useClipStore();

  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [editingHook, setEditingHook] = useState(false);
  const [hookDraft, setHookDraft] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Precision Trimmer & Framing States
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [framingMode, setFramingMode] = useState<FramingMode>('presentation_fit');
  const [audioMode, setAudioMode] = useState<AudioMode>('original');
  const [isRerendering, setIsRerendering] = useState(false);

  // Voiceover / Voice Cloning States
  const [voicePreset, setVoicePreset] = useState<string>('af_heart');
  const [useClonedVoice, setUseClonedVoice] = useState<boolean>(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const originalVideoRef = useRef<HTMLVideoElement>(null);
  const clipVideoRef = useRef<HTMLVideoElement>(null);

  // 1. Initial jobs fetch
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // 2. Auto-select latest completed job or first available
  useEffect(() => {
    if (jobs.length > 0 && !selectedJobId) {
      const completedJob = jobs.find(j => j.status === 'completed') || jobs[0];
      setSelectedJobId(completedJob.id);
    }
  }, [jobs, selectedJobId]);

  // 3. Fetch clips when selectedJobId changes
  useEffect(() => {
    if (selectedJobId) {
      fetchClips(selectedJobId);
      setEditingHook(false);
    }
  }, [selectedJobId, fetchClips]);

  const activeJob = jobs.find(j => j.id === selectedJobId);
  const currentClip: Clip | undefined = clips[activeClipIndex];

  // Sync draft when active clip changes
  useEffect(() => {
    if (currentClip) {
      setHookDraft(currentClip.hook_text || '');
      setTrimStart(Math.round(currentClip.start_time * 10) / 10);
      setTrimEnd(Math.round(currentClip.end_time * 10) / 10);
      setEditingHook(false);

      if (originalVideoRef.current && currentClip.start_time !== undefined) {
        originalVideoRef.current.currentTime = currentClip.start_time;
      }
    }
  }, [currentClip]);

  const handleRerender = async () => {
    if (!currentClip) return;
    setIsRerendering(true);
    try {
      await rerenderClip(currentClip.id, {
        start_time: trimStart,
        end_time: trimEnd,
        framing_mode: framingMode,
        audio_mode: audioMode,
        hook_text: hookDraft,
      });
      if (clipVideoRef.current) {
        clipVideoRef.current.load();
      }
    } catch (e) {
      console.error('Rerender failed:', e);
    } finally {
      setIsRerendering(false);
    }
  };

  const handleSynthesizeVoice = async () => {
    if (!currentClip || !hookDraft) return;
    setIsSynthesizing(true);
    try {
      await api.synthesizeClipVoice(currentClip.id, {
        script_text: hookDraft,
        voice_preset: voicePreset,
        use_cloned_voice: useClonedVoice,
      });
      await fetchClips(selectedJobId);
    } catch (e) {
      console.error('Voice synthesis failed:', e);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleApprove = async () => {
    if (!currentClip) return;
    setIsUpdating(true);
    await updateClip(currentClip.id, { status: 'approved' });
    setIsUpdating(false);
  };

  const handleReject = async () => {
    if (!currentClip) return;
    setIsUpdating(true);
    await updateClip(currentClip.id, { status: 'rejected' });
    setIsUpdating(false);
  };

  const handleSaveHook = async () => {
    if (!currentClip) return;
    setIsUpdating(true);
    await updateClip(currentClip.id, { hook_text: hookDraft });
    setEditingHook(false);
    setIsUpdating(false);
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
  };

  const getVisualHeadline = (text?: string | null): string => {
    if (!text) return '';
    const clean = text.replace(/[\r\n\t]+/g, ' ').trim().replace(/^["']|["']$/g, '');
    const fillers = [
      /^(ever wondered this\??\s*)/i,
      /^(here is the truth:?\s*)/i,
      /^(wait until you hear this:?\s*)/i,
      /^(did you know that\??\s*)/i,
      /^(stop scrolling and listen:?\s*)/i,
      /^(listen up:?\s*)/i,
    ];
    let candidate = clean;
    for (const f of fillers) {
      candidate = candidate.replace(f, '').trim();
    }
    if (!candidate) candidate = clean;
    const sentences = candidate.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    let target = sentences[0] || candidate;
    const words = target.split(/\s+/);
    if (words.length > 7) {
      target = words.slice(0, 6).join(' ');
    } else {
      target = words.join(' ');
    }
    if (target.length > 38) {
      const trimmed = target.slice(0, 36);
      const lastSpace = trimmed.lastIndexOf(' ');
      target = lastSpace > 15 ? trimmed.slice(0, lastSpace) : trimmed;
    }
    if (/\b(why|how|what|who|when)\b/i.test(clean) && !target.endsWith('?')) {
      if (!/[.!?]$/.test(target)) target += '?';
    }
    return target.toUpperCase().trim();
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Header with Project Selector */}
      <div className="page-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <div className="page-header-eyebrow">Studio Suite // Cutdown Review</div>
          <h2>Editorial Review Console</h2>
          <p>Side-by-side verification: 16:9 context footage vs. 9:16 smart-cropped vertical cut</p>
        </div>

        {jobs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Master Project:
            </span>
            <select
              className="mono"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              style={{ minWidth: '220px', padding: '6px 12px', fontSize: 'var(--text-xs)' }}
            >
              {jobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.video_name} ({j.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            [SYNCHRONIZING CLIP METADATA...]
          </p>
        </div>
      ) : clips.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No Extracted Clips Available</div>
          <div className="empty-state-desc">
            {activeJob?.status === 'transcribing' || activeJob?.status === 'analyzing' || activeJob?.status === 'rendering'
              ? 'This project is currently processing in the Ingest Bay. Watch live telemetry on the Ingest tab!'
              : 'Process master footage in the Ingest Bay to generate AI-extracted highlights and 9:16 cuts.'}
          </div>
          <button className="btn btn-editorial btn-sm" onClick={() => navigate('/process')} style={{ marginTop: 'var(--space-sm)' }}>
            Go to Ingest Bay →
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          {/* Clip Navigation Rail */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-md)',
            padding: 'var(--space-sm) var(--space-md)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', overflowX: 'auto' }}>
              {clips.map((clip, idx) => {
                const isActive = activeClipIndex === idx;
                return (
                  <button
                    key={clip.id}
                    onClick={() => setActiveClip(idx)}
                    className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-2xs)',
                      padding: '4px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>CLIP [{String(clip.rank || idx + 1).padStart(2, '0')}]</span>
                    {clip.status === 'approved' && <span style={{ color: isActive ? '#000' : 'var(--accent-mint)' }}>✓</span>}
                    {clip.status === 'rejected' && <span style={{ color: isActive ? '#000' : '#f87171' }}>✗</span>}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={activeClipIndex === 0}
                onClick={() => setActiveClip(activeClipIndex - 1)}
                style={{ opacity: activeClipIndex === 0 ? 0.3 : 1 }}
              >
                <ChevronLeftIcon size={14} /> Prev Cut
              </button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
                [{activeClipIndex + 1} / {clips.length}]
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={activeClipIndex === clips.length - 1}
                onClick={() => setActiveClip(activeClipIndex + 1)}
                style={{ opacity: activeClipIndex === clips.length - 1 ? 0.3 : 1 }}
              >
                Next Cut <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>

          {/* Side-by-Side Dual Monitor Suite */}
          <div className="monitor-suite-grid">
            {/* Left: 16:9 Contextual Master */}
            <div className="card" style={{ padding: 'var(--space-md)' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-sm)',
                paddingBottom: 'var(--space-xs)',
                borderBottom: '1px solid var(--border-subtle)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                  <VideoIcon size={16} style={{ color: 'var(--accent-vermilion)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>
                    Master Footage (16:9 Context)
                  </span>
                </div>
                <span className="badge badge-mono">
                  TIMECODE: {formatSeconds(currentClip.start_time)} → {formatSeconds(currentClip.end_time)}
                </span>
              </div>

              <div className="video-frame-container landscape">
                {activeJob?.video_path ? (
                  <video
                    ref={originalVideoRef}
                    src={api.getVideoSrc(activeJob.video_path)}
                    controls
                    preload="metadata"
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
                    Source file unavailable
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-2xs)',
                color: 'var(--text-tertiary)',
                marginTop: 'var(--space-sm)'
              }}>
                <span>START: {formatSeconds(currentClip.start_time)}</span>
                <span>DURATION: {Math.round(currentClip.duration)} SECONDS</span>
                <span>END: {formatSeconds(currentClip.end_time)}</span>
              </div>
            </div>

            {/* Right: Smart Cropped 9:16 Vertical Smartphone Viewport */}
            <div className="card" style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-sm)',
                paddingBottom: 'var(--space-xs)',
                borderBottom: '1px solid var(--border-subtle)'
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>
                  9:16 Repurposed Reel
                </span>
                <span className={`badge ${
                  currentClip.status === 'approved' ? 'badge-success' :
                  currentClip.status === 'rejected' ? 'badge-error' : 'badge-warning'
                }`}>
                  {currentClip.status}
                </span>
              </div>

              {/* Smartphone Bezel Viewport */}
              <div className="phone-viewport-container">
                <div className="phone-notch" />
                <div className="phone-screen">
                  {currentClip.output_path ? (
                    <video
                      ref={clipVideoRef}
                      src={api.getVideoSrc(currentClip.output_path)}
                      controls
                      loop
                      preload="metadata"
                    />
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      padding: 'var(--space-lg)',
                      textAlign: 'center',
                      color: 'var(--text-tertiary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)'
                    }}>
                      <span>[ASSEMBLING CUTDOWN...]</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{
                marginTop: 'var(--space-sm)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-2xs)',
                color: 'var(--text-tertiary)'
              }}>
                1080×1920 · 9:16 VERTICAL · AUDIO HOOK SYNCED
              </div>
            </div>
          </div>

          {/* Hardware NLE Jog Deck — Precision Trimmer */}
          <div className="jog-deck">
            {/* IN-POINT GROUP */}
            <div className="jog-cluster">
              <span className="jog-label">IN</span>
              <button
                className="jog-btn"
                title="Nudge back 5 seconds"
                onClick={() => setTrimStart(Math.max(0, Number((trimStart - 5).toFixed(1))))}
              >
                -5s
              </button>
              <button
                className="jog-btn"
                title="Nudge back 1 second"
                onClick={() => setTrimStart(Math.max(0, Number((trimStart - 1).toFixed(1))))}
              >
                -1s
              </button>
              <input
                type="number"
                step="0.5"
                className="jog-input"
                value={trimStart}
                onChange={(e) => setTrimStart(Math.max(0, parseFloat(e.target.value) || 0))}
              />
              <button
                className="jog-btn"
                title="Nudge forward 1 second"
                onClick={() => setTrimStart(Number((trimStart + 1).toFixed(1)))}
              >
                +1s
              </button>
              <button
                className="jog-btn"
                title="Nudge forward 5 seconds"
                onClick={() => setTrimStart(Number((trimStart + 5).toFixed(1)))}
              >
                +5s
              </button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginLeft: '2px' }}>
                [{formatSeconds(trimStart)}]
              </span>
            </div>

            {/* CENTER DURATION & RERENDER ACTION */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <div className="badge badge-mono" style={{ fontSize: '11px', padding: '4px 10px' }}>
                ACTIVE DURATION: {Math.max(0, trimEnd - trimStart).toFixed(1)}s
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleRerender}
                disabled={isRerendering}
                style={{ padding: '6px 14px' }}
              >
                <ScissorsIcon size={13} />
                <span>{isRerendering ? 'Rendering Cut...' : 'Apply & Re-Render Cut'}</span>
              </button>
            </div>

            {/* OUT-POINT GROUP */}
            <div className="jog-cluster">
              <span className="jog-label">OUT</span>
              <button
                className="jog-btn"
                title="Nudge back 5 seconds"
                onClick={() => setTrimEnd(Math.max(trimStart + 1, Number((trimEnd - 5).toFixed(1))))}
              >
                -5s
              </button>
              <button
                className="jog-btn"
                title="Nudge back 1 second"
                onClick={() => setTrimEnd(Math.max(trimStart + 1, Number((trimEnd - 1).toFixed(1))))}
              >
                -1s
              </button>
              <input
                type="number"
                step="0.5"
                className="jog-input"
                value={trimEnd}
                onChange={(e) => setTrimEnd(Math.max(trimStart + 1, parseFloat(e.target.value) || trimStart + 1))}
              />
              <button
                className="jog-btn"
                title="Nudge forward 1 second"
                onClick={() => setTrimEnd(Number((trimEnd + 1).toFixed(1)))}
              >
                +1s
              </button>
              <button
                className="jog-btn"
                title="Nudge forward 5 seconds"
                onClick={() => setTrimEnd(Number((trimEnd + 5).toFixed(1)))}
              >
                +5s
              </button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginLeft: '2px' }}>
                [{formatSeconds(trimEnd)}]
              </span>
            </div>
          </div>

          {/* Balanced 2-Column Studio Suite */}
          <div className="studio-grid">
            {/* LEFT CARD: Framing & Audio Master Configuration */}
            <div className="studio-card">
              <div className="studio-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                  <VideoIcon size={14} style={{ color: 'var(--accent-vermilion)' }} />
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-primary)'
                  }}>
                    Framing & Audio Master
                  </span>
                </div>
                <span className="badge badge-mono">Canvas & Stem Matrix</span>
              </div>

              {/* 1. Framing Layout Mode */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="jog-label">9:16 Video Framing Layout</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--accent-mint)' }}>
                    {framingMode === 'presentation_fit' ? '100% SLIDES PRESERVED' : framingMode === 'split_screen' ? 'DUAL STACKED' : 'FACE TRACKING'}
                  </span>
                </div>
                <div className="segment-group">
                  <button
                    className={`segment-btn ${framingMode === 'presentation_fit' ? 'active' : ''}`}
                    onClick={() => setFramingMode('presentation_fit')}
                  >
                    📺 Canvas Fit
                  </button>
                  <button
                    className={`segment-btn ${framingMode === 'split_screen' ? 'active' : ''}`}
                    onClick={() => setFramingMode('split_screen')}
                  >
                    📑 Stacked Split
                  </button>
                  <button
                    className={`segment-btn ${framingMode === 'face_focus' ? 'active' : ''}`}
                    onClick={() => setFramingMode('face_focus')}
                  >
                    👤 Face Focus
                  </button>
                </div>
                <div className="studio-helper-text">
                  {framingMode === 'presentation_fit' && '📺 Canvas Fit preserves 100% of presentation slides, code, and text with zero boundary cutoff.'}
                  {framingMode === 'split_screen' && '📑 Stacked Split displays presenter headshot on top and keynote presentation slides below.'}
                  {framingMode === 'face_focus' && '👤 Face Focus kinetically tracks and crops 9:16 talking-head framing on the speaker.'}
                </div>
              </div>

              {/* 2. Audio Master Mode */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="jog-label">Audio Master Track</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--accent-amber)' }}>
                    {audioMode === 'original' ? 'CLEAN NATURAL SPEECH' : audioMode === 'preroll' ? 'PRE-ROLL INTRO' : 'VOICEOVER DUCKED'}
                  </span>
                </div>
                <div className="segment-group">
                  <button
                    className={`segment-btn ${audioMode === 'original' ? 'active' : ''}`}
                    onClick={() => setAudioMode('original')}
                  >
                    🎙️ Clean Dialogue
                  </button>
                  <button
                    className={`segment-btn ${audioMode === 'preroll' ? 'active' : ''}`}
                    onClick={() => setAudioMode('preroll')}
                  >
                    ⚡ Pre-Roll Hook
                  </button>
                  <button
                    className={`segment-btn ${audioMode === 'voiceover' ? 'active' : ''}`}
                    onClick={() => setAudioMode('voiceover')}
                  >
                    🎚️ Ducked Voice
                  </button>
                </div>
                <div className="studio-helper-text">
                  {audioMode === 'original' && '🎙️ Clean Dialogue isolates natural speaker dialogue with zero synthetic voiceover collision.'}
                  {audioMode === 'preroll' && '⚡ Pre-Roll Hook buffers a 2.5s narration hook prior to speaker dialogue starting.'}
                  {audioMode === 'voiceover' && '🎚️ Ducked Voice ducks master speaker audio under synthesized narration voiceover.'}
                </div>
              </div>

              {/* 3. Viral Rationale Meta Tag */}
              {currentClip.rationale && (
                <div style={{
                  padding: '10px 12px',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-2xs)',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5
                }}>
                  <strong style={{ color: 'var(--accent-amber)' }}>AI EDITORIAL RATIONALE // </strong>
                  {currentClip.rationale}
                </div>
              )}
            </div>

            {/* RIGHT CARD: Transcript, Voiceover & Visual Hook Studio */}
            <div className="studio-card">
              <div className="studio-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                  <SparklesIcon size={14} style={{ color: 'var(--accent-vermilion)' }} />
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-primary)'
                  }}>
                    Scripting & Hook Studio
                  </span>
                </div>
                <span className="badge badge-mono">Auditory + Visual Hook</span>
              </div>

              {/* Transcript Quote */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="jog-label">Source Dialogue Extract</span>
                <div className="transcript-quote-box" style={{ padding: '8px 12px', fontSize: 'var(--text-xs)' }}>
                  "{currentClip.transcript_text}"
                </div>
              </div>

              {/* Hook Script Editor */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="jog-label">Attention Hook Script</span>
                  {!editingHook ? (
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => setEditingHook(true)}>
                      <EditIcon size={11} /> Edit Script
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => setEditingHook(false)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={handleSaveHook} disabled={isUpdating}>Save</button>
                    </div>
                  )}
                </div>

                <textarea
                  className="mono"
                  rows={2}
                  value={hookDraft}
                  onChange={(e) => setHookDraft(e.target.value)}
                  style={{ width: '100%', resize: 'vertical', fontSize: 'var(--text-xs)', padding: '6px 10px', minHeight: '52px' }}
                  placeholder="Enter viral scroll-stopping hook script..."
                />

                {/* Voice Preset & Synthesize Action */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 'var(--space-xs)',
                  padding: '6px 8px',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                    <select
                      className="mono"
                      value={voicePreset}
                      onChange={(e) => setVoicePreset(e.target.value)}
                      style={{ padding: '4px 6px', fontSize: '11px', maxWidth: '140px' }}
                      disabled={useClonedVoice}
                    >
                      <option value="af_heart">Kokoro: Heart</option>
                      <option value="am_adam">Kokoro: Adam</option>
                      <option value="af_bella">Kokoro: Bella</option>
                      <option value="am_michael">Kokoro: Michael</option>
                    </select>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={useClonedVoice}
                        onChange={(e) => setUseClonedVoice(e.target.checked)}
                      />
                      <span>🎤 Cloned Voice</span>
                    </label>
                  </div>

                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    onClick={handleSynthesizeVoice}
                    disabled={isSynthesizing || !hookDraft}
                  >
                    <MicrophoneIcon size={12} />
                    <span>{isSynthesizing ? 'Synthesizing...' : 'Synthesize Track'}</span>
                  </button>
                </div>

                {/* Isolated Audition Track Player */}
                {currentClip.hook_audio_path && (
                  <div style={{ marginTop: '2px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Audition Voice Track (Isolated Preview):
                    </div>
                    <div className="audio-player-bar" style={{ padding: '4px 8px' }}>
                      <audio
                        src={api.getVideoSrc(currentClip.hook_audio_path)}
                        controls
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Visual Hook Badge (Mute-Proof Retention) */}
              <div style={{
                padding: '10px 12px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-2xs)',
                  color: 'var(--accent-mint)',
                  textTransform: 'uppercase',
                  fontWeight: 600
                }}>
                  <span>Visual Hook Badge [Mute Retention]:</span>
                  <span className="badge badge-success" style={{ fontSize: '9px', padding: '1px 6px' }}>UPPER 22% SAFE ZONE</span>
                </div>

                <div style={{
                  padding: '8px 12px',
                  background: '#0a0a0c',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 'var(--radius-xs)',
                  textAlign: 'center'
                }}>
                  <div style={{
                    display: 'inline-block',
                    background: 'rgba(0, 0, 0, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    padding: '4px 12px',
                    borderRadius: '3px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: '11px',
                    color: '#ffffff',
                    letterSpacing: '0.04em'
                  }}>
                    {getVisualHeadline(currentClip.hook_text) || 'ATTENTION SCROLL STOPPER'}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-tertiary)',
                  lineHeight: 1.4
                }}>
                  <span>• Kinetic Zoom: 1.15x face punch-in</span>
                  <span>• Burned-in headline (0.0s – 2.8s)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Ribbon */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-md)',
            padding: 'var(--space-md) var(--space-xl)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <button
                className={`btn btn-sm ${currentClip.status === 'approved' ? 'btn-editorial' : 'btn-primary'}`}
                onClick={handleApprove}
                disabled={isUpdating || currentClip.status === 'approved'}
              >
                <CheckIcon size={14} />
                <span>{currentClip.status === 'approved' ? 'Clip Approved' : 'Approve Cut'}</span>
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleReject}
                disabled={isUpdating || currentClip.status === 'rejected'}
                style={{ color: '#f87171' }}
              >
                <CrossIcon size={14} />
                <span>Reject</span>
              </button>
            </div>

            {currentClip.status === 'approved' && (
              <button
                className="btn btn-editorial btn-sm"
                onClick={() => navigate(`/calendar?clip_id=${currentClip.id}`)}
              >
                <CalendarIcon size={14} />
                <span>Schedule to Social Broadcast →</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
