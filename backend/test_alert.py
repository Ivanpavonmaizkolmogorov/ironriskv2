import asyncio
import logging
from models.database import SessionLocal
from services.notifications import AlertEngine

logging.basicConfig(level=logging.ERROR)

async def test():
    db = SessionLocal()
    engine = AlertEngine(db)
    print("Evaluating...")
    await engine.evaluate_metrics(
        "df1c59b5-add7-4b91-be9c-bef6831eb9c0", 
        "account", 
        "af164ea7-12e4-49d2-b2e4-c832b2539c23", 
        {"ea_disconnect_minutes": 2.5}
    )
    db.commit()
    print('Ran evaluation!')

asyncio.run(test())
