import { expect, test } from 'claude-code/testing'

const HINT = {
  plugin: 'context-pie',
  component: 'PromptHint',
  requestId: 'hint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

const withPercent = (percent: number) => () => ({
  value: { value: percent, version: 1 },
})

test('shows the stored percent beside the engine line', async ($, on) => {
  on('state.get', withPercent(42))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...HINT, surface })

    expect((await ui.find({ type: 'Text', text: /42%/ }))?.text).toBe('42%')
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('a full window draws the full pie', async ($, on) => {
  on('state.get', withPercent(100))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /●/ })).toBeTruthy()
  await ui.unmount()
})
