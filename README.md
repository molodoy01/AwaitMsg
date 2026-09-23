# XMSGi 2.2

XMSGi is a desktop application for working with Telegram messages through a user account.

Version 2.2 is an intermediate but working release. Its core flow is deliberately focused: find a chat, prepare a message, and choose when it should be sent.

## What XMSGi does

- shows available Telegram chats and dialogs;
- finds contacts by account name through Telegram global search;
- sends a message immediately;
- schedules a message for a chosen date and time;
- supports silent delivery;
- supports Telegram message effects;
- provides a clear sent-message history;
- lets you sign out while keeping the session for a later return;
- lets you forget an account and remove its saved data from the device.

The feature set is intentionally compact. XMSGi does not replace Telegram or make decisions on the user’s behalf.

## How it works

1. Choose an existing Telegram chat or search for a contact by account name.
2. Write the message.
3. Send it now or select a date and time.
4. Optionally enable silent delivery or choose a message effect.
5. Review the result in the sending history.

The user controls the message, timing, and delivery mode throughout the flow.

## Security and session handling

XMSGi works with a Telegram user account, not a Telegram bot.

The Telegram session is stored locally on the device. A normal sign-out can keep the account available for a later return. **Forget account** removes the saved account data from the device.

Sensitive local data is protected through Electron `safeStorage` when the operating system supports it. This describes the current implementation and is not a promise of absolute security.

The project is open source, and its source code is available in this repository.

## A note from the developer

I built XMSGi around a practical requirement: a message should be sent at the chosen moment without unnecessary interface noise. Version 2.2 establishes that foundation: choose a chat, prepare the message, send it now or later, and keep the result understandable in history.

It is not the final point of the project, but it is a complete working version of the core flow.

## Release check

The 2.2 release is covered by **201 automated tests**.

## Screenshots

![XMSGi workspace](screenshots/01.png)

![XMSGi message history](screenshots/02.png)

![XMSGi sign in](screenshots/03.png)

## Windows installation

XMSGi 2.2 is distributed as a portable application. No installer is required.

[Download XMSGi 2.2.0](../../releases/tag/v2.2.0)

---

# XMSGi 2.2

XMSGi — desktop-приложение для работы с сообщениями Telegram через пользовательский аккаунт.

Версия 2.2 — промежуточный, но уже рабочий результат проекта. Основной сценарий приложения простой: найти чат, подготовить сообщение и выбрать момент отправки.

## Что делает XMSGi

- показывает доступные чаты и диалоги Telegram;
- ищет контакты по имени аккаунта через глобальный поиск Telegram;
- позволяет отправить сообщение сразу;
- позволяет запланировать сообщение на выбранные дату и время;
- поддерживает отправку без звука;
- поддерживает выбор эффекта сообщения;
- показывает понятную историю отправленных сообщений;
- позволяет выйти из аккаунта, сохранив сессию для следующего входа;
- позволяет забыть аккаунт и удалить его сохранённые данные с устройства.

Набор функций намеренно остаётся компактным. XMSGi не пытается заменить Telegram и не принимает решения вместо пользователя.

## Как это работает

1. Пользователь выбирает существующий чат или ищет контакт по имени аккаунта.
2. Вводит текст сообщения.
3. Выбирает отправку сейчас или задаёт дату и время.
4. При необходимости включает silent delivery или выбирает message effect.
5. После отправки результат доступен в истории.

Отложенная отправка выполняется для выбранного Telegram-чата. Управление текстом, временем и способом отправки остаётся у пользователя.

## Безопасность и сессия

XMSGi работает с Telegram user account, а не с Telegram bot.

Telegram-сессия хранится локально на устройстве. При обычном выходе аккаунт можно сохранить для быстрого возвращения. Действие **Forget account** удаляет сохранённые данные аккаунта с устройства.

Чувствительные локальные данные защищаются через Electron `safeStorage`, если эта возможность доступна в операционной системе. Это описание фактической реализации, а не обещание абсолютной безопасности.

Проект распространяется с открытым исходным кодом. Исходный код доступен в этом репозитории.

## Заметка разработчика

Я собирал XMSGi вокруг одного практического требования: сообщение должно отправляться в выбранный момент без лишнего интерфейсного шума. Версия 2.2 фиксирует этот фундамент: выбор чата, подготовка сообщения, отправка сейчас или позже и понятная история результата.

Это не финальная точка проекта, но уже цельная рабочая версия, которой можно пользоваться по назначению.

## Проверка релиза

Релиз 2.2 покрыт **201 автоматическим тестом**.

## Скриншоты

![Рабочий экран XMSGi](screenshots/01.png)

![История сообщений XMSGi](screenshots/02.png)

![Вход в XMSGi](screenshots/03.png)

## Установка на Windows

XMSGi 2.2 распространяется как portable-приложение. Установка не требуется.

[Скачать XMSGi 2.2.0](../../releases/tag/v2.2.0)
