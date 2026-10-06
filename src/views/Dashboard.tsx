import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobStore } from '../stores/jobStore';
import { useScheduleStore } from '../stores/scheduleStore';
import {
  UploadIcon,
  VideoIcon,
  CalendarIcon,
  ArrowRightIcon,
  YouTubeIcon,
  InstagramIcon,
  TwitterIcon,
} from '../components/Icons';

export default function Dashboard() {
  const { jobs, fetchJobs } = useJobStore();
  const { posts, fetchPosts } = useScheduleStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchJobs();
    fetchPosts();
  }, [fetchJobs, fetchPosts]);

  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const scheduled = posts.filter(p => p.status === 'scheduled').length;
  const uploaded = posts.filter(p => p.status === 'uploaded').length;
  const processing = jobs.filter(j =>
    ['queued', 'transcribing', 'analyzing', 'rendering'].includes(j.status)
  ).length;

  const recentJobs = jobs.slice(0, 5);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      queued:       { cls: 'badge-warning', label: 'Queued' },
      transcribing: { cls: 'badge-active', label: 'Transcribing' },
      analyzing:    { cls: 'badge-active', label: 'Analyzing' },
      rendering:    { cls: 'badge-active', label: 'Rendering' },
      completed:    { cls: 'badge-success', label: 'Completed' },
      failed:       { cls: 'badge-error', label: 'Failed' },
    };
    const info = map[status] || { cls: 'badge-mono', label: status };
    return <span className={`badge ${info.cls}`}>{info.label}</span>;
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-header-eyebrow">Studio Console // Telemetry</div>
          <h2>Editorial Control Room</h2>
          <p>Local offline intelligence suite for high-impact vertical video curation</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button className="btn btn-editorial" onClick={() => navigate('/process')}>
            <UploadIcon size={15} />
            <span>Ingest Media</span>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-2xl)' }}>
        <div className="stat-card">
          <span className="stat-label">[METRIC 01] · Ingested</span>
          <span className="stat-value">{jobs.length}</span>
          <span className="stat-sub">{completedJobs} ready for cut review</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">[METRIC 02] · Active Queue</span>
          <span className="stat-value" style={{ color: processing > 0 ? 'var(--accent-vermilion)' : undefined }}>
            {processing}
          </span>
          <span className="stat-sub">{processing > 0 ? 'Processing on local CPU/GPU' : 'Standby · Zero cloud cost'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">[METRIC 03] · Scheduled</span>
          <span className="stat-value">{scheduled}</span>
          <span className="stat-sub">Pending automated publish</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">[METRIC 04] · Broadcasted</span>
          <span className="stat-value" style={{ color: 'var(--accent-mint)' }}>{uploaded}</span>
          <span className="stat-sub">Shorts & Reels uploaded</span>
        </div>
      </div>

      {/* Quick Action Ingestion Bay Hero */}
      <div
        className="drop-zone"
        style={{ marginBottom: 'var(--space-2xl)', padding: 'var(--space-2xl) var(--space-xl)' }}
        onClick={() => navigate('/process')}
      >
        <div className="drop-zone-icon-box">
          <UploadIcon size={24} />
        </div>
        <div>
          <div className="drop-zone-title">Open Ingestion Bay</div>
          <div className="drop-zone-subtitle" style={{ marginTop: 'var(--space-2xs)' }}>
            Load 16:9 Master · Auto Transcribe · Smart Crop to 9:16 Vertical
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-xs)' }}>
          Enter Ingestion Bay <ArrowRightIcon size={13} />
        </button>
      </div>

      {/* Content Split: Recent Jobs & Broadcast Queue */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 'var(--space-xl)' }}>
        {/* Left: Recent Ingestions */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <VideoIcon size={18} style={{ color: 'var(--accent-vermilion)' }} />
              Recent Master Projects
            </h3>
            {jobs.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/process')}>
                View Ingest Bay →
              </button>
            )}
          </div>

          {recentJobs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">No Media Ingested Yet</div>
              <div className="empty-state-desc">
                Drop your raw footage into the Ingest Bay to extract viral moments and 9:16 cutdowns.
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/process')}>
                Ingest First Video
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {recentJobs.map(job => (
                <div
                  key={job.id}
                  onClick={() => navigate(job.status === 'completed' ? '/review' : '/process')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-md) var(--space-lg)',
                    background: 'var(--bg-surface-elevated)',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all var(--duration-fast) var(--ease-snappy)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--border-medium)';
                    e.currentTarget.style.background = 'var(--bg-surface-hover)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.background = 'var(--bg-surface-elevated)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', minWidth: 0 }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--radius-xs)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      flexShrink: 0
                    }}>
                      <VideoIcon size={16} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {job.video_name}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        ID: {job.id.slice(0, 14)} · {new Date(job.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div>
                    {getStatusBadge(job.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Upcoming Transmissions */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <CalendarIcon size={18} style={{ color: 'var(--accent-amber)' }} />
              Broadcast Schedule
            </h3>
            {posts.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/calendar')}>
                Open Grid →
              </button>
            )}
          </div>

          {posts.filter(p => p.status === 'scheduled').length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">Broadcast Grid Empty</div>
              <div className="empty-state-desc">
                Review your generated highlights to approve clips and schedule automated uploads to YouTube, Instagram, or X.
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/review')}>
                Review Extracted Clips
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {posts
                .filter(p => p.status === 'scheduled')
                .slice(0, 4)
                .map(post => {
                  const PlatformIcon =
                    post.platform === 'youtube' ? YouTubeIcon :
                    post.platform === 'instagram' ? InstagramIcon : TwitterIcon;
                  const platformColor =
                    post.platform === 'youtube' ? '#ff0000' :
                    post.platform === 'instagram' ? '#e1306c' : '#1da1f2';

                  return (
                    <div
                      key={post.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 'var(--space-md) var(--space-lg)',
                        background: 'var(--bg-surface-elevated)',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', minWidth: 0 }}>
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: 'var(--radius-xs)',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: platformColor,
                          flexShrink: 0
                        }}>
                          <PlatformIcon size={16} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {post.title || 'Alfred Highlight Clip'}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                            {new Date(post.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      <span className="badge badge-warning">Scheduled</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
