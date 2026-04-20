import sys

file_path = r'c:\Users\ivanp\Desktop\Symbols\Porfolios\ironriskv2\backend\services\notifications\alert_manager.py'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(130, len(lines)):
    # lines are 0-indexed, so 130 is line 131.
    # The actual block is from line 130 to 211
    # We want to remove 4 spaces from the start.
    if lines[i].startswith('    '):
        lines[i] = lines[i][4:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print("Indentation fixed.")
