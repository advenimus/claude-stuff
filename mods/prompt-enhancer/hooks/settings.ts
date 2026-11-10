import type { ModelChoice, EnhancerSettings } from '../types'

export const MODEL_CHOICES: readonly ModelChoice[] = ['session', 'haiku', 'sonnet', 'opus']

export const DEFAULT_SETTINGS: EnhancerSettings = {
  model: 'sonnet',
  shareProjectFiles: true,
  askQuestions: true,
}

export const parseSettings = (value: unknown): EnhancerSettings => {
  if (typeof value !== 'object' || value === null) return DEFAULT_SETTINGS
  const saved = value as Record<string, unknown>
  const model = MODEL_CHOICES.find(choice => choice === saved.model)
  return {
    model: model ?? DEFAULT_SETTINGS.model,
    shareProjectFiles:
      typeof saved.shareProjectFiles === 'boolean' ? saved.shareProjectFiles : DEFAULT_SETTINGS.shareProjectFiles,
    askQuestions: typeof saved.askQuestions === 'boolean' ? saved.askQuestions : DEFAULT_SETTINGS.askQuestions,
  }
}
