"""Dashboard Layout Service - Handles generating and validating JSON UI layouts."""


# Deprecated value_keys that should be stripped from any stored layout
_DEPRECATED_KEYS = {"current_pnl"}


class DashboardLayoutService:
    """Service class for MT5 Dashboard layout operations."""
    
    @staticmethod
    def get_layout_for_entity(entity) -> dict:
        """Extracts saved layout from a Strategy/Portfolio or generates a default template.
        
        Automatically strips deprecated widgets (e.g. current_pnl) from stored layouts.
        """
        layout = getattr(entity, "dashboard_layout", None)
        if layout and isinstance(layout, dict) and layout.get("widgets"):
            # Filter out deprecated widgets at the service layer
            layout["widgets"] = [
                w for w in layout["widgets"]
                if w.get("value_key") not in _DEPRECATED_KEYS
            ]
            if layout["widgets"]:
                return layout
        return DashboardLayoutService.get_default_template()

    @staticmethod
    def get_default_template() -> dict:
        """Returns the fallback structured template for the MT5 EA."""
        return {
            "theme": "dark",
            "widgets": [
                {
                    "id": "w_dd", 
                    "type": "metric", 
                    "title": "Current DD", 
                    "value_key": "max_drawdown", 
                    "x": 20, 
                    "y": 40, 
                    "color": "Red"
                },
                {
                    "id": "w_consec", 
                    "type": "metric", 
                    "title": "Consec. Losses", 
                    "value_key": "consecutive_losses", 
                    "x": 200, 
                    "y": 40, 
                    "color": "Yellow"
                }
            ]
        }

