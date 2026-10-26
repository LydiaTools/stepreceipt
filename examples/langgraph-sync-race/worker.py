"""Synthetic event-gated LangGraph checkpointer-ordering fixture."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import sys
import threading
from typing import TypedDict


def emit(directory: Path, event: str, **fields: object) -> None:
    with (directory / "events.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps({"event": event, **fields}, ensure_ascii=False) + "\n")
        stream.flush()
        os.fsync(stream.fileno())


def deny_network(event: str, _args: object) -> None:
    if event in ("socket.connect", "socket.connect_ex", "socket.getaddrinfo", "socket.sendto"):
        raise RuntimeError("This synthetic example does not permit network access.")


def read_business(directory: Path) -> dict[str, object]:
    uri = (directory / "business.sqlite").resolve().as_uri() + "?mode=ro"
    with sqlite3.connect(uri, uri=True) as db:
        effects = db.execute(
            "SELECT sequence, count(*) FROM effects GROUP BY sequence ORDER BY sequence"
        ).fetchall()
        attempts = db.execute(
            "SELECT sequence, count(*) FROM attempts GROUP BY sequence ORDER BY sequence"
        ).fetchall()
    return {
        "effects_by_sequence": {str(sequence): count for sequence, count in effects},
        "attempts_by_sequence": {str(sequence): count for sequence, count in attempts},
        "effect_count": sum(count for _, count in effects),
        "attempt_count": sum(count for _, count in attempts),
    }


def inspect_checkpoint(directory: Path, case: str) -> dict[str, object]:
    from langgraph.checkpoint.sqlite import SqliteSaver

    uri = (directory / "checkpoints.sqlite").resolve().as_uri() + "?mode=ro"
    with sqlite3.connect(uri, uri=True, check_same_thread=False, timeout=10) as connection:
        saver = SqliteSaver(connection)
        config = {"configurable": {"thread_id": f"stepreceipt-{case}"}}
        current = saver.get_tuple(config)
        parent = saver.get_tuple(current.parent_config) if current and current.parent_config else None
        return {
            "checkpoint_sequence": current.checkpoint.get("channel_values", {}).get("sequence") if current else None,
            "current_pending_write_count": len(current.pending_writes or ()) if current else None,
            "parent_sequence": parent.checkpoint.get("channel_values", {}).get("sequence") if parent else None,
            "parent_pending_write_count": len(parent.pending_writes or ()) if parent else None,
        }


def run_graph(directory: Path, case: str, phase: str) -> dict[str, object]:
    from importlib.metadata import version
    from langgraph.checkpoint.sqlite import SqliteSaver
    from langgraph.graph import END, START, StateGraph

    versions = {
        name: version(name)
        for name in ("langgraph", "langgraph-checkpoint", "langgraph-checkpoint-sqlite")
    }
    required = {
        "langgraph": "1.2.17",
        "langgraph-checkpoint": "4.3.0",
        "langgraph-checkpoint-sqlite": "3.1.2",
    }
    if versions != required:
        raise RuntimeError("Install the exact versions pinned by this example.")

    class State(TypedDict):
        sequence: int
        limit: int

    class EventGatedSaver(SqliteSaver):
        def __init__(self, connection: sqlite3.Connection):
            super().__init__(connection)
            self.target_write_started = threading.Event()
            self.release_target_write = threading.Event()
            self.target_write_finished = threading.Event()

        def put_writes(self, config, writes, task_id, task_path=""):
            gated = phase == "start" and case in ("race-replay", "ordered-write-control", "stable-key-control") and any(
                channel == "sequence" and value == 2 for channel, value in writes
            )
            if gated:
                emit(directory, "task_write_entered_gate", channels=[channel for channel, _ in writes])
                self.target_write_started.set()
                released = self.release_target_write.wait(timeout=15)
                emit(directory, "task_write_gate_released", by="external" if released else "bounded_timeout")
                result = super().put_writes(config, writes, task_id, task_path)
                self.target_write_finished.set()
                emit(directory, "task_write_committed")
                return result
            return super().put_writes(config, writes, task_id, task_path)

        def put(self, config, checkpoint, metadata, new_versions):
            target = phase == "start" and checkpoint.get("channel_values", {}).get("sequence") == 2
            if target and self.target_write_started.wait(timeout=15):
                if case == "ordered-write-control":
                    self.release_target_write.set()
                    if self.target_write_finished.wait(timeout=15):
                        emit(directory, "checkpoint_attempted_after_task_write", sequence=2)
                        os._exit(73)
                    emit(directory, "ordered_control_timeout", sequence=2)
                    return super().put(config, checkpoint, metadata, new_versions)
                if not self.target_write_finished.is_set():
                    emit(directory, "checkpoint_attempted_while_task_write_blocked", sequence=2)
                    os._exit(73)
            return super().put(config, checkpoint, metadata, new_versions)

    database = directory / "business.sqlite"
    if phase in ("start", "complete"):
        with sqlite3.connect(database) as connection:
            unique = " UNIQUE" if case == "stable-key-control" else ""
            connection.execute(
                f"CREATE TABLE effects (id INTEGER PRIMARY KEY, operation_key TEXT NOT NULL{unique}, sequence INTEGER NOT NULL)"
            )
            connection.execute(
                "CREATE TABLE attempts (id INTEGER PRIMARY KEY, operation_key TEXT NOT NULL, sequence INTEGER NOT NULL)"
            )

    def perform(state):
        sequence = state["sequence"]
        operation_key = f"support-thread-42:publish:{sequence}"
        with sqlite3.connect(database) as sink:
            sink.execute("PRAGMA synchronous=FULL")
            sink.execute(
                "INSERT INTO attempts(operation_key, sequence) VALUES (?, ?)",
                (operation_key, sequence),
            )
            if case == "stable-key-control":
                sink.execute(
                    "INSERT OR IGNORE INTO effects(operation_key, sequence) VALUES (?, ?)",
                    (operation_key, sequence),
                )
            else:
                sink.execute(
                    "INSERT INTO effects(operation_key, sequence) VALUES (?, ?)",
                    (operation_key, sequence),
                )
        return {"sequence": sequence + 1, "limit": state["limit"]}

    def route(state):
        return "perform" if state["sequence"] < state["limit"] else END

    builder = StateGraph(State)
    builder.add_node("perform", perform)
    builder.add_edge(START, "perform")
    builder.add_conditional_edges("perform", route)
    connection = sqlite3.connect(directory / "checkpoints.sqlite", check_same_thread=False, timeout=20)
    saver = EventGatedSaver(connection)
    saver.setup()
    graph = builder.compile(checkpointer=saver)
    config = {"configurable": {"thread_id": f"stepreceipt-{case}"}}
    initial = {"sequence": 0, "limit": 1 if case == "completed-control" else 3}
    result = graph.invoke(initial if phase in ("start", "complete") else None, config, durability="sync")
    pending = list(graph.get_state(config).next)
    emit(directory, "graph_returned", phase=phase, sequence=result.get("sequence"), versions=versions)
    connection.close()
    return {"phase": phase, "sequence": result.get("sequence"), "pending": pending, "versions": versions}


def main() -> None:
    directory = Path(sys.argv[1]).resolve()
    case = sys.argv[2]
    phase = sys.argv[3]
    sys.addaudithook(deny_network)
    if phase == "inspect-business":
        result = read_business(directory)
    elif phase == "inspect-checkpoint":
        result = inspect_checkpoint(directory, case)
    else:
        result = run_graph(directory, case, phase)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
