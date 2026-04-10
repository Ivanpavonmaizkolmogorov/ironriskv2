import re

file_path = "webapp/src/components/features/dashboard/views/MachineLearningView.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace hardcoded E(X) strings with Expectancy
content = content.replace("P(E(X) > 0)", "P(Expectancy > 0)")
content = content.replace("P(E(X) &gt; 0)", "P(Expectancy &gt; 0)")
content = content.replace("P(E(X)>0)", "P(Expectancy > 0)")
content = content.replace("P(E(X)<0)", "P(Expectancy < 0)")
content = content.replace('label="E(X)"', 'label="Expectancy"')

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("E(X) replaced with Expectancy in MachineLearningView.tsx")
