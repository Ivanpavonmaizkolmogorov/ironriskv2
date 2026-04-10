import re

with open('webapp/src/components/features/EditStrategyModal.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

new_ui = """          {/* Ulysses Pact Configuration */}
          <div className="border-t border-iron-700 pt-5 mt-4">
            <p className="text-xs uppercase text-amber-500 mb-4 tracking-wider font-semibold">
              ⚖️ PACTO DE ULISES (Motor Bayesiano)
            </p>
            <div className="grid grid-cols-2 gap-4">
              {RISK_VARIABLES.map((rv) => {
                const cfg = riskConfig[rv.key];
                return (
                  <div key={rv.key} className={`p-3 rounded-lg border ${cfg.enabled ? 'border-amber-500/50 bg-amber-500/5' : 'border-iron-800 bg-surface-primary'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={cfg.enabled} onChange={() => toggleRisk(rv.key)} className="accent-amber-500" />
                        <span className="text-xs font-semibold text-iron-200">{rv.label}</span>
                      </label>
                      <span className="font-mono text-xs text-amber-400">P{cfg.limit}</span>
                    </div>
                    <input 
                      type="range" min={50} max={100} step={1} 
                      value={cfg.limit} 
                      onChange={(e) => setRiskLimit(rv.key, e.target.value)}
                      disabled={!cfg.enabled}
                      className={`w-full accent-amber-500 ${!cfg.enabled ? 'opacity-30' : ''}`} 
                    />
                  </div>
                );
              })}
            </div>
          </div>"""

# Safely replace
# Look for starting comment {/* Risk Config Section and replace everything up until and including `</div>` that matches the block.
# I will use Python AST or string manipulation instead of raw regex to avoid bugs.

start_str = "          {/* Risk Config Section"
end_str = "              </div>\n            </div>\n"

idx_start = text.find(start_str)
idx_end = text.find(end_str, idx_start) + len(end_str)

if idx_start != -1 and idx_end != -1:
    text = text[:idx_start] + new_ui + text[idx_end:]
    with open('webapp/src/components/features/EditStrategyModal.tsx', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Done")
else:
    print("Failed to find block")
