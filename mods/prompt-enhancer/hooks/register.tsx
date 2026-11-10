import type { Register } from 'claude-code'

import { hydrateSettings, reset } from './flow'
import { renderBand } from './view'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await hydrateSettings($)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' || e.origin.kind === 'bridge') await reset($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return renderBand($, e)
  })
}
