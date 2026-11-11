import { atom, read, update } from 'claude-code'
import type { Register, ThemeKey } from 'claude-code'

const percent = atom({ plugin: 'context-pie', key: 'percent' } as const, 0)

const GLYPHS = ['○', '◔', '◑', '◕', '●'] as const
const WARN_AT = 60
const DANGER_AT = 80

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)))

const glyphFor = (value: number) =>
  GLYPHS[Math.min(GLYPHS.length - 1, Math.floor((value / 100) * (GLYPHS.length - 1) + 0.5))]

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

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const engineLine = await next(e)
    const value = await read($, percent)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box justifyContent="space-between">
        <Box flexGrow={1}>{engineLine}</Box>
        <Box>
          <Text color={colorFor(value)}>{glyphFor(value)} </Text>
          <Text color="subtle">{value}%</Text>
        </Box>
      </Box>
    )
  })
}
