# Police Clever Bot 🤖

<img alt="NestJS" src="https://img.shields.io/badge/NestJS-v8.x-red.svg"> <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-v4.x-blue.svg"> <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-v14.x-blue.svg"> <img alt="TDLib" src="https://img.shields.io/badge/TDLib-latest-brightgreen.svg">

Многофункциональный Telegram-бот для управления чатами, пользователями и обработки сообщений на базе NestJS.

## 📝 Описание

**Police Clever Bot** - продвинутый инструмент для администрирования Telegram-чатов с:

- Автоматической модерацией
- Гибким управлением пользователями
- Расширенной аналитикой сообщений
- Системой планирования задач

Архитектура: CQRS + Event-Driven с использованием TypeORM и PostgreSQL

## ✨ Основные функции

### 👥 Управление чатами

- Автоматическое создание/настройка чатов
- Управление ветками сообщений (Threads)
- Получение списка администраторов и участников

### 👮 Модерация пользователей

- Назначение/снятие прав администраторов
- Временные муты пользователей
- Система ролей (админ, нормис)

### 📊 Управление профилями

- Установка никнеймов
- Добавление биографии/даты рождения
- Просмотр профилей пользователей

### 📝 Работа с сообщениями

- Сохранение сообщений с хэштегами
- Автоочистка старых сообщений
- Обработка служебных команд

### ⏱️ Планировщик задач

- Напоминания о днях рождения
- Периодическая очистка данных
- Автообновление информации

## 🛠️ Технологический стек

| Компонент    | Технология             |
| ------------ | ---------------------- |
| Фреймворк    | NestJS                 |
| Язык         | TypeScript 4.x         |
| База данных  | PostgreSQL 14          |
| ORM          | TypeORM                |
| Telegram API | TDLib (prebuilt-tdlib) |
| Архитектура  | CQRS + Event-Driven    |

## 🚀 Установка и запуск

### Предварительные требования

- Node.js v14+
- PostgreSQL
- Telegram API credentials (API ID/Hash)

### Шаги установки

1. Клонировать репозиторий:

```bash
git clone https://github.com/yourusername/police-clever.git
cd police-clever
```

2. Установить зависимости:

```bash
yarn install
```

3. Настройка окружения:
   Создайте .env файл:

```bash
POLICE_TG_API_ID=ваш_api_id
POLICE_TG_API_HASH=ваш_api_hash
POLICE_TG_PHONE=ваш_номер_телефона
POLICE_DB_HOST=localhost
POLICE_DB_PORT=5432
POLICE_DB_USER=postgres
POLICE_DB_PASSWORD=ваш_пароль
POLICE_DB_NAME=police_clever
```

4. Запуск приложения:

```bash
# Режим разработки
yarn start:dev

# Production сборка
yarn build
yarn start:prod
```

### 🔧 Команды бота
Команда	Описание
/createChat	Создать новый чат
/getAdminsList	Список администраторов
/setAdmin	Назначить администратора
/mute	Временно отключить пользователя
/setName	Установить никнейм
/addBirthday	Добавить день рождения
/help	Список всех команд

### 🔧 В процессе:
Автоответы с помощью ии
