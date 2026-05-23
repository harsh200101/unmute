import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, PhoneOff, AlertTriangle, Clock, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { meetings as meetingsApi } from '../api/endpoints.js';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatDuration, formatINR } from '../lib/format.js';

const BILLING_POLL_MS = 5_000;

export default function MeetingRoom() {
  const { uuid } = useParams();
  const navigate = useNavigate();

  // Phase state
  const [phase, setPhase] = useState('joining'); // joining | live | leaving | error
  const [error, setError] = useState(null);

  // Agora refs
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audio: null, video: null });
  const initStartedRef = useRef(false);   // guards StrictMode double-invoke
  const remoteUsers = useRef(new Map());

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [meta, setMeta] = useState(null);  // credentials + booking info
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  // Billing snapshot polling
  const [billing, setBilling] = useState(null);
  const [endingModal, setEndingModal] = useState(false);
  const [ending, setEnding] = useState(false);

  // --- mount: credentials → agora join → events/joined → start polling ---
  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    let cancelled = false;
    let pollTimer = null;

    async function init() {
      try {
        const creds = await meetingsApi.credentials(uuid);
        if (cancelled) return;
        setMeta(creds);

        // Stub Agora mode: backend returned a "stub-" token. Don't try to
        // actually connect; show a placeholder. The user can still hang up,
        // and the billing engine still tracks state via /events/joined.
        const isStub = (creds.token || '').startsWith('stub-');

        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        client.on('user-published', async (user, mediaType) => {
          try {
            await client.subscribe(user, mediaType);
            remoteUsers.current.set(user.uid, user);
            if (mediaType === 'video' && remoteVideoRef.current) {
              user.videoTrack?.play(remoteVideoRef.current);
            }
            if (mediaType === 'audio') user.audioTrack?.play();
            setRemoteJoined(true);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[agora] subscribe failed', e);
          }
        });
        client.on('user-unpublished', (user, mediaType) => {
          if (mediaType === 'video' && remoteVideoRef.current) {
            try { user.videoTrack?.stop(); } catch (_) {}
          }
        });
        client.on('user-left', (user) => {
          remoteUsers.current.delete(user.uid);
          if (remoteUsers.current.size === 0) setRemoteJoined(false);
        });

        if (!isStub) {
          await client.join(creds.app_id, creds.channel, creds.token, creds.uid);

          const [audio, video] = await AgoraRTC.createMicrophoneAndCameraTracks({}, {
            encoderConfig: '720p_1',
          });
          localTracksRef.current = { audio, video };
          await client.publish([audio, video]);
          if (localVideoRef.current) video.play(localVideoRef.current);
        }

        // Tell the server we're present
        await meetingsApi.joined(uuid).catch(() => {});

        if (cancelled) return;
        setPhase('live');

        // Start billing snapshot polling
        const tick = async () => {
          try {
            const s = await meetingsApi.billing(uuid);
            if (!cancelled) setBilling(s);
            if (s.billing_state === 'finalized') {
              // Server already finalized this — end gracefully
              await teardown('server_finalized');
            }
          } catch (_) { /* ignore */ }
        };
        await tick();
        pollTimer = setInterval(tick, BILLING_POLL_MS);
      } catch (e) {
        setPhase('error');
        setError(e.response?.data?.error || e.message || 'Failed to start meeting');
      }
    }

    init();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      teardown('unmount').catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid]);

  async function teardown(reason) {
    try { await meetingsApi.left(uuid).catch(() => {}); } catch (_) {}
    try {
      const tracks = localTracksRef.current;
      tracks?.audio?.close();
      tracks?.video?.close();
      localTracksRef.current = { audio: null, video: null };
    } catch (_) {}
    try { await clientRef.current?.leave(); } catch (_) {}
    clientRef.current = null;
  }

  async function hangUp() {
    setEnding(true);
    try {
      await teardown('user_hangup');
      await meetingsApi.end(uuid).catch(() => {});
      toast.success('Session ended');
      navigate(`/bookings/${uuid}`);
    } finally {
      setEnding(false);
    }
  }

  function toggleMute() {
    const t = localTracksRef.current.audio;
    if (!t) return;
    const next = !muted;
    t.setEnabled(!next);
    setMuted(next);
  }
  function toggleCam() {
    const t = localTracksRef.current.video;
    if (!t) return;
    const next = !camOff;
    t.setEnabled(!next);
    setCamOff(next);
  }

  if (phase === 'joining' && !meta) return <PageSpinner />;
  if (phase === 'error') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-center px-4">
        <div className="max-w-md">
          <AlertTriangle className="mx-auto text-rose-500" size={36} />
          <h1 className="mt-3 text-xl font-semibold text-slate-900">Couldn't start the meeting</h1>
          <p className="mt-2 text-slate-600">{error}</p>
          <Button className="mt-5" onClick={() => navigate(`/bookings/${uuid}`)}>Back to booking</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 min-h-screen text-white -mt-px">
      {/* Top bar: status + HUD */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
        <HUDBar billing={billing} meta={meta} />
      </div>

      {/* Video grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Tile label="You" mutedFlag={muted} camOffFlag={camOff}>
          <div ref={localVideoRef} className="absolute inset-0 [&>video]:object-cover [&>video]:w-full [&>video]:h-full" />
          {(camOff) && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              <VideoOff size={36} />
            </div>
          )}
        </Tile>
        <Tile label={remoteJoined ? 'Other party' : 'Waiting for the other person…'} idle={!remoteJoined}>
          <div ref={remoteVideoRef} className="absolute inset-0 [&>video]:object-cover [&>video]:w-full [&>video]:h-full" />
        </Tile>
      </div>

      {/* Banners */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4 space-y-2">
        {billing?.low_balance_warned_at && billing?.billing_state === 'active' && (
          <Banner tone="warning">
            <AlertTriangle size={16} className="inline mr-1" />
            Low balance — your wallet runs out in ~{formatDuration(billing.est_seconds_remaining)}.
            Top up to avoid the call ending.
          </Banner>
        )}
        {billing?.billing_state === 'low_balance_grace' && (
          <Banner tone="danger">
            <AlertTriangle size={16} className="inline mr-1" />
            Wallet empty. Auto-ending in <strong>{formatDuration(billing.grace_seconds_remaining || 0)}</strong>{' '}
            unless you top up.{' '}
            <button
              onClick={() => window.open('/wallet?topup=1', '_blank', 'width=520,height=720')}
              className="underline ml-1">
              Top up now
            </button>
          </Banner>
        )}
        {billing?.billing_state === 'paused' && remoteJoined === false && (
          <Banner tone="info">Billing paused — waiting for the other person to rejoin.</Banner>
        )}
      </div>

      {/* Controls */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-6 pb-10 flex items-center justify-center gap-3">
        <CircleBtn onClick={toggleMute} active={!muted}>
          {muted ? <MicOff size={20} /> : <Mic size={20} />}
        </CircleBtn>
        <CircleBtn onClick={toggleCam} active={!camOff}>
          {camOff ? <VideoOff size={20} /> : <Video size={20} />}
        </CircleBtn>
        <CircleBtn onClick={() => setEndingModal(true)} danger>
          <PhoneOff size={20} />
        </CircleBtn>
      </div>

      <Modal open={endingModal} onClose={() => setEndingModal(false)} title="End the session?">
        <p className="text-sm text-slate-700">
          You'll be charged for billed time so far (subject to the 5-min minimum if both joined).
        </p>
        {billing && (
          <p className="mt-2 text-sm text-slate-700">
            Billed so far: <strong>{formatINR(billing.billed_paise)}</strong>{' '}
            ({formatDuration(billing.billed_seconds)})
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEndingModal(false)}>Keep talking</Button>
          <Button variant="danger" loading={ending} onClick={hangUp}>End session</Button>
        </div>
      </Modal>
    </div>
  );
}

// --- Sub-components -------------------------------------------------------

function HUDBar({ billing, meta }) {
  if (!billing) {
    return (
      <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3 text-sm">
        <span className="text-slate-300">Connecting…</span>
      </div>
    );
  }
  const stateTone = {
    idle: 'text-slate-300',
    active: 'text-emerald-300',
    paused: 'text-amber-300',
    low_balance_grace: 'text-rose-300',
    finalized: 'text-slate-300',
  }[billing.billing_state] || 'text-slate-300';

  return (
    <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3 text-sm">
      <div className="flex items-center gap-5">
        <span className="inline-flex items-center gap-1 text-slate-300">
          <Clock size={14} /> {formatDuration(billing.wall_clock_seconds)} / {formatDuration(billing.wall_clock_max_seconds)}
        </span>
        <span className="inline-flex items-center gap-1 text-slate-300">
          <IndianRupee size={14} /> Billed {formatINR(billing.billed_paise)} ({formatDuration(billing.billed_seconds)})
        </span>
        <span className="text-slate-400">@ {formatINR(billing.per_minute_paise)}/min</span>
      </div>
      <span className={`inline-flex items-center gap-1.5 ${stateTone}`}>
        <span className="inline-block h-2 w-2 rounded-full bg-current"></span>
        {billing.billing_state.replaceAll('_', ' ')}
      </span>
    </div>
  );
}

function Tile({ label, idle, children }) {
  return (
    <div className={`relative aspect-video rounded-2xl overflow-hidden ${idle ? 'bg-slate-800' : 'bg-slate-700'}`}>
      {children}
      <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/40 text-xs">
        {label}
      </div>
    </div>
  );
}

function Banner({ tone, children }) {
  const palette = {
    info: 'bg-blue-100 text-blue-900 border-blue-200',
    warning: 'bg-amber-100 text-amber-900 border-amber-200',
    danger: 'bg-rose-100 text-rose-900 border-rose-200',
  }[tone] || 'bg-slate-100 text-slate-900 border-slate-200';
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${palette}`}>
      {children}
    </div>
  );
}

function CircleBtn({ onClick, active = true, danger = false, children }) {
  const cls = danger
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : active
      ? 'bg-slate-700 hover:bg-slate-600 text-white'
      : 'bg-rose-600 hover:bg-rose-700 text-white';
  return (
    <button
      onClick={onClick}
      className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}
