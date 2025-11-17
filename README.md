```markdown
# Linea Gas Checker

Простой CLI-че́кер газа для сети Linea (EIP-1559). Скрипт использует JSON-RPC вызовы к указанному RPC-узлу Linea, получает последний блок и историю комиссий (eth_feeHistory), оценивает приоритетную комиссию (tip) и рекомендуемый maxFeePerGas.

Особенности:
- Не требует внешних зависимостей (использует fetch в Node.js >=18).
- Поддерживает eth_feeHistory для более точной оценки приоритетной комиссии.
- Режим мониторинга с периодическим опросом.

Requirements:
- Node.js >= 18 (fetch доступен глобально)
- RPC URL Linea (например, публичный RPC или собственный узел / провайдер)

Установка и запуск:
1. Скопируй файлы в папку проекта.
2. Сделай index.js исполняемым (на Unix): `chmod +x index.js`
3. Запуск один раз:
   - RPC_URL env: `RPC_URL=https://rpc.linea.build node index.js`
   - Или через аргумент: `node index.js --rpc https://rpc.linea.build`
4. Запуск в режиме мониторинга (опрос каждые 10 секунд):
   `node index.js --rpc https://rpc.linea.build --interval 10`

Примеры вывода:
```
--- Linea gas check ---
RPC: https://rpc.linea.build
Block: 0x12ab3c
Base fee: 10.543 gwei
Suggested priority fee (tip): 2.050 gwei
Suggested maxFeePerGas: 23.146 gwei
```

Советы и расширения:
- Подключить уведомления (Telegram/Discord) при резком росте baseFee.
- Добавить историческую статистику (сохранение в CSV/DB).
- Показать percentile (p10/p50/p90) при наличии eth_feeHistory reward percentiles.
- Добавить поддержку RPC через Alchemy/Infura, если нужен rate-limited/платный провайдер.

Если хочешь, могу:
- добавить Express-эндпоинт / веб-интерфейс,
- сделать Dockerfile,
- или переписать на TypeScript с тестами.
```
