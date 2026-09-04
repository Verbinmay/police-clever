// Ванильный JS без сборки — тот же подход, что в admin/public bots-platform.

async function api(path, options = {}) {
	const res = await fetch(`/api${path}`, {
		method: options.method ?? "GET",
		headers: options.body ? { "Content-Type": "application/json" } : undefined,
		body: options.body ? JSON.stringify(options.body) : undefined,
		credentials: "same-origin",
	});
	if (res.status === 401) {
		showLogin();
		throw new Error("unauthorized");
	}
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
	return data;
}

function el(id) {
	return document.getElementById(id);
}

function showLogin() {
	el("login-view").hidden = false;
	el("app-view").hidden = true;
}

function showApp(username) {
	el("login-view").hidden = true;
	el("app-view").hidden = false;
	el("whoami").textContent = username ? `вошли как ${username}` : "";
}

// ---- Табы ----

function setupTabs() {
	const buttons = document.querySelectorAll(".tab-btn");
	buttons.forEach((btn) => {
		btn.addEventListener("click", () => {
			buttons.forEach((b) => b.classList.remove("active"));
			document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
			btn.classList.add("active");
			el(`tab-${btn.dataset.tab}`).classList.add("active");
			loadTab(btn.dataset.tab);
		});
	});
}

function loadTab(tab) {
	if (tab === "topics") return loadTopics();
	if (tab === "ai-config") return loadAiConfig();
	if (tab === "ai-stats") return loadAiStats();
	if (tab === "ai-replies") return loadAiReplies();
	// "Голосования" — конфиг спецфразы/кворума + история в одной вкладке (были две почти одинаково названные).
	if (tab === "votes") {
		loadMuteVoteConfig();
		return loadVotes();
	}
	if (tab === "birthdays") {
		loadBirthdaysConfig();
		return loadBirthdays();
	}
	if (tab === "logs") return loadLogs();
	if (tab === "accounts") return loadAccounts();
}

// ---- Подчаты ----

async function loadTopics() {
	const { gacha, chats } = await api("/topics");
	renderGachaStatus(gacha);

	const tbody = document.querySelector("#topics-table tbody");
	tbody.innerHTML = "";
	for (const chat of chats) {
		tbody.appendChild(chatGroupRow(chat));
		const topics = chat.topics.length > 0 ? chat.topics : [{ threadId: "0", topicName: null, aiJokesEnabled: false, muteVoteEnabled: false, yesNoEnabled: false, birthdaysEnabled: false }];
		for (const topic of topics) {
			const tr = topicRow(chat, topic, chat.topics.length === 0);
			tr.hidden = true;
			tr.dataset.chatGroup = chat.chatId;
			tbody.appendChild(tr);
		}
	}
}

// Счётчик гачи один на весь бот (см. gacha.ts) — отдельный элемент над
// таблицей, а не колонка: дублировать одно и то же число в каждой строке
// каждого чата было бессмысленно (и выглядело так, будто у каждого чата
// своя гача, хотя счётчик общий).
function renderGachaStatus(gacha) {
	const container = el("gacha-status-content");
	container.innerHTML = "";
	const input = document.createElement("input");
	input.type = "number";
	input.min = "1";
	input.max = String(gacha.guaranteedAt);
	input.value = gacha.counter;
	input.style.width = "70px";
	const suffix = document.createElement("span");
	suffix.className = "hint";
	suffix.textContent = ` / ${gacha.guaranteedAt} (вероятностная — реально может сработать раньше)`;

	input.addEventListener("change", async () => {
		const next = Number(input.value);
		if (!Number.isFinite(next) || next < 1) {
			input.value = gacha.counter;
			return;
		}
		try {
			await api("/topics/gacha-counter", { method: "PUT", body: { value: next } });
			loadTopics();
		} catch (err) {
			alert(`Не удалось изменить счётчик: ${err.message}`);
			input.value = gacha.counter;
		}
	});

	container.append(input, suffix);
}

// Заголовок группы — сам чат, кликабельный: разворачивает/сворачивает
// список его тем (по умолчанию свёрнут, "выпадающий список"). Кулдаун и
// дневной кап тоже общие на весь ЧАТ (не на тему) — показываем их тут же
// в заголовке, а не повторяем в каждой строке темы.
function chatGroupRow(chat) {
	const tr = document.createElement("tr");
	tr.className = "expandable-row chat-group-row";
	const td = document.createElement("td");
	td.colSpan = 5;

	const extras = [];
	if (chat.cooldownRemainingMin > 0) extras.push(`кулдаун ещё ${chat.cooldownRemainingMin} мин`);
	if (chat.dailyCapRemainingMin > 0) extras.push(`дневной лимит ещё ${chat.dailyCapRemainingMin} мин`);
	const topicsCount = chat.topics.length > 0 ? `${chat.topics.length} ${chat.topics.length === 1 ? "тема" : "тем"}` : "тем ещё нет";

	td.innerHTML = `<span class="chat-group-toggle">▶</span> <strong>${chat.title ?? "(без названия)"}</strong> <span class="hint">${chat.chatId} · ${topicsCount}${extras.length ? " · " + extras.join(" · ") : ""}</span>`;
	tr.appendChild(td);

	tr.addEventListener("click", () => {
		const expanded = tr.classList.toggle("expanded");
		td.querySelector(".chat-group-toggle").textContent = expanded ? "▼" : "▶";
		document.querySelectorAll(`tr[data-chat-group="${CSS.escape(chat.chatId)}"]`).forEach((row) => {
			row.hidden = !expanded;
		});
	});

	return tr;
}

function topicRow(chat, topic, empty) {
	const tr = document.createElement("tr");
	const label = topic.topicName ?? (topic.threadId === "0" ? "(вся группа)" : `#${topic.threadId}`);
	tr.innerHTML = `
		<td>${label}</td>
		<td></td>
		<td></td>
		<td></td>
		<td></td>
	`;
	if (empty) {
		tr.children[0].innerHTML += ' <span class="hint">ещё нет сообщений</span>';
		return tr;
	}
	tr.children[1].appendChild(toggleSwitch(topic.aiJokesEnabled, (checked) => setTopicToggle(chat.chatId, topic.threadId, { aiJokesEnabled: checked })));
	tr.children[2].appendChild(toggleSwitch(topic.yesNoEnabled, (checked) => setTopicToggle(chat.chatId, topic.threadId, { yesNoEnabled: checked })));
	tr.children[3].appendChild(toggleSwitch(topic.muteVoteEnabled, (checked) => setTopicToggle(chat.chatId, topic.threadId, { muteVoteEnabled: checked })));
	tr.children[4].appendChild(toggleSwitch(topic.birthdaysEnabled, (checked) => setTopicToggle(chat.chatId, topic.threadId, { birthdaysEnabled: checked })));
	return tr;
}

function toggleSwitch(checked, onChange) {
	const label = document.createElement("label");
	label.className = "switch";
	const input = document.createElement("input");
	input.type = "checkbox";
	input.checked = checked;
	input.addEventListener("change", () => onChange(input.checked));
	const slider = document.createElement("span");
	slider.className = "slider";
	label.append(input, slider);
	return label;
}

async function setTopicToggle(chatId, threadId, patch) {
	await api(`/topics/${chatId}/${threadId}`, { method: "PUT", body: patch });
}

// ---- AI-конфиг ----

function linesOf(id) {
	return el(id).value.split("\n").map((s) => s.trim()).filter(Boolean);
}

async function loadAiConfig() {
	const config = await api("/ai-config");
	el("ai-provider").value = config.provider;
	el("ai-monthly-budget").value = config.monthlyBudgetUsd;
	el("p-deepseek-model").value = config.providers.deepseek.model;
	el("p-deepseek-baseurl").value = config.providers.deepseek.baseUrl;
	el("p-deepseek-in").value = config.providers.deepseek.inputPricePerMTok;
	el("p-deepseek-out").value = config.providers.deepseek.outputPricePerMTok;
	el("p-openai-model").value = config.providers.openai.model;
	el("p-openai-baseurl").value = config.providers.openai.baseUrl;
	el("p-openai-in").value = config.providers.openai.inputPricePerMTok;
	el("p-openai-out").value = config.providers.openai.outputPricePerMTok;

	el("ai-prompt").value = config.promptTemplate;
	el("ai-trigger").value = config.triggerWords.join("\n");

	el("ai-cooldown").value = config.cooldownMinutes;
	el("ai-daily-cap").value = config.dailyCallCapPerChat;
	el("ai-participants-window").value = config.activeParticipantsLookback;

	el("ai-sticker-pack").value = config.stickerPackShortName;
	el("ai-sticker-cooldown").value = config.stickerCooldownMinutes;

	el("tone-general").value = config.toneWeights.general;
	el("tone-targeted").value = config.toneWeights.targeted;
	el("tone-sarcasm").value = config.toneWeights.sarcasm;
	el("tone-praise").value = config.toneWeights.praise;
	el("actions-general").value = config.actionsByTone.general.join("\n");
	el("actions-targeted").value = config.actionsByTone.targeted.join("\n");
	el("actions-sarcasm").value = config.actionsByTone.sarcasm.join("\n");
	el("actions-praise").value = config.actionsByTone.praise.join("\n");

	el("ai-guaranteed").value = config.gachaGuaranteedAt;
	el("ai-yesno-prob").value = config.yesNoReplyProbability;
	el("ai-yes").value = config.yesAnswers.join("\n");
	el("ai-no").value = config.noAnswers.join("\n");

	loadScenarioUsage();
}

// Небольшие таблички "сценарий → сколько раз выпал" по каждому тону —
// контроль, что shuffle-bag (tone.ts) реально держит разброс использований
// внутри тона не больше 1, а не просто "по задумке".
const TONE_LABELS = { general: "general", targeted: "targeted", sarcasm: "sarcasm", praise: "praise" };

async function loadScenarioUsage() {
	const usage = await api("/scenario-usage");
	const container = el("scenario-usage-content");
	container.innerHTML = "";

	for (const [tone, label] of Object.entries(TONE_LABELS)) {
		const rows = usage[tone] ?? [];
		if (rows.length === 0) continue;

		const h4 = document.createElement("h4");
		h4.textContent = label;
		h4.style.marginBottom = "4px";
		container.appendChild(h4);

		const wrap = document.createElement("div");
		wrap.className = "table-wrap";
		const table = document.createElement("table");
		table.innerHTML = `<thead><tr><th>Сценарий</th><th>Раз выпал</th></tr></thead><tbody>${rows
			.map((r) => `<tr><td class="wrap">${escapeHtml(r.scenario)}</td><td>${r.count}</td></tr>`)
			.join("")}</tbody>`;
		wrap.appendChild(table);
		container.appendChild(wrap);
	}
}

el("ai-config-save").addEventListener("click", async () => {
	const status = el("ai-config-status");
	status.textContent = "";
	try {
		await api("/ai-config", {
			method: "PUT",
			body: {
				provider: el("ai-provider").value,
				monthlyBudgetUsd: Number(el("ai-monthly-budget").value),
				providers: {
					deepseek: {
						label: "DeepSeek",
						model: el("p-deepseek-model").value,
						baseUrl: el("p-deepseek-baseurl").value,
						inputPricePerMTok: Number(el("p-deepseek-in").value),
						outputPricePerMTok: Number(el("p-deepseek-out").value),
					},
					openai: {
						label: "OpenAI",
						model: el("p-openai-model").value,
						baseUrl: el("p-openai-baseurl").value,
						inputPricePerMTok: Number(el("p-openai-in").value),
						outputPricePerMTok: Number(el("p-openai-out").value),
					},
				},

				promptTemplate: el("ai-prompt").value,
				triggerWords: linesOf("ai-trigger"),

				cooldownMinutes: Number(el("ai-cooldown").value),
				dailyCallCapPerChat: Number(el("ai-daily-cap").value),
				stickerPackShortName: el("ai-sticker-pack").value.trim(),
				stickerCooldownMinutes: Number(el("ai-sticker-cooldown").value),
				activeParticipantsLookback: Number(el("ai-participants-window").value),

				toneWeights: {
					general: Number(el("tone-general").value),
					targeted: Number(el("tone-targeted").value),
					sarcasm: Number(el("tone-sarcasm").value),
					praise: Number(el("tone-praise").value),
				},
				actionsByTone: {
					general: linesOf("actions-general"),
					targeted: linesOf("actions-targeted"),
					sarcasm: linesOf("actions-sarcasm"),
					praise: linesOf("actions-praise"),
				},

				gachaGuaranteedAt: Number(el("ai-guaranteed").value),
				yesNoReplyProbability: Number(el("ai-yesno-prob").value),
				yesAnswers: linesOf("ai-yes"),
				noAnswers: linesOf("ai-no"),
			},
		});
		status.textContent = "Сохранено";
		setTimeout(() => (status.textContent = ""), 2000);
	} catch (err) {
		status.textContent = `Ошибка: ${err.message}`;
	}
});

// ---- Конфиг голосования ----

async function loadMuteVoteConfig() {
	const config = await api("/mutevote-config");
	el("mv-phrase").value = config.triggerPhrase;
	el("mv-quorum").value = config.quorum;
	el("mv-window").value = config.windowMinutes;
	el("mv-mute").value = config.muteMinutes;
}

el("mv-config-save").addEventListener("click", async () => {
	const status = el("mv-config-status");
	try {
		await api("/mutevote-config", {
			method: "PUT",
			body: {
				triggerPhrase: el("mv-phrase").value,
				quorum: Number(el("mv-quorum").value),
				windowMinutes: Number(el("mv-window").value),
				muteMinutes: Number(el("mv-mute").value),
			},
		});
		status.textContent = "Сохранено";
		setTimeout(() => (status.textContent = ""), 2000);
	} catch (err) {
		status.textContent = `Ошибка: ${err.message}`;
	}
});

// ---- Статистика AI ----

function formatUsd(n) {
	return `$${Number(n).toFixed(4)}`;
}

async function loadAiStats() {
	const { daily, byChat, budget } = await api("/ai-stats");

	el("budget-provider").textContent = budget.provider;
	el("budget-today").textContent = formatUsd(budget.todayCostUsd);
	el("budget-month").textContent = formatUsd(budget.monthToDateCostUsd);
	el("budget-limit").textContent = budget.monthlyBudgetUsd > 0 ? formatUsd(budget.monthlyBudgetUsd) : "без лимита";
	const statusEl = el("budget-status");
	if (budget.monthlyBudgetUsd <= 0) {
		statusEl.textContent = "";
	} else if (budget.overBudget) {
		statusEl.textContent = "⛔ Месячный лимит достигнут — AI-ответы приостановлены до следующего месяца.";
		statusEl.className = "error-text";
	} else {
		statusEl.textContent = `Остаток: ${formatUsd(budget.remainingUsd)}`;
		statusEl.className = "ok-text";
	}

	const dailyBody = document.querySelector("#ai-stats-daily-table tbody");
	dailyBody.innerHTML = daily
		.map(
			(row) =>
				`<tr><td>${new Date(row.day).toLocaleDateString("ru-RU")}</td><td>${row.calls}</td><td>${row.promptTokens}</td><td>${row.completionTokens}</td><td>${formatUsd(row.costUsd)}</td></tr>`,
		)
		.join("");

	const chatsBody = document.querySelector("#ai-stats-chats-table tbody");
	chatsBody.innerHTML = byChat.map((row) => `<tr><td>${row.chatId}</td><td>${row.calls}</td><td>${formatUsd(row.costUsd)}</td></tr>`).join("");
}

// ---- Ответы AI ----

async function loadAiReplies() {
	const chatId = el("ai-replies-chat-id").value.trim();
	const params = new URLSearchParams();
	if (chatId) params.set("chatId", chatId);
	const replies = await api(`/ai-replies?${params.toString()}`);

	const tbody = document.querySelector("#ai-replies-table tbody");
	tbody.innerHTML = "";
	for (const r of replies) {
		const mainRow = document.createElement("tr");
		mainRow.className = "expandable-row";
		mainRow.innerHTML = `
			<td>${new Date(r.createdAt).toLocaleString("ru-RU")}</td>
			<td>${r.chatId}</td>
			<td>${r.threadId}</td>
			<td>${r.kind}</td>
			<td>${r.tone ?? "—"}</td>
			<td class="wrap">${escapeHtml(r.replyText)}</td>
			<td>${formatUsd(r.costUsd)}</td>
		`;

		const detailRow = document.createElement("tr");
		detailRow.hidden = true;
		const detailCell = document.createElement("td");
		detailCell.colSpan = 7;
		detailCell.className = "wrap";
		detailCell.innerHTML = `
			<p><strong>Промпт (system):</strong><br>${escapeHtml(r.promptText)}</p>
			<p><strong>Контекст (user):</strong><br>${escapeHtml(r.userContent)}</p>
			<p class="hint">provider: ${r.provider}, prompt_tokens: ${r.promptTokens}, completion_tokens: ${r.completionTokens}</p>
		`;
		detailRow.appendChild(detailCell);

		mainRow.addEventListener("click", () => (detailRow.hidden = !detailRow.hidden));
		tbody.append(mainRow, detailRow);
	}
}

el("ai-replies-load").addEventListener("click", loadAiReplies);

// ---- Голосования ----

async function loadVotes() {
	const chatId = el("votes-chat-id").value.trim();
	const params = new URLSearchParams();
	if (chatId) params.set("chatId", chatId);
	const votes = await api(`/votes?${params.toString()}`);

	const tbody = document.querySelector("#votes-table tbody");
	tbody.innerHTML = votes
		.map((v) => {
			const unmuteBtn = v.status === "muted" ? `<button type="button" class="danger" data-unmute="${v.id}">Снять мьют</button>` : "";
			// "Забыть" — не ходит в Telegram, просто убирает запись из списка
			// актуальных. Нужно для зависших/некорректных строк — например,
			// цель оказалась админом чата, Telegram отказал мьютить, а запись
			// всё равно осталась висеть как "muted" (в т.ч. старые записи до
			// фикса статуса под такой случай).
			const dismissBtn = `<button type="button" data-dismiss="${v.id}">Забыть</button>`;
			return `<tr>
				<td>${new Date(v.startedAt).toLocaleString("ru-RU")}</td>
				<td>${v.chatId}</td>
				<td>${v.topicName ?? v.threadId}</td>
				<td>${v.targetName ?? v.targetTgId}</td>
				<td>${v.requestedByTgId}</td>
				<td>${v.yes} / ${v.no}</td>
				<td>${v.status}</td>
				<td>${unmuteBtn} ${dismissBtn}</td>
			</tr>`;
		})
		.join("");

	tbody.querySelectorAll("button[data-unmute]").forEach((btn) => {
		btn.addEventListener("click", async () => {
			btn.disabled = true;
			btn.textContent = "Снимаю…";
			try {
				await api(`/votes/${btn.dataset.unmute}/unmute`, { method: "POST" });
				loadVotes();
			} catch (err) {
				alert(`Не удалось снять мьют: ${err.message}`);
				btn.disabled = false;
				btn.textContent = "Снять мьют";
			}
		});
	});

	tbody.querySelectorAll("button[data-dismiss]").forEach((btn) => {
		btn.addEventListener("click", async () => {
			if (!confirm("Убрать эту запись из списка? Реальный мьют (если он есть) это не тронет — только запись в панели.")) return;
			btn.disabled = true;
			try {
				await api(`/votes/${btn.dataset.dismiss}/dismiss`, { method: "POST" });
				loadVotes();
			} catch (err) {
				alert(`Не удалось убрать запись: ${err.message}`);
				btn.disabled = false;
			}
		});
	});
}

el("votes-load").addEventListener("click", loadVotes);

// ---- Дни рождения ----

const GENDER_LABELS = { male: "муж", female: "жен", null: "—" };
const BIRTHDAY_RE = /^\d{2}\.\d{2}$/;

async function loadBirthdaysConfig() {
	const config = await api("/birthdays/config");
	el("bday-prompt").value = config.congratsPromptTemplate;
}

el("bday-config-save").addEventListener("click", async () => {
	const status = el("bday-config-status");
	status.textContent = "";
	try {
		await api("/birthdays/config", { method: "PUT", body: { congratsPromptTemplate: el("bday-prompt").value } });
		status.textContent = "Сохранено";
		setTimeout(() => (status.textContent = ""), 2000);
	} catch (err) {
		status.textContent = `Ошибка: ${err.message}`;
	}
});

async function loadBirthdays() {
	const people = await api("/birthdays");
	const tbody = document.querySelector("#birthdays-table tbody");
	tbody.innerHTML = "";

	for (const person of people) {
		const tr = document.createElement("tr");

		const nameTd = document.createElement("td");
		nameTd.textContent = person.firstName;
		const usernameTd = document.createElement("td");
		usernameTd.textContent = person.username ? `@${person.username}` : "—";
		const genderTd = document.createElement("td");
		genderTd.textContent = GENDER_LABELS[person.gender ?? "null"] ?? "—";

		const birthdayTd = document.createElement("td");
		const input = document.createElement("input");
		input.type = "text";
		input.placeholder = "ДД.ММ";
		input.value = person.birthday ?? "";
		input.style.width = "70px";
		input.addEventListener("change", async () => {
			const value = input.value.trim();
			if (value && !BIRTHDAY_RE.test(value)) {
				alert('Дата должна быть в формате "ДД.ММ", например 05.09');
				input.value = person.birthday ?? "";
				return;
			}
			try {
				await api(`/birthdays/${person.tgId}`, { method: "PUT", body: { birthday: value } });
				loadBirthdays();
			} catch (err) {
				alert(`Не удалось сохранить дату: ${err.message}`);
				input.value = person.birthday ?? "";
			}
		});
		birthdayTd.appendChild(input);

		const sourceTd = document.createElement("td");
		sourceTd.className = "hint";
		sourceTd.textContent = person.source === "admin" ? "вручную" : person.source === "auto" ? "автоскан" : "—";

		const chatTd = document.createElement("td");
		chatTd.className = "hint";
		chatTd.textContent = person.chatId;

		const actionsTd = document.createElement("td");
		const deleteBtn = document.createElement("button");
		deleteBtn.type = "button";
		deleteBtn.className = "danger";
		deleteBtn.textContent = "Удалить";
		deleteBtn.addEventListener("click", async () => {
			if (!confirm(`Удалить ${person.firstName} из списка? (например, если человек вышел из чата)`)) return;
			try {
				await api(`/birthdays/${person.tgId}`, { method: "DELETE" });
				loadBirthdays();
			} catch (err) {
				alert(`Не удалось удалить: ${err.message}`);
			}
		});
		actionsTd.appendChild(deleteBtn);

		tr.append(nameTd, usernameTd, genderTd, birthdayTd, sourceTd, chatTd, actionsTd);
		tbody.appendChild(tr);
	}
}

// ---- Логи ----

async function loadLogs() {
	const partId = el("logs-part-filter").value;
	const level = el("logs-level-filter").value;
	const params = new URLSearchParams();
	if (partId) params.set("partId", partId);
	if (level) params.set("level", level);
	const logs = await api(`/logs?${params.toString()}`);
	const tbody = document.querySelector("#logs-table tbody");
	tbody.innerHTML = logs
		.map(
			(log) =>
				`<tr><td>${new Date(log.createdAt).toLocaleString("ru-RU")}</td><td>${log.partId}</td><td class="level-${log.level}">${log.level}</td><td>${log.module}</td><td class="wrap">${escapeHtml(log.message)}</td><td class="wrap">${log.context ? escapeHtml(JSON.stringify(log.context)) : ""}</td></tr>`,
		)
		.join("");
}

function escapeHtml(str) {
	return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

el("logs-refresh").addEventListener("click", loadLogs);

// ---- Аккаунты ----

async function loadAccounts() {
	const accounts = await api("/accounts");
	const tbody = document.querySelector("#accounts-table tbody");
	tbody.innerHTML = accounts
		.map(
			(a) =>
				`<tr><td>${a.username}</td><td>${new Date(a.createdAt).toLocaleDateString("ru-RU")}</td><td><button type="button" class="danger" data-id="${a.id}">Удалить</button></td></tr>`,
		)
		.join("");
	tbody.querySelectorAll("button[data-id]").forEach((btn) => {
		btn.addEventListener("click", async () => {
			try {
				await api(`/accounts/${btn.dataset.id}`, { method: "DELETE" });
				loadAccounts();
			} catch (err) {
				el("accounts-error").textContent = err.message;
			}
		});
	});
}

el("accounts-add-form").addEventListener("submit", async (e) => {
	e.preventDefault();
	el("accounts-error").textContent = "";
	try {
		await api("/accounts", { method: "POST", body: { username: el("accounts-username").value, password: el("accounts-password").value } });
		el("accounts-username").value = "";
		el("accounts-password").value = "";
		loadAccounts();
	} catch (err) {
		el("accounts-error").textContent = err.message;
	}
});

// ---- Логин/логаут ----

el("login-form").addEventListener("submit", async (e) => {
	e.preventDefault();
	el("login-error").textContent = "";
	try {
		const data = await api("/auth/login", { method: "POST", body: { username: el("login-username").value, password: el("login-password").value } });
		showApp(data.username);
		loadTab("topics");
	} catch (err) {
		el("login-error").textContent = err.message;
	}
});

el("logout-btn").addEventListener("click", async () => {
	await api("/auth/logout", { method: "POST" });
	showLogin();
});

// ---- Инициализация ----

setupTabs();
api("/auth/me")
	.then((me) => {
		showApp(me.username);
		loadTab("topics");
	})
	.catch(() => showLogin());
