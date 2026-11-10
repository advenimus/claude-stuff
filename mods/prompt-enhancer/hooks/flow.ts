import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { EnhanceStatus, EnhancerSettings } from '../types'
import {
  MAX_DRAFT_CHARS,
  SYSTEM_PROMPT,
  buildPrompt,
  cleanReply,
  type EnhanceContext,
} from './enhance'
import { gather } from './gather'
import { DEFAULT_SETTINGS, parseSettings } from './settings'
import { QUESTIONS_SYSTEM, formatAnswers, parseQuestions } from './questions'

const original = atom({ plugin: 'prompt-enhancer', key: 'original' } as const, null)
const status = atom({ plugin: 'prompt-enhancer', key: 'status' } as const, 'idle')
const note = atom({ plugin: 'prompt-enhancer', key: 'note' } as const, '')
const questions = atom({ plugin: 'prompt-enhancer', key: 'questions' } as const, [])
const answers = atom({ plugin: 'prompt-enhancer', key: 'answers' } as const, {})
const extra = atom({ plugin: 'prompt-enhancer', key: 'extra' } as const, '')
const expanded = atom({ plugin: 'prompt-enhancer', key: 'expanded' } as const, '')
const settings = atom({ plugin: 'prompt-enhancer', key: 'settings' } as const, DEFAULT_SETTINGS)
const isSettingsOpen = atom({ plugin: 'prompt-enhancer', key: 'isSettingsOpen' } as const, false)

type Pending = {
  readonly draft: string
  readonly rawDraft: string
  readonly context: EnhanceContext
  readonly skipped: readonly string[]
  readonly model: string
}

// A hot reload drops this; applying then asks the person to press Enhance again.
const pending: { current: Pending | null } = { current: null }

async function setStatus($: EngineInterface, next: EnhanceStatus, text: string) {
  await update($, status, () => next)
  await update($, note, () => text)
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function guarded($: EngineInterface, label: string, run: () => Promise<void>) {
  try {
    await run()
  } catch (error) {
    pending.current = null
    await setStatus($, 'error', `${label} failed: ${describeError(error)}`)
  }
}

export async function resolveModel($: EngineInterface, setting: string): Promise<string> {
  return setting === 'session' ? await $.session.model() : setting
}

async function isCancelled($: EngineInterface): Promise<boolean> {
  return (await read($, status)) === 'idle'
}

async function rewrite($: EngineInterface, p: Pending, answersText: string, prefix: string) {
  await setStatus($, 'working', 'Rewriting...')
  const reply = await $.model.complete({
    model: p.model,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(p.draft, p.context, answersText),
    maxTokens: 2000,
    effort: 'low',
    timeoutMs: 60000,
  })
  if (await isCancelled($)) return
  if (!reply.isAnswered) {
    return setStatus($, 'error', `Could not rewrite: ${reply.reason}`)
  }

  const filled = await $.prompt.fill({ text: cleanReply(reply.text), mode: 'replace' })
  if (!filled.isFilled) {
    return setStatus($, 'error', `Could not write to the prompt box (${filled.refusal ?? 'unknown'}).`)
  }

  await update($, original, () => p.rawDraft)
  await update($, questions, () => [])
  pending.current = null
  const skipped = p.skipped.length > 0 ? ` Skipped: ${p.skipped.join('; ')}` : ''
  return setStatus($, 'done', `${prefix}Rewritten with ${p.model}. Read it, then press Enter or Send.${skipped}`)
}

type Asked = { readonly isWaiting: boolean; readonly prefix: string }

async function askQuestions($: EngineInterface, p: Pending): Promise<Asked> {
  await setStatus($, 'asking', `Checking for gaps with ${p.model}...`)
  const reply = await $.model.complete({
    model: p.model,
    system: QUESTIONS_SYSTEM,
    prompt: buildPrompt(p.draft, p.context),
    maxTokens: 800,
    effort: 'low',
    timeoutMs: 45000,
  })
  if (await isCancelled($)) return { isWaiting: true, prefix: '' }
  if (!reply.isAnswered) return { isWaiting: false, prefix: `Questions skipped (${reply.reason}). ` }

  const parsed = parseQuestions(reply.text)
  if (parsed.isBadReply) return { isWaiting: false, prefix: 'Questions skipped (unreadable reply). ' }
  if (parsed.questions.length === 0) return { isWaiting: false, prefix: '' }

  pending.current = p
  await update($, questions, () => [...parsed.questions])
  await update($, answers, () => ({}))
  await update($, extra, () => '')
  await update($, expanded, () => parsed.questions[0]?.id ?? '')
  await setStatus($, 'questions', 'Answer what you want, then press Apply.')
  return { isWaiting: true, prefix: '' }
}

async function runStart($: EngineInterface, options: EnhancerSettings) {
  const box = await $.prompt.read()
  const draft = box.text.trim()
  if (draft === '') return setStatus($, 'error', 'Type a prompt first.')
  if (draft.length > MAX_DRAFT_CHARS) {
    return setStatus($, 'error', `Draft is over ${MAX_DRAFT_CHARS} characters.`)
  }

  const model = await resolveModel($, options.model)
  await setStatus($, 'working', 'Reading your project...')
  const { context, skipped } = await gather($, draft, options.shareProjectFiles)
  if (await isCancelled($)) return
  const p: Pending = { draft, rawDraft: box.text, context, skipped, model }

  const asked = options.askQuestions ? await askQuestions($, p) : { isWaiting: false, prefix: '' }
  if (asked.isWaiting) return
  return rewrite($, p, '', asked.prefix)
}

export async function startEnhance($: EngineInterface) {
  const current = await read($, status)
  if (current === 'working' || current === 'asking' || current === 'questions') return
  const options = await read($, settings)
  await guarded($, 'Enhance', () => runStart($, options))
}

export async function applyAnswers($: EngineInterface) {
  await guarded($, 'Apply', async () => {
    const p = pending.current
    if (p === null) return setStatus($, 'error', 'The mod reloaded. Press Enhance again.')
    const text = formatAnswers(await read($, questions), await read($, answers), await read($, extra))
    return rewrite($, p, text, '')
  })
}

export async function skipQuestions($: EngineInterface) {
  await guarded($, 'Skip', async () => {
    const p = pending.current
    if (p === null) return setStatus($, 'error', 'The mod reloaded. Press Enhance again.')
    return rewrite($, p, '', '')
  })
}

export async function undo($: EngineInterface) {
  const saved = await read($, original)
  if (saved === null) return
  await $.prompt.fill({ text: saved, mode: 'replace' })
  await update($, original, () => null)
  await setStatus($, 'idle', 'Restored your draft.')
}

export async function reset($: EngineInterface) {
  pending.current = null
  await update($, original, () => null)
  await update($, questions, () => [])
  await update($, answers, () => ({}))
  await update($, extra, () => '')
  await update($, expanded, () => '')
  await setStatus($, 'idle', '')
}

export async function send($: EngineInterface) {
  const text = (await $.prompt.read()).text.trim()
  if (text === '') return setStatus($, 'error', 'Nothing to send.')

  await $.prompt.fill({ text: '', mode: 'replace' })
  await reset($)
  void $.prompt.submit({ text })
}

export async function hydrateSettings($: EngineInterface) {
  const saved = parseSettings(await $.store.get('settings'))
  await update($, settings, () => saved)
}

export async function saveSettings($: EngineInterface, patch: Partial<EnhancerSettings>) {
  const next = { ...(await read($, settings)), ...patch }
  await update($, settings, () => next)
  await $.store.set('settings', next)
}

export async function toggleSettings($: EngineInterface) {
  await update($, isSettingsOpen, open => !open)
}
