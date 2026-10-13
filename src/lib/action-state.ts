export interface ActionState {
  error: string | null
  ok?: boolean
}

export const initialActionState: ActionState = { error: null }
