import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeKey } from 'claude-code'
import type { LoopStats } from '../types'

const percent = atom({ plugin: 'chat-status', key: 'percent' } as const, 0)
const picker = atom({ plugin: 'chat-status', key: 'picker' } as const, '')
const cost = atom({ plugin: 'chat-status', key: 'cost' } as const, 0)
const showCost = atom({ plugin: 'chat-status', key: 'showCost' } as const, false)
const loops = atom({ plugin: 'chat-status', key: 'loops' } as const, {} as Record<string, LoopStats>)

const MAIN = 'main'
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const GLYPHS = ['○', '◔', '◑', '◕', '●'] as const
const WARN_AT = 60
const DANGER_AT = 80
const EMPTY: LoopStats = { model: '', effort: '', tokens: 0 }

// PromptHint carries no view, so the AbovePrompt hook records it here.
let viewedAgent: string | undefined

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)))

const glyphFor = (value: number) =>
  GLYPHS[Math.min(GLYPHS.length - 1, Math.floor((value / 100) * (GLYPHS.length - 1) + 0.5))]

const formatTokens = (value: number): string =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(1)}k`
      : String(value)

const formatCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

const sumTokens = (all: Record<string, LoopStats>): number =>
  Object.values(all).reduce((total, stats) => total + stats.tokens, 0)

async function refreshCost($: EngineInterface): Promise<void> {
  const usage = await $.session.usage()
  if (usage.cost !== undefined) await update($, cost, () => usage.cost?.usd ?? 0)
}

const folderOf = (path: string): string => path.split('/').filter(Boolean).at(-1) ?? '/'

const prettyModel = (id: string): string => {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/.exec(id)
  if (match === null) return id
  const [, family, major, minor] = match
  const name = `${family.charAt(0).toUpperCase()}${family.slice(1)}`
  return minor === undefined ? `${name} ${major}` : `${name} ${major}.${minor}`
}

const effortColor = (level: string): ThemeKey =>
  level === 'low' ? 'subtle' : level === 'medium' ? 'text' : level === 'high' ? 'suggestion' : 'claude'

const colorFor = (value: number): ThemeKey =>
  value >= DANGER_AT ? 'error' : value >= WARN_AT ? 'warning' : 'success'

const patchLoop = (key: string, patch: (stats: LoopStats) => LoopStats) => (all: Record<string, LoopStats>) => ({
  ...all,
  [key]: patch(all[key] ?? EMPTY),
})

async function runCommand($: EngineInterface, command: string, args = ''): Promise<boolean> {
  try {
    await $.command.run({ command, args })
    return true
  } catch (error) {
    $.ui.toast(`/${command} did not run: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

async function agentLabel($: EngineInterface, agentId: string): Promise<string> {
  try {
    const agent = (await $.agent.list()).find(item => item.id === agentId)
    return agent === undefined ? 'agent' : agent.name ?? agent.type
  } catch {
    return 'agent'
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const { context } = await $.session.usage()
    await update($, percent, () => clamp(context.percent ?? 0))
    await refreshCost($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, percent, () => clamp(e.context.percent ?? 0))
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const key = e.agentId ?? MAIN
    await update(
      $,
      loops,
      patchLoop(key, stats => ({
        ...stats,
        model: e.model,
        effort: e.effort === undefined ? stats.effort : String(e.effort),
      })),
    )

    const stream = next(e)

    for await (const chunk of stream) {
      if (chunk.kind === 'stop' && chunk.usage) {
        const { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens } =
          chunk.usage
        const added =
          input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens
        await update($, loops, patchLoop(key, stats => ({ ...stats, tokens: stats.tokens + added })))
        await refreshCost($)
      }
      yield chunk
    }

    return await stream.result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const agentId = e.props.view.agentId
    if (agentId !== viewedAgent) {
      viewedAgent = agentId
      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const engineLine = await next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const agentId = viewedAgent
    const allLoops = await read($, loops)
    const stats = allLoops[agentId ?? MAIN] ?? EMPTY
    const shownTokens = agentId === undefined ? sumTokens(allLoops) : stats.tokens
    const isCost = await read($, showCost)
    const spent = await read($, cost)
    const value = await read($, percent)
    const open = agentId === undefined ? await read($, picker) : ''
    const model = agentId === undefined ? await $.session.model() : stats.model
    const folder = folderOf(await $.session.cwd())
    const label = agentId === undefined ? undefined : await agentLabel($, agentId)
    const enhancer = (await $.command.list()).find(
      command => command.name === 'enhancer' || command.name.endsWith(':enhancer'),
    )
    const togglePicker = () => update($, picker, current => (current === 'effort' ? '' : 'effort'))
    const effortText = <Text color={effortColor(stats.effort)}>{stats.effort}</Text>
    const segments = [
      ...(label === undefined ? [] : [<Text key="agent" color="suggestion">{`↳ ${label}`}</Text>]),
      <Text key="model" color="claude" bold>{`✦ ${model === '' ? '…' : prettyModel(model)}`}</Text>,
      ...(stats.effort === ''
        ? []
        : [
            agentId === undefined ? (
              <Button key="effort" plain onPress={togglePicker}>
                {effortText}
              </Button>
            ) : (
              <Box key="effort">{effortText}</Box>
            ),
          ]),
      <Button key="tokens" plain onPress={() => update($, showCost, current => !current)}>
        <Text color="text">
          {isCost ? `${formatCost(spent)} session` : `${formatTokens(shownTokens)} tokens`}
        </Text>
      </Button>,
      <Text key="folder" color="subtle" wrap="truncate-end">{`▸ ${folder}`}</Text>,
    ]
    const parts = segments.flatMap((segment, index) =>
      index === 0 ? [segment] : [<Text key={`dot-${index}`} color="inactive">{'·'}</Text>, segment],
    )
    const options =
      open === 'effort'
        ? EFFORTS.map(item => (
            <Button
              key={`effort-${item}`}
              plain
              onPress={async () => {
                await update($, picker, () => '')
                if (await runCommand($, 'effort', item)) {
                  await update($, loops, patchLoop(MAIN, current => ({ ...current, effort: item })))
                }
              }}
            >
              <Text color={item === stats.effort ? 'success' : 'text'}>
                {`${item === stats.effort ? '●' : '○'} ${item}`}
              </Text>
            </Button>
          ))
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
                <Text color="subtle">{'✦'}</Text>
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
