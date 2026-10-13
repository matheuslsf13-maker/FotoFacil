import { readFileSync, writeFileSync } from 'node:fs'

export interface E2EState {
  email: string
  password: string
  userId: string
  photographerId: string
  clientPhone: string
  eventName: string
}

const STATE_FILE = 'tests/e2e/.state.json'

export function writeState(state: E2EState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state))
}

export function readState(): E2EState {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as E2EState
}
