import { usePreferences } from './preferences';
import { Select } from './select';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
/** This prepares a prompt, not a hidden model call or an edit to the film. */
export function Brief({ onUse }: { onUse(text: string): void }) {
  const { t: tr } = usePreferences();
  const [subject, setSubject] = useState('');
  const [audience, setAudience] = useState('');
  const [duration, setDuration] = useState('15');
  const [ratio, setRatio] = useState('16:9');
  return (
    <div className="brief" data-update-draft={!!(subject || audience || duration !== '15' || ratio !== '16:9')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!subject.trim()) return;
          onUse(
            `Make a ${duration}-second ${ratio} film about ${subject.trim()}.${audience.trim() ? ` It is for ${audience.trim()}.` : ''} Keep the visual story clear, choose a fitting motion, and check the scenes before finishing.`,
          );
        }}
      >
        <label>
          {tr("What are we making?")}
          <textarea
            rows={2}
            placeholder={tr("A launch for our new reading app…")}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={1000}
            required
          />
        </label>
        <label>
          {tr("Who is it for?")} <span className="muted">{tr("Optional")}</span>
          <input
            type="text"
            placeholder={tr("Curious readers, first-time visitors…")}
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            maxLength={300}
          />
        </label>
        <div className="brief-options">
          <label>
            {tr("Length")}
            <Select aria-label={tr("Length")} value={duration} onValueChange={setDuration} options={['15', '30', '60'].map(value => ({ value, label: tr("{0} seconds", {0: value}) }))} />
          </label>
          <label>
            {tr("Canvas")}
            <Select aria-label={tr("Canvas")} value={ratio} onValueChange={setRatio} options={[{ value: '16:9', label: tr("Wide · 16:9") }, { value: '9:16', label: tr("Portrait · 9:16") }, { value: '1:1', label: tr("Square · 1:1") }]} />
          </label>
        </div>
        <button type="submit" className="button" disabled={!subject.trim()}>
          {tr("Use this brief")}
          <ArrowUpRight size={13} />
        </button>
        <p className="note">{tr("Review your message before sending.")}</p>
      </form>
    </div>
  );
}
