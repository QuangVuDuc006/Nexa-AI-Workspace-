"""conversation summary memory

Revision ID: 9c8d7e6f5a4b
Revises: 7f1a2b3c4d5e
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9c8d7e6f5a4b"
down_revision: Union[str, None] = "7f1a2b3c4d5e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("summary", sa.Text(), nullable=False, server_default=""))
    op.add_column(
        "conversations",
        sa.Column("summary_message_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("conversations", sa.Column("summary_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("conversations", "summary_updated_at")
    op.drop_column("conversations", "summary_message_count")
    op.drop_column("conversations", "summary")
