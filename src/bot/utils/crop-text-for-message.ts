const MAX_MESSAGE_LENGTH = 4090;

export function cropTextForMessage(text: string): string[] {
  if (!text || text.length <= MAX_MESSAGE_LENGTH) {
    return [text];
  }

  const chunks: string[] = [];
  let remainingText = text;

  while (remainingText.length > MAX_MESSAGE_LENGTH) {
    const lastSpace = remainingText.lastIndexOf(' ', MAX_MESSAGE_LENGTH);
    const splitPosition = lastSpace > 0 ? lastSpace : MAX_MESSAGE_LENGTH;

    chunks.push(remainingText.slice(0, splitPosition).trim());
    remainingText = remainingText.slice(splitPosition).trimStart();
  }

  if (remainingText.length > 0) {
    chunks.push(remainingText);
  }

  return chunks;
}
