import { expect, test } from 'claude-code/testing'

import { DEFAULT_SETTINGS, parseSettings } from '../hooks/settings'

test('parseSettings falls back to defaults for junk', () => {
  expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  expect(parseSettings('x')).toEqual(DEFAULT_SETTINGS)
  expect(parseSettings({ model: 'gpt', askQuestions: 'yes' })).toEqual(DEFAULT_SETTINGS)
})

test('parseSettings keeps valid saved values', () => {
  expect(parseSettings({ model: 'session', shareProjectFiles: false, askQuestions: false })).toEqual({
    model: 'session',
    shareProjectFiles: false,
    askQuestions: false,
  })
})
