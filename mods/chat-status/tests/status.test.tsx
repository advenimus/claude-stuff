import { expect, test } from 'claude-code/testing'

const HINT = {
  plugin: 'chat-status',
  component: 'PromptHint',
  requestId: 'hint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

const STATE: Record<string, unknown> = {
  percent: 42,
  picker: '',
  loops: {
    main: { model: 'claude-opus-5-5', effort: 'high', tokens: 12_300 },
    'agent-1': { model: 'claude-haiku-5-5', effort: '', tokens: 900 },
  },
}

type On = Parameters<Parameters<typeof test>[1]>[1]

const answerSession = (on: On, ran: string[] = [], commands: unknown[] = []) => {
  on('state.get', ($, e) => ({ value: { value: STATE[e.key], version: 1 } }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.cwd', () => ({ value: '/home/user/work/claude-stuff' }))
  on('command.list', () => ({ value: commands }))
  on('agent.list', () => ({
    value: [{ id: 'agent-1', description: 'scan', type: 'Explore', status: 'running' }],
  }))
  on('ui.toast', () => ({ value: {} }))
  on('command.run', ($, e) => {
    ran.push(`${e.command} ${e.args}`.trim())
    return { value: { text: '' } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const viewAgent = (agentId?: string) => ({
  plugin: 'chat-status',
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'terminal',
  props: { view: agentId === undefined ? {} : { agentId } },
})

test('main view shows the session model, main tokens, folder and pie', async ($, on) => {
  answerSession(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...HINT, surface })

    expect(await ui.find({ type: 'Text', text: /Sonnet 5\.5/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /12\.3k tokens/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /claude-stuff/ })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /42%/ }))?.text).toBe('42%')
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('model and tokens are not buttons: pressing them runs nothing', async ($, on) => {
  const ran: string[] = []
  answerSession(on, ran)

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  await ui.press({ key: 'model' }).catch(() => undefined)
  await ui.press({ key: 'tokens' }).catch(() => undefined)
  expect(ran).toEqual([])
  expect(await ui.find({ type: 'Text', text: /Opus$/ })).toBeFalsy()
  await ui.unmount()
})

test('viewing a subagent shows that agent, its model and its tokens', async ($, on) => {
  answerSession(on)

  const band = await $.ui.mount(viewAgent('agent-1'))
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Haiku 5\.5/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /900 tokens/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Sonnet/ })).toBeFalsy()
  await ui.unmount()
  await band.unmount()

  const back = await $.ui.mount(viewAgent())
  const main = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await main.find({ type: 'Text', text: /Sonnet 5\.5/ })).toBeTruthy()
  await main.unmount()
  await back.unmount()
})

test('the enhancer icon shows only when the command exists, and runs it', async ($, on) => {
  const ran: string[] = []
  answerSession(on, ran, [
    { name: 'enhancer', description: 'x', source: 'plugin', plugin: 'prompt-enhancer' },
  ])

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  await ui.press({ key: 'enhancer' })
  expect(ran).toEqual(['enhancer'])
  await ui.unmount()
})
