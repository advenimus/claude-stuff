import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Question } from '../types'
import { SKIP_VALUE } from './questions'
import { DEFAULT_SETTINGS, MODEL_CHOICES } from './settings'
import {
  applyAnswers,
  reset,
  saveSettings,
  send,
  skipQuestions,
  startEnhance,
  toggleSettings,
  undo,
} from './flow'

const original = atom({ plugin: 'prompt-enhancer', key: 'original' } as const, null)
const status = atom({ plugin: 'prompt-enhancer', key: 'status' } as const, 'idle')
const note = atom({ plugin: 'prompt-enhancer', key: 'note' } as const, '')
const questions = atom({ plugin: 'prompt-enhancer', key: 'questions' } as const, [])
const answers = atom({ plugin: 'prompt-enhancer', key: 'answers' } as const, {})
const extra = atom({ plugin: 'prompt-enhancer', key: 'extra' } as const, '')
const expanded = atom({ plugin: 'prompt-enhancer', key: 'expanded' } as const, '')
const settings = atom({ plugin: 'prompt-enhancer', key: 'settings' } as const, DEFAULT_SETTINGS)
const isSettingsOpen = atom({ plugin: 'prompt-enhancer', key: 'isSettingsOpen' } as const, false)
const isBarOpen = atom({ plugin: 'prompt-enhancer', key: 'isBarOpen' } as const, false)

type RenderEvent = Parameters<EngineInterface['ui']['resolve']>[0]

export async function toggleBar($: EngineInterface) {
  await update($, isBarOpen, open => !open)
}

export async function renderBandIfOpen($: EngineInterface, e: RenderEvent) {
  return (await read($, isBarOpen)) ? renderBand($, e) : null
}

export async function renderBand($: EngineInterface, e: RenderEvent) {
  const { Box, Button, Input, Select, Text } = $.ui.resolve(e)
  const current = await read($, status)
  const saved = await read($, original)
  const message = await read($, note)
  const asked = await read($, questions)
  const picked = await read($, answers)
  const typed = await read($, extra)
  const openId = (await read($, expanded)) || asked[0]?.id
  const config = await read($, settings)
  const isOpen = await read($, isSettingsOpen)
  const sessionModel = await $.session.model()
  const modelLabel = config.model === 'session' ? `session (${sessionModel})` : config.model

  const isBusy = current === 'working' || current === 'asking'
  const isAsking = current === 'questions'

  const choices = (item: Question): readonly string[] => [SKIP_VALUE, ...item.options]
  const labelOf = (value: string): string => (value === SKIP_VALUE ? 'Your call' : value)

  const optionRow = (item: Question, index: number, value: string) => {
    const isPicked = (picked[item.id] ?? SKIP_VALUE) === value
    const nextId = asked[asked.findIndex(entry => entry.id === item.id) + 1]?.id ?? item.id
    return (
      <Button
        key={`opt-${item.id}-${index}`}
        plain
        onPress={async () => {
          await update($, answers, previous => ({ ...previous, [item.id]: value }))
          await update($, expanded, () => nextId)
        }}
      >
        <Text color={isPicked ? 'success' : 'text'}>{`${isPicked ? '\u25cf' : '\u25cb'} ${labelOf(value)}`}</Text>
      </Button>
    )
  }

  const questionRow = (item: Question) =>
    item.id === openId ? (
      <Box key={`row-${item.id}`} flexDirection="column">
        <Text bold color="text">{item.question}</Text>
        {choices(item).map((value, index) => optionRow(item, index, value))}
      </Box>
    ) : (
      <Button key={`row-${item.id}`} plain onPress={() => update($, expanded, () => item.id)}>
        <Text color="subtle">{`\u25b8 ${item.question}  \u2192  ${labelOf(picked[item.id] ?? SKIP_VALUE)}`}</Text>
      </Button>
    )

  const questionRows = isAsking
    ? [
        ...asked.map(questionRow),
        <Input
          key="extra"
          label="Anything else"
          placeholder="optional"
          value={typed}
          submitLabel="apply"
          onInput={value => update($, extra, () => value)}
          onSubmit={() => applyAnswers($)}
        />,
      ]
    : []

  const buttons = [
    ...(isAsking
      ? [
          <Button key="apply" label="Apply" onPress={() => applyAnswers($)} />,
          <Button key="skip" label="Skip questions" onPress={() => skipQuestions($)} />,
        ]
      : [
          <Button
            key="enhance"
            label={isBusy ? '\u2026' : '\u2726'}
            onPress={() => startEnhance($)}
          />,
        ]),
    ...(saved === null ? [] : [<Button key="undo" label={'\u21b6'} onPress={() => undo($)} />]),
    <Button key="send" label={'\u27a4'} onPress={() => send($)} />,
    <Button key="reset" label={'\u21ba'} onPress={() => reset($)} />,
  ]

  const onOff = (value: boolean) => (value ? 'on' : 'off')
  const yesNo = [
    { value: 'on', label: 'On' },
    { value: 'off', label: 'Off' },
  ]

  const settingsRows = isOpen
    ? [
        <Select
          key="set-model"
          label="Model:"
          options={[
            { value: 'session', label: `Follow session (${sessionModel})` },
            { value: 'haiku', label: 'Haiku' },
            { value: 'sonnet', label: 'Sonnet' },
            { value: 'opus', label: 'Opus' },
          ]}
          value={config.model}
          onSelect={value => {
            const model = MODEL_CHOICES.find(choice => choice === value)
            if (model !== undefined) void saveSettings($, { model })
          }}
        />,
        <Select
          key="set-ask"
          label="Ask questions:"
          options={yesNo}
          value={onOff(config.askQuestions)}
          onSelect={value => saveSettings($, { askQuestions: value === 'on' })}
        />,
        <Select
          key="set-share"
          label="Send project files:"
          options={yesNo}
          value={onOff(config.shareProjectFiles)}
          onSelect={value => saveSettings($, { shareProjectFiles: value === 'on' })}
        />,
      ]
    : []

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="promptBorder"
      paddingX={1}
    >
      {[
        <Box key="top" gap={1}>
          <Text color="subtle">{`Prompt enhancer \u00b7 ${modelLabel}`}</Text>
          {buttons}
          <Box flexGrow={1}>
            <Text color={current === 'error' ? 'error' : 'subtle'} wrap="truncate-end">
              {message}
            </Text>
          </Box>
          <Button key="gear" label={'\u2699'} plain onPress={() => toggleSettings($)} />
        </Box>,
        ...settingsRows,
        ...questionRows,
      ]}
    </Box>
  )
}
