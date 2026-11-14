import { createContext, useContext } from 'react';
import type { useAgent } from './hooks/useAgent';
export const AgentState = createContext<ReturnType<typeof useAgent> | null>(null);
export function useAgentState() {
  const state = useContext(AgentState);
  if (!state) throw Error('Agent state provider missing');
  return state;
}
