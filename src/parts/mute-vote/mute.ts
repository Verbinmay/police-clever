import type { Telegram } from "telegraf";
import type { Logger } from "../../logger/logger.ts";

/** Порт `muteUser` из старого `bot.repository.ts` — Bot API-эквивалент через restrictChatMember. */
export async function muteUser(telegram: Telegram, chatId: string, userId: string, minutes: number, logger: Logger): Promise<boolean> {
	try {
		await telegram.restrictChatMember(chatId, Number(userId), {
			until_date: Math.floor(Date.now() / 1000) + minutes * 60,
			permissions: {
				can_send_messages: false,
				can_send_audios: false,
				can_send_documents: false,
				can_send_photos: false,
				can_send_videos: false,
				can_send_video_notes: false,
				can_send_voice_notes: false,
				can_send_polls: false,
				can_send_other_messages: false,
				can_add_web_page_previews: false,
				can_change_info: false,
				can_invite_users: false,
				can_pin_messages: false,
				can_manage_topics: false,
			},
		});
		return true;
	} catch (err) {
		// Telegram сам отказывает замьютить реального чат-админа — это ожидаемо,
		// отдельную exemption-проверку на уровне приложения делать не нужно.
		logger.warn("restrictChatMember failed", { chatId, userId }, err);
		return false;
	}
}
