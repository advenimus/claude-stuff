import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

const BAND = {
  plugin: 'prompt-enhancer',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

const NOT_A_REPO = {
  exitCode: 1,
  stdout: '',
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
}

test('Enhance rewrites the draft, Undo puts it back, on every surface', async ($, on) => {
  const fills: string[] = []
  let box = 'fix the bug'

  on('session.model', () => ({ value: 'claude-opus-4' }))
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    box = e.text
    return { isFilled: true }
  })
  on('session.root', () => ({ value: '/project' }))
  on('session.messages', () => ({ value: [] }))
  on('fs.exists', () => ({ value: false }))
  on('fs.ancestors', () => ({ value: [] }))
  on('process.run', () => ({ value: NOT_A_REPO }))
  on('tool.call', () => ({ result: {}, text: '- code-review: review a diff' }))
  on('model.complete', (_, e) => ({
    value: {
      isAnswered: true,
      text: e.system?.includes('JSON only') ? '{"questions":[]}' : 'Fix the login bug in src/auth.ts.',
      usage: USAGE,
    },
  }))

  for (const surface of ['terminal', 'desktop'] as const) {
    box = 'fix the bug'
    fills.length = 0
    const ui = await $.ui.mount({ ...BAND, surface })

    await ui.press({ key: 'enhance' })
    expect(fills).toEqual(['Fix the login bug in src/auth.ts.'])
    expect(await ui.find({ type: 'Button', key: 'undo' })).toBeDefined()

    await ui.press({ key: 'undo' })
    expect(fills.at(-1)).toBe('fix the bug')
    await ui.unmount()
  }
})

test('Enhance on an empty box says so and changes nothing', async ($, on) => {
  const fills: string[] = []

  on('session.model', () => ({ value: 'claude-opus-4' }))
  on('prompt.read', () => ({ value: { text: '   ', cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'enhance' })

  expect(fills).toEqual([])
  expect((await ui.find({ type: 'Text', text: /Type a prompt first/ }))?.text).toContain('Type a prompt first')
  await ui.unmount()
})

test('a failed model call shows the reason and keeps the draft', async ($, on) => {
  const fills: string[] = []

  on('session.model', () => ({ value: 'claude-opus-4' }))
  on('prompt.read', () => ({ value: { text: 'fix it', cursor: 6 } }))
  on('prompt.fill', (_, e) => {
    fills.push(e.text)
    return { isFilled: true }
  })
  on('session.root', () => ({ value: '/project' }))
  on('session.messages', () => ({ value: [] }))
  on('fs.exists', () => ({ value: false }))
  on('fs.ancestors', () => ({ value: [] }))
  on('process.run', () => ({ value: NOT_A_REPO }))
  on('tool.call', () => ({ result: {}, text: '' }))
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error', status: 500, error: 'server_error', usage: USAGE } }))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'enhance' })

  expect(fills).toEqual([])
  expect((await ui.find({ type: 'Text', text: /Could not rewrite: api-error/ }))?.text).toContain('api-error')
  await ui.unmount()
})

const DEFAULT_QUESTIONS =
  '{"questions":[{"question":"Which file?","options":["src/auth.ts","src/login.ts"]}]}'

function seedEngine(
  on: On,
  box: { text: string },
  prompts: string[],
  models: string[] = [],
  questionsJson: string = DEFAULT_QUESTIONS,
) {
  on('prompt.read', () => ({ value: { text: box.text, cursor: box.text.length } }))
  on('prompt.fill', (_, e) => {
    box.text = e.text
    return { isFilled: true }
  })
  on('session.root', () => ({ value: '/project' }))
  on('session.model', () => ({ value: 'claude-opus-4' }))
  on('session.messages', () => ({ value: [] }))
  on('fs.exists', () => ({ value: false }))
  on('fs.ancestors', () => ({ value: [] }))
  on('process.run', () => ({ value: NOT_A_REPO }))
  on('tool.call', () => ({ result: {}, text: '' }))
  on('model.complete', (_, e) => {
    models.push(e.model)
    const isQuestions = e.system?.includes('JSON only') === true
    if (!isQuestions) prompts.push(e.prompt)
    const text = isQuestions
      ? questionsJson
      : 'Fix the bug in src/login.ts.'
    return { value: { isAnswered: true, text, usage: USAGE } }
  })
}

test('questions show up, the answer feeds the rewrite, Reset clears it', async ($, on) => {
  const box = { text: 'fix the bug' }
  const prompts: string[] = []
  seedEngine(on, box, prompts)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'enhance' })

  expect(await ui.find({ type: 'Text', text: /Which file\?/ })).toBeDefined()
  expect(box.text).toBe('fix the bug')

  await ui.press({ key: 'opt-q0-2' })
  await ui.press({ key: 'apply' })

  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('A: src/login.ts')
  expect(box.text).toBe('Fix the bug in src/login.ts.')

  await ui.press({ key: 'reset' })
  expect(await ui.find({ type: 'Button', key: 'undo' })).toBeUndefined()
  await ui.unmount()
})

test('a long answer is drawn whole and a picked question collapses to one line', async ($, on) => {
  const box = { text: 'fix the bug' }
  const longOption = 'Trigger the enhance action in the running mod UI and report everything that appears on screen afterwards'
  const questionsJson = JSON.stringify({
    questions: [
      { question: 'What now?', options: [longOption, 'Run a test'] },
      { question: 'Include logs?', options: ['yes', 'no'] },
    ],
  })
  seedEngine(on, box, [], [], questionsJson)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'enhance' })

  expect((await ui.find({ type: 'Text', text: /report everything that appears on screen afterwards/ }))?.text).toContain(longOption)

  await ui.press({ key: 'opt-q0-1' })
  expect(await ui.find({ type: 'Text', text: /Include logs\?/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\u25b8 What now\?/ })).toBeDefined()
  await ui.unmount()
})

test('Skip questions rewrites without answers', async ($, on) => {
  const box = { text: 'fix the bug' }
  const prompts: string[] = []
  seedEngine(on, box, prompts)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'enhance' })
  await ui.press({ key: 'skip' })

  expect(prompts[0]).not.toContain('Answers from the author')
  expect(box.text).toBe('Fix the bug in src/login.ts.')
  await ui.unmount()
})

test('the title row names the model it uses', async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-4' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Prompt enhancer .* sonnet/ })).toBeDefined()
  await ui.unmount()
})

test('the gear opens settings and Follow session sends the session model', async ($, on) => {
  const box = { text: 'fix the bug' }
  const prompts: string[] = []
  const models: string[] = []
  const saved: unknown[] = []
  seedEngine(on, box, prompts, models)
  on('store.set', (_, e) => {
    saved.push(e.value)
    return { value: undefined }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Select', key: 'set-model' })).toBeUndefined()

  await ui.press({ key: 'gear' })
  await ui.select({ key: 'set-model', value: 'session' })
  expect(saved.at(-1)).toMatchObject({ model: 'session' })
  expect(await ui.find({ type: 'Text', text: /session \(claude-opus-4\)/ })).toBeDefined()

  await ui.press({ key: 'enhance' })
  await ui.press({ key: 'skip' })
  expect(models.every(model => model === 'claude-opus-4')).toBe(true)
  await ui.unmount()
})
