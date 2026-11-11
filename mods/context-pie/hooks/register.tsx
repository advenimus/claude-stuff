import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeKey } from 'claude-code'

const percent = atom({ plugin: 'context-pie', key: 'percent' } as const, 0)
const effort = atom({ plugin: 'context-pie', key: 'effort' } as const, '')
const tokens = atom({ plugin: 'context-pie', key: 'tokens' } as const, 0)
const picker = atom({ plugin: 'context-pie', key: 'picker' } as const, '')

const MODELS = [
  { alias: 'opus', label: 'Opus' },
  { alias: 'sonnet', label: 'Sonnet' },
  { alias: 'haiku', label: 'Haiku' },
] as const
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

const GLYPHS = ['○', '◔', '◑', '◕', '●'] as const
const WARN_AT = 60
const DANGER_AT = 80

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)))

const glyphFor = (value: number) =>
  GLYPHS[Math.min(GLYPHS.length - 1, Math.floor((value / 100) * (GLYPHS.length - 1) + 0.5))]

const formatTokens = (value: number): string =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(1)}k`
      : String(value)

const folderOf = (path: string): string => path.split('/').filter(Boolean).at(-1) ?? '/'

const prettyModel = (id: string): string => {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id)
  if (match === null) return id
  const [, family, major, minor] = match
  const name = `${family.charAt(0).toUpperCase()}${family.slice(1)}`
  return minor === undefined ? `${name} ${major}` : `${name} ${major}.${minor}`
}

const effortColor = (level: string): ThemeKey =>
  level === 'low' ? 'subtle' : level === 'medium' ? 'text' : level === 'high' ? 'suggestion' : 'claude'

async function runCommand($: EngineInterface, command: string, args = ''): Promise<boolean> {
  try {
    await $.command.run({ command, args })
    return true
  } catch (error) {
    $.ui.toast(`/${command} did not run: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

const colorFor = (value: number): ThemeKey =>
  value >= DANGER_AT ? 'error' : value >= WARN_AT ? 'warning' : 'success'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const { context } = await $.session.usage()
    await update($, percent, () => clamp(context.percent ?? 0))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, percent, () => clamp(e.context.percent ?? 0))
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.effort !== undefined) {
      await update($, effort, () => String(e.effort))
    }

    const stream = next(e)

    for await (const chunk of stream) {
      if (chunk.kind === 'stop' && chunk.usage) {
        const { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens } =
          chunk.usage
        const added =
          input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens
        await update($, tokens, total => total + added)
      }
      yield chunk
    }

    return await stream.result
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const engineLine = await next(e)
    const value = await read($, percent)
    const level = await read($, effort)
    const used = await read($, tokens)
    const model = await $.session.model()
    const folder = folderOf(await $.session.cwd())
    const { Box, Text } = $.ui.resolve(e)
    const open = await read($, picker)
    const enhancer = (await $.command.list()).find(
      command => command.name === 'enhancer' || command.name.endsWith(':enhancer'),
    )
    const { Button } = $.ui.resolve(e)
    const toggle = (name: string) => update($, picker, current => (current === name ? '' : name))
    const segments = [
      <Button key="model" plain onPress={() => toggle('model')}>
        <Text color="claude" bold>{`\u2726 ${prettyModel(model)}`}</Text>
      </Button>,
      ...(level === ''
        ? []
        : [
            <Button key="effort" plain onPress={() => toggle('effort')}>
              <Text color={effortColor(level)}>{level}</Text>
            </Button>,
          ]),
      <Button key="tokens" plain onPress={() => runCommand($, 'usage')}>
        <Text color="text">{`${formatTokens(used)} tokens`}</Text>
      </Button>,
      <Text key="folder" color="subtle" wrap="truncate-end">{`\u25b8 ${folder}`}</Text>,
    ]
    const parts = segments.flatMap((segment, index) =>
      index === 0
        ? [segment]
        : [<Text key={`dot-${index}`} color="inactive">{'\u00b7'}</Text>, segment],
    )
    const choose = (name: string, label: string, isCurrent: boolean, onChoose: () => Promise<unknown>) => (
      <Button
        key={`${name}-${label}`}
        plain
        onPress={async () => {
          await update($, picker, () => '')
          await onChoose()
        }}
      >
        <Text color={isCurrent ? 'success' : 'text'}>{`${isCurrent ? '\u25cf' : '\u25cb'} ${label}`}</Text>
      </Button>
    )
    const options =
      open === 'model'
        ? MODELS.map(item =>
            choose('model', item.label, model.includes(item.alias), () =>
              runCommand($, 'model', item.alias),
            ),
          )
        : open === 'effort'
          ? EFFORTS.map(item =>
              choose('effort', item, item === level, async () => {
                if (await runCommand($, 'effort', item)) await update($, effort, () => item)
              }),
            )
          : []

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Box flexGrow={1} gap={1}>
            {parts}
            {engineLine}
          </Box>
          <Box gap={1}>
            {enhancer === undefined ? null : (
              <Button key="enhancer" plain onPress={() => runCommand($, enhancer.name)}>
                <Text color="subtle">{'\u2726'}</Text>
              </Button>
            )}
            <Text color={colorFor(value)}>{glyphFor(value)} </Text>
            <Text color="subtle">{value}%</Text>
          </Box>
        </Box>
        {options.length === 0 ? null : <Box gap={2}>{options}</Box>}
      </Box>
    )
  })
}
