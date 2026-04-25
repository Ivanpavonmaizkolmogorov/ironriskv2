"""add briefing_hour_utc and last_briefing_date to user_preferences

Revision ID: e74db5cda078
Revises: 8b58e34200b4
Create Date: 2026-04-25 09:22:05.682349

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e74db5cda078'
down_revision: Union[str, Sequence[str], None] = '8b58e34200b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # Check if columns exist (safe for re-run)
    inspector = sa.inspect(conn)
    existing = [c["name"] for c in inspector.get_columns("user_preferences")]
    
    if "briefing_hour_utc" not in existing:
        op.add_column("user_preferences", sa.Column("briefing_hour_utc", sa.Integer(), nullable=False, server_default="6"))
    if "last_briefing_date" not in existing:
        op.add_column("user_preferences", sa.Column("last_briefing_date", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("user_preferences", "last_briefing_date")
    op.drop_column("user_preferences", "briefing_hour_utc")
