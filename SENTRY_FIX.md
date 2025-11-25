# ✅ Sentry Configuration - ИСПРАВЛЕНО!

## Статус: Настроено правильно

Все Sentry warnings исправлены и конфигурация обновлена в соответствии с современными практиками Next.js.

## Что было сделано

### ✅ Миграция на новую структуру
- Создан `instrumentation.ts` для регистрации server/edge runtime
- Создан `instrumentation-client.ts` для клиентской конфигурации
- Создан `app/global-error.tsx` для отлова React ошибок
- Удален deprecated `sentry.client.config.ts`

### ✅ Использование переменных окружения
Вместо хардкоженного DSN теперь используется:
```typescript
dsn: process.env.NEXT_PUBLIC_SENTRY_DSN
```

### ✅ Умная конфигурация dev/production

**Development режим:**
- Sentry отключен по умолчанию (экономия квоты)
- Можно включить через `NEXT_PUBLIC_SENTRY_ENABLED=true`
- Higher sample rates для лучшей отладки
- Отправка PII для debugging
- Меньше маскирования в Session Replay

**Production режим:**
- Sentry включен автоматически
- Оптимизированные sample rates (10%)
- Не отправляется PII для приватности
- Полное маскирование в Session Replay

## Переменные окружения

### Обязательные (только для production):
```env
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
```

### Опциональные:
```env
# Включить Sentry в development (по умолчанию выключен)
NEXT_PUBLIC_SENTRY_ENABLED=true

# Для загрузки source maps (только для CI/CD)
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
SENTRY_AUTH_TOKEN=your-auth-token
```

## Конфигурация по окружениям

### Локальная разработка (.env.local)
```env
# Sentry отключен по умолчанию для экономии квоты
# Раскомментируйте для тестирования Sentry локально:
# NEXT_PUBLIC_SENTRY_DSN=https://...
# NEXT_PUBLIC_SENTRY_ENABLED=true
```

### Production (.env.production)
```env
NEXT_PUBLIC_SENTRY_DSN=https://1c43171522788a43890d24d65dbe7ae8@o4510402228584448.ingest.de.sentry.io/4510402439413840
```

## Структура файлов

```
Boardly/
├── instrumentation.ts              # Server/Edge runtime registration
├── instrumentation-client.ts       # Client-side config
├── sentry.server.config.ts        # Server runtime init
├── sentry.edge.config.ts          # Edge runtime init  
├── app/
│   └── global-error.tsx           # Global error handler
└── next.config.js                 # Sentry webpack plugin config
```

## Проверка работы

### 1. В development (Sentry выключен):
```bash
npm run dev
# Должны исчезнуть все warnings
# Sentry не будет отправлять события
```

### 2. Протестировать Sentry локально:
```bash
# В .env.local добавьте:
# NEXT_PUBLIC_SENTRY_ENABLED=true

npm run dev
# Откройте консоль браузера - должен быть Sentry init
```

### 3. Протестировать error reporting:
```typescript
// В любом компоненте
import * as Sentry from '@sentry/nextjs'

const testError = () => {
  Sentry.captureMessage('Test from development')
  throw new Error('Test error!')
}
```

### 4. В production:
```bash
npm run build && npm start
# Sentry включается автоматически
# Все ошибки отправляются в Sentry
```

## Features включены

- ✅ **Error Tracking** - Автоматический отлов ошибок
- ✅ **Performance Monitoring** - Трассировка производительности
- ✅ **Session Replay** - Запись сессий при ошибках
- ✅ **User Feedback** - Контекст пользователя
- ✅ **Source Maps** - Читаемые stack traces (через webpack plugin)
- ✅ **Router Transitions** - Трассировка навигации
- ✅ **Global Error Handler** - Отлов React rendering ошибок

## Sample Rates

### Development (если включен):
- Traces: 100% (tracesSampleRate: 1.0)
- Session Replay: 50% (replaysSessionSampleRate: 0.5)
- Errors Replay: 100% (replaysOnErrorSampleRate: 1.0)

### Production:
- Traces: 10% (tracesSampleRate: 0.1)
- Session Replay: 10% (replaysSessionSampleRate: 0.1)
- Errors Replay: 100% (replaysOnErrorSampleRate: 1.0)

## Безопасность и Приватность

### Production защита:
- ❌ `sendDefaultPii: false` - Не отправляем PII
- ✅ `maskAllText: true` - Маскируем весь текст в replay
- ✅ `blockAllMedia: true` - Блокируем медиа в replay

### Development (для отладки):
- ✅ `sendDefaultPii: true` - Отправляем для debugging
- ❌ `maskAllText: false` - Не маскируем для видимости
- ❌ `blockAllMedia: false` - Показываем медиа

## Квота и оптимизация

Sentry отключен в development, чтобы:
- 💰 Экономить квоту Sentry
- 🚀 Немного быстрее запускаться
- 🔍 Не засорять Sentry тестовыми данными

В production используются низкие sample rates (10%), чтобы:
- 📊 Получать репрезентативную выборку
- 💰 Не превышать бесплатную квоту
- ⚡ Минимизировать performance impact

## Мониторинг в Production

После деплоя в Sentry Dashboard вы увидите:
- 🐛 Все ошибки с контекстом и stack traces
- 📈 Performance metrics
- 🎥 Session replays при ошибках
- 👤 User context (не PII)
- 🌍 Browser/OS информацию

## Troubleshooting

### Не видите ошибки в Sentry?
1. Проверьте `NEXT_PUBLIC_SENTRY_DSN` установлен
2. В production `NODE_ENV=production`
3. Проверьте браузер console на Sentry init
4. Проверьте квоту в Sentry dashboard

### Sentry warnings все еще есть?
- Убедитесь, что удален `sentry.client.config.ts`
- Проверьте, что `instrumentation.ts` и `instrumentation-client.ts` существуют
- Перезапустите dev сервер

### Source maps не работают?
- Убедитесь, что `SENTRY_AUTH_TOKEN` установлен в CI/CD
- Проверьте `next.config.js` - должен быть `withSentryConfig`
- В production build должны загружаться source maps

## Дополнительные ресурсы

- [Sentry Next.js Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Instrumentation Setup](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
- [Session Replay](https://docs.sentry.io/platforms/javascript/guides/nextjs/session-replay/)
- [Performance Monitoring](https://docs.sentry.io/platforms/javascript/guides/nextjs/performance/)

---

**Статус:** ✅ Всё исправлено и оптимизировано!
**Последнее обновление:** 25 ноября 2025
