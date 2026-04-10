import sqlite3
import pandas as pd
import json
from datetime import datetime

def analyze():
    conn = sqlite3.connect('ironrisk.db')
    
    # 1. Fetch strategy with ID starting with "18_"
    strategies = pd.read_sql("SELECT id, name, equity_curve FROM strategies WHERE name LIKE '%18%BuyStop%'", conn)
    if strategies.empty:
        print("Strategy not found!")
        return

    with open('stagnation_output.txt', 'w', encoding='utf-8') as f:
        for idx_row, strategy in strategies.iterrows():
            strategy_id = strategy['id']
            strategy_name = strategy['name']
            
            f.write(f"\\n================================\\n")
            f.write(f"Estrategia: {strategy_name}\\n")
    
            # 2. Extract Backtest equity curve
            curve_json = strategy['equity_curve']
            if not curve_json:
                f.write("No equity curve found!\n")
                continue
                
            curve = json.loads(curve_json)
            if not curve:
                f.write("Empty equity curve array!\n")
                continue
                
            f.write(f"Total trades en backtest original: {len(curve)}\n")
            
            # 3. Compute equity peaks and stagnation
            max_equity = -float('inf')
            last_peak_time = None
            
            current_equity = 0
            stagnation_periods = []
            
            for trade in curve:
                current_equity = trade.get('equity')
                if current_equity is None:
                    continue
                    
                time_str = trade.get('date') or trade.get('time') or trade.get('Time')
                
                if not time_str:
                    continue
                    
                try:
                    # Parse '2009.01.02 17:00:00'
                    t_time = datetime.strptime(time_str, '%Y.%m.%d %H:%M:%S')
                except:
                    try:
                        t_time = pd.to_datetime(time_str)
                    except:
                        continue
                
                if current_equity > max_equity:
                    # Nuevo pico, termina el estancamiento (si hubo uno)
                    if last_peak_time is not None:
                        days_diff = (t_time - last_peak_time).days
                        if days_diff > 0:
                            stagnation_periods.append({
                                'start_peak': last_peak_time,
                                'end_recovery': t_time,
                                'days': days_diff,
                                'peak_value': max_equity
                            })
                    
                    max_equity = current_equity
                    last_peak_time = t_time
                    
            # Include the final unfinished stagnation (if any)
            if last_peak_time is not None and len(curve) > 0:
                last_trade = curve[-1]
                time_str = last_trade.get('time') or last_trade.get('date') or last_trade.get('Time')
                if time_str:
                    try:
                        final_time = datetime.strptime(time_str, '%Y.%m.%d %H:%M:%S')
                    except:
                        try:
                            final_time = pd.to_datetime(time_str)
                        except:
                            final_time = None
                            
                    if final_time:
                        days_diff = (final_time - last_peak_time).days
                        if days_diff > 0:
                            stagnation_periods.append({
                                'start_peak': last_peak_time,
                                'end_recovery': "AÚN EN ESTANCAMIENTO",
                                'days': days_diff,
                                'peak_value': max_equity,
                                'note': '(Hasta el último trade del backtest)'
                            })

            # Sort and take top 10
            stagnations_df = pd.DataFrame(stagnation_periods)
            if stagnations_df.empty:
                f.write("¡No hay estancamientos!\n")
                continue
                
            stagnations_df = stagnations_df.sort_values(by='days', ascending=False)
            
            f.write(f"\n--- TOP 10 PERÍODOS DE ESTANCAMIENTO MÁXIMO (EN DÍAS) DEL BACKTEST ---\n")
            for idx, row in stagnations_df.head(10).iterrows():
                note = row.get('note', '')
                start_str = row['start_peak'].strftime('%Y-%m-%d %H:%M') if hasattr(row['start_peak'], 'strftime') else str(row['start_peak'])
                end_str = row['end_recovery'].strftime('%Y-%m-%d %H:%M') if hasattr(row['end_recovery'], 'strftime') else str(row['end_recovery'])
                f.write(f"  > {int(row['days'])} días | Desde: {start_str} hasta {end_str} | Equity Peak: ${row['peak_value']:.2f} {note}\n")
        
if __name__ == '__main__':
    analyze()
