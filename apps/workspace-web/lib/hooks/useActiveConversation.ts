"use client"

import { useEffect, useMemo } from 'react'
import { shallow } from 'zustand/shallow'
import { useConversationStore, type ConversationState, type Message } from '../store/conversation'

interface ActiveConversationState {
  messages: Message[]
  input: string
  setInput: ConversationState['setInput']
  sendMessage: ConversationState['sendMessage']
  streaming: boolean
  cancelStreaming: ConversationState['cancelStreaming']
  clearError: ConversationState['clearError']
  errorMsg?: string
  storeReady: boolean
}

const selector = (state: ConversationState) => ({
  activeId: state.activeId,
  messagesByConvId: state.messagesByConvId,
  rehydrate: state.rehydrate,
  hydrated: state.hydrated,
  input: state.input,
  setInput: state.setInput,
  sendMessage: state.sendMessage,
  streaming: state.streaming,
  cancelStreaming: state.cancelStreaming,
  clearError: state.clearError,
  errorMsg: state.errorMsg,
})

export function useActiveConversation(): ActiveConversationState {
  const {
    activeId,
    messagesByConvId,
    rehydrate,
    hydrated,
    input,
    setInput,
    sendMessage,
    streaming,
    cancelStreaming,
    clearError,
    errorMsg,
  } = useConversationStore(selector, shallow)

  useEffect(() => {
    rehydrate()
  }, [rehydrate])

  const messages = useMemo(() => {
    if (!activeId) return []
    return messagesByConvId?.[activeId] ?? []
  }, [activeId, messagesByConvId])

  return {
    messages,
    input,
    setInput,
    sendMessage,
    streaming,
    cancelStreaming,
    clearError,
    errorMsg,
    storeReady: hydrated,
  }
}
