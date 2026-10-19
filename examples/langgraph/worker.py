"""Synthetic local process-crash fixture. Invoked by run.mjs, not a service."""

import argparse
import json
import os
from pathlib import Path
import sqlite3
from typing import TypedDict

OPERATION = "draft-garden-checklist-001"
TITLE = "Garden checklist"


def inspect_store(directory):
    # Read-only mode cannot silently create an empty database at the wrong path.
    uri = (directory / "business.sqlite").resolve().as_uri() + "?mode=ro"
    with sqlite3.connect(uri, uri=True) as db:
        rows = db.execute("SELECT operation_key, title FROM drafts ORDER BY id").fetchall()
        attempts = db.execute("SELECT count(*) FROM attempts").fetchone()[0]
    return {"records": len(rows), "matching": sum(row == (OPERATION, TITLE) for row in rows),
            "nodeAttempts": attempts}


def run_graph(directory, case, phase):
    from importlib.metadata import version
    from langgraph.checkpoint.sqlite import SqliteSaver
    from langgraph.graph import END, START, StateGraph

    versions = {name: version(name) for name in ("langgraph", "langgraph-checkpoint", "langgraph-checkpoint-sqlite")}
    if versions != {"langgraph": "1.2.16", "langgraph-checkpoint": "4.3.0", "langgraph-checkpoint-sqlite": "3.1.2"}:
        raise RuntimeError("Install this example's pinned requirements first.")

    class State(TypedDict, total=False):
        done: bool

    if phase == "start":
        with sqlite3.connect(directory / "business.sqlite") as db:
            unique = " UNIQUE" if case == "target-dedup" else ""
            db.execute(f"CREATE TABLE drafts (id INTEGER PRIMARY KEY, operation_key TEXT NOT NULL{unique}, title TEXT NOT NULL)")
            db.execute("CREATE TABLE attempts (id INTEGER PRIMARY KEY)")

    def save_draft(_state):
        with sqlite3.connect(directory / "business.sqlite") as db:
            db.execute("PRAGMA synchronous=FULL")
            db.execute("INSERT INTO attempts DEFAULT VALUES")
            if case == "target-dedup":
                # The logical operation key and effect live in the SAME transaction.
                db.execute("INSERT INTO drafts(operation_key,title) VALUES (?,?) ON CONFLICT(operation_key) DO NOTHING",
                           (OPERATION, TITLE))
            else:
                db.execute("INSERT INTO drafts(operation_key,title) VALUES (?,?)", (OPERATION, TITLE))
        # The business commit happened; the node has not returned a graph write.
        # This is a real process exit, not an exception caught by the framework.
        if phase == "start" and case != "completed-control":
            os._exit(73)
        return {"done": True}

    builder = StateGraph(State)
    builder.add_node("save_draft", save_draft)
    builder.add_edge(START, "save_draft")
    builder.add_edge("save_draft", END)
    config = {"configurable": {"thread_id": "synthetic-draft-001"}}
    with SqliteSaver.from_conn_string(str(directory / "checkpoints.sqlite")) as saver:
        graph = builder.compile(checkpointer=saver)
        result = graph.invoke({} if phase == "start" else None, config, durability="sync")
        pending = list(graph.get_state(config).next)
    return {"done": result.get("done") is True, "pending": pending, "versions": versions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("case", choices=("completed-control", "crash-replay", "target-dedup"))
    parser.add_argument("phase", choices=("start", "resume", "inspect"))
    args = parser.parse_args()
    # Network access is unnecessary for every phase, including imported libraries.
    def deny_network(event, _args):
        if event in ("socket.connect", "socket.connect_ex", "socket.getaddrinfo", "socket.sendto"):
            raise RuntimeError("This local fixture does not permit network access.")
    import sys
    sys.addaudithook(deny_network)
    result = inspect_store(args.directory) if args.phase == "inspect" else run_graph(args.directory, args.case, args.phase)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
