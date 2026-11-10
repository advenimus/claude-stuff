import { expect, test } from 'claude-code/testing'

import { SKIP_VALUE, formatAnswers, parseQuestions } from '../hooks/questions'

const QUESTIONS = [
  { id: 'q0', question: 'Which file?', options: ['a.ts', 'b.ts'] },
  { id: 'q1', question: 'Add tests?', options: ['yes', 'no'] },
]

test('parseQuestions reads JSON even with prose around it', () => {
  const parsed = parseQuestions('Sure:\n{"questions":[{"question":"Which?","options":["a","b"]}]}\nDone')
  expect(parsed.isBadReply).toBe(false)
  expect(parsed.questions).toEqual([{ id: 'q0', question: 'Which?', options: ['a', 'b'] }])
})

test('parseQuestions caps at three and drops malformed items', () => {
  const item = (n: number) => ({ question: `Q${n}`, options: ['x', 'y'] })
  const text = JSON.stringify({ questions: [item(1), { question: '', options: ['x', 'y'] }, { question: 'one option', options: ['x'] }, item(2), item(3), item(4)] })
  expect(parseQuestions(text).questions.map(question => question.question)).toEqual(['Q1', 'Q2', 'Q3'])
})

test('parseQuestions flags a reply that is not JSON', () => {
  expect(parseQuestions('no json here').isBadReply).toBe(true)
  expect(parseQuestions('{"questions": "nope"}').isBadReply).toBe(true)
})

test('parseQuestions accepts an empty list as clear', () => {
  const parsed = parseQuestions('{"questions":[]}')
  expect(parsed.isBadReply).toBe(false)
  expect(parsed.questions).toEqual([])
})

test('formatAnswers keeps real answers, drops skipped ones, adds notes', () => {
  const text = formatAnswers(QUESTIONS, { q0: 'a.ts', q1: SKIP_VALUE }, ' keep it small ')
  expect(text).toContain('Q: Which file?\nA: a.ts')
  expect(text).not.toContain('Add tests?')
  expect(text).toContain('Extra notes from the author: keep it small')
})

test('formatAnswers gives empty text when nothing was answered', () => {
  expect(formatAnswers(QUESTIONS, {}, '  ')).toBe('')
})
