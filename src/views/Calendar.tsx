import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useScheduleStore } from '../stores/scheduleStore';
import { useJobStore } from '../stores/jobStore';
import { api } from '../services/api';
import type { Platform } from '../types/schedule';
import type { Clip } from '../types/job';

import { YouTubeIcon, InstagramIcon, TwitterIcon, CalendarIcon } from '../components/Icons';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PLATFORM_COLORS: Record<Platform, string> = {
  youtube: '#FF3333',
  instagram: '#E1306C',
  twitter: '#38bdf8',
};

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function Calendar() {
  const [searchParams] = useSearchParams();
  const preselectedClipId = searchParams.get('clip_id');

  const { posts, fetchPosts, createPost, deletePost } = useScheduleStore();
  const { jobs, fetchJobs } = useJobStore();

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [approvedClips, setApprovedClips] = useState<Clip[]>([]);
  const [formClipId, setFormClipId] = useState(preselectedClipId || '');
  const [formPlatform, setFormPlatform] = useState<Platform>('youtube');
  const [formDate, setFormDate] = useState(todayStr);
  const [formTime, setFormTime] = useState('12:00');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formTags, setFormTags] = useState('#Shorts, #viral, #Alfred');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Initial fetch of posts & jobs
  useEffect(() => {
    fetchPosts();
    fetchJobs();
  }, [fetchPosts, fetchJobs]);

  // 2. Fetch approved clips across jobs for modal dropdown
  useEffect(() => {
    async function loadApprovedClips() {
      const allClips: Clip[] = [];
      for (const job of jobs) {
        try {
          const jobClips = await api.listClips(job.id);
          const approved = jobClips.filter(c => c.status === 'approved' || c.id === preselectedClipId);
          allClips.push(...approved);
        } catch {
          // ignore
        }
      }
      setApprovedClips(allClips);

      // Auto-open modal if clip_id param passed in
      if (preselectedClipId && !isModalOpen) {
        setFormClipId(preselectedClipId);
        const match = allClips.find(c => c.id === preselectedClipId);
        if (match) {
          setFormTitle(match.hook_text || `Highlight Clip #${match.rank}`);
          setFormDesc(match.transcript_text.slice(0, 150) + '...');
        }
        setIsModalOpen(true);
      }
    }
    if (jobs.length > 0) {
      loadApprovedClips();
    }
  }, [jobs, preselectedClipId]);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  // Open modal for a specific date
  const handleScheduleForDate = (dateStr: string) => {
    setFormDate(dateStr);
    setIsModalOpen(true);
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClipId) {
      alert('Please select an approved clip to schedule.');
      return;
    }
    setIsSubmitting(true);
    try {
      const scheduledAtIso = `${formDate}T${formTime}:00`;
      await createPost({
        clip_id: formClipId,
        platform: formPlatform,
        scheduled_at: scheduledAtIso,
        title: formTitle || 'Alfred Clip',
        description: formDesc,
        tags: formTags,
      });
      setIsModalOpen(false);
      // Reset form
      setFormTitle('');
      setFormDesc('');
    } catch (err: any) {
      alert(`Scheduling failed: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Posts on currently selected day
  const selectedDayPosts = posts.filter(p => p.scheduled_at.startsWith(selectedDateStr));

  // Build calendar days array
  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(<div key={`empty-${i}`} className="calendar-day empty" />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selectedDateStr;
    const dayPosts = posts.filter(p => p.scheduled_at.startsWith(dateStr));

    calendarDays.push(
      <div
        key={day}
        className={`calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
        onClick={() => setSelectedDateStr(dateStr)}
        style={{
          borderColor: isSelected ? 'var(--accent-primary)' : isToday ? 'var(--accent-secondary)' : undefined,
          background: isSelected ? 'var(--bg-hover)' : undefined,
        }}
      >
        <span className="calendar-day-number">{day}</span>

        {/* Post markers */}
        {dayPosts.length > 0 && (
          <div style={{ display: 'flex', gap: '3px', marginTop: 'auto', flexWrap: 'wrap', justifyContent: 'center' }}>
            {dayPosts.map(p => (
              <span
                key={p.id}
                title={`${p.platform}: ${p.title || 'Clip'} (${p.status})`}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: PLATFORM_COLORS[p.platform as Platform] || '#fff',
                  boxShadow: `0 0 4px ${PLATFORM_COLORS[p.platform as Platform]}`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <div className="page-header-eyebrow">Distribution // Broadcast Grid</div>
          <h2>Transmission Calendar</h2>
          <p>Schedule and orchestrate automated social posts across YouTube Shorts, Instagram Reels, and X</p>
        </div>
        <button
          className="btn btn-editorial"
          onClick={() => {
            setFormDate(selectedDateStr || todayStr);
            setIsModalOpen(true);
          }}
        >
          + Schedule Transmission
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 2fr) minmax(300px, 1.2fr)', gap: 'var(--space-xl)', alignItems: 'start' }}>
        {/* Calendar Card */}
        <div className="card">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-lg)',
          }}>
            <button className="btn btn-ghost btn-icon" onClick={prevMonth}>←</button>
            <h3 className="card-title" style={{ fontSize: 'var(--text-md)', margin: 0 }}>
              {MONTHS[currentMonth]} {currentYear}
            </h3>
            <button className="btn btn-ghost btn-icon" onClick={nextMonth}>→</button>
          </div>

          <div className="calendar-grid" style={{ marginBottom: 'var(--space-sm)' }}>
            {DAYS.map(day => (
              <div key={day} className="calendar-day-header">{day}</div>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 'var(--space-lg)', marginTop: 'var(--space-lg)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PLATFORM_COLORS.youtube }} /> YouTube Shorts
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PLATFORM_COLORS.instagram }} /> Instagram Reels
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PLATFORM_COLORS.twitter }} /> X (Twitter)
            </span>
          </div>
        </div>

        {/* Selected Day Details Panel */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', paddingBottom: 'var(--space-xs)', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', margin: 0, fontFamily: 'var(--font-mono)' }}>
              DAY // {selectedDateStr === todayStr ? `Today (${selectedDateStr})` : selectedDateStr}
            </h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleScheduleForDate(selectedDateStr)}
            >
              + Add Cut
            </button>
          </div>

          {selectedDayPosts.length === 0 ? (
            <div style={{ padding: 'var(--space-2xl) var(--space-md)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <div style={{ marginBottom: 'var(--space-sm)', color: 'var(--text-tertiary)' }}>
                <CalendarIcon size={32} />
              </div>
              <p style={{ fontSize: 'var(--text-sm)', margin: 0 }}>No transmissions queued for this day.</p>
              <button
                className="btn btn-editorial btn-sm"
                onClick={() => handleScheduleForDate(selectedDateStr)}
                style={{ marginTop: 'var(--space-md)' }}
              >
                Schedule Clip
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {selectedDayPosts.map(post => {
                const time = post.scheduled_at.split('T')[1]?.slice(0, 5) || '12:00';
                const PlatformIcon =
                  post.platform === 'youtube' ? YouTubeIcon :
                  post.platform === 'instagram' ? InstagramIcon : TwitterIcon;
                const platformColor = PLATFORM_COLORS[post.platform as Platform] || '#fff';

                return (
                  <div
                    key={post.id}
                    style={{
                      padding: 'var(--space-md)',
                      background: 'var(--bg-surface-elevated)',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-xs)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}>
                        <span style={{ color: platformColor, display: 'flex' }}><PlatformIcon size={16} /></span>
                        <span style={{ textTransform: 'capitalize' }}>{post.platform}</span>
                        <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>· {time}</span>
                      </span>

                      <span className={`badge ${
                        post.status === 'uploaded' ? 'badge-success' :
                        post.status === 'uploading' ? 'badge-active' :
                        post.status === 'failed' ? 'badge-error' : 'badge-warning'
                      }`}>
                        {post.status}
                      </span>
                    </div>

                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)' }}>
                      {post.title || 'Untitled Clip'}
                    </div>

                    {post.last_error && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--status-error)' }}>
                        ⚠️ {post.last_error}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-xs)' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => deletePost(post.id)}
                        style={{ color: 'var(--status-error)', fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                      >
                        Cancel Post
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)',
        }}>
          <div className="card animate-scale-in" style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Schedule Social Upload</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleCreatePost} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {/* Select Approved Clip */}
              <div className="form-group">
                <label className="form-label">Approved Clip</label>
                {approvedClips.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', padding: 'var(--space-sm)' }}>
                    No approved clips available. Please approve a clip in the Review tab first.
                  </div>
                ) : (
                  <select
                    className="form-input"
                    value={formClipId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setFormClipId(id);
                      const clip = approvedClips.find(c => c.id === id);
                      if (clip) {
                        setFormTitle(clip.hook_text || `Highlight Clip #${clip.rank}`);
                        setFormDesc(clip.transcript_text.slice(0, 150) + '...');
                      }
                    }}
                    required
                  >
                    <option value="">-- Choose an approved clip --</option>
                    {approvedClips.map(c => (
                      <option key={c.id} value={c.id}>
                        Clip #{c.rank} ({Math.round(c.duration)}s) — {c.hook_text ? `"${c.hook_text.slice(0, 45)}..."` : c.transcript_text.slice(0, 45)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Platform Selector */}
              <div className="form-group">
                <label className="form-label">Destination Platform</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-sm)' }}>
                  {(['youtube', 'instagram', 'twitter'] as Platform[]).map(p => (
                    <button
                      type="button"
                      key={p}
                      className={`btn btn-sm ${formPlatform === p ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setFormPlatform(p)}
                      style={{ textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {p === 'youtube' && <YouTubeIcon size={14} />}
                      {p === 'instagram' && <InstagramIcon size={14} />}
                      {p === 'twitter' && <TwitterIcon size={14} />}
                      <span>{p}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 'var(--space-sm)' }}>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Title */}
              <div className="form-group">
                <label className="form-label">Title / Caption</label>
                <input
                  type="text"
                  className="form-input"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Catchy title (under 100 chars)..."
                  maxLength={100}
                  required
                />
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Post description or transcript snippet..."
                />
              </div>

              {/* Tags */}
              <div className="form-group">
                <label className="form-label">Tags / Hashtags</label>
                <input
                  type="text"
                  className="form-input"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="#Shorts, #viral"
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || !formClipId}>
                  {isSubmitting ? 'Scheduling...' : 'Confirm Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        .calendar-day-header {
          text-align: center;
          font-size: var(--text-xs);
          font-weight: var(--weight-semibold);
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: var(--space-xs);
        }
        .calendar-day {
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: var(--space-xs);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          min-height: 58px;
        }
        .calendar-day:not(.empty):hover {
          background: var(--bg-hover);
          border-color: var(--border-medium);
        }
        .calendar-day.empty {
          background: transparent;
          border-color: transparent;
          cursor: default;
        }
        .calendar-day.today .calendar-day-number {
          color: var(--accent-secondary);
          font-weight: var(--weight-bold);
        }
        .calendar-day-number {
          font-size: var(--text-xs);
          font-weight: var(--weight-medium);
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
