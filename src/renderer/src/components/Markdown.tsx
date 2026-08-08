import { Check, Copy } from 'lucide-react'
import { Fragment, useState, type ReactNode } from 'react'

/**
 * Just enough Markdown.
 *
 * Language models write Markdown whether or not you ask them to, so a chat
 * that renders raw text shows people literal asterisks and backticks and looks
 * broken. This turns the handful of things that actually turn up — emphasis,
 * inline code, fenced blocks, lists, headings, links, quotes — into real
 * elements and leaves everything else as plain text.
 *
 * It is written by hand rather than pulled in, for two reasons. A Markdown
 * library plus a sanitiser is a few hundred kilobytes to render bold text, and
 * more importantly every one of them ends in `dangerouslySetInnerHTML`. Here
 * the output is React elements and there is no HTML path at all, so nothing a
 * model emits can become markup. The worst case is that something renders as
 * plain text — never that it renders as something else.
 */

interface Props {
  text: string
  className?: string
}

export default function Markdown({ text, className }: Props): JSX.Element {
  return <div className={`md ${className ?? ''}`.trim()}>{blocks(text)}</div>
}

/** Split the text into block-level chunks and render each one. */
function blocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: ReactNode[] = []

  let index = 0
  let key = 0

  while (index < lines.length) {
    const line = lines[index]

    // --- fenced code ------------------------------------------------------
    const fence = /^\s*```(\w+)?\s*$/.exec(line)
    if (fence) {
      const language = fence[1] ?? ''
      const body: string[] = []
      index++
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        body.push(lines[index])
        index++
      }
      // Skip the closing fence if it is there. An unterminated block still
      // renders — a model that gets cut off mid-answer should not blank the
      // whole message.
      index++
      out.push(<CodeBlock key={key++} language={language} code={body.join('\n')} />)
      continue
    }

    // --- heading ----------------------------------------------------------
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const Tag = (['h3', 'h4', 'h5', 'h6'] as const)[level - 1]
      out.push(<Tag key={key++}>{inline(heading[2])}</Tag>)
      index++
      continue
    }

    // --- horizontal rule --------------------------------------------------
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      out.push(<hr key={key++} className="hairline" />)
      index++
      continue
    }

    // --- quote ------------------------------------------------------------
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        body.push(lines[index].replace(/^\s*>\s?/, ''))
        index++
      }
      out.push(<blockquote key={key++}>{inline(body.join(' '))}</blockquote>)
      continue
    }

    // --- lists ------------------------------------------------------------
    const bullet = /^\s*[-*+]\s+/
    const numbered = /^\s*\d+[.)]\s+/

    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const pattern = ordered ? numbered : bullet
      const items: string[] = []

      while (index < lines.length && pattern.test(lines[index])) {
        items.push(lines[index].replace(pattern, ''))
        index++
        // A wrapped list item: an indented continuation line belongs to the
        // item above it rather than starting a paragraph.
        while (index < lines.length && /^\s{2,}\S/.test(lines[index]) && !pattern.test(lines[index])) {
          items[items.length - 1] += ` ${lines[index].trim()}`
          index++
        }
      }

      const List = ordered ? 'ol' : 'ul'
      out.push(
        <List key={key++}>
          {items.map((item, position) => (
            <li key={position}>{inline(item)}</li>
          ))}
        </List>
      )
      continue
    }

    // --- blank ------------------------------------------------------------
    if (!line.trim()) {
      index++
      continue
    }

    // --- paragraph --------------------------------------------------------
    const body: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*```/.test(lines[index]) &&
      !/^(#{1,4})\s/.test(lines[index]) &&
      !/^\s*>/.test(lines[index]) &&
      !bullet.test(lines[index]) &&
      !numbered.test(lines[index])
    ) {
      body.push(lines[index])
      index++
    }
    out.push(<p key={key++}>{inline(body.join(' '))}</p>)
  }

  return out
}

/**
 * Inline formatting.
 *
 * Code is matched first and its contents are never looked at again, so
 * `**not bold**` inside backticks stays literal — which is the whole reason
 * anyone puts something in backticks.
 */
function inline(text: string): ReactNode {
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+)/g

  const out: ReactNode[] = []
  let last = 0
  let key = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const token = match[0]

    if (token.startsWith('`')) {
      out.push(<code key={key++}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**') || token.startsWith('__')) {
      out.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('[')) {
      const link = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(token)
      out.push(
        <Link key={key++} href={link?.[2] ?? ''}>
          {link?.[1] ?? token}
        </Link>
      )
    } else if (token.startsWith('http')) {
      out.push(
        <Link key={key++} href={token}>
          {token}
        </Link>
      )
    } else {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>)
    }

    last = match.index + token.length
  }

  if (last < text.length) out.push(text.slice(last))
  return <Fragment>{out}</Fragment>
}

/**
 * Links open in the real browser, never in the app window.
 *
 * Navigating the renderer away from the app is how an Electron window turns
 * into an unrecoverable browser with no address bar, and the target here is
 * whatever a language model decided to write.
 */
function Link({ href, children }: { href: string; children: ReactNode }): JSX.Element {
  const safe = /^https?:\/\//i.test(href)
  if (!safe) return <span>{children}</span>

  return (
    <button className="link" onClick={() => void window.vilo.shell.openExternal(href)}>
      {children}
    </button>
  )
}

function CodeBlock({ language, code }: { language: string; code: string }): JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = (): void => {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="md-code">
      <div className="md-code-head">
        <span className="mono">{language || 'text'}</span>
        <button className="btn ghost sm icon" onClick={copy} aria-label="Copy">
          {copied ? <Check /> : <Copy />}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}
