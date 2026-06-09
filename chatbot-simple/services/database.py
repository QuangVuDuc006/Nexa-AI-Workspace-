from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, scoped_session, sessionmaker


class Base(DeclarativeBase):
    pass


SessionLocal = scoped_session(sessionmaker(autoflush=False, expire_on_commit=False, future=True))
engine = None


def utc_now():
    return datetime.now(timezone.utc)


def new_id(prefix):
    return f"{prefix}-{uuid.uuid4()}"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), default="", index=True)
    display_name: Mapped[str] = mapped_column(String(160), default="")
    photo_url: Mapped[str] = mapped_column(Text, default="")
    auth_provider: Mapped[str] = mapped_column(String(32), default="firebase")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    storage_used_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    storage_limit_bytes: Mapped[int] = mapped_column(BigInteger, default=75 * 1024 * 1024, nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default="free", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    conversations: Mapped[list["Conversation"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    provider_connections: Mapped[list["ProviderConnection"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    personalization: Mapped["UserPersonalization"] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )
    memories: Mapped[list["UserMemory"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=lambda: new_id("conv"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(120), default="New chat", nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    summary_message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    summary_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    user: Mapped[User] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


Index("ix_conversations_user_updated", Conversation.user_id, Conversation.updated_at.desc())


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=lambda: new_id("msg"))
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    provider: Mapped[str] = mapped_column(String(64), default="")
    model: Mapped[str] = mapped_column(String(160), default="")
    feedback: Mapped[str] = mapped_column(String(16), default="")
    is_error: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_stopped: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
        order_by="Attachment.created_at",
    )


Index("ix_messages_conversation_created", Message.conversation_id, Message.created_at)


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=lambda: new_id("att"))
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(180), default="attachment")
    mime_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    content_text: Mapped[str] = mapped_column(Text, default="")
    storage_path: Mapped[str] = mapped_column(Text, default="")
    document_id: Mapped[str] = mapped_column(String(80), default="", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    message: Mapped[Message] = relationship(back_populates="attachments")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(128), default="", index=True)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), default="")
    resource_id: Mapped[str] = mapped_column(String(160), default="")
    ip_address: Mapped[str] = mapped_column(String(80), default="")
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    @property
    def metadata_dict(self):
        try:
            return json.loads(self.metadata_json)
        except json.JSONDecodeError:
            return {}


class ProviderConnection(Base):
    __tablename__ = "provider_connections"

    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=lambda: new_id("provider"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_type: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(120), default="")
    encrypted_api_key: Mapped[str] = mapped_column(Text, default="")
    api_key_hint: Mapped[str] = mapped_column(String(80), default="")
    base_url: Mapped[str] = mapped_column(Text, default="")
    selected_model: Mapped[str] = mapped_column(String(240), default="")
    models_json: Mapped[str] = mapped_column(Text, default="[]")
    connection_status: Mapped[str] = mapped_column(String(40), default="saved")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    user: Mapped[User] = relationship(back_populates="provider_connections")

    @property
    def models(self):
        try:
            value = json.loads(self.models_json)
            return value if isinstance(value, list) else []
        except (json.JSONDecodeError, TypeError):
            return []


Index("ix_provider_connections_user_active", ProviderConnection.user_id, ProviderConnection.is_active)


class UserPersonalization(Base):
    __tablename__ = "user_personalizations"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    personalization_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user: Mapped[User] = relationship(back_populates="personalization")


class UserMemory(Base):
    __tablename__ = "user_memories"
    __table_args__ = (
        CheckConstraint("source IN ('manual', 'explicit', 'auto_frequency')", name="ck_user_memories_source"),
        CheckConstraint("status IN ('active', 'archived', 'deleted')", name="ck_user_memories_status"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=lambda: new_id("mem"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    value: Mapped[str] = mapped_column(Text, default="", nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="manual", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False, index=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    frequency_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    user: Mapped[User] = relationship(back_populates="memories")


Index("ix_user_memories_user_status_updated", UserMemory.user_id, UserMemory.status, UserMemory.updated_at.desc())
Index("ix_user_memories_user_key_source", UserMemory.user_id, UserMemory.key, UserMemory.source)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=lambda: new_id("doc"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(180), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream", nullable=False)
    size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, default="", nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    user: Mapped[User] = relationship(back_populates="documents")
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentChunk.chunk_index",
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=lambda: new_id("chunk"))
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[str] = mapped_column(Text, default="", nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section_title: Mapped[str | None] = mapped_column(String(240), nullable=True)
    start_char: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_char: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    document: Mapped[Document] = relationship(back_populates="chunks")


Index("ix_document_chunks_document_index", DocumentChunk.document_id, DocumentChunk.chunk_index)


def ensure_sqlite_conversation_summary_columns(engine):
    with engine.begin() as connection:
        columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(conversations)").all()
        }

        if "summary" not in columns:
            connection.exec_driver_sql("ALTER TABLE conversations ADD COLUMN summary TEXT NOT NULL DEFAULT ''")

        if "summary_message_count" not in columns:
            connection.exec_driver_sql(
                "ALTER TABLE conversations ADD COLUMN summary_message_count INTEGER NOT NULL DEFAULT 0"
            )

        if "summary_updated_at" not in columns:
            connection.exec_driver_sql("ALTER TABLE conversations ADD COLUMN summary_updated_at DATETIME")


def ensure_sqlite_user_quota_columns(engine):
    with engine.begin() as connection:
        columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(users)").all()
        }

        if "storage_used_bytes" not in columns:
            connection.exec_driver_sql("ALTER TABLE users ADD COLUMN storage_used_bytes BIGINT NOT NULL DEFAULT 0")

        if "storage_limit_bytes" not in columns:
            connection.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN storage_limit_bytes BIGINT NOT NULL DEFAULT 78643200"
            )

        if "plan" not in columns:
            connection.exec_driver_sql("ALTER TABLE users ADD COLUMN plan VARCHAR(50) NOT NULL DEFAULT 'free'")


def ensure_sqlite_rag_tables(engine):
    Base.metadata.tables["documents"].create(bind=engine, checkfirst=True)
    Base.metadata.tables["document_chunks"].create(bind=engine, checkfirst=True)
    with engine.begin() as connection:
        document_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(documents)").all()
        }
        if "storage_path" not in document_columns:
            connection.exec_driver_sql("ALTER TABLE documents ADD COLUMN storage_path TEXT NOT NULL DEFAULT ''")
        if "size" not in document_columns:
            connection.exec_driver_sql("ALTER TABLE documents ADD COLUMN size INTEGER NOT NULL DEFAULT 0")
        if "last_used_at" not in document_columns:
            connection.exec_driver_sql("ALTER TABLE documents ADD COLUMN last_used_at DATETIME")

        attachment_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(attachments)").all()
        }
        if "document_id" not in attachment_columns:
            connection.exec_driver_sql("ALTER TABLE attachments ADD COLUMN document_id VARCHAR(80) NOT NULL DEFAULT ''")

        columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(document_chunks)").all()
        }

        if "section_title" not in columns:
            connection.exec_driver_sql("ALTER TABLE document_chunks ADD COLUMN section_title VARCHAR(240)")

        if "start_char" not in columns:
            connection.exec_driver_sql("ALTER TABLE document_chunks ADD COLUMN start_char INTEGER")

        if "end_char" not in columns:
            connection.exec_driver_sql("ALTER TABLE document_chunks ADD COLUMN end_char INTEGER")

        if "source_excerpt" not in columns:
            connection.exec_driver_sql("ALTER TABLE document_chunks ADD COLUMN source_excerpt TEXT")


def ensure_postgres_conversation_summary_columns(engine):
    with engine.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT ''")
        connection.exec_driver_sql(
            "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary_message_count INTEGER NOT NULL DEFAULT 0"
        )
        connection.exec_driver_sql(
            "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMP WITH TIME ZONE"
        )


def ensure_postgres_user_quota_columns(engine):
    with engine.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT NOT NULL DEFAULT 0")
        connection.exec_driver_sql(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT NOT NULL DEFAULT 78643200"
        )
        connection.exec_driver_sql("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(50) NOT NULL DEFAULT 'free'")


def ensure_postgres_rag_tables(engine):
    Base.metadata.tables["documents"].create(bind=engine, checkfirst=True)
    Base.metadata.tables["document_chunks"].create(bind=engine, checkfirst=True)
    with engine.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT ''")
        connection.exec_driver_sql("ALTER TABLE documents ADD COLUMN IF NOT EXISTS size INTEGER NOT NULL DEFAULT 0")
        connection.exec_driver_sql("ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE")
        connection.exec_driver_sql("ALTER TABLE attachments ADD COLUMN IF NOT EXISTS document_id VARCHAR(80) NOT NULL DEFAULT ''")
        connection.exec_driver_sql("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS section_title VARCHAR(240)")
        connection.exec_driver_sql("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS start_char INTEGER")
        connection.exec_driver_sql("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS end_char INTEGER")
        connection.exec_driver_sql("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS source_excerpt TEXT")


def init_database(app, database_url):
    global engine
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    engine = create_engine(database_url, pool_pre_ping=True, future=True, connect_args=connect_args)
    SessionLocal.configure(bind=engine)
    Base.metadata.create_all(bind=engine)

    if database_url.startswith("sqlite"):
        ensure_sqlite_conversation_summary_columns(engine)
        ensure_sqlite_user_quota_columns(engine)
        ensure_sqlite_rag_tables(engine)
    elif database_url.startswith("postgresql"):
        ensure_postgres_conversation_summary_columns(engine)
        ensure_postgres_user_quota_columns(engine)
        ensure_postgres_rag_tables(engine)

    @app.teardown_appcontext
    def remove_session(_error=None):
        SessionLocal.remove()


def db_session():
    return SessionLocal()
