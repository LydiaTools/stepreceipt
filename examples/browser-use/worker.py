"""Original localhost fixtures; actual browser-use actions, no Agent or model."""
import argparse
import asyncio
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import version
from pathlib import Path
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "integrations/browser-use"))
from stepreceipt_browser_use import BrowserUseReceipt


async def run(out, chrome):
    from browser_use.browser import BrowserSession
    from browser_use.browser.profile import BrowserProfile
    from browser_use.tools.service import Tools
    counts = {name: {"posts": 0, "records": 0} for name in ("disabled", "stored", "false-toast", "readback-unavailable")}
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass

        def reply(self, code, body, content_type):
            raw = body.encode()
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            if self.path.startswith("/state/"):
                name = self.path.removeprefix("/state/")
                if name not in counts:
                    self.reply(404, "{}", "application/json")
                elif name == "readback-unavailable":
                    self.reply(503, "{}", "application/json")
                else:
                    with lock: body = json.dumps(counts[name])
                    self.reply(200, body, "application/json")
                return
            name = self.path.removeprefix("/")
            if name not in counts:
                self.reply(404, "missing", "text/plain")
                return
            disabled = "disabled" if name == "disabled" else ""
            self.reply(200, f"""<!doctype html><html lang=en><title>Local draft fixture</title>
<h1>Save a sample draft</h1><p>Draft: example garden checklist</p>
<button id=submit {disabled}>Save draft</button><p id=message>Draft not submitted</p>
<script>document.getElementById('submit').addEventListener('click', async () => {{
 await fetch('/save/{name}', {{method:'POST'}});
 document.getElementById('message').textContent = 'Draft saved';
}});</script></html>""", "text/html; charset=utf-8")

        def do_POST(self):
            name = self.path.removeprefix("/save/")
            if name not in counts:
                self.reply(404, "{}", "application/json")
                return
            with lock:
                counts[name]["posts"] += 1
                if name in ("stored", "readback-unavailable"):
                    counts[name]["records"] += 1
            self.reply(500 if name == "false-toast" else 200, "{}", "application/json")

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"
    titles = {"disabled": "The tool said clicked. No request reached the server.",
              "stored": "The native click saved one matching draft.",
              "false-toast": "The page said saved. The server stored nothing.",
              "readback-unavailable": "The click returned. The readback endpoint was unavailable."}
    measurements = []
    with tempfile.TemporaryDirectory(prefix="isolated-browser-", dir=out) as temporary:
        profile = Path(temporary) / "profile"
        profile.mkdir()
        session = BrowserSession(browser_profile=BrowserProfile(
            headless=True, executable_path=chrome, user_data_dir=str(profile),
            enable_default_extensions=False, keep_alive=False, allowed_domains=["127.0.0.1"],
        ), use_cloud=False)
        try:
            await session.start()
            tools = Tools()
            for name in counts:
                navigation = await tools.navigate(url=base + "/" + name, new_tab=False, browser_session=session)
                if navigation.error: raise RuntimeError("Local navigation failed")
                await session.get_browser_state_summary(include_screenshot=False)
                indexes = {node.attributes.get("id"): idx for idx, node in (await session.get_selector_map()).items()}
                if "submit" not in indexes: raise RuntimeError("No native button index")
                receipt = BrowserUseReceipt(titles[name])
                step = await receipt.attempt(label="Click Save draft once with browser-use Tools.click", kind="write",
                                             action=lambda: tools.click(index=indexes["submit"], browser_session=session))
                if not step["ok"]: raise RuntimeError("Unexpected native tool error in the pinned fixture")
                # Wait only for a read-only UI signal; never repeat the action.
                cdp = await session.get_or_create_cdp_session()
                deadline = time.monotonic() + 3
                while True:
                    result = await cdp.cdp_client.send.Runtime.evaluate(params={
                        "expression": "document.getElementById('message').textContent", "returnByValue": True,
                    }, session_id=cdp.session_id)
                    visible = result.get("result", {}).get("value")
                    if name == "disabled" or visible == "Draft saved": break
                    if time.monotonic() >= deadline: raise TimeoutError("Fixture UI did not settle")
                    await asyncio.sleep(.05)
                observation = None

                def observe():
                    nonlocal observation
                    with urlopen(base + "/state/" + name, timeout=2) as response:
                        observation = json.load(response)
                    if observation == {"posts": 1, "records": 1}:
                        return {"status": "verified", "summary": "Separate GET: exactly one POST and one matching saved draft in this isolated case."}
                    return {"status": "rejected", "summary": f"Separate GET: {observation['posts']} POSTs and {observation['records']} saved drafts. Expected one matching saved draft."}

                await receipt.verify(step["id"], observe)
                expected = "verified" if name == "stored" else "unknown" if name == "readback-unavailable" else "rejected"
                data = receipt.to_dict()
                if data["steps"][0]["verification"]["status"] != expected: raise AssertionError("Wrong recorded verification")
                with lock: truth = deepcopy(counts[name])
                target = {"posts": 0, "records": 0} if name == "disabled" else {"posts": 1, "records": 0} if name == "false-toast" else {"posts": 1, "records": 1}
                if truth != target: raise AssertionError("The fixture did not match its expected counts")
                (out / f"{name}.json").write_text(json.dumps(data, indent=2) + "\n")
                measurements.append({"case": name, "toolStatus": data["steps"][0]["toolStatus"],
                    "verification": expected, "visibleMessage": visible, "independentReadback": observation,
                    "fixtureCounts": truth, "readbackHTTP": 503 if name == "readback-unavailable" else 200})
        finally:
            try: await session.kill()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)
    payload = {"synthetic": True, "library": "browser-use", "version": version("browser-use"),
               "chrome": subprocess.check_output([chrome, "--version"], text=True).strip(),
               "providerCalls": 0, "agentRun": False, "cases": measurements}
    (out / "measurements.json").write_text(json.dumps(payload, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--chrome", required=True)
    args = parser.parse_args()
    args.out.mkdir(exist_ok=False)
    # Only this new configuration directory is read. Never load a signed-in profile.
    os.environ.update({"ANONYMIZED_TELEMETRY": "false", "BROWSER_USE_CLOUD_SYNC": "false",
        "BROWSER_USE_VERSION_CHECK": "false", "BROWSER_USE_DISABLE_EXTENSIONS": "true",
        "BROWSER_USE_CONFIG_DIR": str(args.out / "config")})
    asyncio.run(run(args.out, args.chrome))


if __name__ == "__main__": main()
