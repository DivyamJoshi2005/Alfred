import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobStore } from '../stores/jobStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { api } from '../services/api';
import type { WSMessage } from '../types/ws';
import {
  UploadIcon,
  VideoIcon,
  PlayIcon,
  CheckIcon,
  CrossIcon,
  MicrophoneIcon,
  ScissorsIcon,
  SparklesIcon,
} from '../components/Icons';

export default function Process() {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [createdJobId, setCreatedJobId] = useState<string | null>(null);
  const [localVideos, setLocalVideos] = useState<Array<{ name: string; path: string; size_mb: number; folder: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { jobs, progress, createJob, fetchJobs, updateProgress, updateJobStatus, loading, error, clearError } = useJobStore();

  const activeJob = (createdJobId ? jobs.find(j => j.id === createdJobId && j.status !== 'completed' && j.status !== 'failed') : null)
    || jobs.find(j => ['queued', 'processing', 'transcribing', 'analyzing', 'rendering'].includes(j.status));
  const activeProgress = activeJob ? progress[activeJob.id] : null;

  const handleWSMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'progress') {
      updateProgress(msg.job_id, {
        phase: msg.phase,
        progress: msg.progress,
        message: msg.message,
        clipIndex: msg.clip_index,
        clipTotal: msg.clip_total,
      });
    } else if (msg.type === 'job_status') {
      updateJobStatus(msg.job_id, msg.status);
      if (msg.status === 'completed' || msg.status === 'failed') {
        fetchJobs();
      }
    }
  }, [updateProgress, updateJobStatus, fetchJobs]);

  useWebSocket(handleWSMessage);

  useEffect(() => {
    fetchJobs();
    api.listLocalVideos().then(setLocalVideos).catch(() => {});
  }, [fetchJobs]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const validExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (validExtensions.includes(ext)) {
        setSelectedFile(file.name);
        setFilePath((file as any).path || file.name);
      }
    }
  }, []);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0].name);
      setFilePath((files[0] as any).path || files[0].name);
    }
  }, []);

  const handleProcess = useCallback(async () => {
    if (!filePath) return;
    clearError();
    try {
      const newJob = await createJob(filePath);
      setCreatedJobId(newJob.id);
      setSelectedFile(null);
      setFilePath(null);
    } catch (err) {
      console.error('Failed to create job:', err);
    }
  }, [filePath, createJob, clearError]);

  const phases = [
    { id: 'transcribing',    label: '01 Whisper Transcription',  icon: MicrophoneIcon },
    { id: 'analyzing',       label: '02 Highlight Extraction',   icon: ScissorsIcon },
    { id: 'generating_hooks',label: '03 Hook Voiceover (Kokoro)',icon: SparklesIcon },
    { id: 'rendering',       label: '04 YOLOv8 9:16 Smart Crop', icon: VideoIcon },
  ];

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-header-eyebrow">Ingestion // Studio Bay</div>
          <h2>Ingest & Dissection Bay</h2>
          <p>Drop 16:9 master footage to run offline transcription, viral extraction, and 9:16 smart cropping</p>
        </div>
      </div>

      {error && (
        <div style={{
          padding: 'var(--space-md) var(--space-lg)',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-xs)',
          color: '#f87171',
          marginBottom: 'var(--space-xl)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
        }}>
          <span>ERROR // {error}</span>
          <button className="btn btn-ghost btn-sm" onClick={clearError}>
            <CrossIcon size={14} />
          </button>
        </div>
      )}

      {/* Active Pipeline Monitor */}
      {activeJob && (
        <div className="card" style={{ marginBottom: 'var(--space-2xl)', borderColor: 'var(--border-strong)' }}>
          <div className="card-header">
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--accent-vermilion)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                LIVE ORCHESTRATION PIPELINE
              </div>
              <h3 className="card-title" style={{ marginTop: '2px' }}>
                Master: {activeJob.video_name}
              </h3>
            </div>
            <span className="badge badge-active">{activeJob.status}</span>
          </div>

          {/* Phase Indicators */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-sm)',
            marginBottom: 'var(--space-xl)',
          }}>
            {phases.map((p) => {
              const Icon = p.icon;
              const isCurrent = activeProgress?.phase === p.id;
              return (
                <div
                  key={p.id}
                  style={{
                    padding: 'var(--space-sm) var(--space-md)',
                    background: isCurrent ? 'var(--accent-vermilion-subtle)' : 'var(--bg-surface-elevated)',
                    border: '1px solid',
                    borderColor: isCurrent ? 'var(--accent-vermilion)' : 'var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                  }}
                >
                  <Icon size={15} style={{ color: isCurrent ? 'var(--accent-vermilion)' : 'var(--text-tertiary)' }} />
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-2xs)',
                    color: isCurrent ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontWeight: isCurrent ? 700 : 500,
                  }}>
                    {p.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress Bar & Telemetry */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                {activeProgress?.message || 'Processing stage active...'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--accent-vermilion)', fontWeight: 700 }}>
                {activeProgress?.progress || 0}%
              </span>
            </div>

            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${activeProgress?.progress || 0}%` }} />
            </div>

            {activeProgress?.clipIndex && activeProgress?.clipTotal && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                [RENDERING CLIP {activeProgress.clipIndex} OF {activeProgress.clipTotal}]
              </div>
            )}
          </div>
        </div>
      )}

      {/* Completed Banner if last completed */}
      {activeJob && activeJob.status === 'completed' && (
        <div className="card" style={{
          marginBottom: 'var(--space-xl)',
          borderColor: 'var(--accent-mint)',
          background: 'rgba(44, 212, 131, 0.05)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-xs)',
                background: 'rgba(44, 212, 131, 0.15)', color: 'var(--accent-mint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <CheckIcon size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-md)' }}>
                  {activeJob.video_name} — Ingestion Complete!
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  Vertical clips rendered. Proceed to Review Suite to preview cuts.
                </div>
              </div>
            </div>
            <button className="btn btn-editorial btn-sm" onClick={() => navigate('/review')}>
              Open Review Suite →
            </button>
          </div>
        </div>
      )}

      {/* Discovered Project Media Shelf (1-Click Select) */}
      {!activeJob && !selectedFile && localVideos.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-xl)', padding: 'var(--space-md)' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-sm)',
            paddingBottom: 'var(--space-xs)',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
              <VideoIcon size={16} style={{ color: 'var(--accent-mint)' }} />
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-2xs)',
                color: 'var(--accent-mint)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}>
                [DISCOVERED PROJECT FOOTAGE // 1-CLICK SELECT]
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
              {localVideos.length} LOCAL FILE(S) DETECTED
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {localVideos.map((vid) => (
              <div
                key={vid.path}
                onClick={() => {
                  setSelectedFile(vid.name);
                  setFilePath(vid.path);
                }}
                style={{
                  padding: '10px 14px',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'all var(--duration-fast)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-vermilion)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', overflow: 'hidden' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '4px',
                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <VideoIcon size={14} style={{ color: 'var(--accent-vermilion)' }} />
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{
                      fontWeight: 600,
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {vid.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      DIR: {vid.folder} · {vid.size_mb} MB
                    </div>
                  </div>
                </div>

                <button
                  className="btn btn-editorial btn-sm"
                  style={{ flexShrink: 0, padding: '4px 10px', fontSize: 'var(--text-2xs)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(vid.name);
                    setFilePath(vid.path);
                  }}
                >
                  Stage Footage →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Viewfinder Drop Zone */}
      {!activeJob && !selectedFile && (
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleFileSelect}
        >
          <div className="drop-zone-icon-box">
            <UploadIcon size={28} />
          </div>
          <div>
            <div className="drop-zone-title">Select Master Video File</div>
            <div className="drop-zone-subtitle" style={{ marginTop: '4px' }}>
              Drag & Drop footage or click to browse · MP4, MOV, MKV, WebM
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-xs)' }}>
            Choose File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.avi,.mkv,.webm"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* Staged File Card */}
      {!activeJob && selectedFile && (
        <div className="card animate-fade-in">
          <div className="card-header">
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--accent-vermilion)' }}>
                STAGED FOOTAGE READY FOR INGEST
              </div>
              <h3 className="card-title" style={{ marginTop: '2px' }}>{selectedFile}</h3>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedFile(null); setFilePath(null); }}>
              <CrossIcon size={14} /> Remove
            </button>
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-2xs)',
              color: 'var(--text-tertiary)',
              marginBottom: '4px',
              textTransform: 'uppercase'
            }}>
              Master Footage Path (Local System):
            </div>
            <input
              type="text"
              className="mono"
              value={filePath || ''}
              onChange={(e) => setFilePath(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 'var(--text-xs)',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                color: 'var(--text-primary)'
              }}
              placeholder="/path/to/video.mp4"
            />
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleProcess}
              disabled={loading}
            >
              <PlayIcon size={16} />
              <span>{loading ? 'Initiating Pipeline...' : 'Start Extraction Pipeline'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Recent Completions */}
      {jobs.filter(j => j.status === 'completed').length > 0 && (
        <div style={{ marginTop: 'var(--space-3xl)' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 'var(--space-md)', paddingBottom: 'var(--space-xs)',
            borderBottom: '1px solid var(--border-subtle)'
          }}>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)' }}>
              Completed Projects
            </h3>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
              [{jobs.filter(j => j.status === 'completed').length} READY]
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            {jobs.filter(j => j.status === 'completed').slice(0, 5).map(job => (
              <div
                key={job.id}
                onClick={() => navigate('/review')}
                style={{
                  padding: 'var(--space-md) var(--space-lg)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all var(--duration-fast) var(--ease-snappy)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--border-medium)';
                  e.currentTarget.style.background = 'var(--bg-surface-elevated)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  e.currentTarget.style.background = 'var(--bg-surface)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <VideoIcon size={18} style={{ color: 'var(--text-secondary)' }} />
                  <div>
                    <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}>
                      {job.video_name}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
                      ID: {job.id.slice(0, 12)} · {new Date(job.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <span className="badge badge-success">Completed</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--accent-vermilion)' }}>
                    Review Cuts →
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
