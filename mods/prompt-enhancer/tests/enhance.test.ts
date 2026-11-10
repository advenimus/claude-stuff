import { expect, test } from 'claude-code/testing'

import {
  buildPrompt,
  cleanReply,
  formatHistory,
  parseSkillList,
  shortlistSkills,
  summarizePackage,
  truncate,
} from '../hooks/enhance'

const EMPTY = { claudeMd: '', readme: '', pkg: '', git: '', skills: [], history: '' }

test('parseSkillList reads name and description lines', () => {
  const skills = parseSkillList('- code-review: Review the diff\n* seo-audit - Audit a site\nnot a skill line')
  expect(skills.map(skill => skill.name)).toEqual(['code-review', 'seo-audit'])
  expect(skills[0].description).toBe('Review the diff')
})

test('shortlistSkills ranks by draft words and drops misses', () => {
  const skills = [
    { name: 'code-review', description: 'Review the current diff for bugs' },
    { name: 'seo-audit', description: 'Audit a website for search ranking' },
    { name: 'docx', description: 'Word documents' },
  ]
  const picked = shortlistSkills(skills, 'please review my diff before I merge')
  expect(picked.map(skill => skill.name)).toEqual(['code-review'])
})

test('shortlistSkills returns nothing when no word matches', () => {
  expect(shortlistSkills([{ name: 'docx', description: 'Word documents' }], 'fix the login bug')).toEqual([])
})

test('summarizePackage lists scripts and dependencies', () => {
  const text = JSON.stringify({ name: 'app', scripts: { test: 'vitest' }, dependencies: { react: '1' } })
  const summary = summarizePackage(text)
  expect(summary).toContain('scripts: test')
  expect(summary).toContain('dependencies: react')
})

test('summarizePackage gives empty text for bad JSON', () => {
  expect(summarizePackage('{nope')).toBe('')
})

test('cleanReply strips a code fence and whitespace', () => {
  expect(cleanReply('```\nDo the thing\n```\n')).toBe('Do the thing')
  expect(cleanReply('  plain  ')).toBe('plain')
})

test('truncate cuts long text and leaves short text alone', () => {
  expect(truncate('abc', 10)).toBe('abc')
  expect(truncate('abcdef', 3)).toBe('abc\n[cut]')
})

test('buildPrompt keeps the draft and skips empty sections', () => {
  const prompt = buildPrompt('fix the bug', { ...EMPTY, git: '## main' })
  expect(prompt).toContain('## Draft prompt to rewrite\nfix the bug')
  expect(prompt).toContain('## Git state')
  expect(prompt).not.toContain('## README')
})

const msg = (role: 'user' | 'assistant', text: string, toolUses: { tool: string; input: Record<string, unknown> }[] = []) =>
  ({ role, text, toolUses }) as const

test('formatHistory keeps the newest messages and skips empty rows', () => {
  const text = formatHistory([msg('user', 'fix login'), msg('user', ''), msg('assistant', 'Done. Want tests too?')])
  expect(text).toBe('user: fix login\nassistant: Done. Want tests too?')
})

test('formatHistory names tool targets and keeps the tail of a long reply', () => {
  const long = `${'x'.repeat(1000)} Which one do you want?`
  const text = formatHistory([msg('assistant', long, [{ tool: 'Edit', input: { file_path: 'src/a.ts' } }])])
  expect(text).toContain('[used: Edit src/a.ts]')
  expect(text).toContain('Which one do you want?')
  expect(text).toContain('[cut]')
})

test('formatHistory adds the opening goal when the window cuts it off', () => {
  const many = Array.from({ length: 12 }, (_, index) => msg(index % 2 === 0 ? 'user' : 'assistant', `m${index}`))
  const text = formatHistory(many)
  expect(text.startsWith('(session started with) user: m0')).toBe(true)
  expect(text).toContain('m11')
  expect(text).not.toContain('m3')
})
