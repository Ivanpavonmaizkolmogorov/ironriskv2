import sys

with open('webapp/src/components/features/BayesSandbox.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if "Confianza en BT:" in line and "<label" in new_lines[-1]:
        # we are inside the block, remove the "<div>" and "<label" that just got added
        new_lines.pop()
        new_lines.pop()
        skip = True
        continue
    
    if skip:
        # looking for end of block
        if "</div>" in line and "</div>" in new_lines[-1]: # wait, simpler
            pass
    
    # Just a more robust way: Find indices of blocks.
