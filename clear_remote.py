from models.database import SessionLocal
from models.strategy import Strategy
from sqlalchemy.orm.attributes import flag_modified

def clear():
    db = SessionLocal()
    strategies = db.query(Strategy).all()
    count = 0
    for s in strategies:
        if s.metrics_snapshot and "bayes_cache" in s.metrics_snapshot:
            del s.metrics_snapshot["bayes_cache"]
            flag_modified(s, "metrics_snapshot")
            count += 1
    db.commit()
    print(f"Cleared bayes_cache from {count} strategies")
    db.close()

if __name__ == "__main__":
    clear()
