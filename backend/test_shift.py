import pandas as pd
import io

html = """
<table>
    <tr>
        <th>Date</th><th>Symbol</th><th>Volume</th><th>Profit</th><th>Comment</th>
    </tr>
    <tr>
        <td>2021</td><td>EURUSD</td><td>1.0</td><td>55.2</td><td colspan="4">Buy stop Order</td>
    </tr>
</table>
"""
df = pd.read_html(io.StringIO(html))[0]
print("Columns:", df.columns.tolist())
print("Data row:", df.iloc[0].tolist())
