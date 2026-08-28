const MAX_MESSAGE_LENGTH = 4090;

/**
 * Режет текст на куски под лимит Telegram (4096 символов) по границе слова.
 * Порт как есть из старого police-clever (`bot/utils/crop-text-for-message.ts`)
 * — Bot API режет сообщения точно так же, как TDLib.
 */
export function cropTextForMessage(text: string): string[] {
	if (!text || text.length <= MAX_MESSAGE_LENGTH) {
		return [text];
	}

	const chunks: string[] = [];
	let remainingText = text;

	while (remainingText.length > MAX_MESSAGE_LENGTH) {
		const lastSpace = remainingText.lastIndexOf(" ", MAX_MESSAGE_LENGTH);
		const splitPosition = lastSpace > 0 ? lastSpace : MAX_MESSAGE_LENGTH;

		chunks.push(remainingText.slice(0, splitPosition).trim());
		remainingText = remainingText.slice(splitPosition).trimStart();
	}

	if (remainingText.length > 0) {
		chunks.push(remainingText);
	}

	return chunks;
}
