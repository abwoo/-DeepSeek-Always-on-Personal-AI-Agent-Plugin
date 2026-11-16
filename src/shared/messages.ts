// Presentation of actual durable input receipts and text-message events.
// A receipt is displayed distinctly until the same message enters model history.
export function conversationRows(events: Array<{ type: string; seq: number; data: any }>) {
  const visibleUsers = new Set(
    events.filter((e) => e.type === 'user/message').map((e) => e.data.id),
  );
  const rows = new Map<string, { id: string; seq: number; role: string; text: string }>();
  const text = (content: unknown) =>
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter((part) => part?.type === 'text' && typeof part.text === 'string')
            .map((part) => part.text)
            .join('\n')
        : '';
  for (const event of events) {
    if (event.type === 'agent/inbox/spliced') {
      for (const message of event.data.inserted || []) {
        if (message.source?.kind === 'user' && !visibleUsers.has(message.id)) {
          rows.set(message.id, {
            id: message.id,
            seq: event.seq,
            role: 'received',
            text: text(message.content),
          });
        }
      }
    } else if (event.type === 'user/message' || event.type === 'assistant/message') {
      const message = event.type === 'user/message' ? event.data : event.data.message;
      // Native producers declare context independently of their kind. In particular,
      // skill-catalog is a catalog, not runtime-context. These are model inputs,
      // not ordinary chat. Preserve the durable events and the user's exact text.
      const source = message.source;
      const context = event.type === 'user/message' && source?.kind !== 'user';
      if (
        context &&
        (source?.kind === 'runtime-context' ||
          ['instructions', 'catalog', 'snapshot'].includes(source?.form))
      ) continue;
      rows.set(message.id, {
        id: message.id,
        seq: event.seq,
        role:
          event.type === 'user/message'
            ? message.source?.kind === 'user'
              ? 'you'
              : 'context'
            : 'assistant',
        text: context && source?.form === 'notice' && typeof source.summary === 'string'
          ? source.summary
          : text(message.content),
      });
    }
  }
  return [...rows.values()].sort((a, b) => a.seq - b.seq);
}
