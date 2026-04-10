with open('C:\\Users\\ivanp\\.gemini\\antigravity\\brain\\3f16404a-ed0d-4802-9c1c-2df8b78cf238\\task.md', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('- [ ] Añadir métodos y tipado OOP en backend', '- [x] Añadir métodos y tipado OOP en backend')

with open('C:\\Users\\ivanp\\.gemini\\antigravity\\brain\\3f16404a-ed0d-4802-9c1c-2df8b78cf238\\task.md', 'w', encoding='utf-8') as f:
    f.write(text)
