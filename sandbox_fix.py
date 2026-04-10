import sys, re

with open('webapp/src/components/features/BayesSandbox.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

sliders = '''                  <div className="pt-2 border-t border-iron-800/50">
                    <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                      <div className="flex items-center gap-1.5">
                        <input type="checkbox" checked={useRedLosses} onChange={(e) => setUseRedLosses(e.target.checked)} className="accent-red-500 cursor-pointer" />
                        <span className={!useRedLosses ? "opacity-50 line-through" : ""}>Rojo (Rachas Perd.):</span>
                      </div>
                      <span className={`text-red-400 font-mono ${!useRedLosses ? 'opacity-50' : ''}`}>P{threshRedLosses}</span>
                    </label>
                    <input type="range" min={70} max={100} step={1} value={threshRedLosses} disabled={!useRedLosses} onChange={(e) => setThreshRedLosses(parseInt(e.target.value))} className={`w-full accent-red-500 h-1 cursor-pointer ${!useRedLosses ? 'opacity-30 cursor-not-allowed' : ''}`} />
                  </div>
                  <div>
                    <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                      <div className="flex items-center gap-1.5">
                        <input type="checkbox" checked={useAmberLosses} onChange={(e) => setUseAmberLosses(e.target.checked)} className="accent-amber-500 cursor-pointer" />
                        <span className={!useAmberLosses ? "opacity-50 line-through" : ""}>Ámbar (Rachas Perd.):</span>
                      </div>
                      <span className={`text-amber-400 font-mono ${!useAmberLosses ? 'opacity-50' : ''}`}>P{threshAmberLosses}</span>
                    </label>
                    <input type="range" min={50} max={95} step={1} value={threshAmberLosses} disabled={!useAmberLosses} onChange={(e) => setThreshAmberLosses(parseInt(e.target.value))} className={`w-full accent-amber-500 h-1 cursor-pointer ${!useAmberLosses ? 'opacity-30 cursor-not-allowed' : ''}`} />
                  </div>\n'''

code = re.sub(
    r'(<div className="pt-2 border-t border-iron-800/50">\s*<label[^>]*>\s*<div[^>]*>\s*<input[^>]*useRedBayes)',
    sliders + r'                  \1',
    code
)

code = re.sub(
    r'<div[^>]*>\s*<label[^>]*>\s*Confianza en BT:(?:.|\n)*?</div>\s*</div>\s*</div>',
    '',
    code
)

code = re.sub(
    r'<div[^>]*>\s*<label[^>]*>\s*Max BT Trades(?:.|\n)*?</div>\s*</div>\s*</div>',
    '',
    code
)

code = re.sub(r'bt_discount: overrideBtDiscount \?\? btDiscount,', 'bt_discount: 20, /* Hardcoded to 5% by default */', code)
code = re.sub(r'bt_discount: btDiscount,', 'bt_discount: 20,', code)
code = re.sub(r'max_prior_trades: overrideMinTrades \?\? maxBtTrades,', 'max_prior_trades: 30, /* Hardcoded inside engine via Sandbox Defaults */', code)
code = re.sub(r'max_prior_trades: maxBtTrades,', 'max_prior_trades: 30,', code)

with open('webapp/src/components/features/BayesSandbox.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
print('Phase 2 done')
