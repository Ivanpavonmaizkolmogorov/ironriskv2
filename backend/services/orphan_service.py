from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime

from models.orphan import OrphanMagic

class OrphanService:
    """
    Service to manage Sandbox Orphan Magics without polluting core domains.
    """
    
    @staticmethod
    def register_orphan(db: Session, account_id: str, magic_number: int, pnl: float) -> OrphanMagic:
        orphan = db.query(OrphanMagic).filter(
            OrphanMagic.account_id == account_id,
            OrphanMagic.magic_number == magic_number
        ).first()

        if orphan:
            orphan.last_seen = datetime.utcnow()
            orphan.current_pnl = pnl
        else:
            orphan = OrphanMagic(
                account_id=account_id,
                magic_number=magic_number,
                current_pnl=pnl
            )
            db.add(orphan)
            
        db.commit()
        db.refresh(orphan)
        return orphan

    @staticmethod
    def get_orphans_by_account(db: Session, account_id: str) -> List[OrphanMagic]:
        return db.query(OrphanMagic).filter(OrphanMagic.account_id == account_id).all()

    @staticmethod
    def delete_orphan(db: Session, orphan_id: int) -> bool:
        orphan = db.query(OrphanMagic).filter(OrphanMagic.id == orphan_id).first()
        if orphan:
            db.delete(orphan)
            db.commit()
            return True
        return False
