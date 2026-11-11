declare module 'claude-code' {
  interface PluginState {
    'context-pie': { percent: number; effort: string; tokens: number; picker: string }
  }
}
