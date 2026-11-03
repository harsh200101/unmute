import { useState } from 'react';
import { Phone, HeartHandshake, ShieldAlert, Copy, Check, ExternalLink, LifeBuoy } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';

const CRISIS_HELPLINES = [
  {
    name: 'Tele-MANAS',
    org: 'Govt. of India — Ministry of Health & Family Welfare',
    number: '14416',
    altNumber: '1800-891-4416',
    callUrl: 'tel:14416',
    hours: '24/7 Toll-Free',
    languages: 'All 22 Scheduled Indian Languages + English',
    description: 'National tele-mental health programme providing free, confidential psychological support across India.',
    primary: true,
  },
  {
    name: 'Vandrevala Foundation',
    org: 'Mental Health & Suicide Prevention Helpline',
    number: '+91 9999 666 555',
    callUrl: 'tel:9999666555',
    hours: '24/7 Free & Confidential',
    languages: 'Hindi, English & Regional Languages',
    description: 'Immediate counseling and crisis intervention by trained mental health professionals via phone and WhatsApp.',
  },
  {
    name: 'KIRAN',
    org: 'Govt. of India — Ministry of Social Justice',
    number: '1800-599-0019',
    callUrl: 'tel:18005990019',
    hours: '24/7 Toll-Free',
    languages: '13 Indian Languages',
    description: 'Toll-free mental health rehabilitation and psychological crisis support.',
  },
  {
    name: 'AASRA',
    org: 'Crisis Intervention & Suicide Prevention',
    number: '+91 9820 466 726',
    callUrl: 'tel:919820466726',
    hours: '24/7 Confidential',
    languages: 'English, Hindi',
    description: 'Non-judgmental, confidential emotional support for anyone feeling depressed or suicidal.',
  },
  {
    name: 'National Emergency Helpline',
    org: 'Emergency Response Support System (ERSS)',
    number: '112',
    callUrl: 'tel:112',
    hours: '24/7 All-India',
    languages: 'Multi-lingual',
    description: 'Unified emergency response for immediate police, medical, or fire assistance.',
  },
];

export default function CrisisSupportModal({ open, onClose, isMentor = false }) {
  const [copiedNumber, setCopiedNumber] = useState(null);
  const [activeTab, setActiveTab] = useState('helplines'); // 'helplines' | 'mentor_guide'

  function copyToClipboard(num) {
    navigator.clipboard?.writeText(num);
    setCopiedNumber(num);
    setTimeout(() => setCopiedNumber(null), 2000);
  }

  return (
    <Modal open={open} onClose={onClose} title="Immediate Crisis & Lifeline Support" maxWidth="max-w-xl">
      <div className="space-y-4">
        {/* Urgent empathetic advisory banner */}
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-200 text-xs sm:text-sm leading-relaxed flex items-start gap-3">
          <ShieldAlert size={20} className="shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <div>
            <strong className="block font-semibold mb-0.5">You are not alone. Help is available right now.</strong>
            Unmute mentors offer philosophical perspective and peer reflection — they are not clinical doctors or licensed psychiatrists. If you or someone you are talking with is experiencing acute distress or thoughts of self-harm, please connect immediately with these free, confidential, 24/7 helplines.
          </div>
        </div>

        {/* Tab switch if viewed by mentor or user wants mentor guidance */}
        <div className="flex border-b border-border text-sm">
          <button
            onClick={() => setActiveTab('helplines')}
            className={`pb-2.5 px-3 font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'helplines'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400 font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            24/7 Verified Helplines
          </button>
          <button
            onClick={() => setActiveTab('mentor_guide')}
            className={`pb-2.5 px-3 font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'mentor_guide'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400 font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {isMentor ? 'Mentor Emergency Protocol' : 'What to Expect in Crisis Care'}
          </button>
        </div>

        {activeTab === 'helplines' ? (
          <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
            {CRISIS_HELPLINES.map((line) => (
              <div
                key={line.name}
                className={`p-3.5 rounded-xl border transition-all ${
                  line.primary
                    ? 'border-rose-500/40 bg-rose-500/5 shadow-sm'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-foreground text-sm">{line.name}</h3>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300">
                        {line.hours}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{line.org}</p>
                  </div>
                  <a
                    href={line.callUrl}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs shadow-sm transition-transform active:scale-95 shrink-0"
                  >
                    <Phone size={13} />
                    Call {line.number}
                  </a>
                </div>

                <p className="text-xs text-foreground/80 mt-2 leading-relaxed">
                  {line.description}
                </p>

                <div className="mt-2.5 pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                  <span className="text-[11px]">Languages: {line.languages}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(line.number)}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors text-[11px]"
                  >
                    {copiedNumber === line.number ? (
                      <>
                        <Check size={12} className="text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Copy number</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3.5 text-xs sm:text-sm text-foreground/90 max-h-[58vh] overflow-y-auto pr-1">
            <div className="p-3.5 rounded-xl bg-muted/60 border border-border space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                <HeartHandshake size={16} className="text-rose-500" />
                Guidelines for Mentors when Self-Harm is Mentioned
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground text-xs leading-relaxed pl-1">
                <li>
                  <strong className="text-foreground">Stay Calm and Listen with Compassion:</strong> Acknowledge their suffering without panic or judgment. Say: <em>&ldquo;I hear how heavy and painful things are for you right now, and I am grateful you trusted me enough to tell me.&rdquo;</em>
                </li>
                <li>
                  <strong className="text-foreground">Do Not Debate, Diagnose, or Argue:</strong> Avoid philosophical rationalizations or dismissals like &ldquo;everything happens for a reason&rdquo;. Validate the emotion while prioritizing physical safety.
                </li>
                <li>
                  <strong className="text-foreground">Be Clear on Boundaries:</strong> Warmly state: <em>&ldquo;Because I care about your life and I am a peer guide rather than a psychiatric doctor, I want to make sure you have the real clinical safety support you deserve.&rdquo;</em>
                </li>
                <li>
                  <strong className="text-foreground">Offer Verified Helplines Directly:</strong> Paste the Tele-MANAS (<strong>14416</strong>) or Vandrevala Foundation (<strong>+91 9999 666 555</strong>) number directly into in-call chat.
                </li>
                <li>
                  <strong className="text-foreground">Encourage Connecting with a Loved One:</strong> Suggest asking a family member, trusted roommate, or doctor to stay with them in person right now.
                </li>
              </ol>
            </div>

            <div className="p-3 rounded-lg border border-border text-xs text-muted-foreground">
              <strong>Emergency Services:</strong> In any situation with imminent risk to life, encourage immediate dialing of <strong>112</strong> or going to the nearest hospital casualty/emergency room.
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
