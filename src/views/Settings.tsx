import { useEffect, useState, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { api } from '../services/api';
import {
  YouTubeIcon,
  InstagramIcon,
  TwitterIcon,
  MicrophoneIcon,
  CheckIcon,
} from '../components/Icons';

interface ModelInfo {
  name: string;
  ready: boolean;
  path?: string;
  fallback_available?: boolean;
}

export default function Settings() {
  const { accounts, fetchAccounts, connectAccount, disconnectAccount } = useSettingsStore();

  const [settings, setSettings] = useState<Record<string, string>>({
    voice_preset: 'default',
    voice_cloning_enabled: 'false',
    output_directory: '~/Alfred/projects',
  });
  const [models, setModels] = useState<Record<string, ModelInfo>>({});
  const [voiceSamples, setVoiceSamples] = useState<any[]>([]);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAccounts();
    api.getSettings().then(s => setSettings(s)).catch(console.error);
    api.getModels().then(m => setModels(m)).catch(console.error);
    api.listVoiceSamples().then(v => setVoiceSamples(v)).catch(console.error);
  }, [fetchAccounts]);

  const handleConnect = async (platform: string) => {
    setConnectingPlatform(platform);
    try {
      await connectAccount(platform);
      await fetchAccounts();
    } catch (err: any) {
      alert(`Could not connect ${platform}: ${err.message || err}`);
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (platform: string) => {
    if (!confirm(`Are you sure you want to disconnect ${platform}?`)) return;
    try {
      await disconnectAccount(platform);
      await fetchAccounts();
    } catch (err: any) {
      alert(`Disconnect failed: ${err.message || err}`);
    }
  };

  const handleVoicePresetChange = async (preset: string) => {
    const updated = { ...settings, voice_preset: preset };
    setSettings(updated);
    try {
      await api.updateSettings({ voice_preset: preset });
      triggerSaveNotification('Voice preset updated');
    } catch (err) {
      console.error(err);
    }
  };

  const handleVoiceCloningToggle = async (enabled: boolean) => {
    const val = enabled ? 'true' : 'false';
    const updated = { ...settings, voice_cloning_enabled: val };
    setSettings(updated);
    try {
      await api.updateSettings({ voice_cloning_enabled: val });
      triggerSaveNotification(enabled ? 'Voice cloning enabled' : 'Voice cloning disabled');
    } catch (err) {
      console.error(err);
    }
  };

  const handleVoiceSampleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingVoice(true);
    try {
      await api.uploadVoiceSample(file, 'my_voice');
      const updatedSamples = await api.listVoiceSamples();
      setVoiceSamples(updatedSamples);
      triggerSaveNotification('10s Voice sample embedding generated!');
    } catch (err: any) {
      alert(`Voice sample upload failed: ${err.message || err}`);
    } finally {
      setUploadingVoice(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerSaveNotification = (msg: string) => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const isConnected = (platform: string) => {
    return accounts.some(a => a.platform === platform);
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <div className="page-header-eyebrow">Calibration // Machine Hardware & Profiles</div>
          <h2>Hardware & Engine Settings</h2>
          <p>Configure local social sessions, Kokoro voice synthesis, and on-device ML runtimes</p>
        </div>
        {saveStatus && (
          <span className="badge badge-success animate-fade-in" style={{ padding: '6px 12px' }}>
            <CheckIcon size={12} /> {saveStatus}
          </span>
        )}
      </div>

      {/* Social Accounts */}
      <section style={{ marginBottom: 'var(--space-2xl)' }}>
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', marginBottom: 'var(--space-xs)', color: 'var(--text-primary)' }}>
          Broadcast Platform Profiles
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)' }}>
          Clicking Connect opens a dedicated browser session for zero-cloud OAuth login. Persistent session tokens remain encrypted in <code style={{ color: 'var(--accent-vermilion)' }}>~/.alfred/chromium_profiles</code>.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 'var(--space-md)' }}>
          {/* YouTube */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 'var(--radius-xs)',
              background: 'rgba(255, 51, 51, 0.1)', color: '#ff3333', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <YouTubeIcon size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', marginBottom: '2px' }}>
                YouTube Studio
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: isConnected('youtube') ? 'var(--accent-mint)' : 'var(--text-tertiary)' }}>
                {isConnected('youtube') ? '● AUTHENTICATED' : 'DISCONNECTED'}
              </div>
            </div>
            {isConnected('youtube') ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleDisconnect('youtube')}
                style={{ color: '#f87171' }}
              >
                Disconnect
              </button>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                disabled={connectingPlatform === 'youtube'}
                onClick={() => handleConnect('youtube')}
              >
                {connectingPlatform === 'youtube' ? 'Opening...' : 'Connect'}
              </button>
            )}
          </div>

          {/* Instagram */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 'var(--radius-xs)',
              background: 'rgba(225, 48, 108, 0.1)', color: '#e1306c', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <InstagramIcon size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', marginBottom: '2px' }}>
                Instagram Reels
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: isConnected('instagram') ? 'var(--accent-mint)' : 'var(--text-tertiary)' }}>
                {isConnected('instagram') ? '● AUTHENTICATED' : 'DISCONNECTED'}
              </div>
            </div>
            {isConnected('instagram') ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleDisconnect('instagram')}
                style={{ color: '#f87171' }}
              >
                Disconnect
              </button>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                disabled={connectingPlatform === 'instagram'}
                onClick={() => handleConnect('instagram')}
              >
                {connectingPlatform === 'instagram' ? 'Opening...' : 'Connect'}
              </button>
            )}
          </div>

          {/* X / Twitter */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 'var(--radius-xs)',
              background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <TwitterIcon size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', marginBottom: '2px' }}>
                X (Twitter)
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: isConnected('twitter') ? 'var(--accent-mint)' : 'var(--text-tertiary)' }}>
                {isConnected('twitter') ? '● AUTHENTICATED' : 'DISCONNECTED'}
              </div>
            </div>
            {isConnected('twitter') ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleDisconnect('twitter')}
                style={{ color: '#f87171' }}
              >
                Disconnect
              </button>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                disabled={connectingPlatform === 'twitter'}
                onClick={() => handleConnect('twitter')}
              >
                {connectingPlatform === 'twitter' ? 'Opening...' : 'Connect'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Voice & TTS Settings */}
      <section style={{ marginBottom: 'var(--space-2xl)' }}>
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', marginBottom: 'var(--space-xs)', color: 'var(--text-primary)' }}>
          Voiceover Synthesis (Kokoro-82M ONNX)
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)' }}>
          Local neural text-to-speech synthesis with true IPA G2P phoneme timing and tone mapping.
        </p>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* TTS Preset Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Active Voice Preset
            </label>
            <select
              className="mono"
              value={settings.voice_preset || 'default'}
              onChange={(e) => handleVoicePresetChange(e.target.value)}
              style={{ maxWidth: '420px', padding: '8px 12px' }}
            >
              <option value="default">Bella (af_bella) — Clear American Female [Default]</option>
              <option value="professional">Michael (am_michael) — Authoritative American Male</option>
              <option value="casual">Nicole (af_nicole) — Expressive Conversational Female</option>
              <option value="energetic">Sky (af_sky) — Vibrant Dynamic Youthful Female</option>
              <option value="narrator">George (bm_george) — Distinguished British Narrator</option>
            </select>
          </div>

          <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

          {/* Voice Cloning Box */}
          <div style={{
            padding: 'var(--space-lg)',
            background: 'var(--bg-surface-elevated)',
            borderRadius: 'var(--radius-xs)',
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <MicrophoneIcon size={18} style={{ color: 'var(--accent-vermilion)' }} />
                <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}>
                  OpenVoice v2 Voice Cloning
                </span>
                <span className="badge badge-mono">10s Reference Audio</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                <input
                  type="checkbox"
                  checked={settings.voice_cloning_enabled === 'true'}
                  onChange={(e) => handleVoiceCloningToggle(e.target.checked)}
                />
                Active In Pipeline
              </label>
            </div>

            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
              Clone your own voice for hook narration by uploading a short 10-second reference audio (.wav or .mp3). Speaker embeddings are calculated completely offline.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleVoiceSampleUpload}
                style={{ display: 'none' }}
              />
              <button
                className="btn btn-secondary btn-sm"
                disabled={uploadingVoice}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingVoice ? 'Extracting Embedding...' : '+ Upload 10s Reference Sample'}
              </button>

              {voiceSamples.length > 0 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--accent-mint)' }}>
                  ✓ ACTIVE EMBEDDING: {voiceSamples[0].name}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Model Status & Offline Engine */}
      <section style={{ marginBottom: 'var(--space-2xl)' }}>
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', marginBottom: 'var(--space-xs)', color: 'var(--text-primary)' }}>
          On-Device ML Engine Telemetry
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)' }}>
          Local neural weights loaded into ONNX Runtime & local inference backends.
        </p>

        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 'var(--space-sm)' }}>
            {Object.entries(models).map(([key, info]) => (
              <div
                key={key}
                style={{
                  padding: 'var(--space-md)',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                  <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-xs)' }}>{info.name}</span>
                  <span className={`badge ${info.ready ? 'badge-success' : 'badge-warning'}`}>
                    {info.ready ? 'ONLINE' : info.fallback_available ? 'FALLBACK' : 'OFFLINE'}
                  </span>
                </div>
                {info.path && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>
                    {info.path}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Alfred Studio */}
      <section>
        <div className="card" style={{
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-xs)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-secondary)'
        }}>
          <div><strong style={{ color: 'var(--text-primary)' }}>ALFRED STUDIO EDITION</strong> · v0.1.0</div>
          <div>ARCHITECTURE: Tauri 2.0 Rust Shell · React 19 Client · FastAPI Local Sidecar</div>
          <div style={{ color: 'var(--text-tertiary)' }}>100% On-Device Neural Pipeline · Zero Cloud Telemetry · Privacy First</div>
        </div>
      </section>
    </div>
  );
}
