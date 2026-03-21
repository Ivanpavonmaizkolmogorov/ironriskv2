"""Strategies API routes — CRUD + CSV Upload."""

import json
import logging
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from typing import List

from models.database import get_db
from models.user import User
from schemas.strategy import StrategyResponse, StrategyListResponse, StrategyUpdate
from services.auth_service import get_current_user
from services.strategy_service import (
    create_strategy_from_csv, get_user_strategies,
    get_strategy_by_id, delete_strategy, update_strategy
)

logger = logging.getLogger("ironrisk")

router = APIRouter(prefix="/api/strategies", tags=["Strategies"])


@router.post("/upload", response_model=StrategyResponse)
async def upload_strategy(
    trading_account_id: str = Form(...),
    name: str = Form(...),
    description: str = Form(""),
    magic_number: int = Form(0),
    start_date: str = Form(None),
    max_drawdown_limit: float = Form(0.0),
    daily_loss_limit: float = Form(0.0),
    column_mapping: str = Form(None),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a CSV file to create a new strategy with full metrics analysis."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    # Parse column mapping from JSON string
    mapping = None
    if column_mapping:
        try:
            mapping = json.loads(column_mapping)
            logger.info(f"Column mapping received: {mapping}")
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid column_mapping JSON")

    try:
        strategy = create_strategy_from_csv(
            db=db,
            trading_account_id=trading_account_id,
            name=name,
            description=description,
            magic_number=magic_number,
            start_date=start_date,
            max_drawdown_limit=max_drawdown_limit,
            daily_loss_limit=daily_loss_limit,
            csv_content=content,
            column_mapping=mapping,
        )
        return strategy
    except ValueError as e:
        logger.warning(f"CSV parsing error for user {user.id}: {e}")
        raise HTTPException(status_code=400, detail=f"CSV error: {str(e)}")
    except Exception as e:
        logger.error(f"Upload failed for user {user.id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Strategy creation failed: {str(e)}")


@router.get("/", response_model=List[StrategyResponse])
def list_strategies(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_user_strategies(db, user.id)


@router.get("/{strategy_id}", response_model=StrategyResponse)
def get_strategy(
    strategy_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_strategy_by_id(db, strategy_id, user.id)


@router.delete("/{strategy_id}")
def remove_strategy(
    strategy_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    delete_strategy(db, strategy_id, user.id)
    return {"detail": "Strategy deleted"}


@router.delete("/bulk/all")
def remove_all_strategies(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete ALL strategies belonging to the current user."""
    from services.strategy_service import get_user_strategies
    strategies = get_user_strategies(db, user.id)
    count = len(strategies)
    for s in strategies:
        delete_strategy(db, s.id, user.id)
    logger.info(f"Bulk deleted {count} strategies for user {user.id}")
    return {"detail": f"{count} strategies deleted"}


@router.patch("/{strategy_id}", response_model=StrategyResponse)
def modify_strategy(
    strategy_id: str,
    update_data: StrategyUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update strategy parameters like name, description, magic number."""
    return update_strategy(db, strategy_id, user.id, update_data)

