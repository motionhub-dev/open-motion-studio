import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
/** This prepares a prompt, not a hidden model call or an edit to the film. */
export function Brief({ onUse }: { onUse(text: string): void }) {
  const [subject, setSubject] = useState('');
  const [audience, setAudience] = useState('');
  const [duration, setDuration] = useState('15');
  const [ratio, setRatio] = useState('16:9');
  return (
    <div className="brief">
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
          What are we making?
          <textarea
            rows={2}
            placeholder="A launch for our new reading app…"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={1000}
            required
          />
        </label>
        <label>
          Who is it for? <span className="muted">Optional</span>
          <input
            type="text"
            placeholder="Curious readers, first-time visitors…"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            maxLength={300}
          />
        </label>
        <div className="brief-options">
          <label>
            Length
            <select value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="15">15 seconds</option>
              <option value="30">30 seconds</option>
              <option value="60">60 seconds</option>
            </select>
          </label>
          <label>
            Canvas
            <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
              <option value="16:9">Wide · 16:9</option>
              <option value="9:16">Portrait · 9:16</option>
              <option value="1:1">Square · 1:1</option>
            </select>
          </label>
        </div>
        <button type="submit" className="button" disabled={!subject.trim()}>
          Use this brief
          <ArrowUpRight size={13} />
        </button>
        <p className="note">Review your message before sending.</p>
      </form>
    </div>
  );
}
