export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
}

const SESSIONS_KEY = "commercepilot_sessions";
const ACTIVE_THREAD_KEY = "commerce_session_id";

export const getSavedSessions = (): ChatSession[] => {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const getActiveThreadId = (): string => {
  let threadId = localStorage.getItem(ACTIVE_THREAD_KEY);
  if (!threadId) {
    threadId = `session_${crypto.randomUUID()}`;
    localStorage.setItem(ACTIVE_THREAD_KEY, threadId);
    saveSessionMeta(threadId, "New Conversation");
  }
  return threadId;
};

export const saveSessionMeta = (threadId: string, title?: string) => {
  const sessions = getSavedSessions();
  const existing = sessions.find((s) => s.id === threadId);
  
  const updated: ChatSession[] = existing
    ? sessions.map((s) =>
        s.id === threadId
          ? { ...s, title: title || s.title, updatedAt: new Date().toISOString() }
          : s
      )
    : [
        {
          id: threadId,
          title: title || "New Conversation",
          updatedAt: new Date().toISOString(),
        },
        ...sessions,
      ];

  localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
};

export const setActiveThread = (threadId: string) => {
  localStorage.setItem(ACTIVE_THREAD_KEY, threadId);
};

export const createNewSession = (): string => {
  const newThreadId = `session_${crypto.randomUUID()}`;
  localStorage.setItem(ACTIVE_THREAD_KEY, newThreadId);
  saveSessionMeta(newThreadId, "New Conversation");
  return newThreadId;
};

export const deleteSession = (threadId: string) => {
  const sessions = getSavedSessions();
  const updated = sessions.filter(s => s.id !== threadId);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
  localStorage.removeItem(`commercepilot_messages_${threadId}`);
};
