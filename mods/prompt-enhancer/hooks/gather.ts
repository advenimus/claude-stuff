import type { EngineInterface } from 'claude-code'

import {
  parseSkillList,
  shortlistSkills,
  summarizePackage,
  formatHistory,
  type EnhanceContext,
  type SkillEntry,
} from './enhance'

export type Gathered = {
  readonly context: EnhanceContext
  readonly skipped: readonly string[]
}

type Part<T> = { readonly value: T; readonly skipped?: string }

async function attempt<T>(label: string, empty: T, run: () => Promise<T>): Promise<Part<T>> {
  try {
    return { value: await run() }
  } catch (error) {
    return { value: empty, skipped: `${label}: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function readIfPresent($: EngineInterface, path: string): Promise<string> {
  return (await $.fs.exists(path)) ? await $.fs.read(path) : ''
}

async function readClaudeMd($: EngineInterface): Promise<string> {
  const found = await $.fs.ancestors({ names: ['CLAUDE.md'] })
  return found.map(file => `# ${file.dir}/${file.name}\n${file.content}`).join('\n\n')
}

async function readGit($: EngineInterface): Promise<string> {
  const status = await $.process.run(['git', 'status', '--short', '--branch'])
  if (status.exitCode !== 0) return ''
  const log = await $.process.run(['git', 'log', '-5', '--oneline'])
  return `${status.stdout}\n${log.exitCode === 0 ? log.stdout : ''}`
}

async function readSkills($: EngineInterface, draft: string): Promise<readonly SkillEntry[]> {
  const reply = await $.tool.call({ tool: 'ListSkills' })
  if (reply.deny !== undefined) return []
  const text = reply.text ?? JSON.stringify(reply.result ?? '')
  return shortlistSkills(parseSkillList(text), draft)
}

async function readHistory($: EngineInterface): Promise<string> {
  const messages = await $.session.messages()
  if ('deny' in messages) return ''
  return formatHistory(messages)
}

async function readProjectFiles(
  $: EngineInterface,
  root: string,
): Promise<readonly [Part<string>, Part<string>, Part<string>, Part<string>]> {
  return Promise.all([
    attempt('CLAUDE.md', '', () => readClaudeMd($)),
    attempt('README', '', () => readIfPresent($, `${root}/README.md`)),
    attempt('package.json', '', async () => summarizePackage(await readIfPresent($, `${root}/package.json`))),
    attempt('git', '', () => readGit($)),
  ])
}

const NO_FILES: readonly [Part<string>, Part<string>, Part<string>, Part<string>] = [
  { value: '' },
  { value: '' },
  { value: '' },
  { value: '' },
]

export async function gather(
  $: EngineInterface,
  draft: string,
  shareProjectFiles: boolean,
): Promise<Gathered> {
  const root = await $.session.root()
  const [skills, history, files] = await Promise.all([
    attempt<readonly SkillEntry[]>('skills', [], () => readSkills($, draft)),
    attempt('conversation', '', () => readHistory($)),
    shareProjectFiles ? readProjectFiles($, root) : Promise.resolve(NO_FILES),
  ])
  const [claudeMd, readme, pkg, git] = files
  const skipped = [skills, history, ...files].flatMap(part =>
    part.skipped === undefined ? [] : [part.skipped],
  )
  return {
    context: {
      skills: skills.value,
      history: history.value,
      claudeMd: claudeMd.value,
      readme: readme.value,
      pkg: pkg.value,
      git: git.value,
    },
    skipped,
  }
}
