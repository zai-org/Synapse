import { Bot } from "lucide-react"
import type { RemoteAgentRuntimeKind } from "@synapse/shared"

// Monochrome brand marks for the remote-agent runtime kinds. Sourced from
// LobeHub icons (Claude Code + Codex are monochrome-by-brand); rendered via
// currentColor so they inherit the surrounding badge's text color. Unknown /
// future kinds fall back to the generic Bot glyph.
type IconProps = React.SVGProps<SVGSVGElement>

function ClaudeCodeIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      width="1em"
      height="1em"
      aria-hidden="true"
      {...props}
    >
      <path
        clipRule="evenodd"
        d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z"
      ></path>
    </svg>
  )
}
function CodexIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      width="1em"
      height="1em"
      aria-hidden="true"
      {...props}
    >
      <path
        clipRule="evenodd"
        d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"
      ></path>
    </svg>
  )
}

// pi (pi.dev): stylized lowercase "pi" glyph — two strokes with a crossbar,
// drawn as filled bars in the 24x24 grid.
function PiIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      width="1em"
      height="1em"
      aria-hidden="true"
      {...props}
    >
      <path d="M3 5h18v2.4h-6.3c.2.9.3 1.9.3 2.9 0 3.4-.9 6-3.4 7.9l1.6 1.9c3.3-2.4 4.6-6 4.6-9.8 0-1-.1-2-.3-2.9H21V5H3z" />
      <path d="M5.2 14.6h6v2.2h-6z" />
    </svg>
  )
}

// opencode (opencode.ai): terminal-prompt chevron + underscore, matching the
// product's CLI-first mark.
function OpencodeIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden="true"
      {...props}
    >
      <path d="M5 7l5 5-5 5" />
      <path d="M13 17h6" />
    </svg>
  )
}

// Keyed by the closed RemoteAgentRuntimeKind union, so adding a runtime kind is
// a compile error here until its icon is provided.
const REMOTE_AGENT_RUNTIME_ICONS: Record<
  RemoteAgentRuntimeKind,
  (props: IconProps) => React.JSX.Element
> = {
  claude_code: ClaudeCodeIcon,
  codex: CodexIcon,
  pi: PiIcon,
  opencode: OpencodeIcon,
}

export function RuntimeKindIcon({
  kind,
  className,
}: {
  kind?: RemoteAgentRuntimeKind | null
  className?: string
}) {
  const Icon = kind ? REMOTE_AGENT_RUNTIME_ICONS[kind] : undefined
  if (!Icon) return <Bot className={className} />
  return <Icon className={className} />
}
