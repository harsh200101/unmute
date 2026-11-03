import { useState, useRef } from 'react';
import {
  Mic, Square, Volume2, CheckCircle2, Clock, Shield,
  Sparkles, AlertCircle, RotateCcw, ChevronDown, ChevronUp, User
} from 'lucide-react';
import toast from 'react-hot-toast';
import Avatar from './Avatar.jsx';
import Button from './ui/Button.jsx';
import { voiceDilemmas as voiceApi } from '../api/endpoints.js';
import { relativeTime, formatDate } from '../lib/format.js';

export default function VoiceDilemmaCard({ dilemma, currentUserId, onAnswered }) {
  const [expanded, setExpanded] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);

  // Mentor answering states
  const [recording, setRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBase64, setAudioBase64] = useState(null);
  const [writtenTakeaway, setWrittenTakeaway] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const isMentor = Number(currentUserId) === Number(dilemma.mentor_user_id);
  const isMentee = Number(currentUserId) === Number(dilemma.mentee_user_id);
  const isAnswered = dilemma.status === 'answered';

  const startRecording = async () => {
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

        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          setAudioBase64(reader.result);
        };

        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(250);
      setRecording(true);
      setRecordDuration(0);

      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => {
          if (prev >= 180) {
            stopRecording();
            return 180;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      toast.error('Microphone access denied or unavailable');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleRerecord = () => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioBase64(null);
    setRecordDuration(0);
    startRecording();
  };

  const handleSubmitAnswer = async () => {
    if (!audioBase64) {
      toast.error('Please record your audio answer');
      return;
    }
    if (!writtenTakeaway.trim()) {
      toast.error('Please include key takeaways / action points');
      return;
    }

    setSubmitting(true);
    try {
      const res = await voiceApi.answer(dilemma.uuid, {
        audio_base64: audioBase64,
        audio_duration_seconds: recordDuration,
        written_takeaway: writtenTakeaway.trim(),
      });
      toast.success('Response sent! ?69.30 credited to your mentor wallet.');
      setIsAnswering(false);
      onAnswered?.(res.dilemma);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  const formatSecs = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-card text-card-foreground border border-border rounded-2xl p-4 sm:p-5 shadow-soft transition-all hover:shadow-elev">
      {/* Top Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {dilemma.category}
            </span>
            {dilemma.is_anonymous ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                <Shield size={11} className="text-primary" /> Anonymous
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {relativeTime(dilemma.created_at)}
            </span>
          </div>

          <h3 className="font-semibold text-foreground text-base sm:text-lg mt-1">
            {dilemma.title}
          </h3>
        </div>

        {/* Status Pill */}
        <div className="shrink-0">
          {isAnswered ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 size={13} /> Answered
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Clock size={13} /> Pending reply
            </span>
          )}
        </div>
      </div>

      {/* Participants info */}
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {dilemma.is_anonymous && !isMentee ? (
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <User size={13} />
              </div>
              Anonymous Mentee
            </div>
          ) : (
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Avatar
                src={dilemma.mentee_avatar_url}
                name={dilemma.mentee_name || 'Mentee'}
                size={24}
              />
              {dilemma.mentee_name}
            </div>
          )}
          <span>?</span>
          <span className="font-medium text-foreground">
            Mentor: {dilemma.mentor_name}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
        >
          {expanded ? 'Collapse' : 'Details'}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Dilemma Audio Player */}
      <div className="mt-4 p-3.5 rounded-xl bg-muted/40 border border-border space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Volume2 size={14} className="text-primary" />
            Mentee&apos;s Voice Dilemma
          </span>
          {dilemma.mentee_audio_duration_seconds > 0 && (
            <span className="text-muted-foreground font-mono">
              ~{formatSecs(dilemma.mentee_audio_duration_seconds)}
            </span>
          )}
        </div>
        <audio controls src={dilemma.mentee_audio_url} className="w-full h-9 rounded-lg" />

        {dilemma.mentee_text_notes && (
          <p className="text-xs text-muted-foreground italic pt-1">
            &ldquo;{dilemma.mentee_text_notes}&rdquo;
          </p>
        )}
      </div>

      {/* Answered Section */}
      {isAnswered && (
        <div className="mt-4 space-y-3">
          {/* Mentor Audio */}
          <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-primary flex items-center gap-1.5">
                <Sparkles size={14} />
                Mentor&apos;s Voice Answer
              </span>
              <span className="text-muted-foreground font-mono">
                {formatDate(dilemma.answered_at)}
              </span>
            </div>
            <audio controls src={dilemma.mentor_audio_url} className="w-full h-9 rounded-lg" />
          </div>

          {/* Mentor Written Takeaway Box (Gold/Indigo Accent) */}
          {dilemma.mentor_written_takeaway && (
            <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-card to-primary/5 p-4 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                <Sparkles size={13} /> Mentor&apos;s Key Takeaway & Next Steps
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {dilemma.mentor_written_takeaway}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Mentor Answering Action */}
      {!isAnswered && isMentor && (
        <div className="mt-4 pt-4 border-t border-border">
          {!isAnswering ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => setIsAnswering(true)}
              className="w-full gap-2 shadow-soft"
            >
              <Mic size={16} /> Record Audio Answer (?69.30 payout)
            </Button>
          ) : (
            <div className="p-4 rounded-xl border border-primary/30 bg-card space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
                  <Mic size={16} className="text-primary" />
                  Record Your Mentorship Answer
                </h4>
                <button
                  type="button"
                  onClick={() => setIsAnswering(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>

              {/* Recorder */}
              {!audioBlob && !recording && (
                <div className="text-center py-5 border border-dashed border-border rounded-xl">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startRecording}
                    className="gap-2 border-primary/40 text-primary"
                  >
                    <Mic size={16} /> Start Answer Recording
                  </Button>
                </div>
              )}

              {recording && (
                <div className="text-center py-5 bg-red-500/5 border border-red-500/20 rounded-xl space-y-2">
                  <div className="flex justify-center items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                    <span className="font-mono text-lg font-bold text-red-600 dark:text-red-400">
                      {formatSecs(recordDuration)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={stopRecording}
                    className="gap-2"
                  >
                    <Square size={14} /> Stop Recording
                  </Button>
                </div>
              )}

              {audioBlob && !recording && (
                <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-500 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={13} /> Recorded ({formatSecs(recordDuration)})
                    </span>
                    <button
                      type="button"
                      onClick={handleRerecord}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw size={12} className="inline mr-1" /> Re-record
                    </button>
                  </div>
                  <audio controls src={audioUrl} className="w-full h-9 rounded-lg" />
                </div>
              )}

              {/* Written Takeaway */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                  Written Takeaway & Action Points <span className="text-destructive">*</span>
                </label>
                <textarea
                  rows={3}
                  value={writtenTakeaway}
                  onChange={(e) => setWrittenTakeaway(e.target.value)}
                  placeholder="Summarize the core philosophical advice and 1-2 action steps..."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAnswering(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSubmitAnswer}
                  disabled={submitting || !audioBlob || !writtenTakeaway.trim()}
                  className="gap-2 shadow-soft"
                >
                  {submitting ? 'Submitting…' : 'Send Answer & Earn ?69.30'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
