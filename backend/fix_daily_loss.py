import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from models.database import SessionLocal
from models.strategy import Strategy
from services.stats.analyzer import DistributionAnalyzer
import json

def run():
    db = SessionLocal()
    strategies = db.query(Strategy).all()
    print(f"Encontradas {len(strategies)} estrategias para actualizar...")
    
    analyzer = DistributionAnalyzer()
    
    updated = 0
    for strat in strategies:
        try:
            if not strat.csv_data:
                continue
                
            trades = json.loads(strat.csv_data)
            
            # Recalculate everything to get the correct daily_loss fits
            # This is fast enough (1-2s per strategy for full analysis)
            new_fits = analyzer.analyze_strategy(trades)
            
            strat.distribution_fit = new_fits
            db.commit()
            updated += 1
            if updated % 10 == 0:
                print(f"Actualizadas {updated}...")
        except Exception as e:
            print(f"Error procesando {strat.id}: {e}")
            db.rollback()
            
    print(f"Hecho. Total actualizadas: {updated}")
    db.close()

if __name__ == '__main__':
    run()
