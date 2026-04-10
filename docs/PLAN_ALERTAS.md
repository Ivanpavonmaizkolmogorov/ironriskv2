# Plan de Alertas (Pacto de Ulises Activo)

Este plan documenta la arquitectura en fases, programación orientada a objetos y flujo UX/UI para el sistema de alertas de IronRisk.

## Fase 1: Modelado de Dominio (Base de Datos)
* Añadir `telegram_chat_id` y `telegram_sync_token` a las preferencias.
* Tablas `UserAlertConfig` (Filtros: target_type ['account', 'strategy', 'portfolio'], operador, threshold, etc) y `UserAlertHistory` (Anti-spam / Cooldown).

## Fase 2: Motor Orientado a Objetos (Core Alert Engine)
* Polimorfismo y Clases Abstractas: `NotificationChannel` dictará el contrato `send(recipient, message)`.
* `TelegramChannel(NotificationChannel)` y `EmailChannel`.
* `AlertManager` evaluará métricas vivas *y latencia (desconexiones EA)* comparándolas contra las reglas del usuario. El polimorfismo será clave para disparar "Alertas de Cuenta" (Ej: Desconexión de EA) vs "Alertas Estratégicas".

## Fase 3: Inyección de Eventos (El Pulso)
* Evaluación reactiva enganchada a la recepción de eventos en `api/live.py`.
* Incluye el sistema nativo de alerta de Desconexión de EA: un chequeo periódico que avisa si el `last_heartbeat` tiene más de 10 minutos de retraso.

## Fase 4: Integración Telegram
* Endpoint Webhook de Telegram (`/start token`).
* El UUID se asocia internamente a la tabla (nada relacionado con MT5, puramente de DB Usuario <-> Telegram Bot).

## Fase 5: UI y Clicks
1. **Vinculación (Ajustes):** Un banner en ajustes "Conectar Telegram" que genera el Deep Link.
2. **Configurador Rápido:** Un icono (🔔) cerca del Veredicto Maestro o Gauge que despliega un sub-menú: "Alertarme si cae de P90" a 2 clicks.
