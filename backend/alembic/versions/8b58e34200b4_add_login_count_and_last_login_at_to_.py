"""add login_count and last_login_at to users

Revision ID: 8b58e34200b4
Revises: a1b2c3d4e5f6
Create Date: 2026-04-24 15:31:00.631042

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


# revision identifiers, used by Alembic.
revision: str = '8b58e34200b4'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_column_if_missing(table: str, column: sa.Column):
    """Add a column only if it doesn't already exist (idempotent)."""
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    existing = [c['name'] for c in inspector.get_columns(table)]
    if column.name not in existing:
        op.add_column(table, column)


def upgrade() -> None:
    """Upgrade schema."""
    _add_column_if_missing('users', sa.Column('login_count', sa.Integer(), server_default='0', nullable=False))
    _add_column_if_missing('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
    _add_column_if_missing('waitlist_leads', sa.Column('locale', sa.String(length=10), server_default='es', nullable=False))
    _add_column_if_missing('waitlist_leads', sa.Column('password_hash', sa.Text(), nullable=True))
    _add_column_if_missing('waitlist_leads', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('waitlist_leads', 'approved_at')
    op.drop_column('waitlist_leads', 'password_hash')
    op.drop_column('waitlist_leads', 'locale')
    op.drop_column('users', 'last_login_at')
    op.drop_column('users', 'login_count')
