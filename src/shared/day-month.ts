const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * "ДД.ММ" с реальными днём и месяцем (29.02 допустимо). Раньше проверялся
 * только формат \d{2}.\d{2} — "31.13" или перепутанное "09.25" сохранялось
 * и тихо никогда не срабатывало.
 */
export function isValidDayMonth(value: string): boolean {
	const match = /^(\d{2})\.(\d{2})$/.exec(value);
	if (!match) return false;
	const day = Number(match[1]);
	const month = Number(match[2]);
	return month >= 1 && month <= 12 && day >= 1 && day <= (DAYS_IN_MONTH[month - 1] ?? 0);
}
