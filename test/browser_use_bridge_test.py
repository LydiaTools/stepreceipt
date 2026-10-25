import asyncio
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "integrations/browser-use"))
from stepreceipt_browser_use import BrowserUseReceipt


class BridgeTest(unittest.IsolatedAsyncioTestCase):
    async def test_normal_result_stays_unknown_and_raw_result_is_not_exported(self):
        receipt = BrowserUseReceipt("Local action")
        result = SimpleNamespace(error=None, extracted_content="private page", success=True)
        calls = []
        async def action():
            calls.append(1)
            return result
        step = await receipt.attempt(label="Save", kind="write", action=action)
        self.assertIs(step["value"], result)
        self.assertTrue(step["ok"])
        self.assertEqual(calls, [1])
        data = receipt.to_dict()
        self.assertEqual(data["steps"][0]["verification"]["status"], "unknown")
        self.assertNotIn("private page", json.dumps(data))

    async def test_native_error_and_empty_error_are_errors_without_messages(self):
        for native_error in ("password=private123", ""):
            receipt = BrowserUseReceipt("Error result")
            async def action(): return SimpleNamespace(error=native_error)
            step = await receipt.attempt(label="Click", kind="write", action=action)
            self.assertFalse(step["ok"])
            data = receipt.to_dict()
            self.assertEqual(data["steps"][0]["errorName"], "BrowserUseActionError")
            self.assertNotIn("private123", json.dumps(data))

    async def test_action_exception_and_observer_exception_do_not_repeat_action(self):
        receipt = BrowserUseReceipt("Failures")
        calls = []
        async def action():
            calls.append(1)
            raise TimeoutError("private action message")
        def observe(): raise RuntimeError("private observer message")
        step = await receipt.attempt(label="Save", kind="write", action=action)
        await receipt.verify(step["id"], observe)
        self.assertEqual(calls, [1])
        data = receipt.to_dict()
        self.assertEqual(data["steps"][0]["errorName"], "TimeoutError")
        self.assertEqual(data["steps"][0]["verification"]["status"], "unknown")
        self.assertNotIn("private", json.dumps(data))

    async def test_verification_is_explicit_once_and_invalid_verdict_stays_unknown(self):
        receipt = BrowserUseReceipt("Checks")
        async def action(): return SimpleNamespace(error=None)
        step = await receipt.attempt(label="Save", kind="write", action=action)
        with self.assertRaises(ValueError):
            await receipt.verify(step["id"], lambda: {"status": "success", "summary": "Wrong status"})
        self.assertEqual(receipt.to_dict()["steps"][0]["verification"]["status"], "unknown")
        async def observer(): return {"status": "rejected", "summary": "No saved draft."}
        await receipt.verify(step["id"], observer)
        with self.assertRaises(ValueError):
            await receipt.verify(step["id"], observer)
        self.assertEqual(receipt.to_dict()["steps"][0]["verification"]["status"], "rejected")

    async def test_inflight_export_and_overlapping_checks_are_refused(self):
        receipt = BrowserUseReceipt("Concurrent checks")
        gate = asyncio.Event()
        async def action():
            await gate.wait()
            return SimpleNamespace(error=None)
        task = asyncio.create_task(receipt.attempt(label="Save", kind="write", action=action))
        await asyncio.sleep(0)
        with self.assertRaises(ValueError): receipt.to_dict()
        gate.set()
        step = await task
        gate.clear()
        async def observe():
            await gate.wait()
            return {"status": "verified", "summary": "One matching draft."}
        task = asyncio.create_task(receipt.verify(step["id"], observe))
        await asyncio.sleep(0)
        with self.assertRaises(ValueError): receipt.to_dict()
        with self.assertRaises(ValueError): await receipt.verify(step["id"], observe)
        gate.set()
        await task

    async def test_invalid_metadata_rejected_before_action_and_export_is_detached(self):
        receipt = BrowserUseReceipt("password=fictional123")
        calls = []
        async def action():
            calls.append(1)
            return SimpleNamespace(error=None)
        with self.assertRaises(ValueError):
            await receipt.attempt(label="Save", kind="maybe", action=action)
        self.assertEqual(calls, [])
        await receipt.attempt(label="Save", kind="write", action=action)
        copy = receipt.to_dict()
        copy["steps"].clear()
        self.assertEqual(len(receipt.to_dict()["steps"]), 1)
        self.assertNotIn("fictional123", json.dumps(receipt.to_dict()))


if __name__ == "__main__": unittest.main()
