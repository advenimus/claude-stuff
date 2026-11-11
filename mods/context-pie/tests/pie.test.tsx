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

const answerSession = (on: Parameters<Parameters<typeof test>[1]>[1]) => {
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.cwd', () => ({ value: '/home/user/work/claude-stuff' }))
  on('command.list', () => ({ value: [] }))
}

test('shows the stored percent beside the engine line', async ($, on) => {
  on('state.get', withPercent(42))
  answerSession(on)
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
  answerSession(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /●/ })).toBeTruthy()
  await ui.unmount()
})

test('shows model, folder and token total beside the pie', async ($, on) => {
  on('state.get', withPercent(11))
  answerSession(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Sonnet 5\.5/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /tokens/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /claude-stuff/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /11%/ })).toBeTruthy()
  await ui.unmount()
})

test('clicking tokens runs /usage; the model picker runs /model', async ($, on) => {
  const ran: string[] = []
  answerSession(on)
  on('ui.toast', () => ({ value: {} }))
  on('command.run', ($, e) => {
    ran.push(`${e.command} ${e.args}`.trim())

    return { value: { text: '' } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  await ui.press({ key: 'tokens' })
  await ui.press({ key: 'model' })
  expect(await ui.find({ type: 'Text', text: /Opus/ })).toBeTruthy()
  await ui.press({ key: 'model-Opus' })
  expect(ran).toEqual(['usage', 'model opus'])
  await ui.unmount()
})

test('the enhancer icon shows only when the command exists, and runs it', async ($, on) => {
  const ran: string[] = []

  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.cwd', () => ({ value: '/home/user/work/claude-stuff' }))
  on('command.list', () => ({
    value: [{ name: 'enhancer', description: 'x', source: 'plugin', plugin: 'prompt-enhancer' }],
  }))
  on('command.run', ($, e) => {
    ran.push(e.command)

    return { value: {} }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  await ui.press({ key: 'enhancer' })
  expect(ran).toEqual(['enhancer'])
  await ui.unmount()
})
