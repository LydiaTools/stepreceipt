import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { createReceipt } from '../../src/receipt.mjs';
import { renderReport } from '../../src/report.mjs';

function outputDirectory(args) {
  let output = 'artifacts/mcp';
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i + 1] || args[i] !== '--out') throw new Error('Usage: node run.mjs [--out NEW_DIR]');
    output = args[i + 1];
  }
  return resolve(output);
}

function readText(result) {
  if (result.isError) throw new Error('MCP tool returned an error result.');
  const item = result.content.find((entry) => entry.type === 'text');
  if (!item) throw new Error('MCP tool returned no text result.');
  return JSON.parse(item.text);
}

function createHandler(ledger) {
  return createMcpHandler(() => {
    const server = new McpServer({ name: 'stepreceipt-synthetic-ledger', version: '1.0.0' });
    server.registerTool('create_draft', {
      description: 'Create one synthetic draft record.',
      inputSchema: z.object({ operationId: z.string(), title: z.string() }),
    }, async ({ operationId, title }) => {
      const record = { id: `draft-${ledger.length + 1}`, operationId, title };
      ledger.push(record);
      return { content: [{ type: 'text', text: JSON.stringify(record) }] };
    });
    server.registerTool('list_drafts', {
      description: 'Read all synthetic draft records.',
      inputSchema: z.object({ operationId: z.string() }),
    }, async ({ operationId }) => {
      const records = ledger.filter((record) => record.operationId === operationId);
      return { content: [{ type: 'text', text: JSON.stringify(records) }] };
    });
    return server;
  });
}

async function runScenario(kind, out) {
  await mkdir(out, { recursive: true });
  const ledger = [];
  const operationId = `operation-${kind}`;
  const handler = createHandler(ledger);
  let dropFirstCreateResponse = true;
  let droppedResponses = 0;
  const transport = new StreamableHTTPClientTransport(new URL('http://stepreceipt.local/mcp'), {
    fetch: async (url, init) => {
      const request = new Request(url, init);
      let body;
      try { body = await request.clone().json(); } catch { body = null; }
      const response = await handler.fetch(request);
      if (dropFirstCreateResponse && body?.method === 'tools/call' && body.params?.name === 'create_draft') {
        dropFirstCreateResponse = false;
        droppedResponses++;
        // The local MCP handler has finished the tool call and committed the ledger row.
        await response.clone().arrayBuffer();
        return new Response('Synthetic response loss after commit.', { status: 504 });
      }
      return response;
    },
  });
  const client = new Client({ name: 'stepreceipt-demo', version: '1.0.0' });
  await client.connect(transport);

  const receipt = createReceipt({
    title: kind === 'blind-retry'
      ? 'MCP timeout: blind retry after a committed write'
      : 'MCP timeout: read back before deciding to retry',
  });

  const createDraft = () => client.callTool({
    name: 'create_draft',
    arguments: { operationId, title: 'One intended draft' },
  }).then(readText);
  const listDrafts = () => client.callTool({
    name: 'list_drafts',
    arguments: { operationId },
  }).then(readText);

  try {
    const first = await receipt.attempt({ label: 'MCP create_draft — first call', kind: 'write' }, createDraft);
    let retry;
    if (kind === 'blind-retry') {
      retry = await receipt.attempt({ label: 'MCP create_draft — blind retry', kind: 'write' }, createDraft);
    }
    const readback = await receipt.attempt({ label: 'MCP list_drafts — independent readback', kind: 'read' }, listDrafts);
    const count = Array.isArray(readback.value) ? readback.value.length : -1;

    await receipt.verify(first.id, async () => ({
      status: count >= 1 ? 'verified' : 'rejected',
      summary: count >= 1
        ? `Readback found ${count} record(s). The first call committed despite its lost response.`
        : 'Readback found no record for this operation; the first call did not produce the intended draft.',
    }));
    if (retry) {
      await receipt.verify(retry.id, async () => ({
        status: count === 1 ? 'verified' : 'rejected',
        summary: count === 1
          ? 'Readback found exactly one record for the intended operation.'
          : `Readback found ${count} records; the intended maximum was one.`,
      }));
    }
    await receipt.verify(readback.id, async () => ({
      status: 'verified',
      summary: `The independent list_drafts call returned ${count} record(s) for this operation.`,
    }));

    const run = receipt.toJSON();
    const observation = {
      scenario: kind,
      transport: 'MCP TypeScript SDK 2.4.0 over an in-process fetch handler; no socket or external service',
      droppedResponses,
      createCalls: ledger.length,
      readbackRecords: count,
      intendedRecords: 1,
      toolStatuses: run.steps.map((step) => step.toolStatus),
      verificationStatuses: run.steps.map((step) => step.verification.status),
    };
    await writeFile(resolve(out, 'run.json'), `${JSON.stringify(run, null, 2)}\n`, { flag: 'wx' });
    await writeFile(resolve(out, 'report.html'), renderReport(run), { flag: 'wx' });
    await writeFile(resolve(out, 'observation.json'), `${JSON.stringify(observation, null, 2)}\n`, { flag: 'wx' });
    return observation;
  } finally {
    await client.close();
  }
}

const out = outputDirectory(process.argv.slice(2));
await mkdir(dirname(out), { recursive: true });
await mkdir(out); // Never overwrite an earlier demo run.
const unsafe = await runScenario('blind-retry', resolve(out, 'blind-retry'));
const safe = await runScenario('readback-first', resolve(out, 'readback-first'));
console.log(JSON.stringify({ output: out, unsafe, safe }, null, 2));
if (unsafe.createCalls !== 2 || unsafe.readbackRecords !== 2 || safe.createCalls !== 1 || safe.readbackRecords !== 1) process.exitCode = 1;
