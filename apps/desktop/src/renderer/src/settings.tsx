// The model providers: add one (a preset or any server that speaks the Anthropic Messages
// protocol), give it a key, and choose which one the agent runs on. A key goes to the main
// process and is never shown again.

import { type FormEvent, useState } from 'react';
import type { ProviderInput, Providers } from '../../shared/api';
import { reason } from './reason';

const PRESETS: Omit<ProviderInput, 'key'>[] = [
  { name: 'Anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5' },
  { name: 'MiniMax', baseUrl: 'https://api.minimax.io/anthropic', model: 'MiniMax-M3' },
  { name: 'Custom', baseUrl: 'https://', model: '' },
];

const blank = (): ProviderInput => ({ ...PRESETS[0]!, key: '' });

export function Settings({ providers, onChange, onClose }: { providers: Providers; onChange(p: Providers): void; onClose(): void }) {
  const [form, setForm] = useState<ProviderInput | null>(providers.providers.length ? null : blank());
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<Providers>) {
    setError(null);
    try {
      onChange(await action());
      return true;
    } catch (e) {
      setError(reason(e));
      return false;
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (form && (await run(() => window.studio.saveProvider(form)))) setForm(null);
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Models" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Models</h2>
          <button type="button" className="quiet" onClick={onClose}>
            Done
          </button>
        </div>
        {providers.weakKeyStorage && (
          <p className="error">This system has no keychain, so keys are kept with a fixed secret any program on it could open.</p>
        )}
        <ul className="list">
          {providers.providers.map((p) => (
            <li key={p.id} className="provider">
              <label>
                <input
                  type="radio"
                  name="active"
                  checked={providers.active === p.id}
                  onChange={() => void run(() => window.studio.activateProvider(p.id))}
                />
                <span>
                  <strong>{p.name}</strong>
                  <span className="path">
                    {p.model} · {p.baseUrl}
                    {p.hasKey ? '' : ' · no key'}
                  </span>
                </span>
              </label>
              <span className="actions">
                <button type="button" className="quiet" onClick={() => setForm({ ...p, key: '' })}>
                  Edit
                </button>
                <button type="button" className="quiet" onClick={() => void run(() => window.studio.removeProvider(p.id))}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
        {form ? (
          <form className="provider-form" onSubmit={save}>
            {!form.id && (
              <label>
                Preset
                <select
                  onChange={(e) => {
                    const preset = PRESETS[Number(e.target.value)]!;
                    setForm({ ...preset, key: form.key });
                  }}
                >
                  {PRESETS.map((p, i) => (
                    <option key={p.name} value={i}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Name
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Address (speaks the Anthropic Messages protocol)
              <input type="text" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
            </label>
            <label>
              Model
              <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </label>
            <label>
              Key{form.id ? ' (leave empty to keep the one stored)' : ''}
              <input
                type="password"
                value={form.key}
                autoComplete="off"
                onChange={(e) => setForm({ ...form, key: e.target.value })}
              />
            </label>
            <div className="actions">
              <button type="submit" className="primary">
                Save
              </button>
              <button type="button" onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setForm(blank())}>
            Add a provider
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
