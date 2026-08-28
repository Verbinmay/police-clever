import { EntitySchema } from "typeorm";

/**
 * Общая key-value настройка на "часть" бота — сюда идут AI-конфиг
 * (промпт/шутки/триггер-слово/гача-кривая), конфиг голосования за мьют
 * (спецфраза/кворум/окно/длительность) и персистентный счётчик гачи на
 * чат. Управляется из панели, чтобы не плодить отдельные таблицы под
 * каждую мелкую настройку и редактировать без передеплоя. Порт 1:1 из
 * bots-platform (`db/entities/PartSetting.ts`).
 */
export interface PartSetting {
	partId: string;
	key: string;
	value: unknown;
	updatedAt: Date;
}

export const PartSettingSchema = new EntitySchema<PartSetting>({
	name: "PartSetting",
	tableName: "part_settings",
	columns: {
		partId: { type: "text", primary: true, name: "part_id" },
		key: { type: "text", primary: true },
		value: { type: "jsonb" },
		updatedAt: { type: "timestamptz", name: "updated_at", updateDate: true },
	},
});
