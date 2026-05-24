import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, AlertTriangle, Clock, IndianRupee,
  MessageSquare, X, Send,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { meetings as meetingsApi } from '../api/endpoints.js';
import { getAccessToken } from '../api/client.js';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatDuration, formatINR } from '../lib/format.js';

const BILLING_POLL_MS = 5_000;
const CHAT_POLL_MS    = 2_000;

// Reliable "left" beacon for tab-close / browser-quit / OS-shutdown.
// `fetch(..., { keepalive: true })` lets the request outlive the page so
// the server reliably hears we left, in cases where the React unmount
// cleanup doesn't run. The server already handles /events/left correctly
// (rolls active interval into billed and transitions to `paused`).
function fireLeaveBeacon(uuid) {
  const token = getAccessToken();
  if (!token) return;
  try {
    const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    fetch(`${apiBase}/api/meetings/${uuid}/events/left`, {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    }).catch(() => {});
  } catch (_) { /* never throw inside unload */ }
}

export default function MeetingRoom() {
  const { uuid } = useParams();
  const navigate = useNavigate();

  // Phase state
  const [phase, setPhase] = useState('joining'); // joining | live | leaving | error
  const [error, setError] = useState(null);

  // Agora refs
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audio: null, video: null });
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

  // Chat state. `messages` is the cumulative list seen so far. `lastMsgId`
  // is the high-watermark we pass to the next poll. `chatOpen` controls the
  // drawer visibility; `unread` is bumped while the drawer is closed and a
  // new message arrives, and reset to 0 when the drawer opens.
  const [messages, setMessages] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const lastMsgIdRef = useRef(0);
  const chatScrollRef = useRef(null);

  // --- mount: credentials → agora join → events/joined → start polling ---
  //
  // We rely on the local `cancelled` flag (not a ref guard) to cope with
  // React 18 StrictMode's mount → unmount → remount cycle in dev. The first
  // mount's init() will bail out on its `cancelled` check; the second mount's
  // init() runs to completion. A ref guard breaks that — the second mount
  // would skip init entirely and the user is stuck on the spinner.
  useEffect(() => {
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
          if (cancelled) { try { await client.leave(); } catch (_) {} return; }
          await client.join(creds.app_id, creds.channel, creds.token, creds.uid);
          if (cancelled) { try { await client.leave(); } catch (_) {} return; }

          const [audio, video] = await AgoraRTC.createMicrophoneAndCameraTracks({}, {
            encoderConfig: '720p_1',
          });
          if (cancelled) {
            try { audio.close(); video.close(); } catch (_) {}
            try { await client.leave(); } catch (_) {}
            return;
          }
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

    // Fire a keepalive POST to /events/left on tab close / browser quit so
    // the server marks us as no-longer-present and pauses billing. This is
    // the most reliable signal — `useEffect` cleanup is best-effort and is
    // skipped on hard tab-close.
    const onPageHide = () => fireLeaveBeacon(uuid);
    window.addEventListener('pagehide', onPageHide);

    init();

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', onPageHide);
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

  // --- Chat polling. Runs only once we're live in the room. Polls every 2s
  //     for messages > lastMsgIdRef. Auto-scrolls to bottom when new messages
  //     arrive AND the drawer is open. Bumps unread when drawer is closed. ---
  useEffect(() => {
    if (phase !== 'live') return undefined;
    let cancelled = false;
    let timer = null;
    const poll = async () => {
      try {
        const res = await meetingsApi.listMessages(uuid, lastMsgIdRef.current);
        if (cancelled) return;
        const fresh = res.items || [];
        if (fresh.length) {
          lastMsgIdRef.current = fresh[fresh.length - 1].id;
          // Filter out messages we already optimistically added (matched by
          // body + sender + close timestamp). Cheap O(n*m) check, n+m tiny.
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id).filter(Boolean));
            const dedup = fresh.filter((m) => !seen.has(m.id));
            return prev.concat(dedup);
          });
          // Bump unread only for messages from the other party while drawer closed
          if (!chatOpen) {
            const fromOther = fresh.filter((m) => m.sender_user_id !== meta?.uid && m.sender_name !== meta?.self_name).length;
            if (fromOther > 0) setUnread((u) => u + fromOther);
          }
        }
      } catch (_) { /* keep polling */ }
    };
    poll();
    timer = setInterval(poll, CHAT_POLL_MS);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, uuid, chatOpen]);

  // Auto-scroll to bottom whenever messages change AND drawer is open.
  useEffect(() => {
    if (!chatOpen) return;
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, chatOpen]);

  // When the user opens the drawer, clear unread.
  useEffect(() => {
    if (chatOpen) setUnread(0);
  }, [chatOpen]);

  async function sendChat(e) {
    e?.preventDefault?.();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const r = await meetingsApi.sendMessage(uuid, text);
      const msg = r.message;
      // Append immediately — the poll will dedup by id.
      setMessages((prev) => prev.concat(msg));
      lastMsgIdRef.current = Math.max(lastMsgIdRef.current, msg.id);
      setDraft('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send');
    } finally {
      setSending(false);
    }
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
    // Full-viewport meeting room. `h-[100dvh]` (dynamic viewport height) gives
    // us a true fullscreen on mobile where iOS Safari's address bar
    // collapses/expands — `h-screen` (100vh) would over-shoot by ~80 px and
    // hide the controls behind the URL bar. Flex column so the video grid
    // gets `flex-1` and fills all space minus the HUD + control bar.
    <div className="fixed inset-0 z-30 flex bg-slate-950 text-white">
      {/* Main column: HUD + video + controls. Shrinks when chat drawer is
          open on desktop; on mobile the drawer is a full-screen overlay. */}
      <div className="flex-1 relative flex flex-col min-w-0">
        {/* Floating HUD pills, top-left. Glassmorphism (backdrop-blur)
            looks soft over the dark video background. */}
        <div className="absolute top-3 left-3 right-3 z-20 pointer-events-none flex flex-wrap items-start gap-2">
          <HUDPills billing={billing} />
          {/* Banner stack flows next to the HUD pills, wraps below on mobile. */}
          <div className="flex-1 min-w-[12rem] flex flex-col gap-2 pointer-events-auto">
            {billing?.low_balance_warned_at && billing?.billing_state === 'active' && (
              <Banner tone="warning">
                <AlertTriangle size={14} className="inline mr-1" />
                Low balance — runs out in ~{formatDuration(billing.est_seconds_remaining)}
              </Banner>
            )}
            {billing?.billing_state === 'low_balance_grace' && (
              <Banner tone="danger">
                <AlertTriangle size={14} className="inline mr-1" />
                Wallet empty. Auto-ending in <strong>{formatDuration(billing.grace_seconds_remaining || 0)}</strong>.{' '}
                <button
                  onClick={() => window.open('/wallet?topup=1', '_blank', 'width=520,height=720')}
                  className="underline">Top up</button>
              </Banner>
            )}
            {billing?.billing_state === 'paused' && remoteJoined === false && (
              <Banner tone="info">
                Billing paused — waiting for <strong>{meta?.counterpart_name || 'the other person'}</strong>
              </Banner>
            )}
          </div>
        </div>

        {/* Video grid — fills remaining vertical space. On mobile the tiles
            stack into a single column; on >= md they sit side-by-side. The
            tiles themselves grow to fill the cell. */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 p-2 pt-20 pb-24">
          <Tile label={`You${meta?.self_name ? ` — ${meta.self_name}` : ''}`} idle={false}>
            <div ref={localVideoRef} className="absolute inset-0 [&>video]:object-cover [&>video]:w-full [&>video]:h-full" />
            {camOff && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                <VideoOff size={48} />
              </div>
            )}
            {muted && (
              <div className="absolute top-2 right-2 bg-rose-600/90 rounded-full p-1.5">
                <MicOff size={14} />
              </div>
            )}
          </Tile>
          <Tile
            label={remoteJoined
              ? (meta?.counterpart_name || 'Other party')
              : `Waiting for ${meta?.counterpart_name || 'the other person'}…`}
            idle={!remoteJoined}
          >
            <div ref={remoteVideoRef} className="absolute inset-0 [&>video]:object-cover [&>video]:w-full [&>video]:h-full" />
            {!remoteJoined && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="h-20 w-20 rounded-full bg-slate-700 flex items-center justify-center text-2xl font-semibold">
                  {(meta?.counterpart_name || '?').charAt(0).toUpperCase()}
                </div>
                <p className="text-slate-300 text-sm">
                  Waiting for {meta?.counterpart_name || 'the other person'}…
                </p>
              </div>
            )}
          </Tile>
        </div>

        {/* Floating glassmorphism control bar, bottom-center. `safe-area-inset`
            keeps it clear of the iOS home indicator. */}
        <div className="absolute bottom-0 inset-x-0 z-20 flex justify-center pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
          <div className="flex items-center gap-2 rounded-full bg-slate-900/60 backdrop-blur-md ring-1 ring-white/10 px-3 py-2">
            <CircleBtn onClick={toggleMute} active={!muted} title={muted ? 'Unmute' : 'Mute'}>
              {muted ? <MicOff size={20} /> : <Mic size={20} />}
            </CircleBtn>
            <CircleBtn onClick={toggleCam} active={!camOff} title={camOff ? 'Turn camera on' : 'Turn camera off'}>
              {camOff ? <VideoOff size={20} /> : <Video size={20} />}
            </CircleBtn>
            <CircleBtn onClick={() => setChatOpen((o) => !o)} active={!chatOpen} title="Chat" badge={unread}>
              <MessageSquare size={20} />
            </CircleBtn>
            <div className="w-px h-8 bg-white/15 mx-1" />
            <CircleBtn onClick={() => setEndingModal(true)} danger title="End session">
              <PhoneOff size={20} />
            </CircleBtn>
          </div>
        </div>
      </div>

      {/* Chat drawer. Desktop: 360 px fixed column on the right. Mobile:
          full-screen overlay sliding in from the right. Both share the same
          markup; CSS toggles the size and slide animation. */}
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={messages}
        meta={meta}
        draft={draft}
        setDraft={setDraft}
        onSend={sendChat}
        sending={sending}
        scrollRef={chatScrollRef}
      />

      <Modal open={endingModal} onClose={() => setEndingModal(false)} title="End the session?">
        <p className="text-sm text-slate-700">
          You'll be charged for billed time so far (subject to the 15-min minimum if both joined).
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

// Pill-shaped HUD shown top-left over the video. Splits the old single-bar
// HUD into discrete chips so the layout reflows nicely on narrow screens
// (each chip wraps independently). Glassmorphism (bg slate-900/60 +
// backdrop-blur) blends softly with whatever video the user has behind it.
function HUDPills({ billing }) {
  const stateTone = {
    idle:               'bg-slate-500',
    active:             'bg-emerald-400',
    paused:             'bg-amber-400',
    low_balance_grace:  'bg-rose-500',
    finalized:          'bg-slate-500',
  }[billing?.billing_state] || 'bg-slate-500';

  const Pill = ({ children, dotClass }) => (
    <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-slate-900/60 backdrop-blur-md ring-1 ring-white/10 px-3 py-1.5 text-xs whitespace-nowrap">
      {dotClass && <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />}
      {children}
    </div>
  );

  if (!billing) {
    return <Pill dotClass="bg-slate-400 animate-pulse">Connecting…</Pill>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill dotClass={stateTone}>
        {billing.billing_state.replaceAll('_', ' ')}
      </Pill>
      <Pill>
        <Clock size={12} className="opacity-75" />
        {formatDuration(billing.wall_clock_seconds)} / {formatDuration(billing.wall_clock_max_seconds)}
      </Pill>
      <Pill>
        <IndianRupee size={12} className="opacity-75" />
        {formatINR(billing.billed_paise)} <span className="opacity-60">({formatDuration(billing.billed_seconds)})</span>
      </Pill>
      <Pill>
        <span className="opacity-60">@</span> {formatINR(billing.per_minute_paise)}/min
      </Pill>
    </div>
  );
}

// Video tile. Fills the available cell space (no aspect-video cap so the
// grid can drive the size). Label is bottom-left, semi-transparent so the
// video reads through it. `idle` flag tints the background slightly darker.
function Tile({ label, idle, children }) {
  return (
    <div className={`relative rounded-2xl overflow-hidden ring-1 ring-white/5 ${idle ? 'bg-slate-900' : 'bg-slate-800'}`}>
      {children}
      <div className="absolute bottom-2 left-2 z-10 px-2.5 py-1 rounded-md bg-black/55 backdrop-blur-sm text-xs font-medium tracking-tight">
        {label}
      </div>
    </div>
  );
}

// Toast-style status banner. Sits next to the HUD pills. Subtle border +
// darker fill so it reads on the dark video bg.
function Banner({ tone, children }) {
  const palette = {
    info:    'bg-sky-500/15 text-sky-100 ring-sky-400/30',
    warning: 'bg-amber-500/15 text-amber-100 ring-amber-400/30',
    danger:  'bg-rose-500/15 text-rose-100 ring-rose-400/30',
  }[tone] || 'bg-slate-500/15 text-slate-100 ring-slate-400/30';
  return (
    <div className={`pointer-events-auto rounded-xl ring-1 backdrop-blur-md px-3 py-2 text-xs ${palette}`}>
      {children}
    </div>
  );
}

// Round icon button used in the floating control bar. Supports a small
// numeric `badge` (e.g. unread message count) overlaid top-right.
function CircleBtn({ onClick, active = true, danger = false, badge, title, children }) {
  const cls = danger
    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40'
    : active
      ? 'bg-white/10 hover:bg-white/20 text-white ring-1 ring-white/15'
      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`relative h-11 w-11 rounded-full flex items-center justify-center transition-colors ${cls}`}
    >
      {children}
      {badge ? (
        <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-rose-500 text-[10px] font-bold flex items-center justify-center ring-2 ring-slate-900">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </button>
  );
}

// In-call chat panel. Desktop ≥ md: 360 px wide column docked right.
// Mobile < md: full-screen overlay sliding in from the right.
function ChatPanel({ open, onClose, messages, meta, draft, setDraft, onSend, sending, scrollRef }) {
  return (
    <>
      {/* Mobile-only overlay backdrop. Tapping it closes the drawer. On md+
          we skip the backdrop entirely because the drawer is part of the
          flex row, not floating. */}
      {open && (
        <button
          type="button"
          aria-label="Close chat"
          onClick={onClose}
          className="md:hidden fixed inset-0 z-40 bg-black/40"
        />
      )}

      <aside
        className={`
          z-50 bg-slate-900 ring-1 ring-white/10 flex flex-col
          fixed md:relative inset-y-0 right-0 w-full max-w-sm md:w-[22rem] md:max-w-none
          transition-transform duration-200 ease-out
          ${open ? 'translate-x-0' : 'translate-x-full md:translate-x-0 md:w-0 md:max-w-0 md:overflow-hidden md:ring-0'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <p className="text-sm font-semibold">Chat</p>
            <p className="text-[11px] text-slate-400">
              with {meta?.counterpart_name || 'the other party'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-white/10 flex items-center justify-center"
            aria-label="Close chat"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable message list. Auto-scrolled by the parent useEffect. */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
          {messages.length === 0 && (
            <p className="text-xs text-slate-500 text-center mt-6">
              No messages yet. Say hi 👋
            </p>
          )}
          {messages.map((m) => {
            const mine = m.sender_name === meta?.self_name;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm break-words ${
                    mine
                      ? 'bg-brand-600 text-white rounded-br-md'
                      : 'bg-white/10 text-slate-100 rounded-bl-md'
                  }`}
                >
                  {!mine && (
                    <p className="text-[10px] font-medium text-slate-400 mb-0.5">
                      {m.sender_name}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Composer. Pressing Enter sends; Shift+Enter inserts a newline. */}
        <form onSubmit={onSend} className="border-t border-white/10 p-3 flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend(e);
              }
            }}
            placeholder="Message…"
            rows={1}
            className="flex-1 resize-none rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-32"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="h-9 w-9 rounded-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </form>
      </aside>
    </>
  );
}
