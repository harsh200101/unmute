import { useState, useEffect, useRef } from 'react';
import {
  Mic, Square, RotateCcw, Volume2, Shield, AlertCircle,
  Clock, Check, Sparkles, ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import { wallet as walletApi, voiceDilemmas as voiceApi } from '../api/endpoints.js';
import { formatINR } from '../lib/format.js';

const CATEGORIES = [
  'Career & Direction',
  'Anxiety & Overwhelm',
  'Relationships & Boundaries',
  'Decision Paralysis',
  'Philosophy & Meaning',
  'Creativity & Burnout',
  'General Life Dilemma',
];

export default function VoiceDilemmaModal({
  isOpen,
  onClose,
  mentor,
  onSuccess,
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [textNotes, setTextNotes] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Wallet
  const [balancePaise, setBalancePaise] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);

  // Recording states
  const [recording, setRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBase64, setAudioBase64] = useState(null);
  const [recordError, setRecordError] = useState(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const DILEMMA_FEE_PAISE = 9900; // ?99

  useEffect(() => {
    if (!isOpen) {
      resetForm();
      return;
    }

    setWalletLoading(true);
    walletApi.me()
      .then((w) => {
        const bal = w?.balance_paise ?? w?.balances?.mentee ?? 0;
        setBalancePaise(bal);
      })
      .catch(() => setBalancePaise(0))
      .finally(() => setWalletLoading(false));
  }, [isOpen]);

  const resetForm = () => {
    setTitle('');
    setCategory(CATEGORIES[0]);
    setTextNotes('');
    setIsAnonymous(false);
    stopRecording(true);
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioBase64(null);
    setRecordDuration(0);
    setRecordError(null);
  };

  // Recording controls
  const startRecording = async () => {
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          setAudioBase64(reader.result);
        };

        // Stop all audio tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(250);
      setRecording(true);
      setRecordDuration(0);

      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => {
          if (prev >= 180) { // 3-minute hard limit
            stopRecording();
            return 180;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[recorder] microphone access failed:', err);
      setRecordError('Could not access microphone. Please grant permission in your browser.');
    }
  };

  const stopRecording = (discard = false) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (discard) {
        mediaRecorderRef.current.onstop = null;
      }
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleRerecord = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioBase64(null);
    setRecordDuration(0);
    startRecording();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter a short title for your dilemma');
      return;
    }
    if (!audioBase64) {
      toast.error('Please record your voice dilemma before submitting');
      return;
    }
    if ((balancePaise ?? 0) < DILEMMA_FEE_PAISE) {
      toast.error('Insufficient wallet balance. Please top up ?99.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        mentor_uuid: mentor?.uuid || mentor?.profile_uuid,
        mentor_user_id: mentor?.user_id || mentor?.user?.id,
        title: title.trim(),
        category,
        audio_base64: audioBase64,
        audio_duration_seconds: recordDuration,
        text_notes: textNotes.trim() || null,
        is_anonymous: isAnonymous,
      };

      const res = await voiceApi.create(payload);
      toast.success('Voice Dilemma submitted! ?99 deducted from your wallet.');
      onSuccess?.(res.dilemma);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to submit voice dilemma';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const formatSecs = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const hasSufficientBalance = (balancePaise ?? 0) >= DILEMMA_FEE_PAISE;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Ask an Async Voice Dilemma (?99)"
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Mentor target pill */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/60 border border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
              ?
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Direct to Mentor
              </p>
              <h4 className="font-semibold text-foreground text-sm">
                {mentor?.full_name || mentor?.user?.full_name || 'Selected Mentor'}
              </h4>
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Fixed ?99
            </span>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
            Dilemma Title <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Should I leave my stable job for an early-stage startup?"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Voice Recorder Section */}
        <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Volume2 size={14} className="text-primary" />
              Voice Note (Up to 3 mins) <span className="text-destructive">*</span>
            </label>
            {recording && (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-red-500 animate-pulse">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {formatSecs(recordDuration)} / 3:00
              </span>
            )}
          </div>

          {recordError && (
            <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle size={14} />
              {recordError}
            </div>
          )}

          {/* Recorder Controls */}
          {!audioBlob && !recording && (
            <div className="text-center py-6 px-4 border-2 border-dashed border-border rounded-xl">
              <p className="text-xs text-muted-foreground mb-3">
                Speak your mind naturally. Explain your situation, conflicting thoughts, and what clarity you seek.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={startRecording}
                className="gap-2 border-primary/40 hover:bg-primary/5 text-primary"
              >
                <Mic size={16} />
                Start Voice Recording
              </Button>
            </div>
          )}

          {recording && (
            <div className="text-center py-6 px-4 bg-red-500/5 border border-red-500/20 rounded-xl space-y-3">
              <div className="flex justify-center items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
                <span className="font-mono text-xl font-bold text-red-600 dark:text-red-400">
                  {formatSecs(recordDuration)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Recording audio via your microphone...</p>
              <Button
                type="button"
                variant="danger"
                onClick={() => stopRecording(false)}
                className="gap-2"
              >
                <Square size={16} />
                Stop Recording
              </Button>
            </div>
          )}

          {audioBlob && !recording && (
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <Check size={14} className="text-emerald-500" />
                  Recorded ({formatSecs(recordDuration)})
                </span>
                <button
                  type="button"
                  onClick={handleRerecord}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition underline"
                >
                  <RotateCcw size={12} />
                  Re-record
                </button>
              </div>

              {audioUrl && (
                <audio controls src={audioUrl} className="w-full h-10 rounded-lg" />
              )}
            </div>
          )}
        </div>

        {/* Optional text notes */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
            Optional Notes / Key Context
          </label>
          <textarea
            rows={3}
            value={textNotes}
            onChange={(e) => setTextNotes(e.target.value)}
            placeholder="Bullet points or links to help your mentor give a targeted answer..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition resize-none"
          />
        </div>

        {/* Anonymous Toggle */}
        <label className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/30 cursor-pointer select-none hover:bg-muted/50 transition">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <div className="text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1">
              <Shield size={13} className="text-primary" />
              Ask anonymously
            </span>
            <p className="text-muted-foreground mt-0.5">
              Mentor will see your dilemma as &ldquo;Anonymous Mentee&rdquo;. Your name and avatar are hidden.
            </p>
          </div>
        </label>

        {/* Wallet Balance & Cost info */}
        <div className="p-3.5 rounded-xl border border-border bg-muted/40 flex items-center justify-between text-xs">
          <div>
            <span className="text-muted-foreground">Your Mentee Wallet:</span>
            <p className="font-semibold text-foreground text-sm mt-0.5">
              {walletLoading ? 'Checking…' : formatINR(balancePaise ?? 0)}
            </p>
          </div>
          {!hasSufficientBalance && !walletLoading && (
            <Link
              to="/wallet"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20"
            >
              Top Up ?100 <ChevronRight size={14} />
            </Link>
          )}
          {hasSufficientBalance && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <Check size={14} /> ?99 Available
            </span>
          )}
        </div>

        {/* Submit button */}
        <div className="pt-2 flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !audioBlob || !hasSufficientBalance}
            className="flex-1 gap-2 shadow-soft"
          >
            {submitting ? (
              'Submitting…'
            ) : (
              <>
                <Sparkles size={16} />
                Submit Dilemma (?99)
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
