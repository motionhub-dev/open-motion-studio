import type { HarnessView } from '../../shared/api';
import codexLogo from './agent-icons/codex.png';
import claudeLogo from './agent-icons/claude-code.png';

// Official artwork from the Codex desktop app and the Claude Code VS Code extension.
const logos = { codex: codexLogo, claude: claudeLogo };

export function AgentLogo({ kind }: { kind: HarnessView['kind'] }) {
  return <img className={`agent-logo ${kind}`} src={logos[kind]} alt="" />;
}
