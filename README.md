# XMSGi

XMSGi is a desktop application for preparing and scheduling Telegram messages from your own Telegram user account.

## Screenshots

![XMSGi composer](screenshots/01.png)

![XMSGi scheduled messages](screenshots/02.png)

![XMSGi authentication](screenshots/03.png)

## Project Transparency

XMSGi is an open-source project. Its source code is available in this repository for review.

XMSGi works with a Telegram user account, not a Telegram bot. Telegram session data is stored locally on the device. Sensitive local data, including the Gemini API key when configured, is protected through Electron `safeStorage` where the operating system supports it.

## Security & Session Storage

- Telegram authentication and session data remain local to the device.
- The application uses a Telegram user account rather than a bot account.
- Sensitive configuration values are protected with Electron `safeStorage` when available.
- Signing out keeps the account available for the local **Welcome back** flow; **Forget account** removes the saved account data from the device.
- A development `.env` file is excluded from production packaging.

## What is XMSGi?

XMSGi is for messages that are ready now but should be sent later. It provides a focused desktop workspace for choosing a Telegram dialog, writing a message, setting a delivery time, and reviewing scheduled or sent messages.

## Core Features

- Schedule messages for Telegram dialogs.
- Send a message immediately or choose a scheduled delivery time.
- Browse Telegram dialogs, including groups, private chats, and channels.
- Keep locally added dialogs available across restarts.
- Attach multiple files, view compact photo thumbnails, and open a delayed hover preview for images.
- Add inline keyboard buttons to messages.
- Review upcoming scheduled messages and sent messages.
- Cancel scheduled messages and clear sent-message history.
- Use a System Tray menu to reopen or exit the application.
- Use the experimental Gemini AI Assistant prototype to help prepare message content when configured.

## Installation

### Windows

Download the portable XMSGi 2.2.0 package:

[Download XMSGi 2.2.0](../../releases/tag/v2.2.0)

Run the downloaded executable. No installer is required.

## Прозрачность проекта

XMSGi — проект с открытым исходным кодом. Исходный код доступен в этом репозитории для ознакомления и проверки.

XMSGi работает с пользовательским аккаунтом Telegram, а не с Telegram-ботом. Сессия Telegram хранится локально на устройстве. Чувствительные локальные данные, включая ключ Gemini при его настройке, защищаются через Electron `safeStorage`, если эта возможность доступна в операционной системе.

## Безопасность и хранение сессии

- Данные авторизации и сессия Telegram хранятся локально на устройстве.
- Для работы используется пользовательский аккаунт Telegram, а не аккаунт бота.
- Чувствительные настройки защищаются через Electron `safeStorage`, если он доступен.
- Выход из аккаунта сохраняет его для локального сценария **Welcome back**; действие **Forget account** удаляет сохранённые данные аккаунта с устройства.
- Файл `.env` для разработки исключён из production-пакета.

## Что такое XMSGi?

XMSGi предназначен для сообщений, которые уже готовы, но должны быть отправлены позже. Приложение помогает выбрать диалог Telegram, написать сообщение, указать время отправки и просматривать запланированные и отправленные сообщения.

## Основные функции

- Планирование сообщений для диалогов Telegram.
- Немедленная отправка или выбор времени отправки.
- Просмотр диалогов Telegram, включая группы, личные чаты и каналы.
- Сохранение локально добавленных диалогов после перезапуска.
- Прикрепление нескольких файлов, компактные миниатюры фотографий и отложенный preview изображения при наведении.
- Добавление inline-кнопок к сообщениям.
- Просмотр запланированных и отправленных сообщений.
- Отмена запланированных сообщений и очистка истории отправленных сообщений.
- Работа через System Tray: повторное открытие и выход из приложения.
- Экспериментальный прототип Gemini AI Assistant для подготовки текста при его настройке.

## Установка

### Windows

Скачайте portable-пакет XMSGi 2.2.0:

[Скачать XMSGi 2.2.0](../../releases/tag/v2.2.0)

Запустите скачанный exe-файл. Установка не требуется.

