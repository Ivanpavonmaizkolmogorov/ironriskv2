with open('webapp/src/components/features/EditStrategyModal.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if 'Risk Config Section' in line:
        print(f'Start: {i+1}')
    if '<div className="flex justify-end gap-3 mt-8">' in line:
        print(f'End near: {i+1}')
