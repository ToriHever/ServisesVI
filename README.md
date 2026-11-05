# ServisesVI

Веб-интерфейс для запуска и мониторинга Puppeteer-скриптов-парсеров
из репозитория [Puppeteer](https://github.com/ToriHever/Puppeteer).

## Структура

- `backend/` — NestJS-сервис: читает реестр манифестов из `scripts/manifests/`,
  запускает скрипты в псевдотерминале (node-pty), стримит логи по SSE,
  хранит историю запусков в SQLite.
- `frontend/` — Angular + PrimeNG: список скриптов, формы запуска по манифесту,
  просмотр логов в реальном времени, история.
- `scripts/` — git submodule на репозиторий [Puppeteer](https://github.com/ToriHever/Puppeteer).
  Backend только читает `scripts/manifests/*.json` и запускает команды
  из манифеста.

## Ключевые возможности

### Переподключение к живому процессу

Backend держит каждый запуск в памяти (лог, stdin, статус). Если закрыть
или перезагрузить вкладку браузера, страница скрипта при следующем открытии
**сама переподключается к работающему процессу**: подтягивает весь
накопленный лог, продолжает стрим и позволяет отправлять ввод
(пустое поле = Enter — то, что ждут prompt'ы «Нажмите Enter для продолжения»).
На главной странице блок «Сейчас выполняется» ведёт к активным запускам.

Ограничение: запуски живут в памяти backend'а — его перезапуск обрывает
привязку (child-процесс при этом тоже завершается).

### Общие cookies (страница Cookies)

Cookies хранятся в vault'е backend'а (`backend/data/cookies/<домен>.json`),
список ключей собирается из `cookieKey`-входов манифестов. Цикл синхронизации:

1. Перед запуском backend записывает cookies из vault'а в файлы скрипта
   (пути из манифеста) — скрипт стартует с актуальными куками.
2. Скрипт в работе может пересохранять свои файлы (например,
   multi_search_parser — после ручного прохождения капчи).
3. После завершения запуска backend забирает обновлённые файлы обратно
   в vault — страница Cookies показывает честный статус и дату обновления.

### Параллельный режим multi_search_parser (Yandex + Google)

- Окна браузеров разведены по половинам экрана: Yandex слева, Google справа
  (раньше оба открывались в точке 0,0 и Google перекрывал Яндекс).
- Prompt'ы stdin сериализованы: выбор режима (куки/инкогнито) один на оба
  парсера, ожидания Enter идут по очереди — одно нажатие больше не отвечает
  за оба парсера сразу.

### Прочее

- Лог запуска отображается инвертированно: свежие события сверху.
- «Последние запуски» и история — явная сортировка, новые первыми.
- Детекция капчи (`scripts/multi_search_parser/utils/captcha.js`) с циклом
  ручных попыток: скрипт ждёт прохождения и повторяет запрос.

## Быстрый старт (локально)

```bash
git submodule update --init --recursive

cd backend
cp .env.example .env   # поправить SCRIPTS_DIR при необходимости
npm install
npm run start:dev

cd ../frontend
npm install
npx ng serve
```

Backend слушает `:3000`, frontend — `:4200` (dev-прокси на backend задаётся
в `frontend/src/environments`).

## Деплой (VDS, torihever.ru)

Схема: nginx → статика Angular (`frontend/dist/frontend/browser`) +
проксирование `/api/` → backend (`127.0.0.1:3000`), `/novnc/` и `/websockify`
→ noVNC (`127.0.0.1:6080`). Доступ закрыт Basic Auth + DDoS-Guard.
Браузеры парсеров работают в Xvfb (`:99`, 1920x1080) и видны через noVNC.

Процессы под PM2: `servisesvi-backend`, `servisesvi-frontend` (ng serve
для dev), `servisesvi-xvfb`, `servisesvi-x11vnc`, `servisesvi-novnc`.

### Сборка production-фронтенда

```bash
cd frontend && npm run build   # результат попадает в dist/, nginx отдаёт его же
```

`angular.json` содержит `fileReplacements`: production-сборка подставляет
`environment.prod.ts` (`apiUrl: '/api'`, `novncUrl: '/novnc/...'`).
Без него в бандл попадают dev-адреса `localhost:*` — через домен работать
не будет.

### Сборка backend'а на VDS

На VDS стоит Node 18, а `nest build` падает из-за зависимостей CLI
(флаг регулярок `/v`, нужен Node 20+). Собирать напрямую:

```bash
cd backend && npx tsc -p tsconfig.build.json && pm2 restart servisesvi-backend
```

При случае — обновить Node на VDS до 20+.

Внимание: `pm2 restart servisesvi-backend` убивает текущие запуски парсеров
(их pty принадлежит backend'у) — перезапускать только между прогонами.
Токены/cookies живут в `.env` и `backend/data/` на VDS, не в репозитории.
