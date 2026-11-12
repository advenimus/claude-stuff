export type LoopStats = { model: string; effort: string; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    'chat-status': {
      percent: number
      picker: string
      loops: Record<string, LoopStats>
    }
  }
}
