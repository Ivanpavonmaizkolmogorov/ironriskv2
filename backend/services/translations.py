"""Translation dictionary for Telegram alerts and messages."""

TRANSLATIONS = {
    "es": {
        "welcome_title": "🛡️ <b>IronRisk Shield Activado!</b>",
        "welcome_body": "Estás conectado. A partir de ahora recibirás aquí tus notificaciones y alertas de riesgo de IronRisk.\n\n📌 <b>Comandos disponibles:</b>\n/status — Comprobar si tu EA sigue conectado\n/help — Ver esta lista de comandos",
        "alert_title_ea_disconnect": "⚠️ <b>¡Alerta: Servicio Desconectado!</b>",
        "alert_body_ea_disconnect": "Tu nodo IronRisk lleva {minutes} minutos sin enviar telemetría.\n\nRevisa tu VPS de MetaTrader 5 o tu conexión a Internet para evitar operar a ciegas.",
        "alert_title_risk": "🚨 <b>IronRisk Alerta de Riesgo ({target_type_upper})</b>",
        "alert_metric_line": "Métrica: <code>{metric_key}</code> {operator} {threshold_value}",
        "alert_value_line": "Valor Actual: <b>{current_value}</b>",
        "alert_id_line": "🎯 <b>Objetivo:</b> {target_name}\n💼 <b>Cuenta:</b> {account_name}",
        "help_title": "📌 <b>Comandos IronRisk Bot</b>",
        "help_body": "/status — Comprobar si tu Servicio sigue conectado\n/help — Ver esta lista de comandos\n\nLas alertas de riesgo se envían automáticamente cuando se activan las reglas configuradas en el Centro de Alertas.",
        "transition_title": "🚦 <b>Transición de Riesgo: Portfolio '{portfolio_name}'</b>",
        "transition_reasons": "⚠️ <b>QUÉ ESTÁ PASANDO</b>"
    },
    "en": {
        "welcome_title": "🛡️ <b>IronRisk Shield Activated!</b>",
        "welcome_body": "You are connected. From now on you will receive your IronRisk notifications and risk alerts here.\n\n📌 <b>Available commands:</b>\n/status — Check if your EA is still connected\n/help — Show this command list",
        "alert_title_ea_disconnect": "⚠️ <b>Alert: Service Disconnected!</b>",
        "alert_body_ea_disconnect": "Your IronRisk node has not sent telemetry for {minutes} minutes.\n\nPlease check your MetaTrader 5 VPS or internet connection to avoid unmonitored trading.",
        "alert_title_risk": "🚨 <b>IronRisk Risk Alert ({target_type_upper})</b>",
        "alert_metric_line": "Metric: <code>{metric_key}</code> {operator} {threshold_value}",
        "alert_value_line": "Current Value: <b>{current_value}</b>",
        "alert_id_line": "🎯 <b>Target:</b> {target_name}\n💼 <b>Account:</b> {account_name}",
        "help_title": "📌 <b>IronRisk Bot Commands</b>",
        "help_body": "/status — Check if your Service is still connected\n/help — Show this command list\n\nRisk alerts are sent automatically when rules configured in the Alert Center are triggered.",
        "transition_title": "🚦 <b>Risk Transition: Portfolio '{portfolio_name}'</b>",
        "transition_reasons": "⚠️ <b>WHAT IS HAPPENING</b>"
    }
}

def get_text(locale: str, key: str, **kwargs) -> str:
    """Returns a translated template string formatted with kwargs."""
    locale = locale.lower() if locale else "es"
    if locale not in TRANSLATIONS:
        locale = "es"
    text = TRANSLATIONS[locale].get(key, "")
    if kwargs:
        try:
            return text.format(**kwargs)
        except Exception:
            return text
    return text
