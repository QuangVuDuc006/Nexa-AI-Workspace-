"""phase 7 personalization and memory

Revision ID: 7f1a2b3c4d5e
Revises: 233d31845c28
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7f1a2b3c4d5e"
down_revision: Union[str, None] = "233d31845c28"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_personalizations",
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("personalization_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "user_memories",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("frequency_count", sa.Integer(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("source IN ('manual', 'explicit', 'auto_frequency')", name="ck_user_memories_source"),
        sa.CheckConstraint("status IN ('active', 'archived', 'deleted')", name="ck_user_memories_status"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_memories_status"), "user_memories", ["status"], unique=False)
    op.create_index(op.f("ix_user_memories_user_id"), "user_memories", ["user_id"], unique=False)
    op.create_index("ix_user_memories_user_key_source", "user_memories", ["user_id", "key", "source"], unique=False)
    op.create_index(
        "ix_user_memories_user_status_updated",
        "user_memories",
        ["user_id", "status", sa.text("updated_at DESC")],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_user_memories_user_status_updated", table_name="user_memories")
    op.drop_index("ix_user_memories_user_key_source", table_name="user_memories")
    op.drop_index(op.f("ix_user_memories_user_id"), table_name="user_memories")
    op.drop_index(op.f("ix_user_memories_status"), table_name="user_memories")
    op.drop_table("user_memories")
    op.drop_table("user_personalizations")
