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
  cost: 1.234,
  showCost: false,
  loops: {
    main: { model: 'claude-opus-5-5', effort: 'high', tokens: 12_300 },
    'agent-1': { model: 'claude-haiku-5-5', effort: '', tokens: 900 },
  },
}

const AGENT = { status: 'completed' }

const VERSIONS: Record<string, number> = {}

type On = Parameters<Parameters<typeof test>[1]>[1]

const answerSession = (on: On, ran: string[] = [], commands: unknown[] = []) => {
  on('state.get', ($, e) => ({ value: { value: STATE[e.key], version: VERSIONS[e.key] ?? 1 } }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.cwd', () => ({ value: '/home/user/work/claude-stuff' }))
  on('command.list', () => ({ value: commands }))
  on('agent.list', () => ({
    value: [{ id: 'agent-1', description: 'scan', type: 'Explore', status: AGENT.status }],
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
    expect(await ui.find({ type: 'Text', text: /13\.2k tokens/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /claude-stuff/ })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /42%/ }))?.text).toBe('42%')
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('pressing tokens switches to the session cost and back', async ($, on) => {
  const ran: string[] = []
  answerSession(on, ran)
  const writes: unknown[] = []
  on('state.set', ($, e) => {
    if (e.key === 'showCost') {
      writes.push(e.value)
      STATE.showCost = e.value
    }
    VERSIONS[e.key] = (VERSIONS[e.key] ?? 1) + 1
    return { value: { isSet: true, version: VERSIONS[e.key] } }
  })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  await ui.press({ key: 'tokens' })
  expect(writes).toEqual([true])
  expect(ran).toEqual([])
  await ui.unmount()

  const shown = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await shown.find({ type: 'Text', text: /\$1\.23 session/ })).toBeTruthy()
  await shown.unmount()
  STATE.showCost = false
})

test('the model picker runs /model when idle', async ($, on) => {
  const ran: string[] = []
  answerSession(on, ran)
  on('state.set', ($, e) => {
    STATE[e.key] = e.value
    VERSIONS[e.key] = (VERSIONS[e.key] ?? 1) + 1
    return { value: { isSet: true, version: VERSIONS[e.key] } }
  })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  await ui.press({ key: 'model' })
  await ui.unmount()
  const open = await $.ui.mount({ ...HINT, surface: 'terminal' })
  await open.press({ key: 'model-Opus' })
  expect(ran).toEqual(['model opus'])
  await open.unmount()
  STATE.picker = ''
})

test('model and effort are locked while a turn runs', async ($, on) => {
  const ran: string[] = []
  answerSession(on, ran)
  const writes: string[] = []
  on('state.set', ($, e) => {
    writes.push(e.key)
    return { value: { isSet: true, version: 2 } }
  })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal', props: { ...HINT.props, isWorking: true } })
  await ui.press({ key: 'model' }).catch(() => undefined)
  await ui.press({ key: 'effort' }).catch(() => undefined)
  expect(writes).toEqual([])
  expect(ran).toEqual([])
  await ui.unmount()
})

test('model and effort are locked while a subagent runs', async ($, on) => {
  AGENT.status = 'running'
  const ran: string[] = []
  answerSession(on, ran)
  const writes: string[] = []
  on('state.set', ($, e) => {
    writes.push(e.key)
    return { value: { isSet: true, version: 2 } }
  })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  await ui.press({ key: 'model' }).catch(() => undefined)
  expect(writes).toEqual([])
  await ui.unmount()
  AGENT.status = 'completed'
})

test('model and effort are locked in a subagent view', async ($, on) => {
  answerSession(on)
  const writes: string[] = []
  on('state.set', ($, e) => {
    writes.push(e.key)
    return { value: { isSet: true, version: 2 } }
  })

  const band = await $.ui.mount(viewAgent('agent-1'))
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  await ui.press({ key: 'model' }).catch(() => undefined)
  expect(writes).toEqual([])
  await ui.unmount()
  await band.unmount()
  const back = await $.ui.mount(viewAgent())
  await back.unmount()
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
  expect((await ui.find({ type: 'Text', text: /✦$/ }))?.text).toBe('✦')
  await ui.press({ key: 'enhancer' })
  expect(ran).toEqual(['enhancer'])
  await ui.unmount()

  const drafted = await $.ui.mount({ ...HINT, surface: 'terminal', props: { ...HINT.props, isDraft: true } })
  expect(await drafted.find({ type: 'Text', text: /enhance prompt/ })).toBeTruthy()
  await drafted.unmount()

  const busy = await $.ui.mount({ ...HINT, surface: 'terminal', props: { ...HINT.props, isWorking: true } })
  await busy.press({ key: 'enhancer' }).catch(() => undefined)
  expect(ran).toEqual(['enhancer'])
  await busy.unmount()
})
