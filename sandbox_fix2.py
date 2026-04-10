import re

with open('webapp/src/components/features/BayesSandbox.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Remove Confianza block
pattern1 = r'<div>\s*<label className="text-xs text-iron-400 block mb-1">\s*Confianza en BT.*?</div>\s*</div>'
text = re.sub(pattern1, '', text, flags=re.DOTALL)

# Remove Max BT Trades block
pattern2 = r'<div>\s*<label className="text-xs text-iron-400 block mb-1">\s*Max BT Trades.*?</div>\s*</div>'
text = re.sub(pattern2, '', text, flags=re.DOTALL)

with open('webapp/src/components/features/BayesSandbox.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Removed UI blocks explicitly")
