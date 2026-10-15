/**
 * Распознавание обращения к боту по имени — во всех падежах, по целым словам.
 *
 * Раньше было `text.includes("реня")`: "Реню позовите", "спроси у Рени",
 * "с Реней" бота не звали (в этих формах нет подстроки "реня"), а простое
 * добавление форм подстроками ловило бы чужие слова ("примирения" содержит
 * "рени"). Поэтому сравниваем целые слова с формами имени.
 */

const FILLER_WORDS = new Set(["эй", "ну", "слышь", "алло", "ало", "ау", "ой", "так", "вот"]);

/** Падежные формы имени: Реня → реня/рени/рене/реню/реней/ренею; Реван → реван/ревана/ревану/реваном/реване. */
function nameForms(word: string): string[] {
	const w = word.trim().toLowerCase();
	if (!w) return [];
	if (w.endsWith("я")) {
		const stem = w.slice(0, -1);
		return [w, ...["и", "е", "ю", "ей", "ею", "ёй"].map((e) => stem + e)];
	}
	if (w.endsWith("а")) {
		const stem = w.slice(0, -1);
		return [w, ...["ы", "и", "е", "у", "ой", "ою"].map((e) => stem + e)];
	}
	return [w, ...["а", "у", "ом", "е", "ы"].map((e) => w + e)];
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}

export interface TriggerMatch {
	/** В тексте есть имя бота в какой-либо форме. */
	isTriggered: boolean;
	/** Кроме имени и междометий есть хоть одно слово из 3+ букв — значит, есть, на что отвечать по существу. */
	hasMeaningfulWords: boolean;
}

export function matchTrigger(text: string, triggerWords: string[]): TriggerMatch {
	const forms = new Set(triggerWords.flatMap(nameForms));
	// Растянутое "Реняяя"/"Рееевааан" — тоже обращение: сжимаем повторы букв.
	const isName = (t: string) => forms.has(t) || forms.has(t.replace(/(\p{L})\1+/gu, "$1"));
	const tokens = tokenize(text);
	const isTriggered = tokens.some(isName);
	const hasMeaningfulWords = tokens.some((t) => t.length >= 3 && !FILLER_WORDS.has(t) && !isName(t));
	return { isTriggered, hasMeaningfulWords };
}
