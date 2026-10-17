# ServisesVI

Веб-интерфейс для запуска и мониторинга Puppeteer-скриптов-парсеров
из репозитория [Puppeteer](https://github.com/ToriHever/Puppeteer).

## Структура

- `backend/` — NestJS-сервис: читает реестр манифестов из `scripts/manifests/`,
  запускает скрипты как child_process, стримит логи по SSE, хранит историю
  запусков в SQLite.
- `frontend/` — Angular + PrimeNG: список скриптов, формы запуска по манифесту,
  просмотр логов в реальном времени, история.
- `scripts/` — git submodule на репозиторий [Puppeteer](https://github.com/ToriHever/Puppeteer).
  Код скриптов не модифицируется и не копируется — backend только читает
  `scripts/manifests/*.json` и запускает команды из манифеста.

## Как это работает

Каждый скрипт описан манифестом в `scripts/manifests/<id>.json`
(формат — `scripts/manifests/SCHEMA.md`). Backend строит список доступных
скриптов и форм запуска из этих манифестов без доработок при появлении
нового скрипта.

У некоторых скриптов есть `execution.blocking` (ручная капча, ручной логин
и т.п.) — интерфейс в этом случае показывает поле для ответа скрипту
(посылается в его stdin) рядом с логами.

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

## Деплой

Планируется разворачивать на VDS: nginx/Caddy → backend → Puppeteer/Chrome,
статика Angular и SQLite с историей — там же. Токены/cookies живут в
`.env` на VDS, не в репозитории.
