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

/** Снять мьют вручную (кнопка в панели, вкладка "Голосования") — полные права обратно, until_date=0. */
export async function unmuteUser(telegram: Telegram, chatId: string, userId: string, logger: Logger): Promise<boolean> {
	try {
		await telegram.restrictChatMember(chatId, Number(userId), {
			until_date: 0,
			permissions: {
				can_send_messages: true,
				can_send_audios: true,
				can_send_documents: true,
				can_send_photos: true,
				can_send_videos: true,
				can_send_video_notes: true,
				can_send_voice_notes: true,
				can_send_polls: true,
				can_send_other_messages: true,
				can_add_web_page_previews: true,
				can_change_info: false,
				can_invite_users: true,
				can_pin_messages: false,
				can_manage_topics: false,
			},
		});
		return true;
	} catch (err) {
		logger.warn("restrictChatMember (unmute) failed", { chatId, userId }, err);
		return false;
	}
}
