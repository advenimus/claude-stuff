export type EnhanceStatus = 'idle' | 'asking' | 'questions' | 'working' | 'done' | 'error'

export type ModelChoice = 'session' | 'haiku' | 'sonnet' | 'opus'

export type EnhancerSettings = {
  model: ModelChoice
  shareProjectFiles: boolean
  askQuestions: boolean
}

export type Question = {
  id: string
  question: string
  options: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': {
      original: string | null
      status: EnhanceStatus
      note: string
      questions: Question[]
      answers: Record<string, string>
      extra: string
      expanded: string
      settings: EnhancerSettings
      isSettingsOpen: boolean
    }
  }
}
