import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Users, 
  Cpu, 
  Mic, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ExternalLink, 
  Upload, 
  RefreshCw, 
  Check, 
  ShieldCheck,
  HardDrive,
  Radio,
  Square,
  RotateCcw,
  Sparkles,
  Volume2,
  Play
} from 'lucide-react'
import { settings as settingsApi, accounts as accountsApi } from '../lib/api'
import type { SocialAccount, ModelStatus, VoiceSample } from '../lib/types'
import { KOKORO_VOICES, VOICE_DISPLAY_NAMES } from '../lib/types'
import { cn } from '../lib/utils'

const REFERENCE_PROMPTS = [
  {
    title: "Casual Story & Hook",
    text: "Nobody warned us that this was going to happen before we arrived. We almost turned around and went back, but sticking it out turned into the single best decision we ever made. If you ever visit this place, make sure you don't miss it.",
  },
  {
    title: "Travel & Vlog",
    text: "In this video, we're exploring the most breathtaking hidden spots in the mountains. We took an unexpected detour, and what we found completely blew us away. Watch closely because this view is unreal.",
  },
  {
    title: "Insight & Tip",
    text: "The truth is, most creators make this critical mistake when starting out. Once we flipped this one simple rule, our retention numbers immediately doubled. Here is exactly what we learned from hundreds of hours of testing.",
  },
]

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'accounts' | 'voice' | 'models' | 'general'>('accounts')

  // Accounts
  const [accountsList, setAccountsList] = useState<SocialAccount[]>([])
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null)
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<string | null>(null)
  const [accountStatuses, setAccountStatuses] = useState<Record<string, { checking?: boolean; authenticated?: boolean; error?: string }>>({})

  // Voice & Audio
  const [voicePreset, setVoicePreset] = useState('af_sarah')
  const [voiceCloningEnabled, setVoiceCloningEnabled] = useState(false)
  const [selectedVoiceSample, setSelectedVoiceSample] = useState<string | null>(null)
  const [voiceSamples, setVoiceSamples] = useState<VoiceSample[]>([])
  const [uploadingVoice, setUploadingVoice] = useState(false)
  const [sampleName, setSampleName] = useState('')
  const [selectedVoiceFile, setSelectedVoiceFile] = useState<File | null>(null)
  const [savingVoice, setSavingVoice] = useState(false)
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null)

  // Audition Voice Player
  const [auditioningVoice, setAuditioningVoice] = useState<string | null>(null)
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      if (auditionAudioRef.current) {
        auditionAudioRef.current.pause()
        auditionAudioRef.current = null
      }
    }
  }, [])

  const handlePlayVoiceAudition = (voiceId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (auditionAudioRef.current) {
      auditionAudioRef.current.pause()
    }
    if (auditioningVoice === voiceId) {
      setAuditioningVoice(null)
      return
    }
    setAuditioningVoice(voiceId)
    const audio = new Audio(settingsApi.getVoicePreviewUrl(voiceId))
    auditionAudioRef.current = audio
    audio.play().catch(err => console.warn('Audition playback failed:', err))
    audio.onended = () => setAuditioningVoice(null)
    audio.onerror = () => setAuditioningVoice(null)
  }

  // Live Voice Recording
  const [voiceInputMode, setVoiceInputMode] = useState<'record' | 'upload'>('record')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null)
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl)
    }
  }, [recordedAudioUrl])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []

      let mimeType = 'audio/webm'
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus'
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm'
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus'
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4'
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blobType = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(audioChunksRef.current, { type: blobType })
        setRecordedAudioBlob(blob)
        if (recordedAudioUrl) {
          URL.revokeObjectURL(recordedAudioUrl)
        }
        setRecordedAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }

      recorder.start(200)
      setIsRecording(true)
      setRecordingSeconds(0)
      setRecordedAudioBlob(null)
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl)
        setRecordedAudioUrl(null)
      }

      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1)
      }, 1000)
    } catch (err: unknown) {
      alert(err instanceof Error ? `Microphone access error: ${err.message}` : 'Please allow microphone access in your browser to record.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const handleSaveRecordedVoice = async () => {
    if (!recordedAudioBlob) {
      alert('Please record your voice first before saving')
      return
    }
    setUploadingVoice(true)
    try {
      const cleanName = sampleName.trim() || `my_voice_${Date.now()}`
      const ext = recordedAudioBlob.type.includes('ogg') ? 'ogg' : 'webm'
      const file = new File([recordedAudioBlob], `${cleanName}.${ext}`, {
        type: recordedAudioBlob.type || 'audio/webm',
      })
      await settingsApi.uploadVoiceSample(file, cleanName)
      const freshSamples = await settingsApi.voiceSamples()
      setVoiceSamples(freshSamples)
      setRecordedAudioBlob(null)
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl)
        setRecordedAudioUrl(null)
      }
      setSampleName('')
      setRecordingSeconds(0)
      alert(`Voice profile "${cleanName}" created and acoustic profile analyzed! It is now ready for voice cloning.`)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save voice profile')
    } finally {
      setUploadingVoice(false)
    }
  }

  // Models
  const [modelsStatus, setModelsStatus] = useState<Record<string, ModelStatus>>({})
  const [loadingModels, setLoadingModels] = useState(false)

  // General Settings
  const [outputDir, setOutputDir] = useState('~/Alfred/projects')
  const [savingSettings, setSavingSettings] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Initial load
  const loadData = useCallback(async () => {
    try {
      const [accs, appSettings, samples, models] = await Promise.all([
        accountsApi.list().catch(() => [] as SocialAccount[]),
        settingsApi.get().catch(() => ({} as Record<string, string>)),
        settingsApi.voiceSamples().catch(() => [] as VoiceSample[]),
        settingsApi.models().catch(() => ({} as Record<string, ModelStatus>)),
      ])

      setAccountsList(accs)
      setVoiceSamples(samples)
      setModelsStatus(models)

      const s = appSettings as Record<string, string>
      if (s.voice_preset) {
        const mapped = s.voice_preset === 'af_heart' ? 'af_sarah' : s.voice_preset
        setVoicePreset(mapped)
      }
      if (s.voice_cloning_enabled) setVoiceCloningEnabled(s.voice_cloning_enabled === 'true')
      if (s.selected_voice_sample) {
        setSelectedVoiceSample(s.selected_voice_sample)
      } else if (samples.length > 0) {
        const firstWithEmbedding = samples.find(sm => sm.has_embedding)
        if (firstWithEmbedding) setSelectedVoiceSample(firstWithEmbedding.name)
      }
      if (s.output_directory) setOutputDir(s.output_directory)

      // Check live status for connected accounts
      accs.forEach(a => {
        checkAccountStatus(a.platform)
      })
    } catch (err) {
      console.error('Failed to load settings', err)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const checkAccountStatus = async (platform: string) => {
    setAccountStatuses(prev => ({
      ...prev,
      [platform]: { ...prev[platform], checking: true },
    }))
    try {
      const res = await accountsApi.status(platform)
      setAccountStatuses(prev => ({
        ...prev,
        [platform]: { checking: false, authenticated: res.authenticated, error: res.error },
      }))
    } catch (err: unknown) {
      setAccountStatuses(prev => ({
        ...prev,
        [platform]: {
          checking: false,
          authenticated: false,
          error: err instanceof Error ? err.message : 'Status check failed',
        },
      }))
    }
  }

  const handleConnectAccount = async (platform: string) => {
    setConnectingPlatform(platform)
    try {
      alert(`A Chromium browser window will open shortly for ${platform.toUpperCase()}.\n\n1. Sign in with your account credentials.\n2. Ensure you reach the dashboard or home feed.\n3. Alfred will verify and safely store your session cookies for automated uploads.`)
      const updated = await accountsApi.connect(platform)
      setAccountsList(prev => [updated, ...prev.filter(a => a.platform !== platform)])
      setAccountStatuses(prev => ({
        ...prev,
        [platform]: { checking: false, authenticated: true },
      }))
      alert(`✅ Connected to ${platform.toUpperCase()} and verified session successfully!`)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Connection to ${platform} failed or timed out`)
    } finally {
      setConnectingPlatform(null)
    }
  }

  const handleDisconnectAccount = async (platform: string) => {
    if (!window.confirm(`Disconnect ${platform.toUpperCase()} account and remove saved session cookies?`)) return
    setDisconnectingPlatform(platform)
    try {
      await accountsApi.disconnect(platform, true)
      setAccountsList(prev => prev.filter(a => a.platform !== platform))
      setAccountStatuses(prev => {
        const next = { ...prev }
        delete next[platform]
        return next
      })
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to disconnect account')
    } finally {
      setDisconnectingPlatform(null)
    }
  }

  const handleUploadVoiceSample = async () => {
    if (!selectedVoiceFile) {
      alert('Please choose an audio file first')
      return
    }
    setUploadingVoice(true)
    try {
      const cleanName = sampleName.trim() || 'my_voice'
      await settingsApi.uploadVoiceSample(selectedVoiceFile, cleanName)
      const freshSamples = await settingsApi.voiceSamples()
      setVoiceSamples(freshSamples)
      setSelectedVoiceFile(null)
      setSampleName('')
      alert('Voice sample uploaded and acoustic profile analyzed!')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to process voice sample')
    } finally {
      setUploadingVoice(false)
    }
  }

  const handleSelectVoicePreset = async (presetId: string) => {
    setVoicePreset(presetId)
    setSavingVoice(true)
    try {
      await settingsApi.update({ voice_preset: presetId })
      setVoiceFeedback(`Saved: Default voice set to ${VOICE_DISPLAY_NAMES[presetId] || presetId}`)
      setTimeout(() => setVoiceFeedback(null), 3500)
    } catch (err: unknown) {
      console.error('Failed to update voice preset', err)
      setVoiceFeedback('Failed to save voice preset')
    } finally {
      setSavingVoice(false)
    }
  }

  const handleToggleVoiceCloning = async () => {
    const next = !voiceCloningEnabled
    setVoiceCloningEnabled(next)
    setSavingVoice(true)
    try {
      await settingsApi.update({ voice_cloning_enabled: next ? 'true' : 'false' })
      setVoiceFeedback(next ? 'Saved: Voice cloning enabled' : 'Saved: Voice cloning disabled (using AI preset)')
      setTimeout(() => setVoiceFeedback(null), 3500)
    } catch (err: unknown) {
      console.error('Failed to update voice cloning state', err)
      setVoiceFeedback('Failed to update voice cloning setting')
    } finally {
      setSavingVoice(false)
    }
  }

  const handleSelectVoiceSample = async (sampleName: string) => {
    setSelectedVoiceSample(sampleName)
    setSavingVoice(true)
    try {
      await settingsApi.update({
        selected_voice_sample: sampleName,
        voice_cloning_enabled: 'true',
      })
      setVoiceCloningEnabled(true)
      setVoiceFeedback(`Saved: Active cloned voice profile set to "${sampleName}"`)
      setTimeout(() => setVoiceFeedback(null), 3500)
    } catch (err: unknown) {
      console.error('Failed to update active voice sample', err)
      setVoiceFeedback('Failed to set active voice sample')
    } finally {
      setSavingVoice(false)
    }
  }

  const handleSaveGeneralSettings = async () => {
    setSavingSettings(true)
    setSaveSuccess(false)
    try {
      await settingsApi.update({
        voice_preset: voicePreset,
        voice_cloning_enabled: voiceCloningEnabled ? 'true' : 'false',
        selected_voice_sample: selectedVoiceSample || '',
        output_directory: outputDir,
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  const checkModels = async () => {
    setLoadingModels(true)
    try {
      const m = await settingsApi.models()
      setModelsStatus(m)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingModels(false)
    }
  }

  const getAccount = (platform: string) => accountsList.find(a => a.platform === platform)

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-text">Settings & System</h2>
        <p className="text-sm text-text-secondary mt-1">
          Manage your connected publishing platforms, local AI models, voice cloning, and storage preferences.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-6 text-sm font-medium">
        {[
          { id: 'accounts', label: 'Social Accounts', icon: Users },
          { id: 'voice', label: 'Voice & Hook Audio', icon: Mic },
          { id: 'models', label: 'Local AI Engine', icon: Cpu },
          { id: 'general', label: 'General & Storage', icon: HardDrive },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as typeof activeTab)}
            className={cn(
              "flex items-center gap-2 pb-3 border-b-2 transition-all cursor-pointer",
              activeTab === id
                ? "border-accent text-accent font-semibold"
                : "border-transparent text-text-secondary hover:text-text hover:border-border-strong"
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Accounts */}
      {activeTab === 'accounts' && (
        <div className="space-y-6">
          <div className="bg-stone-50/70 p-4 rounded-xl border border-border text-xs text-text-secondary flex items-start gap-3">
            <ShieldCheck size={18} className="text-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-text">Private & Offline-first Auth</p>
              <p className="mt-0.5 leading-relaxed">
                Alfred uses local stealth browser profiles to upload content on your behalf. Your passwords and credentials are never stored or sent to any third-party server.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                platform: 'youtube',
                title: 'YouTube Shorts',
                desc: 'Upload vertical shorts directly to YouTube Studio.',
                color: 'text-red-600',
              },
              {
                platform: 'instagram',
                title: 'Instagram Reels',
                desc: 'Post 9:16 reels to your connected Instagram profile.',
                color: 'text-pink-600',
              },
              {
                platform: 'twitter',
                title: 'X (Twitter)',
                desc: 'Publish video tweets with custom hooks and copy.',
                color: 'text-sky-600',
              },
            ].map(({ platform, title, desc, color }) => {
              const connectedAcc = getAccount(platform)
              const isConnecting = connectingPlatform === platform
              const isDisconnecting = disconnectingPlatform === platform
              const statusInfo = accountStatuses[platform]
              const isChecking = statusInfo?.checking === true
              const isAuthenticated = statusInfo?.authenticated === true
              const isExpired = connectedAcc && statusInfo?.authenticated === false

              return (
                <div
                  key={platform}
                  className="bg-surface rounded-xl border border-border p-5 shadow-xs flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className={cn("text-base font-semibold", color)}>
                        {title}
                      </h4>
                      {isChecking ? (
                        <span className="inline-flex items-center gap-1 text-xs text-text-muted bg-stone-100 px-2 py-0.5 rounded-full">
                          <Loader2 size={11} className="animate-spin" />
                          Checking...
                        </span>
                      ) : isAuthenticated ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 size={12} />
                          Logged In
                        </span>
                      ) : isExpired ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                          <AlertCircle size={12} />
                          Not Logged In
                        </span>
                      ) : connectedAcc ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 size={12} />
                          Active
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted bg-stone-100 px-2 py-0.5 rounded-full">
                          Disconnected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      {desc}
                    </p>
                    {isAuthenticated && (
                      <div className="p-2 rounded-lg bg-emerald-50/70 border border-emerald-200/60 text-xs text-emerald-800">
                        <p className="font-medium">Active browser session verified.</p>
                        <p className="text-[11px] text-emerald-700 mt-0.5">Automated stealth uploads are enabled.</p>
                      </div>
                    )}
                    {isExpired && (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                        <p className="font-semibold">Action Required: No active login detected.</p>
                        <p className="text-[11px] text-amber-700 mt-0.5">Click "Log In via Browser" to sign into your account.</p>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-border">
                    {isAuthenticated ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => checkAccountStatus(platform)}
                          disabled={isChecking}
                          className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors border border-border"
                          title="Verify session cookies"
                        >
                          <RefreshCw size={12} className={cn(isChecking && "animate-spin")} />
                          Check Status
                        </button>
                        <button
                          onClick={() => handleDisconnectAccount(platform)}
                          disabled={isDisconnecting}
                          className="py-1.5 px-3 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 disabled:opacity-50"
                        >
                          {isDisconnecting ? '...' : 'Disconnect'}
                        </button>
                      </div>
                    ) : isExpired ? (
                      <div className="space-y-2">
                        <button
                          onClick={() => handleConnectAccount(platform)}
                          disabled={isConnecting}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50 shadow-xs"
                        >
                          {isConnecting ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Browser Open...
                            </>
                          ) : (
                            <>
                              <ExternalLink size={13} />
                              Log In via Browser
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDisconnectAccount(platform)}
                          disabled={isDisconnecting}
                          className="w-full py-1 text-xs text-red-600 hover:text-red-700 transition-colors"
                        >
                          Remove Stale Session
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnectAccount(platform)}
                        disabled={isConnecting}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium bg-stone-900 text-white hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50 shadow-xs"
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            Browser Open...
                          </>
                        ) : (
                          <>
                            <ExternalLink size={13} />
                            Connect via Browser
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tab: Voice & Audio */}
      {activeTab === 'voice' && (
        <div className="space-y-6">
          {voiceFeedback && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between animate-fade-in shadow-2xs">
              <span className="flex items-center gap-1.5 font-medium">
                <Check size={14} className="text-emerald-600" />
                {voiceFeedback}
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider">Synced to database</span>
            </div>
          )}

          <div className="bg-surface rounded-xl border border-border p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-text">Spoken Audio Presets</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Choose the default voice used by the Kokoro-82M TTS engine for hook voiceovers. Changes save instantly.
                </p>
              </div>
              {savingVoice && (
                <div className="inline-flex items-center gap-1.5 text-xs text-accent font-medium bg-accent-light/40 px-2.5 py-1 rounded-md">
                  <Loader2 size={12} className="animate-spin" />
                  Saving...
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {KOKORO_VOICES.map(voice => {
                const isSelected = voicePreset === voice.id && !voiceCloningEnabled
                const isAuditioning = auditioningVoice === voice.id
                return (
                  <div
                    key={voice.id}
                    onClick={() => handleSelectVoicePreset(voice.id)}
                    className={cn(
                      "p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between space-y-2.5",
                      isSelected
                        ? "border-accent bg-accent-light/30 ring-1 ring-accent shadow-xs"
                        : "border-border hover:border-stone-400 bg-white"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-text">{voice.name}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
                            {voice.gender === 'female' ? '♀ Female' : '♂ Male'}
                          </span>
                        </div>
                        {isSelected && <Check size={16} className="text-accent shrink-0" />}
                      </div>
                      <p className="text-xs text-text-muted leading-snug line-clamp-2">{voice.desc}</p>
                    </div>

                    <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px]">
                      <span className="text-stone-500 font-medium text-[10px]">{voice.tag}</span>
                      <button
                        type="button"
                        onClick={(e) => handlePlayVoiceAudition(voice.id, e)}
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer border",
                          isAuditioning
                            ? "bg-accent text-white border-accent animate-pulse"
                            : "bg-stone-100 hover:bg-stone-200 text-text border-stone-200"
                        )}
                        title="Hear a live voice sample"
                      >
                        {isAuditioning ? (
                          <>
                            <Square size={9} className="fill-white" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Play size={9} className="fill-current" />
                            <span>Listen</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-text">Enable Voice Cloning (OpenVoice v2)</p>
                <p className="text-xs text-text-muted">Generate hooks in your own voice from an uploaded reference clip</p>
              </div>
              <button
                type="button"
                onClick={handleToggleVoiceCloning}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  voiceCloningEnabled ? "bg-accent" : "bg-stone-200"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    voiceCloningEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>

          {/* Voice sample recording & upload */}
          <div className="bg-surface rounded-xl border border-border p-6 shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-semibold text-text">Your Voice Reference Samples</h3>
              <p className="text-xs text-text-secondary mt-1">
                Record a 10–15 second clean voice clip with the reference script below or upload an audio file to generate your sound profile for voice cloning.
              </p>
            </div>

            {/* Mode switch */}
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <button
                type="button"
                onClick={() => setVoiceInputMode('record')}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  voiceInputMode === 'record'
                    ? "bg-accent text-accent-text shadow-xs"
                    : "bg-stone-100 text-text-secondary hover:text-text hover:bg-stone-200"
                )}
              >
                <Radio size={13} className={voiceInputMode === 'record' ? 'animate-pulse' : ''} />
                Record with Microphone
              </button>
              <button
                type="button"
                onClick={() => setVoiceInputMode('upload')}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  voiceInputMode === 'upload'
                    ? "bg-accent text-accent-text shadow-xs"
                    : "bg-stone-100 text-text-secondary hover:text-text hover:bg-stone-200"
                )}
              >
                <Upload size={13} />
                Upload Audio File
              </button>
            </div>

            {/* Mode: Live Recording */}
            {voiceInputMode === 'record' && (
              <div className="space-y-4">
                {/* Script selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-text uppercase tracking-wider">
                      1. Read this text aloud (10-15 seconds):
                    </span>
                    <div className="flex gap-1.5">
                      {REFERENCE_PROMPTS.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedPromptIndex(idx)}
                          className={cn(
                            "px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer",
                            selectedPromptIndex === idx
                              ? "bg-accent-light text-accent border border-accent/30 font-semibold"
                              : "bg-stone-100 text-text-muted hover:text-text"
                          )}
                        >
                          {p.title}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-stone-50/80 rounded-xl border border-stone-200 shadow-2xs">
                    <p className="text-sm font-medium text-text leading-relaxed italic">
                      "{REFERENCE_PROMPTS[selectedPromptIndex].text}"
                    </p>
                  </div>
                </div>

                {/* Recording interface */}
                <div className="p-4 bg-stone-50/50 rounded-xl border border-border space-y-3">
                  <span className="text-xs font-semibold text-text uppercase tracking-wider block">
                    2. Record & Generate Sound Profile:
                  </span>

                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <input
                      type="text"
                      placeholder="Voice label (e.g. My Studio Voice)"
                      value={sampleName}
                      onChange={(e) => setSampleName(e.target.value)}
                      className="text-xs px-3 py-2 border border-border rounded-lg bg-white text-text w-full sm:w-64 focus:outline-none focus:ring-1 focus:ring-accent"
                    />

                    {!isRecording && !recordedAudioUrl && (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-accent-text hover:bg-accent-hover transition-colors shadow-xs cursor-pointer"
                      >
                        <Radio size={14} className="animate-pulse" />
                        Start Recording
                      </button>
                    )}

                    {isRecording && (
                      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
                          <span>Recording: {recordingSeconds}s</span>
                          <span className="text-[10px] text-rose-500 font-normal">
                            (10-15s recommended)
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={stopRecording}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition-colors cursor-pointer shadow-xs"
                        >
                          <Square size={13} className="fill-white" />
                          Stop Recording
                        </button>
                      </div>
                    )}

                    {recordedAudioUrl && !isRecording && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={startRecording}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-100 text-text hover:bg-stone-200 transition-colors cursor-pointer"
                          title="Record again"
                        >
                          <RotateCcw size={13} />
                          Re-record
                        </button>

                        <button
                          type="button"
                          onClick={handleSaveRecordedVoice}
                          disabled={uploadingVoice}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-accent-text hover:bg-accent-hover transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                        >
                          {uploadingVoice ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Analyzing Profile...
                            </>
                          ) : (
                            <>
                              <Sparkles size={13} />
                              Save & Create Profile
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {recordedAudioUrl && (
                    <div className="pt-2">
                      <p className="text-[11px] text-text-muted mb-1 flex items-center gap-1">
                        <Volume2 size={12} className="text-accent" />
                        Listen to your recording preview ({recordingSeconds}s):
                      </p>
                      <audio controls src={recordedAudioUrl} className="w-full h-8" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mode: File Upload */}
            {voiceInputMode === 'upload' && (
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Voice label (e.g. Divyam Mic 1)"
                  value={sampleName}
                  onChange={(e) => setSampleName(e.target.value)}
                  className="text-xs px-3 py-2 border border-border rounded-lg bg-white text-text flex-1 focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  type="file"
                  accept=".wav,.mp3,.m4a,.ogg,.webm"
                  onChange={(e) => setSelectedVoiceFile(e.target.files?.[0] || null)}
                  className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-stone-100 file:text-text hover:file:bg-stone-200 text-text-secondary"
                />
                <button
                  type="button"
                  onClick={handleUploadVoiceSample}
                  disabled={uploadingVoice || !selectedVoiceFile}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-text hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {uploadingVoice ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  Upload Sample
                </button>
              </div>
            )}

            {voiceSamples.length > 0 && (
              <div className="divide-y divide-border pt-2">
                {voiceSamples.map((sample, i) => {
                  const isSelected = selectedVoiceSample === sample.name && voiceCloningEnabled
                  return (
                    <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Mic size={14} className={isSelected ? "text-accent" : "text-text-muted"} />
                        <span className="font-medium text-text">{sample.name}</span>
                        {isSelected && (
                          <span className="text-[10px] bg-accent-light text-accent border border-accent/20 px-2 py-0.5 rounded-full font-bold">
                            Active Voice Profile
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {sample.has_embedding ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-200">
                            Embedding Ready
                          </span>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                            Raw Audio
                          </span>
                        )}

                        {sample.has_embedding && !isSelected && (
                          <button
                            type="button"
                            onClick={() => handleSelectVoiceSample(sample.name)}
                            className="px-2.5 py-1 text-[11px] rounded bg-stone-100 hover:bg-accent hover:text-white transition-colors cursor-pointer text-text font-medium"
                          >
                            Set Active
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Models */}
      {activeTab === 'models' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-text">On-Device AI Models</h3>
              <p className="text-xs text-text-secondary mt-1">
                Alfred runs 100% locally on your hardware. All models execute offline with zero cloud tokens or external latency.
              </p>
            </div>
            <button
              onClick={checkModels}
              disabled={loadingModels}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-100 text-text hover:bg-stone-200 transition-colors cursor-pointer"
            >
              <RefreshCw size={13} className={loadingModels ? "animate-spin" : ""} />
              Check Status
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(modelsStatus).map(([key, model]) => (
              <div
                key={key}
                className="bg-surface rounded-xl border border-border p-4 shadow-xs space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-text">{model.name}</h4>
                  {model.ready ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 size={12} />
                      Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      <AlertCircle size={12} />
                      Fallback mode
                    </span>
                  )}
                </div>

                {model.engine && (
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-secondary bg-stone-50 px-2.5 py-1 rounded-md border border-border/70">
                    <Cpu size={12} className="text-accent shrink-0" />
                    <span>Engine: {model.engine}</span>
                  </div>
                )}

                {model.path && (
                  <p className="text-[11px] text-text-muted truncate font-mono">
                    Path: {model.path}
                  </p>
                )}

                {model.ready ? (
                  <p className="text-[11px] text-emerald-700 flex items-center gap-1 font-medium pt-0.5">
                    <Check size={12} strokeWidth={2.5} />
                    Active on local hardware — full neural accuracy
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-700">
                    Using heuristic algorithm fallback until model weights are in place.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: General */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="bg-surface rounded-xl border border-border p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-semibold text-text">Storage & Export Folder</h3>
              <p className="text-xs text-text-secondary mt-1">
                Where generated 9:16 shorts, audio files, and transcripts will be saved.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
                Output Directory
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-border bg-white text-text focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-between">
              {saveSuccess && (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <Check size={14} />
                  Settings saved successfully!
                </span>
              )}
              <div className="ml-auto">
                <button
                  onClick={handleSaveGeneralSettings}
                  disabled={savingSettings}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-text hover:bg-accent-hover transition-colors shadow-xs disabled:opacity-50"
                >
                  {savingSettings ? <Loader2 size={13} className="animate-spin" /> : 'Save Preferences'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
