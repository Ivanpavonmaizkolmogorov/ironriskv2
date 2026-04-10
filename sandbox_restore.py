import re

with open('webapp/src/components/features/BayesSandbox.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Add the UI block for maxBtTrades back. I will place it above "Mín. trades" inside the <details>
pattern_inject = r'(<div>\s*<label className=\"text-xs text-iron-400 block mb-1\">\s*Mín\. trades:)'
insert_block = '''              <div>
                <label className="text-xs text-iron-400 block mb-1">
                  Max BT Trades (Techo prior): <span className="text-iron-200 font-mono">{maxBtTrades === 0 ? "Sin Límite" : maxBtTrades}</span>
                </label>
                <input type="range" min={0} max={1000} step={10} value={maxBtTrades} onChange={(e) => setMaxBtTrades(parseInt(e.target.value))} className="w-full accent-amber-400" />
                <div className="flex justify-between text-[9px] text-iron-600">
                  <span>0 = Infinito</span><span>1000 MAX</span>
                </div>
              </div>\n\n'''

text = re.sub(pattern_inject, insert_block + r'              \1', text)

# Restore the payload handling for max_prior_trades 
text = re.sub(
    r'max_prior_trades: 30, /\* Hardcoded inside engine via Sandbox Defaults \*/',
    r'max_prior_trades: overrideMinTrades ?? maxBtTrades,',
    text
)
text = re.sub(
    r'max_prior_trades: 30,',
    r'max_prior_trades: maxBtTrades,',
    text
)

# And make sure maxBtTrades state is configured
if 'const [maxBtTrades' not in text:
    state_injector = r'(const \[simPnl, setSimPnl\] = useState<string>\(\"\"\);)'
    text = re.sub(state_injector, r'const [maxBtTrades, setMaxBtTrades] = useState<number>(0);\n  \1', text)

with open('webapp/src/components/features/BayesSandbox.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Restored Max BT Trades successfully")
