import type { Register } from 'claude-code'

import { hydrateSettings, reset } from './flow'
import { renderBandIfOpen, toggleBar } from './view'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await hydrateSettings($)
    await $.command.register({
      name: 'enhancer',
      description: 'Show or hide the prompt enhancer bar',
    })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' || e.origin.kind === 'bridge') await reset($)
    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const engineLine = await next(e)
    const band = await renderBandIfOpen($, e)
    const { Box } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" marginTop={1}>
        {band}
        {engineLine}
      </Box>
    )
  })

  on('command.run', { command: 'enhancer' }, async $ => {
    await toggleBar($)
    return {}
  })
}
