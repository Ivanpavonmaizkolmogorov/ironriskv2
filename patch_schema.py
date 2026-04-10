import re

with open('backend/schemas/live.py', 'r', encoding='utf-8') as f:
    text = f.read()

# I will add the master_verdict and pact_broken variables to HeartbeatResponse
injection = """
    # --- Server-Driven UI (Ulysses Pact) ---
    master_verdict: Optional[str] = "GREEN"  # GREEN, AMBER, RED
    pact_broken: bool = False
    ulysses_banner: Optional[dict] = None  # { text: str, bg_color: str, font_color: str }
    trade_instruction: Optional[str] = "RESUME" # RESUME, REDUCE_RISK, HALT_TRADING
"""
text = re.sub(
    r'(kill_reason: Optional\[str\] = None)',
    r'\1\n' + injection,
    text
)
with open('backend/schemas/live.py', 'w', encoding='utf-8') as f:
    f.write(text)
print("done")
