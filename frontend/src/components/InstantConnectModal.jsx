import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, EyeOff, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import { Input, Field } from './ui/Field.jsx';
import Avatar from './Avatar.jsx';
import { bookings as bookingsApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatPerMinute } from '../lib/format.js';

export default function InstantConnectModal({ isOpen, onClose, mentor }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [intentType, setIntentType] = useState('perspective');
  const [isIncognito, setIsIncognito] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!mentor) return null;

  async function handleConnect(e) {
    e?.preventDefault();
    if (!user) {
      toast.error('Please log in to start an instant call');
      navigate('/login?redirect=/mentors');
      return;
    }

    setLoading(true);
    try {
      const res = await bookingsApi.createInstant({
        mentor_uuid: mentor.profile_uuid || mentor.uuid,
        mentee_title: title.trim() || 'Instant Session',
        intent_type: intentType,
        is_incognito: isIncognito,
      });

      toast.success('Instant call started! Entering meeting room...');
      onClose();
      navigate(`/meetings/${res.booking.uuid}`);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to start instant session';
      toast.error(msg);
      if (err.response?.status === 401) {
        navigate('/login?redirect=/mentors');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="⚡ Connect Instantly" maxWidth="max-w-lg">
      <form onSubmit={handleConnect} className="space-y-4">
        {/* Mentor summary strip */}
        <div className="flex items-center gap-3.5 p-3 rounded-xl bg-muted/60 border border-border">
          <Avatar src={mentor.avatar_url} name={mentor.full_name} size={48} className="ring-2 ring-primary/20 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground text-sm truncate">{mentor.full_name}</h3>
              <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Online Now
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{mentor.headline}</p>
            <p className="text-xs font-medium text-primary mt-0.5">
              {formatPerMinute(mentor.per_minute_paise)} · Pay only for minutes you talk
            </p>
          </div>
        </div>

        {/* What's on your mind */}
        <Field label="What would you like to talk about?" htmlFor="instant_title">
          <Input
            id="instant_title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Quick advice on team conflict, feeling stuck..."
            className="w-full text-sm"
          />
        </Field>

        {/* Intent selection */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            What do you need from this session?
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'just_listen', label: 'Just listen', desc: 'Vent / soundboard' },
              { id: 'perspective', label: 'Perspective', desc: 'Advice & clarity' },
              { id: 'action_plan', label: 'Action plan', desc: 'Concrete next steps' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setIntentType(opt.id)}
                className={`p-2 rounded-xl text-left border transition-all text-xs ${
                  intentType === opt.id
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30 font-semibold'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/70'
                }`}
              >
                <div className="font-medium text-foreground">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Incognito mode toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-2.5">
            <EyeOff size={16} className="text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-foreground">Incognito mode</p>
              <p className="text-[11px] text-muted-foreground">Keep camera off and appear as "Anonymous Mentee"</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={isIncognito}
            onChange={(e) => setIsIncognito(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
          />
        </div>

        {/* Live notice */}
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl">
          <Clock size={14} className="shrink-0" />
          <span>The mentor will be notified immediately and routed into the meeting room with you.</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
          <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="md"
            loading={loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 font-medium shadow-soft"
          >
            <Zap size={14} className="fill-current" />
            Start Instant Call
          </Button>
        </div>
      </form>
    </Modal>
  );
}
