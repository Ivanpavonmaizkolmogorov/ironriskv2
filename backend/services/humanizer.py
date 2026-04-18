"""Humanizer (Python version) - Reads webapp/messages/{locale}.json natively."""

import os
import json
import logging

logger = logging.getLogger("ironrisk.humanizer")

class PythonHumanizer:
    def __init__(self, locale: str = "es"):
        self.locale = locale
        self.dict_cache = {}
        self.load_dictionary()

    def get_dict_path(self):
        # We assume the backend is in /var/www/ironrisk/backend
        # and webapp is in /var/www/ironrisk/webapp
        # Local development fallback included
        base_dir = os.path.abspath(os.path.dirname(__file__))
        
        # Walk up from backend/services -> backend -> ironriskv2
        root_dir = os.path.dirname(os.path.dirname(base_dir))
        
        target = os.path.join(root_dir, "webapp", "messages", f"{self.locale}.json")
        if not os.path.exists(target):
            # Try production path
            prod_target = f"/var/www/ironrisk/webapp/messages/{self.locale}.json"
            if os.path.exists(prod_target):
                return prod_target
            logger.error(f"Cannot find frontend dictionary at {target} or {prod_target}")
        return target

    def load_dictionary(self):
        path = self.get_dict_path()
        try:
            with open(path, "r", encoding="utf-8") as f:
                self.dict_cache = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load humanizer dict: {e}")
            self.dict_cache = {}

    def t(self, key: str, **kwargs) -> str:
        text = self.dict_cache.get(key, key)
        if kwargs:
            for k, v in kwargs.items():
                text = text.replace("{{" + k + "}}", str(v))
                # For i18next style interpolation {val}
                text = text.replace("{" + k + "}", str(v))
        return text

    # --- Same API as Frontend --- 

    def verdict_headline(self, status: str) -> str:
        # e.g., "amber_human"
        return self.t(f"{status.lower()}_human")

    def gauge_narrative(self, metric_key: str, status: str, current: float, percentile: float) -> str:
        specific_key = f"{metric_key}_{status.lower()}"
        return self.t(specific_key, current=current, pct=round(percentile))
